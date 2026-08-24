-- Execute after the legacy restore compatibility migration and finish with ROLLBACK.
do $test$
declare
  v_team_id uuid;
  v_legacy_request uuid;
  v_invalid_confirmed_request uuid;
  v_request_number bigint;
  v_created_at timestamptz;
  v_preferred_at timestamptz := '2026-09-09T13:00:00Z'::timestamptz;
  v_event_count integer;
  v_dashboard jsonb;
begin
  select a.team_id into v_team_id
  from public.marketing_access a
  where a.managed_user_id = 'gerente-teste'
    and a.role = 'sales_manager'
    and a.active is true;
  if v_team_id is null then raise exception 'TEST_LEGACY_RESTORE_MANAGER_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-legacy-restore-admin', 'sha256'), 'hex'), 'tezzei', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-legacy-restore-marketing', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-legacy-restore-manager', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour');

  begin
    perform public.marketing_v2_create_request(
      p_session_token => 'test-legacy-restore-manager',
      p_team_id => v_team_id,
      p_broker_name => 'Teste Novo Sem Duracao',
      p_has_property_code => true,
      p_property_reference => 'NOVO-SEM-DURACAO',
      p_is_exclusive => false,
      p_request_kind => 'capture_edit',
      p_content_types => array['video']::text[],
      p_capture_location => 'Local do teste',
      p_preferred_capture_at => v_preferred_at,
      p_preferred_capture_duration_minutes => null
    );
    raise exception 'TEST_EXPECTED_NEW_REQUEST_DURATION_REQUIRED';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_DURATION_REQUIRED%' then raise; end if;
  end;

  select request_id into v_legacy_request
  from public.marketing_v2_create_request(
    p_session_token => 'test-legacy-restore-manager',
    p_team_id => v_team_id,
    p_broker_name => 'Teste Restore Legado',
    p_has_property_code => false,
    p_property_reference => null,
    p_is_exclusive => true,
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_capture_location => 'Local legado'
  );

  update public.marketing_requests
  set preferred_capture_at = v_preferred_at,
      preferred_capture_duration_minutes = null
  where id = v_legacy_request;

  select q.request_number, q.created_at into v_request_number, v_created_at
  from public.marketing_requests q
  where q.id = v_legacy_request;
  select count(*) into v_event_count
  from public.marketing_request_events e
  where e.request_id = v_legacy_request;

  perform public.marketing_v2_admin_delete_request(
    'test-legacy-restore-admin',
    v_legacy_request,
    'Exclusao temporaria do teste de restore legado'
  );

  begin
    perform public.marketing_v2_admin_restore_request('test-legacy-restore-marketing', v_legacy_request);
    raise exception 'TEST_EXPECTED_MARKETING_RESTORE_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_ADMIN_REQUIRED%' then raise; end if;
  end;
  begin
    perform public.marketing_v2_admin_restore_request('test-legacy-restore-manager', v_legacy_request);
    raise exception 'TEST_EXPECTED_MANAGER_RESTORE_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_ADMIN_REQUIRED%' then raise; end if;
  end;

  perform public.marketing_v2_admin_restore_request('test-legacy-restore-admin', v_legacy_request);

  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_legacy_request
      and q.deleted_at is null
      and q.preferred_capture_at = v_preferred_at
      and q.preferred_capture_duration_minutes is null
      and q.confirmed_capture_at is null
      and q.confirmed_capture_duration_minutes is null
      and q.request_number = v_request_number
      and q.created_at = v_created_at
  ) then raise exception 'TEST_LEGACY_RESTORE_DID_NOT_PRESERVE_REQUEST'; end if;

  if (select count(*) from public.marketing_request_events e where e.request_id = v_legacy_request) <> v_event_count + 2 then
    raise exception 'TEST_LEGACY_RESTORE_HISTORY_NOT_PRESERVED';
  end if;
  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id = v_legacy_request
      and e.event_type = 'pedido_restaurado_admin'
      and e.actor_user_id = 'tezzei'
  ) then raise exception 'TEST_LEGACY_RESTORE_AUDIT_MISSING'; end if;

  v_dashboard := public.marketing_v2_get_dashboard_review('test-legacy-restore-admin');
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'occupiedCaptureSlots') slot
    where slot->>'requestId' = v_legacy_request::text
  ) then raise exception 'TEST_LEGACY_PREFERRED_DATE_BLOCKED_AGENDA'; end if;

  select request_id into v_invalid_confirmed_request
  from public.marketing_v2_create_request(
    p_session_token => 'test-legacy-restore-manager',
    p_team_id => v_team_id,
    p_broker_name => 'Teste Confirmado Invalido',
    p_has_property_code => true,
    p_property_reference => 'CONFIRMADO-INVALIDO',
    p_is_exclusive => false,
    p_request_kind => 'capture_edit',
    p_content_types => array['fotos']::text[],
    p_capture_location => 'Local confirmado'
  );
  update public.marketing_requests
  set confirmed_capture_at = '2026-09-10T13:00:00Z'::timestamptz,
      confirmed_capture_duration_minutes = null
  where id = v_invalid_confirmed_request;
  perform public.marketing_v2_admin_delete_request(
    'test-legacy-restore-admin',
    v_invalid_confirmed_request,
    'Exclusao temporaria do confirmado invalido'
  );
  begin
    perform public.marketing_v2_admin_restore_request('test-legacy-restore-admin', v_invalid_confirmed_request);
    raise exception 'TEST_EXPECTED_CONFIRMED_DURATION_REQUIRED';
  exception when others then
    if sqlerrm not like '%MARKETING_RESTORE_DATA_INVALID%' then raise; end if;
  end;
end;
$test$;

