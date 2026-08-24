-- Execute after both Marketing V2 migrations, inside a transaction ending with ROLLBACK.
do $test$
declare
  v_team_id uuid;
  v_request_confirm uuid;
  v_request_modify uuid;
  v_request_forbidden uuid;
  v_request_decline uuid;
  v_review_id uuid;
begin
  select id into v_team_id from public.marketing_teams where manager_name = 'Fernando' and active is true;
  if v_team_id is null then raise exception 'TEST_REVIEW_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-review-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-review-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-review-admin-session', 'sha256'), 'hex'), 'tezzei', null, now() + interval '1 hour');

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Confirmação',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Confirmação',
    p_has_property_code => true,
    p_property_reference => 'REV-100',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => true
  );
  select id into v_request_confirm from public.marketing_requests where broker_name = 'Corretor Confirmação' order by created_at desc limit 1;

  v_review_id := public.marketing_v2_open_manager_review(
    'test-review-marketing-session',
    v_request_confirm,
    'property_code_divergent',
    'Código do imóvel precisa ser conferido pelo gerente.'
  );
  if v_review_id is null then raise exception 'TEST_35_REVIEW_OPEN_FAILED'; end if;
  if not exists (select 1 from public.marketing_requests where id = v_request_confirm and status = 'bloqueado') then
    raise exception 'TEST_36_REQUEST_NOT_BLOCKED';
  end if;
  if not exists (
    select 1 from public.marketing_manager_reviews
    where id = v_review_id and status = 'pending' and manager_user_id = 'gerente-teste' and return_status = 'solicitado'
  ) or not exists (
    select 1 from public.marketing_notifications
    where request_id = v_request_confirm and recipient_user_id = 'gerente-teste' and type = 'auditoria_gerente'
  ) then raise exception 'TEST_37_MANAGER_PENDING_MISSING'; end if;

  begin
    update public.marketing_requests set status = 'agendado' where id = v_request_confirm;
    raise exception 'TEST_EXPECTED_PENDING_REVIEW_GUARD';
  exception when others then
    if sqlerrm not like '%MARKETING_MANAGER_REVIEW_PENDING%' then raise; end if;
  end;

  perform public.marketing_v2_resolve_manager_review(
    'test-review-manager-session', v_review_id, 'confirmed', 'Dados conferidos com o corretor.', '{}'::jsonb
  );
  if not exists (
    select 1 from public.marketing_manager_reviews where id = v_review_id and status = 'confirmed' and decided_at is not null
  ) then raise exception 'TEST_38_REVIEW_CONFIRM_FAILED'; end if;
  if not exists (select 1 from public.marketing_requests where id = v_request_confirm and status = 'solicitado') then
    raise exception 'TEST_39_RETURN_STATUS_FAILED';
  end if;

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Correção',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Antes',
    p_has_property_code => true,
    p_property_reference => 'REV-101',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => false
  );
  select id into v_request_modify from public.marketing_requests where broker_name = 'Corretor Antes' order by created_at desc limit 1;
  v_review_id := public.marketing_v2_open_manager_review(
    'test-review-marketing-session', v_request_modify, 'incomplete_request', 'Nome do corretor precisa ser corrigido.'
  );
  perform public.marketing_v2_resolve_manager_review(
    'test-review-manager-session',
    v_review_id,
    'modified',
    'Corretor e código atualizados.',
    jsonb_build_object('brokerName', 'Corretor Depois', 'hasPropertyCode', false, 'propertyReference', '')
  );
  if not exists (select 1 from public.marketing_manager_reviews where id = v_review_id and status = 'modified') then
    raise exception 'TEST_40_REVIEW_MODIFY_FAILED';
  end if;
  if not exists (
    select 1 from public.marketing_requests
    where id = v_request_modify
      and broker_name = 'Corretor Depois'
      and has_property_code is false
      and property_reference = 'SEM CÓDIGO'
      and status = 'solicitado'
      and confirmed_capture_at is null
      and assigned_marketing_name is null
      and promised_at is null
  ) then raise exception 'TEST_41_ALLOWED_FIELDS_FAILED'; end if;

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Campo Interno',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Interno',
    p_has_property_code => true,
    p_property_reference => 'REV-102',
    p_request_kind => 'edit_only',
    p_content_types => array['fotos']::text[],
    p_is_exclusive => false
  );
  select id into v_request_forbidden from public.marketing_requests where broker_name = 'Corretor Interno' order by created_at desc limit 1;
  v_review_id := public.marketing_v2_open_manager_review(
    'test-review-marketing-session', v_request_forbidden, 'other', 'Validar proteção dos campos internos.'
  );
  begin
    perform public.marketing_v2_resolve_manager_review(
      'test-review-manager-session',
      v_review_id,
      'modified',
      null,
      jsonb_build_object('confirmedCaptureAt', '2026-09-03T12:00:00.000Z')
    );
    raise exception 'TEST_EXPECTED_INTERNAL_FIELD_DENIAL';
  exception when others then
    if sqlerrm not like '%MARKETING_MANAGER_REVIEW_FIELD_DENIED%' then raise; end if;
  end;
  perform public.marketing_v2_resolve_manager_review(
    'test-review-manager-session', v_review_id, 'confirmed', null, '{}'::jsonb
  );

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Declínio',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Declínio',
    p_has_property_code => true,
    p_property_reference => 'REV-103',
    p_request_kind => 'edit_only',
    p_content_types => array['carrossel']::text[],
    p_is_exclusive => true
  );
  select id into v_request_decline from public.marketing_requests where broker_name = 'Corretor Declínio' order by created_at desc limit 1;
  v_review_id := public.marketing_v2_open_manager_review(
    'test-review-marketing-session', v_request_decline, 'incorrect_service', 'Serviço não pertence a esta solicitação.'
  );
  perform public.marketing_v2_resolve_manager_review(
    'test-review-manager-session', v_review_id, 'declined', 'Pedido aberto para o serviço incorreto.', '{}'::jsonb
  );
  if not exists (select 1 from public.marketing_manager_reviews where id = v_review_id and status = 'declined') then
    raise exception 'TEST_42_REVIEW_DECLINE_FAILED';
  end if;
  if not exists (
    select 1 from public.marketing_requests where id = v_request_decline and status = 'cancelado' and completed_at is not null
  ) then raise exception 'TEST_43_DECLINED_REQUEST_NOT_PRESERVED'; end if;

  if not exists (
    select 1 from public.marketing_notifications
    where request_id in (v_request_confirm, v_request_modify, v_request_decline)
      and recipient_user_id = 'mkteste'
      and type in ('auditoria_confirmada', 'auditoria_modificada', 'auditoria_declinada')
  ) then raise exception 'TEST_44_MARKETING_RESPONSE_NOTIFICATION_MISSING'; end if;
  if not exists (
    select 1 from public.marketing_request_events where request_id = v_request_confirm and event_type = 'auditoria_solicitada'
  ) or not exists (
    select 1 from public.marketing_request_events where request_id = v_request_confirm and event_type = 'auditoria_confirmada'
  ) or not exists (
    select 1 from public.marketing_request_events
    where request_id = v_request_modify and event_type = 'auditoria_modificada' and details->'changes' ? 'brokerName'
  ) or not exists (
    select 1 from public.marketing_request_events where request_id = v_request_decline and event_type = 'auditoria_declinada'
  ) then raise exception 'TEST_45_REVIEW_AUDIT_EVENTS_MISSING'; end if;

end;
$test$;
