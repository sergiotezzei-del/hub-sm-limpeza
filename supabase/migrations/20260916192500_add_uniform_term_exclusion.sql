-- A term can be removed from the active UI, but its legal/audit record is NEVER deleted.
-- Only the password-verified Edge Function (service_role) can execute either RPC.
CREATE TABLE IF NOT EXISTS public.uniform_term_exclusions (
  term_id uuid PRIMARY KEY REFERENCES public.uniform_delivery_terms(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL UNIQUE,
  batch_id uuid NOT NULL REFERENCES public.uniform_delivery_batches(id) ON DELETE RESTRICT,
  actor_auth_user uuid NOT NULL,
  actor_name text NOT NULL CHECK (length(btrim(actor_name)) >= 2),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.uniform_term_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uniform_term_exclusions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.uniform_term_exclusions TO authenticated;
DROP POLICY IF EXISTS uniform_term_exclusions_admin_read ON public.uniform_term_exclusions;
CREATE POLICY uniform_term_exclusions_admin_read ON public.uniform_term_exclusions
  FOR SELECT TO authenticated USING (public.is_hub_admin());
CREATE INDEX IF NOT EXISTS uniform_term_exclusions_batch_idx ON public.uniform_term_exclusions(batch_id);

CREATE OR REPLACE FUNCTION public.exclude_uniform_delivery_term(
  p_operation_id uuid,
  p_term_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_reason text
) RETURNS TABLE(excluded_term_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_term public.uniform_delivery_terms%ROWTYPE;
  v_batch public.uniform_delivery_batches%ROWTYPE;
  v_existing public.uniform_term_exclusions%ROWTYPE;
  v_outstanding numeric;
  v_actor text := btrim(coalesce(p_actor_name,''));
  v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF p_operation_id IS NULL OR p_term_id IS NULL OR p_actor_user_id IS NULL OR length(v_actor)<2 OR length(v_reason)<5
  THEN RAISE EXCEPTION 'Termo, responsavel e motivo obrigatorios'; END IF;

  SELECT * INTO v_term FROM public.uniform_delivery_terms WHERE id=p_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Termo nao encontrado'; END IF;
  SELECT * INTO v_batch FROM public.uniform_delivery_batches WHERE id=v_term.batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega do termo nao encontrada'; END IF;
  SELECT * INTO v_term FROM public.uniform_delivery_terms WHERE id=p_term_id FOR UPDATE;

  SELECT * INTO v_existing FROM public.uniform_term_exclusions
    WHERE term_id=p_term_id OR operation_id=p_operation_id LIMIT 1;
  IF FOUND THEN
    IF v_existing.term_id IS DISTINCT FROM p_term_id OR v_existing.operation_id IS DISTINCT FROM p_operation_id
       OR v_existing.actor_auth_user IS DISTINCT FROM p_actor_user_id OR v_existing.reason IS DISTINCT FROM v_reason
    THEN RAISE EXCEPTION 'Termo ja excluido ou identificador de operacao reutilizado'; END IF;
    excluded_term_id:=p_term_id; RETURN NEXT; RETURN;
  END IF;

  IF v_term.status='assinado' OR v_term.signed_document_path IS NOT NULL OR v_term.signed_uploaded_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.uniform_term_attachments a WHERE a.term_id=p_term_id)
  THEN RAISE EXCEPTION 'Termo assinado ou com anexo nao pode ser excluido'; END IF;
  IF v_term.status NOT IN ('aguardando_assinatura','substituido')
  THEN RAISE EXCEPTION 'Status do termo nao permite exclusao'; END IF;

  IF v_term.status='aguardando_assinatura' THEN
    SELECT coalesce(sum(a.quantity-a.returned_quantity),0) INTO v_outstanding
    FROM public.uniform_delivery_batch_items bi
    JOIN public.patrimony_assignments a ON a.id=bi.patrimony_assignment_id
    WHERE bi.batch_id=v_term.batch_id AND bi.active=true;
    IF v_outstanding>0 THEN
      RAISE EXCEPTION 'Existem uniformes com esta pessoa. Corrija ou exclua a entrega antes de excluir o termo';
    END IF;
    UPDATE public.uniform_delivery_terms
       SET status='substituido',replaced_at=now(),replaced_by_name=v_actor,
           replacement_reason='Termo excluido: '||v_reason,updated_at=now()
     WHERE id=p_term_id;
  END IF;

  INSERT INTO public.uniform_term_exclusions(term_id,operation_id,batch_id,actor_auth_user,actor_name,reason)
  VALUES(p_term_id,p_operation_id,v_term.batch_id,p_actor_user_id,v_actor,v_reason);
  INSERT INTO public.patrimony_audit_log(action,person_id,actor_auth_user,actor_name,reason,change_summary,before_data,after_data)
  VALUES('uniform_term_exclude',v_batch.person_id,p_actor_user_id,v_actor,v_reason,
         'Termo ocultado da lista operacional sem apagar o documento historico ou movimentar estoque',
         jsonb_build_object('term_id',p_term_id,'batch_id',v_term.batch_id,'term_status',v_term.status),
         jsonb_build_object('term_id',p_term_id,'hidden',true));
  excluded_term_id:=p_term_id; RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.exclude_uniform_delivery_term(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_uniform_delivery_term(uuid,uuid,uuid,text,text) TO service_role;

-- Keep cancellation and optional term exclusion within the SAME database transaction.
CREATE OR REPLACE FUNCTION public.cancel_uniform_delivery_with_term_choice(
  p_operation_id uuid,
  p_batch_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_reason text,
  p_physical_confirmed boolean,
  p_hide_term boolean DEFAULT false
) RETURNS TABLE(cancelled_batch_id uuid, restored_quantity numeric, term_excluded boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_result record;
  v_term_id uuid;
BEGIN
  SELECT * INTO v_result FROM public.cancel_uniform_delivery_batch(
    p_operation_id,p_batch_id,p_actor_user_id,p_actor_name,p_reason,p_physical_confirmed);
  cancelled_batch_id:=v_result.cancelled_batch_id;
  restored_quantity:=v_result.restored_quantity;
  term_excluded:=false;
  IF p_hide_term IS TRUE THEN
    SELECT t.id INTO v_term_id FROM public.uniform_delivery_terms t
      WHERE t.batch_id=p_batch_id AND t.status='substituido'
        AND t.replacement_reason LIKE 'Entrega cancelada:%'
      ORDER BY t.replaced_at DESC LIMIT 1;
    IF v_term_id IS NULL THEN RAISE EXCEPTION 'Termo cancelado nao localizado'; END IF;
    PERFORM public.exclude_uniform_delivery_term(
      p_operation_id,v_term_id,p_actor_user_id,p_actor_name,p_reason);
    term_excluded:=true;
  END IF;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_uniform_delivery_with_term_choice(uuid,uuid,uuid,text,text,boolean,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_uniform_delivery_with_term_choice(uuid,uuid,uuid,text,text,boolean,boolean)
  TO service_role;

-- The existing audit log has a CHECK whitelist, which must admit the new audited action.
ALTER TABLE public.patrimony_audit_log DROP CONSTRAINT IF EXISTS patrimony_audit_log_action_check;
ALTER TABLE public.patrimony_audit_log ADD CONSTRAINT patrimony_audit_log_action_check
 CHECK (action IN (
 'person_notebook_update','notebook_item_update','person_inactivation','notebook_transfer',
 'uniform_delivery','uniform_return','uniform_stock_receipt','uniform_term_attachment',
 'uniform_term_print','person_document_update','uniform_delivery_correction',
 'uniform_delivery_cancel','uniform_term_exclude'
 ));
