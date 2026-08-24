-- Execute only after the V2 migration and inside a transaction that ends with ROLLBACK.
do $test$
declare
  v_team_id uuid;
  v_with_code uuid;
  v_without_code uuid;
  v_scheduled uuid;
  v_marketing_defines uuid;
  v_conflict uuid;
  v_edit_only uuid;
  v_override_id uuid;
  v_rejected_override_id uuid;
  v_notification_id uuid;
  v_before_count integer;
  v_after_count integer;
  v_dashboard jsonb;
begin
  select id into v_team_id
  from public.marketing_teams
  where manager_name = 'Fernando' and active is true;
  if v_team_id is null then raise exception 'TEST_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-v2-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-v2-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-v2-admin-session', 'sha256'), 'hex'), 'tezzei', null, now() + interval '1 hour');

  select request_id into v_with_code
  from public.marketing_v2_create_request(
    p_session_token => 'test-v2-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V2 Código',
    p_has_property_code => true,
    p_property_reference => 'V2-100',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => true
  );
  if not exists (
    select 1 from public.marketing_requests
    where id = v_with_code and has_property_code is true and property_reference = 'V2-100'
  ) then raise exception 'TEST_WITH_CODE_FAILED'; end if;

  select request_id into v_without_code
  from public.marketing_v2_create_request(
    p_session_token => 'test-v2-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V2 Sem Código',
    p_has_property_code => false,
    p_property_reference => null,
    p_request_kind => 'edit_only',
    p_content_types => array['fotos']::text[],
    p_is_exclusive => false
  );
  if not exists (
    select 1 from public.marketing_requests
    where id = v_without_code and has_property_code is false and property_reference = 'SEM CÓDIGO'
  ) then raise exception 'TEST_WITHOUT_CODE_FAILED'; end if;

  select request_id into v_scheduled
  from public.marketing_v2_create_request(
    p_session_token => 'test-v2-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V2 Agenda',
    p_has_property_code => true,
    p_property_reference => 'V2-200',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => true,
    p_capture_location => 'Local de teste',
    p_preferred_capture_at => '2026-08-26 10:00:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 60
  );
  if not exists (
    select 1 from public.marketing_requests
    where id = v_scheduled
      and preferred_capture_at = '2026-08-26 10:00:00-03'::timestamptz
      and preferred_capture_duration_minutes = 60
  ) then raise exception 'TEST_PREFERRED_CAPTURE_FAILED'; end if;
  if not exists (
    select 1 from public.marketing_request_events
    where request_id = v_scheduled and event_type = 'data_solicitada'
  ) then raise exception 'TEST_REQUESTED_DATE_EVENT_FAILED'; end if;

  select request_id into v_marketing_defines
  from public.marketing_v2_create_request(
    p_session_token => 'test-v2-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V2 Marketing Define',
    p_has_property_code => true,
    p_property_reference => 'V2-201',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => false,
    p_preferred_capture_at => null,
    p_preferred_capture_duration_minutes => null
  );
  if exists (
    select 1 from public.marketing_requests
    where id = v_marketing_defines
      and (preferred_capture_at is not null or preferred_capture_duration_minutes is not null)
  ) then raise exception 'TEST_MARKETING_DEFINES_FAILED'; end if;

  perform public.marketing_v2_update_request(
    'test-v2-marketing-session',
    v_scheduled,
    'save_management',
    jsonb_build_object(
      'status', 'solicitado',
      'confirmedCaptureAt', '2026-08-27T13:00:00.000Z',
      'confirmedCaptureDurationMinutes', 90,
      'assignedMarketingName', 'Maria'
    )
  );
  if not exists (
    select 1 from public.marketing_requests
    where id = v_scheduled
      and confirmed_capture_duration_minutes = 90
      and confirmed_capture_end_at = confirmed_capture_at + interval '90 minutes'
      and assigned_marketing_name = 'Maria'
  ) then raise exception 'TEST_CONFIRMED_CAPTURE_FAILED'; end if;

  select request_id into v_conflict
  from public.marketing_v2_create_request(
    p_session_token => 'test-v2-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V2 Conflito',
    p_has_property_code => true,
    p_property_reference => 'V2-202',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => false
  );
  begin
    perform public.marketing_v2_update_request(
      'test-v2-marketing-session',
      v_conflict,
      'save_management',
      jsonb_build_object(
        'status', 'solicitado',
        'confirmedCaptureAt', '2026-08-27T13:30:00.000Z',
        'confirmedCaptureDurationMinutes', 60
      )
    );
    raise exception 'TEST_EXPECTED_CAPTURE_CONFLICT';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_CONFLICT%' then raise; end if;
  end;
  begin
    update public.marketing_requests
    set confirmed_capture_at = '2026-08-27T13:30:00.000Z'::timestamptz,
        confirmed_capture_duration_minutes = 60
    where id = v_conflict;
    raise exception 'TEST_EXPECTED_EXCLUSION_CONSTRAINT';
  exception when exclusion_violation then
    null;
  end;

  select request_id into v_edit_only
  from public.marketing_v2_create_request(
    p_session_token => 'test-v2-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V2 Edição',
    p_has_property_code => true,
    p_property_reference => 'V2-203',
    p_request_kind => 'edit_only',
    p_content_types => array['carrossel']::text[],
    p_is_exclusive => false
  );
  begin
    perform public.marketing_v2_update_request(
      'test-v2-marketing-session',
      v_edit_only,
      'save_management',
      jsonb_build_object(
        'confirmedCaptureAt', '2026-08-28T13:00:00.000Z',
        'confirmedCaptureDurationMinutes', 60
      )
    );
    raise exception 'TEST_EXPECTED_EDIT_ONLY_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_EDIT_ONLY_CAPTURE_DENIED%' then raise; end if;
  end;

  begin
    perform public.marketing_v2_update_request(
      'test-v2-marketing-session',
      v_with_code,
      'save_management',
      jsonb_build_object('status', 'aguardando_edicao')
    );
    raise exception 'TEST_EXPECTED_QUEUE_BLOCK';
  exception when others then
    if sqlerrm not like '%MARKETING_QUEUE_ORDER_BLOCKED%' then raise; end if;
  end;

  v_override_id := public.marketing_v2_request_queue_override(
    'test-v2-marketing-session',
    v_with_code,
    'Material liberado para campanha já contratada.'
  );
  perform public.marketing_v2_decide_queue_override('test-v2-admin-session', v_override_id, 'approved');
  perform public.marketing_v2_update_request(
    'test-v2-marketing-session',
    v_with_code,
    'save_management',
    jsonb_build_object('status', 'aguardando_edicao', 'assignedMarketingName', 'Arthur')
  );
  if not exists (
    select 1 from public.marketing_queue_override_requests
    where id = v_override_id and status = 'approved' and consumed_at is not null
  ) then raise exception 'TEST_OVERRIDE_CONSUMPTION_FAILED'; end if;

  v_rejected_override_id := public.marketing_v2_request_queue_override(
    'test-v2-marketing-session',
    v_without_code,
    'Validar rejeição da alteração de fila.'
  );
  perform public.marketing_v2_decide_queue_override('test-v2-admin-session', v_rejected_override_id, 'rejected');
  begin
    perform public.marketing_v2_update_request(
      'test-v2-marketing-session',
      v_without_code,
      'save_management',
      jsonb_build_object('status', 'aguardando_edicao')
    );
    raise exception 'TEST_EXPECTED_REJECTED_QUEUE_BLOCK';
  exception when others then
    if sqlerrm not like '%MARKETING_QUEUE_ORDER_BLOCKED%' then raise; end if;
  end;

  if not exists (
    select 1 from public.marketing_request_events
    where request_id = v_with_code and event_type = 'alteracao_fila_solicitada'
  ) or not exists (
    select 1 from public.marketing_request_events
    where request_id = v_with_code and event_type = 'alteracao_fila_aprovada'
  ) or not exists (
    select 1 from public.marketing_request_events
    where request_id = v_with_code and event_type = 'alteracao_fila_utilizada'
  ) or not exists (
    select 1 from public.marketing_request_events
    where request_id = v_without_code and event_type = 'alteracao_fila_rejeitada'
  ) then raise exception 'TEST_OVERRIDE_AUDIT_FAILED'; end if;

  select count(*) into v_before_count
  from public.marketing_notifications
  where recipient_user_id = 'gerente-teste';
  perform public.marketing_v2_update_request(
    'test-v2-marketing-session',
    v_marketing_defines,
    'save_management',
    jsonb_build_object('status', 'solicitado', 'marketingNotes', 'Nota interna que não deve notificar.')
  );
  select count(*) into v_after_count
  from public.marketing_notifications
  where recipient_user_id = 'gerente-teste';
  if v_after_count <> v_before_count then raise exception 'TEST_INTERNAL_NOTE_NOTIFICATION_LEAK'; end if;

  select id into v_notification_id
  from public.marketing_notifications
  where recipient_user_id = 'gerente-teste' and read_at is null
  order by created_at
  limit 1;
  if v_notification_id is null then raise exception 'TEST_MANAGER_NOTIFICATION_MISSING'; end if;
  perform public.marketing_v2_mark_notifications_read('test-v2-manager-session', array[v_notification_id]);
  if not exists (
    select 1 from public.marketing_notifications
    where id = v_notification_id and read_at is not null
  ) then raise exception 'TEST_NOTIFICATION_READ_FAILED'; end if;

  v_dashboard := public.marketing_v2_get_dashboard('test-v2-manager-session');
  if jsonb_array_length(v_dashboard->'occupiedCaptureSlots') < 1 then
    raise exception 'TEST_OCCUPIED_SLOTS_MISSING';
  end if;
  if (v_dashboard->'scheduleConfig'->>'timezone') <> 'America/Sao_Paulo' then
    raise exception 'TEST_TIMEZONE_CONFIG_FAILED';
  end if;
  if not exists (
    select 1 from public.managed_users
    where id = 'tezzei'
      and 'marketing' = any(coalesce(permissions, '{}'::text[]))
      and 'painel-admin' = any(coalesce(permissions, '{}'::text[]))
  ) then raise exception 'TEST_TEZZEI_PERMISSIONS_FAILED'; end if;

  if not exists (
    select 1 from public.marketing_request_events
    where request_id = v_scheduled and event_type = 'responsavel_definido'
  ) or not exists (
    select 1 from public.marketing_request_events
    where request_id = v_scheduled and event_type = 'data_confirmada'
  ) or not exists (
    select 1 from public.marketing_request_events
    where request_id = v_scheduled and event_type = 'notificacao_criada'
  ) then raise exception 'TEST_HISTORY_FAILED'; end if;

  if not exists (
    select 1 from public.marketing_requests where id = v_scheduled and assigned_marketing_name = 'Maria'
  ) or not exists (
    select 1 from public.marketing_requests where id = v_with_code and assigned_marketing_name = 'Arthur'
  ) then raise exception 'TEST_ASSIGNEE_OPTIONS_FAILED'; end if;

  if to_regprocedure('public.marketing_get_dashboard(text)') is null
    or to_regprocedure('public.marketing_create_request(text,uuid,text,boolean,text,text,text[],text,timestamptz,text,boolean,text,boolean,text)') is null
    or to_regprocedure('public.marketing_update_request(text,uuid,text,jsonb)') is null
    or to_regprocedure('public.marketing_save_access(text,text,text,uuid,boolean)') is null
    or to_regprocedure('public.marketing_session_get_dashboard(text)') is null
    or to_regprocedure('public.marketing_session_create_request(text,uuid,text,boolean,text,text,text[],text,timestamptz,text,boolean,text,boolean,text)') is null
    or to_regprocedure('public.marketing_session_update_request(text,uuid,text,jsonb)') is null
    or to_regprocedure('public.marketing_session_save_access(text,text,text,uuid,boolean)') is null then
    raise exception 'TEST_LEGACY_RPC_COMPATIBILITY_FAILED';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('marketing_notifications', 'marketing_queue_override_requests', 'marketing_schedule_settings')
      and c.relrowsecurity is true
    group by n.nspname
    having count(*) = 3
  ) then raise exception 'TEST_RLS_FAILED'; end if;
end;
$test$;
