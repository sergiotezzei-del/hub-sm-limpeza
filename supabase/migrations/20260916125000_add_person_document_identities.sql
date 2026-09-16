-- Keep the iHome short/system name unchanged; legal/document details are separate.
ALTER TABLE public.organization_people
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS ihome_client_code text;

COMMENT ON COLUMN public.organization_people.name IS 'Nome de exibição no HUB e no iHome; não substituir pelo nome civil.';
COMMENT ON COLUMN public.organization_people.full_name IS 'Nome completo informado pelo cadastro oficial, destinado à emissão de documentos.';
COMMENT ON COLUMN public.organization_people.ihome_client_code IS 'Código do CLIENTE do iHome; distinto de ihome_user_id (identificador de usuário).';

CREATE UNIQUE INDEX IF NOT EXISTS organization_people_ihome_client_code_unique
  ON public.organization_people (ihome_client_code)
  WHERE ihome_client_code IS NOT NULL AND btrim(ihome_client_code) <> '';

CREATE TABLE IF NOT EXISTS public.organization_person_private_details (
  person_id uuid PRIMARY KEY REFERENCES public.organization_people(id) ON DELETE RESTRICT,
  cpf text,
  rg text,
  birth_date date,
  marital_status text,
  nationality text,
  residential_phone text,
  commercial_phone text,
  address_line text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_person_private_details IS 'Dados pessoais adicionais de uso documental, separados do diretório de seleção e limitados a administradores do HUB.';
ALTER TABLE public.organization_person_private_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_person_private_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_person_private_details TO authenticated;

DROP POLICY IF EXISTS organization_person_private_details_admin_select ON public.organization_person_private_details;
DROP POLICY IF EXISTS organization_person_private_details_admin_insert ON public.organization_person_private_details;
DROP POLICY IF EXISTS organization_person_private_details_admin_update ON public.organization_person_private_details;
CREATE POLICY organization_person_private_details_admin_select ON public.organization_person_private_details FOR SELECT TO authenticated USING ((SELECT public.is_hub_admin()));
CREATE POLICY organization_person_private_details_admin_insert ON public.organization_person_private_details FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_hub_admin()));
CREATE POLICY organization_person_private_details_admin_update ON public.organization_person_private_details FOR UPDATE TO authenticated USING ((SELECT public.is_hub_admin())) WITH CHECK ((SELECT public.is_hub_admin()));

-- Reuse the protected Patrimony audit trail; never duplicate CPF/RG/address into its JSON snapshots.
ALTER TABLE public.patrimony_audit_log DROP CONSTRAINT IF EXISTS patrimony_audit_log_action_check;
ALTER TABLE public.patrimony_audit_log ADD CONSTRAINT patrimony_audit_log_action_check CHECK (action IN (
  'person_notebook_update', 'notebook_item_update', 'person_inactivation', 'notebook_transfer',
  'uniform_delivery', 'uniform_return', 'uniform_stock_receipt', 'uniform_term_attachment',
  'uniform_term_print', 'person_document_update'
));

CREATE OR REPLACE FUNCTION public.save_organization_person_document_profile(
  p_person_id uuid,
  p_full_name text,
  p_ihome_client_code text,
  p_profile jsonb,
  p_actor_name text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_person public.organization_people%ROWTYPE;
  v_before public.organization_person_private_details%ROWTYPE;
  v_profile jsonb := COALESCE(p_profile, '{}'::jsonb);
  v_full_name text := NULLIF(BTRIM(COALESCE(p_full_name, '')), '');
  v_client_code text := NULLIF(BTRIM(COALESCE(p_ihome_client_code, '')), '');
  v_actor text := BTRIM(COALESCE(p_actor_name, ''));
  v_reason text := BTRIM(COALESCE(p_reason, ''));
  v_audit_id uuid;
BEGIN
  IF NOT public.is_hub_admin() THEN RAISE EXCEPTION 'Sem permissao para editar dados documentais'; END IF;
  IF p_person_id IS NULL THEN RAISE EXCEPTION 'Pessoa obrigatoria'; END IF;
  IF v_full_name IS NULL THEN RAISE EXCEPTION 'Informe o nome completo da pessoa'; END IF;
  IF v_actor = '' THEN RAISE EXCEPTION 'Informe o responsavel'; END IF;
  IF LENGTH(v_reason) < 3 THEN RAISE EXCEPTION 'Informe o motivo da alteracao'; END IF;
  IF v_client_code IS NOT NULL AND v_client_code !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'Codigo do cliente deve conter apenas numeros'; END IF;
  IF v_profile ? 'cpf' AND NULLIF(BTRIM(v_profile->>'cpf'), '') IS NOT NULL
     AND LENGTH(REGEXP_REPLACE(v_profile->>'cpf', '[^0-9]', '', 'g')) <> 11
  THEN RAISE EXCEPTION 'CPF deve conter 11 digitos'; END IF;

  SELECT * INTO v_person FROM public.organization_people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa nao encontrada'; END IF;
  SELECT * INTO v_before FROM public.organization_person_private_details WHERE person_id = p_person_id FOR UPDATE;

  UPDATE public.organization_people
     SET full_name = v_full_name,
         ihome_client_code = v_client_code,
         email = CASE WHEN v_profile ? 'email' THEN NULLIF(BTRIM(v_profile->>'email'), '') ELSE email END,
         phone = CASE WHEN v_profile ? 'phone' THEN NULLIF(BTRIM(v_profile->>'phone'), '') ELSE phone END,
         updated_at = NOW()
   WHERE id = p_person_id;

  INSERT INTO public.organization_person_private_details AS d (
    person_id, cpf, rg, birth_date, marital_status, nationality,
    residential_phone, commercial_phone, address_line, neighborhood, city, state, postal_code
  ) VALUES (
    p_person_id,
    NULLIF(BTRIM(v_profile->>'cpf'), ''),
    NULLIF(BTRIM(v_profile->>'rg'), ''),
    NULLIF(v_profile->>'birth_date', '')::date,
    NULLIF(BTRIM(v_profile->>'marital_status'), ''),
    NULLIF(BTRIM(v_profile->>'nationality'), ''),
    NULLIF(BTRIM(v_profile->>'residential_phone'), ''),
    NULLIF(BTRIM(v_profile->>'commercial_phone'), ''),
    NULLIF(BTRIM(v_profile->>'address_line'), ''),
    NULLIF(BTRIM(v_profile->>'neighborhood'), ''),
    NULLIF(BTRIM(v_profile->>'city'), ''),
    NULLIF(BTRIM(v_profile->>'state'), ''),
    NULLIF(BTRIM(v_profile->>'postal_code'), '')
  ) ON CONFLICT (person_id) DO UPDATE SET
    cpf = EXCLUDED.cpf, rg = EXCLUDED.rg, birth_date = EXCLUDED.birth_date,
    marital_status = EXCLUDED.marital_status, nationality = EXCLUDED.nationality,
    residential_phone = EXCLUDED.residential_phone, commercial_phone = EXCLUDED.commercial_phone,
    address_line = EXCLUDED.address_line, neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city, state = EXCLUDED.state, postal_code = EXCLUDED.postal_code,
    updated_at = NOW();

  INSERT INTO public.patrimony_audit_log (
    action, person_id, actor_name, reason, change_summary, before_data, after_data
  ) VALUES (
    'person_document_update', p_person_id, v_actor, v_reason,
    'Dados documentais atualizados: nome completo / codigo iHome / informacoes restritas',
    jsonb_build_object('name', v_person.name, 'full_name', v_person.full_name, 'ihome_client_code', v_person.ihome_client_code,
                       'private_profile_existed', v_before.person_id IS NOT NULL),
    jsonb_build_object('name', v_person.name, 'full_name', v_full_name, 'ihome_client_code', v_client_code,
                       'private_profile_existed', TRUE)
  ) RETURNING id INTO v_audit_id;
  RETURN v_audit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_organization_person_document_profile(uuid,text,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_organization_person_document_profile(uuid,text,text,jsonb,text,text) TO authenticated;
