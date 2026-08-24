-- Execute after the operation-adjustments migration in the same transaction and finish with ROLLBACK.
create temporary table marketing_operation_real_snapshot on commit drop as
select q.id, to_jsonb(q) as row_data
from public.marketing_requests q
where q.request_number in (3, 4);

do $test$
declare
  v_team_id uuid;
  v_group_id uuid := '11111111-2222-4333-8444-555555555555';
  v_first_submission uuid := '21111111-2222-4333-8444-555555555555';
  v_second_submission uuid := '31111111-2222-4333-8444-555555555555';
  v_third_submission uuid := '41111111-2222-4333-8444-555555555555';
  v_first_request uuid;
  v_second_request uuid;
  v_afternoon_request uuid;
  v_operation jsonb;
  v_public_availability jsonb;
  v_first_number bigint;
  v_second_number bigint;
begin
  select a.team_id into v_team_id
  from public.marketing_access a
  where a.managed_user_id = 'gerente-teste'
    and a.role = 'sales_manager'
    and a.active is true;
  if v_team_id is null then raise exception 'TEST_OPERATION_MANAGER_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-operation-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-operation-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour');

  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_first_submission,
    p_requester_name => 'Solicitante Grupo Teste',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Saída Teste',
    p_has_property_code => true,
    p_property_reference => 'GRUPO-IMOVEL-1',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => true,
    p_capture_location => 'Local da saída agrupada',
    p_preferred_capture_at => '2026-09-08 08:30:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 60,
    p_capture_group_id => v_group_id
  );

  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_second_submission,
    p_requester_name => 'Solicitante Grupo Teste',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Saída Teste',
    p_has_property_code => true,
    p_property_reference => 'GRUPO-IMOVEL-2',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => false,
    p_capture_location => 'Local da saída agrupada',
    p_preferred_capture_at => '2026-09-08 08:30:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 60,
    p_capture_group_id => v_group_id
  );

  select q.id, q.request_number into v_first_request, v_first_number
  from public.marketing_requests q where q.public_submission_id = v_first_submission;
  select q.id, q.request_number into v_second_request, v_second_number
  from public.marketing_requests q where q.public_submission_id = v_second_submission;

  if v_first_request is null or v_second_request is null or v_first_request = v_second_request then
    raise exception 'TEST_OPERATION_ONE_REQUEST_PER_PROPERTY_FAILED';
  end if;
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_first_request and q.capture_group_id = v_group_id and q.property_reference = 'GRUPO-IMOVEL-1'
  ) or not exists (
    select 1 from public.marketing_requests q
    where q.id = v_second_request and q.capture_group_id = v_group_id and q.property_reference = 'GRUPO-IMOVEL-2'
  ) then raise exception 'TEST_OPERATION_GROUP_LINK_FAILED'; end if;
  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id in (v_first_request, v_second_request)
      and e.event_type = 'saida_captacao_agrupada'
    group by e.event_type having count(*) = 2
  ) then raise exception 'TEST_OPERATION_GROUP_AUDIT_FAILED'; end if;

  begin
    perform public.marketing_v2_update_request_grouped(
      'test-operation-marketing-session',
      v_second_request,
      'save_management',
      jsonb_build_object('status', 'agendado')
    );
    raise exception 'TEST_OPERATION_EXPECTED_INDIVIDUAL_QUEUE_BLOCK';
  exception when others then
    if sqlerrm not like '%MARKETING_QUEUE_ORDER_BLOCKED%' then raise; end if;
  end;

  perform public.marketing_v2_update_request_grouped(
    'test-operation-marketing-session',
    v_first_request,
    'save_management',
    jsonb_build_object(
      'confirmedCaptureAt', '2026-09-08 08:30:00-03',
      'confirmedCaptureDurationMinutes', 60
    )
  );
  perform public.marketing_v2_update_request_grouped(
    'test-operation-marketing-session',
    v_second_request,
    'save_management',
    jsonb_build_object(
      'confirmedCaptureAt', '2026-09-08 08:30:00-03',
      'confirmedCaptureDurationMinutes', 60
    )
  );

  if (select count(*) from private.marketing_capture_reservations r where r.capture_group_id = v_group_id) <> 1 then
    raise exception 'TEST_OPERATION_GROUP_COUNTS_AS_MULTIPLE_TRIPS';
  end if;
  if not exists (
    select 1 from private.marketing_capture_reservations r
    where r.capture_group_id = v_group_id
      and r.capture_window_id = 'morning'
      and extract(epoch from (r.end_at - r.start_at))::integer / 60 = 150
  ) then raise exception 'TEST_OPERATION_MORNING_WINDOW_FAILED'; end if;

  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_third_submission,
    p_requester_name => 'Solicitante Tarde Teste',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Tarde Teste',
    p_has_property_code => true,
    p_property_reference => 'TARDE-IMOVEL-1',
    p_request_kind => 'capture_edit',
    p_content_types => array['fotos']::text[],
    p_is_exclusive => false,
    p_capture_location => 'Local da tarde'
  );
  select q.id into v_afternoon_request
  from public.marketing_requests q where q.public_submission_id = v_third_submission;

  begin
    perform public.marketing_v2_update_request_grouped(
      'test-operation-marketing-session',
      v_afternoon_request,
      'save_management',
      jsonb_build_object(
        'confirmedCaptureAt', '2026-09-08 08:30:00-03',
        'confirmedCaptureDurationMinutes', 60
      )
    );
    raise exception 'TEST_OPERATION_EXPECTED_MORNING_CONFLICT';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_CONFLICT%' then raise; end if;
  end;

  begin
    perform public.marketing_v2_update_request_grouped(
      'test-operation-marketing-session',
      v_afternoon_request,
      'save_management',
      jsonb_build_object(
        'confirmedCaptureAt', '2026-09-08 10:00:00-03',
        'confirmedCaptureDurationMinutes', 60
      )
    );
    raise exception 'TEST_OPERATION_EXPECTED_NON_PERIOD_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_WINDOW_INVALID%' then raise; end if;
  end;

  perform public.marketing_v2_update_request_grouped(
    'test-operation-marketing-session',
    v_afternoon_request,
    'save_management',
    jsonb_build_object(
      'confirmedCaptureAt', '2026-09-08 14:00:00-03',
      'confirmedCaptureDurationMinutes', 60
    )
  );

  if (select count(*) from private.marketing_capture_reservations r where (r.start_at at time zone 'America/Sao_Paulo')::date = date '2026-09-08') <> 2 then
    raise exception 'TEST_OPERATION_DAILY_MAX_TWO_FAILED';
  end if;

  v_public_availability := public.marketing_public_get_availability_v22();
  if jsonb_array_length(v_public_availability->'scheduleConfig'->'captureWindows') <> 2
    or exists (
      select 1 from jsonb_array_elements(v_public_availability->'occupiedCaptureSlots') slot
      where slot ? 'requestId' or slot ? 'captureGroupId' or slot ? 'brokerName'
    ) then raise exception 'TEST_OPERATION_PUBLIC_AVAILABILITY_NOT_SANITIZED'; end if;

  v_operation := public.marketing_v2_get_operation_schedule('test-operation-manager-session');
  if not exists (
    select 1 from jsonb_array_elements(v_operation->'captureGroups') grouped
    where grouped->>'captureGroupId' = v_group_id::text
      and jsonb_array_length(grouped->'requestIds') = 2
      and (grouped->'requestNumbers') @> jsonb_build_array(v_first_number, v_second_number)
  ) then raise exception 'TEST_OPERATION_GROUP_DETAILS_FAILED'; end if;
  if jsonb_array_length(v_operation->'occupiedCaptureSlots') <> 2 then
    raise exception 'TEST_OPERATION_AGENDA_NOT_GROUPED';
  end if;

  if has_table_privilege('anon', 'public.marketing_capture_groups', 'select')
    or has_table_privilege('anon', 'public.marketing_capture_windows', 'select')
    or has_table_privilege('anon', 'private.marketing_capture_reservations', 'select') then
    raise exception 'TEST_OPERATION_ANON_TABLE_ACCESS_GRANTED';
  end if;
  if to_regprocedure('public.marketing_public_create_request(uuid,text,uuid,text,boolean,text,text,text[],boolean,text,timestamptz,integer,text,boolean,text,boolean,text,text)') is null
    or to_regprocedure('public.marketing_v2_update_request(text,uuid,text,jsonb)') is null then
    raise exception 'TEST_OPERATION_LEGACY_RPC_REMOVED';
  end if;

  if exists (
    select 1
    from marketing_operation_real_snapshot snapshot
    join public.marketing_requests q on q.id = snapshot.id
    where to_jsonb(q) is distinct from snapshot.row_data
  ) then raise exception 'TEST_OPERATION_REAL_REQUESTS_CHANGED'; end if;
end;
$test$;
