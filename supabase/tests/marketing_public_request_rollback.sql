-- Execute after both Marketing V2 migrations, inside a transaction ending with ROLLBACK.
do $test$
declare
  v_team_id uuid;
  v_submission uuid := gen_random_uuid();
  v_request_id uuid;
  v_request_number bigint;
  v_duplicate_number bigint;
  v_later_id uuid;
  v_slot_id uuid;
  v_options jsonb;
  v_availability jsonb;
  v_dashboard jsonb;
begin
  select id into v_team_id from public.marketing_teams where manager_name = 'Fernando' and active is true;
  if v_team_id is null then raise exception 'TEST_PUBLIC_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-public-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-public-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour');

  v_options := public.marketing_public_get_options();
  if jsonb_array_length(v_options->'teams') <> 6 or v_options ? 'users' then
    raise exception 'TEST_22_PUBLIC_OPTIONS_LEAK';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_options->'teams') team
    cross join lateral jsonb_object_keys(team) key
    where key not in ('id', 'managerName')
  ) then raise exception 'TEST_22_PUBLIC_TEAM_FIELDS_LEAK'; end if;

  v_availability := public.marketing_public_get_availability();
  if (v_availability->'scheduleConfig'->>'timezone') <> 'America/Sao_Paulo' then
    raise exception 'TEST_23_PUBLIC_TIMEZONE_MISSING';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_availability->'occupiedCaptureSlots') slot
    where slot ? 'requestId'
      or slot ? 'brokerName'
      or slot ? 'managerName'
      or slot ? 'propertyReference'
      or slot ? 'assignedMarketingName'
  ) then raise exception 'TEST_23_PUBLIC_AVAILABILITY_LEAK'; end if;

  select request_number into v_request_number
  from public.marketing_public_create_request(
    p_submission_id => v_submission,
    p_requester_name => 'João Teste Público',
    p_team_id => v_team_id,
    p_broker_name => 'Marcelo Público',
    p_has_property_code => false,
    p_property_reference => null,
    p_request_kind => 'capture_edit',
    p_content_types => array['video', 'fotos']::text[],
    p_capture_location => 'Empreendimento de teste',
    p_preferred_capture_at => '2026-09-02 09:00:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 60,
    p_paid_traffic => true,
    p_requester_notes => 'Teste público com rollback.'
  );
  select id into v_request_id from public.marketing_requests where public_submission_id = v_submission;
  if v_request_id is null then raise exception 'TEST_24_PUBLIC_CREATE_FAILED'; end if;
  if not exists (
    select 1 from public.marketing_requests
    where id = v_request_id
      and request_source = 'public'
      and public_requester_name = 'João Teste Público'
      and created_by_user_id is null
      and status = 'solicitado'
      and has_property_code is false
      and property_reference = 'SEM CÓDIGO'
  ) then raise exception 'TEST_25_DIRECT_REQUEST_FAILED'; end if;
  if not exists (
    select 1 from public.marketing_request_events
    where request_id = v_request_id
      and event_type = 'criado_publicamente'
      and details->>'origin' = 'public'
  ) then raise exception 'TEST_26_PUBLIC_QUEUE_ENTRY_FAILED'; end if;
  if exists (select 1 from public.marketing_manager_reviews where request_id = v_request_id) then
    raise exception 'TEST_27_MANAGER_GATE_CREATED';
  end if;

  v_dashboard := public.marketing_v2_get_dashboard_review('test-public-manager-session');
  if not exists (
    select 1 from jsonb_array_elements(v_dashboard->'requests') request
    where (request->>'id')::uuid = v_request_id and request->>'requestSource' = 'public'
  ) then raise exception 'TEST_28_MANAGER_REQUEST_MISSING'; end if;
  v_dashboard := public.marketing_v2_get_dashboard_review('test-public-marketing-session');
  if not exists (
    select 1 from jsonb_array_elements(v_dashboard->'requests') request
    where (request->>'id')::uuid = v_request_id
  ) then raise exception 'TEST_29_MARKETING_REQUEST_MISSING'; end if;

  select request_number into v_duplicate_number
  from public.marketing_public_create_request(
    p_submission_id => v_submission,
    p_requester_name => 'João Teste Público',
    p_team_id => v_team_id,
    p_broker_name => 'Marcelo Público',
    p_has_property_code => false,
    p_property_reference => null,
    p_request_kind => 'capture_edit',
    p_content_types => array['video', 'fotos']::text[],
    p_capture_location => 'Empreendimento de teste',
    p_preferred_capture_at => '2026-09-02 09:00:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 60
  );
  if v_duplicate_number <> v_request_number
    or (select count(*) from public.marketing_requests where public_submission_id = v_submission) <> 1 then
    raise exception 'TEST_30_PUBLIC_IDEMPOTENCY_FAILED';
  end if;

  if has_table_privilege('anon', 'public.marketing_queue_override_requests', 'select')
    or has_table_privilege('anon', 'public.marketing_requests', 'select')
    or has_table_privilege('anon', 'public.marketing_notifications', 'select')
    or has_table_privilege('anon', 'public.marketing_manager_reviews', 'select') then
    raise exception 'TEST_31_TO_34_ANON_TABLE_ACCESS';
  end if;
  if not has_function_privilege('anon', 'public.marketing_public_get_options()', 'execute')
    or not has_function_privilege('anon', 'public.marketing_public_get_availability()', 'execute')
    or not has_function_privilege(
      'anon',
      'public.marketing_public_create_request(uuid,text,uuid,text,boolean,text,text,text[],text,timestamptz,integer,text,boolean,text,boolean,text,text)',
      'execute'
    ) then raise exception 'TEST_PUBLIC_RPC_GRANTS_FAILED'; end if;

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Fila Posterior',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Posterior',
    p_has_property_code => true,
    p_property_reference => 'PUB-103',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[]
  );
  select id into v_later_id from public.marketing_requests where broker_name = 'Corretor Posterior' order by created_at desc limit 1;
  begin
    perform public.marketing_v2_update_request(
      'test-public-marketing-session', v_later_id, 'save_management', jsonb_build_object('status', 'aguardando_edicao')
    );
    raise exception 'TEST_EXPECTED_PUBLIC_QUEUE_BLOCK';
  exception when others then
    if sqlerrm not like '%MARKETING_QUEUE_ORDER_BLOCKED%' then raise; end if;
  end;

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Urgência',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Urgência',
    p_has_property_code => true,
    p_property_reference => 'PUB-104',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_urgency_requested => true,
    p_urgency_reason => 'Campanha de teste ainda sem decisão do Tezzei.'
  );
  if not exists (
    select 1 from public.marketing_requests
    where broker_name = 'Corretor Urgência'
      and urgency_requested is true
      and urgency_approved is false
      and urgency_decided_at is null
  ) then raise exception 'TEST_47_PUBLIC_URGENCY_PRIVILEGE'; end if;

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Horário Base',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Horário Base',
    p_has_property_code => true,
    p_property_reference => 'PUB-105',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_capture_location => 'Local base',
    p_preferred_capture_at => null,
    p_preferred_capture_duration_minutes => null
  );
  select id into v_slot_id from public.marketing_requests where broker_name = 'Corretor Horário Base' order by created_at desc limit 1;
  perform public.marketing_v2_update_request(
    'test-public-marketing-session',
    v_slot_id,
    'save_management',
    jsonb_build_object(
      'status', 'solicitado',
      'confirmedCaptureAt', '2026-09-03T12:00:00.000Z',
      'confirmedCaptureDurationMinutes', 90
    )
  );
  begin
    perform public.marketing_public_create_request(
      p_submission_id => gen_random_uuid(),
      p_requester_name => 'Pessoa Conflito',
      p_team_id => v_team_id,
      p_broker_name => 'Corretor Conflito Público',
      p_has_property_code => true,
      p_property_reference => 'PUB-106',
      p_request_kind => 'capture_edit',
      p_content_types => array['video']::text[],
      p_capture_location => 'Local conflito',
      p_preferred_capture_at => '2026-09-03 09:30:00-03'::timestamptz,
      p_preferred_capture_duration_minutes => 60
    );
    raise exception 'TEST_EXPECTED_PUBLIC_CAPTURE_CONFLICT';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_CONFLICT%' then raise; end if;
  end;

  begin
    perform public.marketing_public_create_request(
      p_submission_id => gen_random_uuid(),
      p_requester_name => 'Pessoa Somente Edição',
      p_team_id => v_team_id,
      p_broker_name => 'Corretor Somente Edição',
      p_has_property_code => true,
      p_property_reference => 'PUB-107',
      p_request_kind => 'edit_only',
      p_content_types => array['video']::text[],
      p_capture_location => 'Não deveria existir',
      p_preferred_capture_at => '2026-09-04 09:00:00-03'::timestamptz,
      p_preferred_capture_duration_minutes => 60
    );
    raise exception 'TEST_EXPECTED_PUBLIC_EDIT_ONLY_CAPTURE_DENIAL';
  exception when others then
    if sqlerrm not like '%MARKETING_EDIT_ONLY_CAPTURE_DENIED%' then raise; end if;
  end;
end;
$test$;
