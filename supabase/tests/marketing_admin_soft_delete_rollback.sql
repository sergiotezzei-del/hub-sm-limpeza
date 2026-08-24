-- Execute after the V2.1 migration in the same transaction and finish with ROLLBACK.
create temporary table marketing_v21_real_request_snapshot on commit drop as
select q.id, to_jsonb(q) as row_data
from public.marketing_requests q
where q.request_number in (3, 4);

do $test$
declare
  v_team_id uuid;
  v_other_team_id uuid;
  v_edit_request uuid;
  v_capture_request uuid;
  v_replacement_request uuid;
  v_review_request uuid;
  v_override_blocker uuid;
  v_override_target uuid;
  v_queue_blocker uuid;
  v_queue_target uuid;
  v_queue_later uuid;
  v_cancelled_capture uuid;
  v_active_capture uuid;
  v_override_id uuid;
  v_request_number bigint;
  v_created_at timestamptz;
  v_event_count integer;
  v_dashboard jsonb;
  v_changes jsonb;
begin
  select a.team_id into v_team_id
  from public.marketing_access a
  where a.managed_user_id = 'gerente-teste'
    and a.role = 'sales_manager'
    and a.active is true;
  if v_team_id is null then raise exception 'TEST_V21_MANAGER_TEAM_NOT_FOUND'; end if;

  select t.id into v_other_team_id
  from public.marketing_teams t
  where t.active is true and t.id <> v_team_id
  order by t.sort_order, t.manager_name
  limit 1;
  if v_other_team_id is null then raise exception 'TEST_V21_SECOND_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-v21-admin-session', 'sha256'), 'hex'), 'tezzei', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-v21-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-v21-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour');

  select request_id into v_edit_request
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Admin',
    p_has_property_code => true,
    p_property_reference => 'V21-ADMIN',
    p_is_exclusive => false,
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[]
  );

  v_changes := public.marketing_v2_admin_update_request(
    'test-v21-admin-session',
    v_edit_request,
    jsonb_build_object('brokerName', 'Teste V21 Corrigido', 'isExclusive', true)
  );
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_edit_request
      and q.broker_name = 'Teste V21 Corrigido'
      and q.is_exclusive is true
  ) then raise exception 'TEST_V21_ADMIN_EDIT_FAILED'; end if;
  if (select count(*) from jsonb_object_keys(v_changes)) <> 2
    or not (v_changes ? 'brokerName')
    or not (v_changes ? 'isExclusive') then
    raise exception 'TEST_V21_ADMIN_CHANGES_NOT_MINIMAL';
  end if;
  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id = v_edit_request
      and e.event_type = 'pedido_editado_admin'
      and e.actor_user_id = 'tezzei'
      and e.details->'changes' ? 'brokerName'
      and e.details->'changes' ? 'isExclusive'
  ) then raise exception 'TEST_V21_ADMIN_EDIT_AUDIT_FAILED'; end if;

  begin
    perform public.marketing_v2_admin_update_request(
      'test-v21-marketing-session', v_edit_request, jsonb_build_object('brokerName', 'Negado Marketing')
    );
    raise exception 'TEST_V21_EXPECTED_MARKETING_ADMIN_EDIT_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_ADMIN_REQUIRED%' then raise; end if;
  end;
  begin
    perform public.marketing_v2_admin_update_request(
      'test-v21-manager-session', v_edit_request, jsonb_build_object('brokerName', 'Negado Gerente')
    );
    raise exception 'TEST_V21_EXPECTED_MANAGER_ADMIN_EDIT_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_ADMIN_REQUIRED%' then raise; end if;
  end;

  select request_id into v_capture_request
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Agenda Excluída',
    p_has_property_code => false,
    p_property_reference => null,
    p_is_exclusive => true,
    p_request_kind => 'capture_edit',
    p_content_types => array['fotos']::text[],
    p_capture_location => 'Local V21'
  );
  perform public.marketing_v2_update_request(
    'test-v21-marketing-session',
    v_capture_request,
    'save_management',
    jsonb_build_object(
      'confirmedCaptureAt', '2026-09-02T13:00:00.000Z',
      'confirmedCaptureDurationMinutes', 60,
      'assignedMarketingName', 'Maria'
    )
  );
  select q.request_number, q.created_at into v_request_number, v_created_at
  from public.marketing_requests q where q.id = v_capture_request;
  select count(*) into v_event_count
  from public.marketing_request_events e where e.request_id = v_capture_request;

  perform public.marketing_v2_admin_delete_request(
    'test-v21-admin-session', v_capture_request, 'Exclusão temporária do teste V2.1'
  );
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_capture_request
      and q.deleted_at is not null
      and q.deleted_by_user_id = 'tezzei'
      and q.deletion_reason = 'Exclusão temporária do teste V2.1'
  ) then raise exception 'TEST_V21_SOFT_DELETE_FAILED'; end if;
  if (select count(*) from public.marketing_request_events e where e.request_id = v_capture_request) <> v_event_count + 1 then
    raise exception 'TEST_V21_PREVIOUS_EVENTS_NOT_PRESERVED';
  end if;
  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id = v_capture_request
      and e.event_type = 'pedido_excluido_admin'
      and e.actor_user_id = 'tezzei'
  ) then raise exception 'TEST_V21_DELETE_AUDIT_FAILED'; end if;

  v_dashboard := public.marketing_v2_get_dashboard_review('test-v21-admin-session');
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'requests') item
    where item->>'id' = v_capture_request::text
  ) then raise exception 'TEST_V21_DELETED_VISIBLE_IN_CENTRAL'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'occupiedCaptureSlots') item
    where item->>'requestId' = v_capture_request::text
  ) then raise exception 'TEST_V21_DELETED_VISIBLE_IN_AGENDA'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'notifications') item
    where item->>'requestId' = v_capture_request::text
  ) then raise exception 'TEST_V21_DELETED_NOTIFICATION_VISIBLE'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_dashboard->'deletedRequests') item
    where item->>'id' = v_capture_request::text
      and jsonb_array_length(item->'events') >= v_event_count + 1
  ) then raise exception 'TEST_V21_ADMIN_DELETED_LIST_FAILED'; end if;

  v_dashboard := public.marketing_v2_get_dashboard_review('test-v21-manager-session');
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'requests') item
    where item->>'id' = v_capture_request::text
  ) then raise exception 'TEST_V21_DELETED_VISIBLE_IN_MY_TEAM'; end if;
  if jsonb_array_length(coalesce(v_dashboard->'deletedRequests', '[]'::jsonb)) <> 0 then
    raise exception 'TEST_V21_DELETED_LIST_EXPOSED_TO_MANAGER';
  end if;

  begin
    perform public.marketing_v2_update_request(
      'test-v21-marketing-session', v_capture_request, 'save_management', jsonb_build_object('assignedMarketingName', 'Arthur')
    );
    raise exception 'TEST_V21_EXPECTED_DELETED_OPERATION_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_REQUEST_NOT_FOUND%' and sqlerrm not like '%MARKETING_REQUEST_DELETED%' then raise; end if;
  end;
  begin
    perform public.marketing_v2_open_manager_review(
      'test-v21-marketing-session', v_capture_request, 'other', 'Tentativa de auditoria em excluído.'
    );
    raise exception 'TEST_V21_EXPECTED_DELETED_REVIEW_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_REQUEST_DELETED%' then raise; end if;
  end;
  begin
    perform public.marketing_v2_request_queue_override(
      'test-v21-marketing-session', v_capture_request, 'Tentativa em pedido excluído.'
    );
    raise exception 'TEST_V21_EXPECTED_DELETED_OVERRIDE_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_REQUEST_NOT_FOUND%' then raise; end if;
  end;
  begin
    insert into public.marketing_notifications(recipient_user_id, request_id, type, title, message)
    values ('gerente-teste', v_capture_request, 'teste_v21', 'Teste', 'Não deve ser criada');
    raise exception 'TEST_V21_EXPECTED_DELETED_NOTIFICATION_DENIED';
  exception when others then
    if sqlerrm not like '%MARKETING_REQUEST_DELETED%' then raise; end if;
  end;

  select request_id into v_replacement_request
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Horário Liberado',
    p_has_property_code => true,
    p_property_reference => 'V21-LIVRE',
    p_is_exclusive => false,
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_capture_location => 'Local V21'
  );
  perform public.marketing_v2_update_request(
    'test-v21-marketing-session',
    v_replacement_request,
    'save_management',
    jsonb_build_object(
      'confirmedCaptureAt', '2026-09-02T13:00:00.000Z',
      'confirmedCaptureDurationMinutes', 60
    )
  );
  begin
    perform public.marketing_v2_admin_restore_request('test-v21-admin-session', v_capture_request);
    raise exception 'TEST_V21_EXPECTED_RESTORE_CONFLICT';
  exception when others then
    if sqlerrm not like '%MARKETING_RESTORE_CAPTURE_CONFLICT%' then raise; end if;
  end;
  perform public.marketing_v2_admin_delete_request(
    'test-v21-admin-session', v_replacement_request, 'Liberar horário para testar restauração'
  );
  perform public.marketing_v2_admin_restore_request('test-v21-admin-session', v_capture_request);
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_capture_request
      and q.deleted_at is null
      and q.request_number = v_request_number
      and q.created_at = v_created_at
  ) then raise exception 'TEST_V21_RESTORE_DID_NOT_PRESERVE_IDENTITY'; end if;
  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id = v_capture_request and e.event_type = 'pedido_restaurado_admin'
  ) then raise exception 'TEST_V21_RESTORE_AUDIT_FAILED'; end if;

  select request_id into v_review_request
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Auditoria',
    p_has_property_code => true,
    p_property_reference => 'V21-REV',
    p_is_exclusive => true,
    p_request_kind => 'edit_only',
    p_content_types => array['carrossel']::text[]
  );
  perform public.marketing_v2_open_manager_review(
    'test-v21-marketing-session', v_review_request, 'other', 'Auditoria temporária para preservar histórico.'
  );
  perform public.marketing_v2_admin_delete_request(
    'test-v21-admin-session', v_review_request, 'Excluir pedido com auditoria histórica'
  );
  if not exists (
    select 1 from public.marketing_manager_reviews r where r.request_id = v_review_request
  ) then raise exception 'TEST_V21_REVIEW_HISTORY_REMOVED'; end if;
  v_dashboard := public.marketing_v2_get_dashboard_review('test-v21-admin-session');
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'managerReviews') item
    where item->>'requestId' = v_review_request::text
  ) then raise exception 'TEST_V21_DELETED_REVIEW_VISIBLE_OPERATIONALLY'; end if;

  select request_id into v_override_blocker
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Override Bloqueador', p_has_property_code => true,
    p_property_reference => 'V21-OVR-A', p_is_exclusive => false,
    p_request_kind => 'edit_only', p_content_types => array['video']::text[]
  );
  select request_id into v_override_target
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Override Excluído', p_has_property_code => true,
    p_property_reference => 'V21-OVR-B', p_is_exclusive => false,
    p_request_kind => 'edit_only', p_content_types => array['video']::text[]
  );
  update public.marketing_requests set urgency_approved = true, created_at = '2001-01-01T10:00:00Z' where id = v_override_blocker;
  update public.marketing_requests set urgency_approved = true, created_at = '2001-01-02T10:00:00Z' where id = v_override_target;
  v_override_id := public.marketing_v2_request_queue_override(
    'test-v21-marketing-session', v_override_target, 'Override histórico temporário.'
  );
  perform public.marketing_v2_admin_delete_request(
    'test-v21-admin-session', v_override_target, 'Excluir pedido com override histórico'
  );
  if not exists (
    select 1 from public.marketing_queue_override_requests o where o.id = v_override_id
  ) then raise exception 'TEST_V21_OVERRIDE_HISTORY_REMOVED'; end if;
  v_dashboard := public.marketing_v2_get_dashboard_review('test-v21-admin-session');
  if exists (
    select 1 from jsonb_array_elements(v_dashboard->'queueOverrideRequests') item
    where item->>'requestId' = v_override_target::text
  ) then raise exception 'TEST_V21_DELETED_OVERRIDE_VISIBLE_OPERATIONALLY'; end if;
  perform public.marketing_v2_admin_delete_request(
    'test-v21-admin-session', v_override_blocker, 'Encerrar bloqueador do cenário de override'
  );

  select request_id into v_queue_blocker
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Fila Excluído', p_has_property_code => true,
    p_property_reference => 'V21-FILA-A', p_is_exclusive => false,
    p_request_kind => 'edit_only', p_content_types => array['video']::text[]
  );
  select request_id into v_queue_target
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Fila Seguinte', p_has_property_code => true,
    p_property_reference => 'V21-FILA-B', p_is_exclusive => false,
    p_request_kind => 'edit_only', p_content_types => array['video']::text[]
  );
  update public.marketing_requests set urgency_approved = true, created_at = '2002-01-01T10:00:00Z' where id = v_queue_blocker;
  update public.marketing_requests set urgency_approved = true, created_at = '2002-01-02T10:00:00Z' where id = v_queue_target;
  perform public.marketing_v2_admin_delete_request(
    'test-v21-admin-session', v_queue_blocker, 'Bloqueador temporariamente excluído'
  );
  perform public.marketing_v2_update_request(
    'test-v21-marketing-session', v_queue_target, 'save_management', jsonb_build_object('status', 'aguardando_edicao')
  );
  if not exists (
    select 1 from public.marketing_requests q where q.id = v_queue_target and q.status = 'aguardando_edicao'
  ) then raise exception 'TEST_V21_DELETED_STILL_BLOCKS_QUEUE'; end if;

  perform public.marketing_v2_admin_restore_request('test-v21-admin-session', v_queue_blocker);
  select request_id into v_queue_later
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Fila Após Restauração', p_has_property_code => true,
    p_property_reference => 'V21-FILA-C', p_is_exclusive => true,
    p_request_kind => 'edit_only', p_content_types => array['video']::text[]
  );
  update public.marketing_requests set urgency_approved = true, created_at = '2002-01-03T10:00:00Z' where id = v_queue_later;
  begin
    perform public.marketing_v2_update_request(
      'test-v21-marketing-session', v_queue_later, 'save_management', jsonb_build_object('status', 'aguardando_edicao')
    );
    raise exception 'TEST_V21_EXPECTED_RESTORED_QUEUE_BLOCK';
  exception when others then
    if sqlerrm not like '%MARKETING_QUEUE_ORDER_BLOCKED%' then raise; end if;
  end;

  select request_id into v_cancelled_capture
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Captação Cancelada', p_has_property_code => true,
    p_property_reference => 'V21-CANCEL', p_is_exclusive => false,
    p_request_kind => 'capture_edit', p_content_types => array['video']::text[]
  );
  perform public.marketing_v2_update_request(
    'test-v21-marketing-session', v_cancelled_capture, 'save_management',
    jsonb_build_object('status', 'cancelado', 'confirmedCaptureAt', '2026-09-03T14:00:00.000Z', 'confirmedCaptureDurationMinutes', 60)
  );
  select request_id into v_active_capture
  from public.marketing_v2_create_request(
    p_session_token => 'test-v21-manager-session', p_team_id => v_team_id,
    p_broker_name => 'Teste V21 Captação Ativa', p_has_property_code => true,
    p_property_reference => 'V21-ATIVA', p_is_exclusive => true,
    p_request_kind => 'capture_edit', p_content_types => array['video']::text[]
  );
  perform public.marketing_v2_update_request(
    'test-v21-marketing-session', v_active_capture, 'save_management',
    jsonb_build_object('confirmedCaptureAt', '2026-09-03T14:00:00.000Z', 'confirmedCaptureDurationMinutes', 60)
  );
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_cancelled_capture and q.status = 'cancelado'
  ) or not exists (
    select 1 from public.marketing_requests q
    where q.id = v_active_capture and q.confirmed_capture_at = '2026-09-03T14:00:00.000Z'::timestamptz
  ) then raise exception 'TEST_V21_CANCELLED_CAPTURE_STILL_BLOCKS'; end if;

  if has_table_privilege('anon', 'public.marketing_requests', 'select')
    or has_table_privilege('anon', 'public.marketing_notifications', 'select')
    or has_table_privilege('anon', 'public.marketing_manager_reviews', 'select') then
    raise exception 'TEST_V21_ANON_DIRECT_SELECT_GRANTED';
  end if;

  if exists (
    select 1
    from marketing_v21_real_request_snapshot snapshot
    join public.marketing_requests q on q.id = snapshot.id
    where to_jsonb(q) is distinct from snapshot.row_data
  ) then raise exception 'TEST_V21_REAL_REQUESTS_3_4_CHANGED'; end if;
end;
$test$;
