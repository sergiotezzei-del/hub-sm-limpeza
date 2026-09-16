-- Administrative void, never a destructive DELETE. Only the verified Edge Function
-- may call the RPC (service_role); an ordinary authenticated browser cannot.
CREATE TABLE IF NOT EXISTS public.uniform_delivery_cancellations (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL UNIQUE REFERENCES public.uniform_delivery_batches(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.organization_people(id) ON DELETE RESTRICT,
  actor_auth_user uuid NOT NULL,
  actor_name text NOT NULL CHECK (length(btrim(actor_name)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  restored_quantity numeric NOT NULL DEFAULT 0 CHECK (restored_quantity >= 0),
  detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.uniform_delivery_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uniform_delivery_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.uniform_delivery_cancellations TO authenticated;
CREATE POLICY uniform_delivery_cancellations_admin_read ON public.uniform_delivery_cancellations
  FOR SELECT TO authenticated USING (public.is_hub_admin());
CREATE INDEX IF NOT EXISTS uniform_delivery_cancellations_person_idx ON public.uniform_delivery_cancellations(person_id);

CREATE OR REPLACE FUNCTION public.cancel_uniform_delivery_batch(
  p_operation_id uuid,
  p_batch_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_reason text,
  p_physical_confirmed boolean
)
RETURNS TABLE(cancelled_batch_id uuid, restored_quantity numeric)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_batch public.uniform_delivery_batches%ROWTYPE;
  v_term public.uniform_delivery_terms%ROWTYPE;
  v_line record;
  v_assignment public.patrimony_assignments%ROWTYPE;
  v_item public.patrimony_items%ROWTYPE;
  v_outstanding numeric;
  v_open_all numeric;
  v_status text;
  v_total numeric := 0;
  v_details jsonb := '[]'::jsonb;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing public.uniform_delivery_cancellations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_batch_id IS NULL OR p_actor_user_id IS NULL THEN RAISE EXCEPTION 'Identificadores obrigatorios'; END IF;
  IF length(v_actor) < 2 OR length(v_reason) < 5 THEN RAISE EXCEPTION 'Responsavel e motivo obrigatorios'; END IF;
  IF p_physical_confirmed IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Confirme que as pecas estao fisicamente disponiveis'; END IF;

  SELECT * INTO v_batch FROM public.uniform_delivery_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega nao encontrada'; END IF;
  SELECT * INTO v_existing FROM public.uniform_delivery_cancellations WHERE id=p_operation_id OR batch_id=p_batch_id LIMIT 1;
  IF FOUND THEN
    IF v_existing.id IS DISTINCT FROM p_operation_id OR v_existing.batch_id IS DISTINCT FROM p_batch_id
       OR v_existing.actor_auth_user IS DISTINCT FROM p_actor_user_id OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Esta entrega ja foi cancelada ou o identificador foi reutilizado';
    END IF;
    cancelled_batch_id := p_batch_id; restored_quantity := v_existing.restored_quantity;
    RETURN NEXT; RETURN;
  END IF;
  IF v_batch.status <> 'aguardando_assinatura' THEN RAISE EXCEPTION 'Somente entregas pendentes e sem assinatura podem ser canceladas'; END IF;
  IF EXISTS (SELECT 1 FROM public.uniform_delivery_corrections c WHERE c.source_batch_id=p_batch_id OR c.result_batch_id=p_batch_id)
  THEN RAISE EXCEPTION 'Entrega vinculada a correcao: use a retificacao do historico em vez de excluir'; END IF;
  IF EXISTS (SELECT 1 FROM public.uniform_delivery_terms t WHERE t.batch_id=p_batch_id AND (t.status='assinado' OR t.signed_document_path IS NOT NULL OR t.signed_uploaded_at IS NOT NULL))
     OR EXISTS (SELECT 1 FROM public.uniform_term_attachments a JOIN public.uniform_delivery_terms t ON t.id=a.term_id WHERE t.batch_id=p_batch_id)
  THEN RAISE EXCEPTION 'Termo assinado ou anexado: cancelamento automatico bloqueado'; END IF;

  SELECT * INTO v_term FROM public.uniform_delivery_terms WHERE batch_id=p_batch_id AND status='aguardando_assinatura' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Termo pendente nao encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM public.uniform_delivery_batch_items WHERE batch_id=p_batch_id AND active=false)
  THEN RAISE EXCEPTION 'Entrega com itens corrigidos: use retificacao do historico'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.uniform_delivery_batch_items WHERE batch_id=p_batch_id AND active=true)
  THEN RAISE EXCEPTION 'Entrega sem pecas vinculadas'; END IF;

  FOR v_line IN SELECT bi.* FROM public.uniform_delivery_batch_items bi WHERE bi.batch_id=p_batch_id AND bi.active=true ORDER BY bi.patrimony_assignment_id LOOP
    SELECT * INTO v_assignment FROM public.patrimony_assignments WHERE id=v_line.patrimony_assignment_id FOR UPDATE;
    IF NOT FOUND OR v_assignment.person_id IS DISTINCT FROM v_batch.person_id OR v_assignment.item_id IS DISTINCT FROM v_line.item_id
       OR v_assignment.quantity IS DISTINCT FROM v_line.quantity
    THEN RAISE EXCEPTION 'Entrega com vinculos divergentes; revisao manual obrigatoria'; END IF;
    IF (SELECT count(*) FROM public.uniform_delivery_batch_items WHERE patrimony_assignment_id=v_assignment.id AND active=true) <> 1
    THEN RAISE EXCEPTION 'Peca vinculada a mais de uma entrega: revisao manual obrigatoria'; END IF;

    v_outstanding := v_assignment.quantity - v_assignment.returned_quantity;
    IF v_outstanding < 0 THEN RAISE EXCEPTION 'Quantidade devolvida excede o total'; END IF;
    SELECT * INTO v_item FROM public.patrimony_items WHERE id=v_line.item_id FOR UPDATE;
    IF NOT FOUND OR lower(v_item.category) <> 'uniforme' THEN RAISE EXCEPTION 'Uniforme nao encontrado'; END IF;
    IF v_item.available_quantity + v_outstanding + v_item.maintenance_quantity + v_item.lost_quantity > v_item.total_quantity
    THEN RAISE EXCEPTION 'Saldo inconsistente para %: cancelamento interrompido',v_item.code; END IF;

    IF v_outstanding > 0 THEN
      UPDATE public.patrimony_assignments SET returned_quantity=quantity, returned_at=now(),
        last_return_condition='bom', returned_by_auth_user=p_actor_user_id, returned_by_name=v_actor,
        return_notes=concat_ws(' · ',nullif(return_notes,''),'Cancelamento '||p_operation_id::text||': '||v_reason), updated_at=now()
      WHERE id=v_assignment.id;
      UPDATE public.patrimony_items SET available_quantity=available_quantity+v_outstanding, updated_at=now() WHERE id=v_item.id;
      INSERT INTO public.patrimony_movements(movement_type,item_id,assignment_id,person_id,quantity,condition,actor_auth_user,actor_name,notes)
      VALUES('devolucao',v_item.id,v_assignment.id,v_batch.person_id,v_outstanding,'bom',p_actor_user_id,v_actor,
             'Estorno de entrega cancelada '||p_operation_id::text||' · '||v_reason);
      v_total := v_total+v_outstanding;
    END IF;

    SELECT coalesce(sum(quantity-returned_quantity),0) INTO v_open_all FROM public.patrimony_assignments
      WHERE item_id=v_item.id AND returned_at IS NULL;
    SELECT CASE WHEN v_open_all>0 AND available_quantity>0 THEN 'parcialmente_em_uso'
      WHEN v_open_all>0 THEN 'em_uso' WHEN available_quantity>0 THEN 'disponivel'
      WHEN maintenance_quantity>0 THEN 'manutencao' WHEN lost_quantity>=total_quantity THEN 'extraviado'
      ELSE 'indisponivel' END INTO v_status FROM public.patrimony_items WHERE id=v_item.id;
    UPDATE public.patrimony_items SET status=v_status,updated_at=now() WHERE id=v_item.id;
    UPDATE public.uniform_delivery_batch_items SET active=false,corrected_at=now(),corrected_by_name=v_actor,
      correction_reason='Entrega cancelada: '||v_reason WHERE id=v_line.id;
    v_details := v_details || jsonb_build_array(jsonb_build_object('item_id',v_item.id,'code',v_item.code,
      'issued',v_line.quantity,'previously_returned',v_assignment.returned_quantity,'restored',v_outstanding));
  END LOOP;

  UPDATE public.uniform_delivery_terms SET status='substituido',replaced_at=now(),replaced_by_name=v_actor,
    replacement_reason='Entrega cancelada: '||v_reason,updated_at=now() WHERE id=v_term.id;
  UPDATE public.uniform_delivery_batches SET status='cancelado',updated_at=now() WHERE id=p_batch_id;
  INSERT INTO public.uniform_delivery_cancellations(id,batch_id,person_id,actor_auth_user,actor_name,reason,restored_quantity,detail)
  VALUES (p_operation_id,p_batch_id,v_batch.person_id,p_actor_user_id,v_actor,v_reason,v_total,v_details);
  INSERT INTO public.patrimony_audit_log(action,person_id,actor_auth_user,actor_name,reason,change_summary,before_data,after_data)
  VALUES('uniform_delivery_cancel',v_batch.person_id,p_actor_user_id,v_actor,v_reason,
    'Entrega cancelada; devolucao ao estoque apenas das pecas pendentes',
    jsonb_build_object('batch_id',p_batch_id,'status',v_batch.status),
    jsonb_build_object('batch_id',p_batch_id,'status','cancelado','restored_quantity',v_total,'items',v_details));
  cancelled_batch_id := p_batch_id; restored_quantity := v_total;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_uniform_delivery_batch(uuid,uuid,uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_uniform_delivery_batch(uuid,uuid,uuid,text,text,boolean) TO service_role;
