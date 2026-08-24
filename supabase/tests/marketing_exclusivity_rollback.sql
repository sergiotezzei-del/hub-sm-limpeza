-- Execute after both Marketing V2 migrations, inside a transaction ending with ROLLBACK.
do $test$
declare
  v_team_id uuid;
  v_public_yes uuid;
  v_public_no uuid;
  v_internal_yes uuid;
  v_internal_no uuid;
  v_legacy uuid;
  v_review_id uuid;
  v_queue_first uuid;
  v_queue_second uuid;
  v_dashboard jsonb;
  v_first_queue_id uuid;
begin
  select id into v_team_id
  from public.marketing_teams
  where manager_name = 'Fernando' and active is true;
  if v_team_id is null then raise exception 'TEST_EXCLUSIVITY_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-exclusive-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-exclusive-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour');

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Exclusivo Sim',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Exclusivo Sim',
    p_has_property_code => true,
    p_property_reference => 'EXC-PUB-YES',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => true
  );
  select id into v_public_yes
  from public.marketing_requests
  where broker_name = 'Corretor Exclusivo Sim'
  order by created_at desc limit 1;
  if not exists (
    select 1 from public.marketing_requests where id = v_public_yes and is_exclusive is true
  ) then raise exception 'TEST_51_PUBLIC_EXCLUSIVE_TRUE_FAILED'; end if;

  perform public.marketing_public_create_request(
    p_submission_id => gen_random_uuid(),
    p_requester_name => 'Pessoa Exclusivo Não',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Exclusivo Não',
    p_has_property_code => true,
    p_property_reference => 'EXC-PUB-NO',
    p_request_kind => 'edit_only',
    p_content_types => array['fotos']::text[],
    p_is_exclusive => false
  );
  select id into v_public_no
  from public.marketing_requests
  where broker_name = 'Corretor Exclusivo Não'
  order by created_at desc limit 1;
  if not exists (
    select 1 from public.marketing_requests where id = v_public_no and is_exclusive is false
  ) then raise exception 'TEST_52_PUBLIC_EXCLUSIVE_FALSE_FAILED'; end if;

  begin
    perform public.marketing_public_create_request(
      p_submission_id => gen_random_uuid(),
      p_requester_name => 'Pessoa Exclusivo Ausente',
      p_team_id => v_team_id,
      p_broker_name => 'Corretor Exclusivo Ausente',
      p_has_property_code => true,
      p_property_reference => 'EXC-PUB-NULL',
      p_request_kind => 'edit_only',
      p_content_types => array['video']::text[],
      p_is_exclusive => null
    );
    raise exception 'TEST_53_EXPECTED_PUBLIC_EXCLUSIVITY_REQUIRED';
  exception when others then
    if sqlerrm not like '%MARKETING_EXCLUSIVITY_REQUIRED%' then raise; end if;
  end;

  select request_id into v_internal_yes
  from public.marketing_v2_create_request(
    p_session_token => 'test-exclusive-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Interno Exclusivo Sim',
    p_has_property_code => true,
    p_property_reference => 'EXC-HUB-YES',
    p_request_kind => 'edit_only',
    p_content_types => array['carrossel']::text[],
    p_is_exclusive => true
  );
  if not exists (
    select 1 from public.marketing_requests where id = v_internal_yes and is_exclusive is true
  ) then raise exception 'TEST_54_INTERNAL_EXCLUSIVE_TRUE_FAILED'; end if;

  select request_id into v_internal_no
  from public.marketing_v2_create_request(
    p_session_token => 'test-exclusive-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Interno Exclusivo Não',
    p_has_property_code => true,
    p_property_reference => 'EXC-HUB-NO',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => false
  );
  if not exists (
    select 1 from public.marketing_requests where id = v_internal_no and is_exclusive is false
  ) then raise exception 'TEST_55_INTERNAL_EXCLUSIVE_FALSE_FAILED'; end if;
  begin
    perform public.marketing_v2_create_request(
      p_session_token => 'test-exclusive-manager-session',
      p_team_id => v_team_id,
      p_broker_name => 'Corretor Interno Exclusivo Ausente',
      p_has_property_code => true,
      p_property_reference => 'EXC-HUB-NULL',
      p_request_kind => 'edit_only',
      p_content_types => array['video']::text[],
      p_is_exclusive => null
    );
    raise exception 'TEST_EXPECTED_INTERNAL_EXCLUSIVITY_REQUIRED';
  exception when others then
    if sqlerrm not like '%MARKETING_EXCLUSIVITY_REQUIRED%' then raise; end if;
  end;

  select request_id into v_legacy
  from public.marketing_session_create_request(
    p_session_token => 'test-exclusive-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Legado Exclusividade',
    p_has_property_code => true,
    p_property_reference => 'EXC-LEGACY',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[]
  );
  v_dashboard := public.marketing_v2_get_dashboard_review('test-exclusive-manager-session');
  if not exists (
    select 1
    from jsonb_array_elements(v_dashboard->'requests') request
    where (request->>'id')::uuid = v_legacy
      and request ? 'isExclusive'
      and request->'isExclusive' = 'null'::jsonb
  ) then raise exception 'TEST_56_LEGACY_NULL_VISIBILITY_FAILED'; end if;

  v_dashboard := public.marketing_v2_get_dashboard_review('test-exclusive-marketing-session');
  if not exists (
    select 1
    from jsonb_array_elements(v_dashboard->'requests') request
    where (request->>'id')::uuid = v_public_yes
      and (request->>'isExclusive')::boolean is true
  ) then raise exception 'TEST_57_MARKETING_EXCLUSIVITY_VISIBILITY_FAILED'; end if;

  v_dashboard := public.marketing_v2_get_dashboard_review('test-exclusive-manager-session');
  if not exists (
    select 1
    from jsonb_array_elements(v_dashboard->'requests') request
    where (request->>'id')::uuid = v_public_no
      and (request->>'isExclusive')::boolean is false
  ) then raise exception 'TEST_58_MANAGER_EXCLUSIVITY_VISIBILITY_FAILED'; end if;

  v_review_id := public.marketing_v2_open_manager_review(
    'test-exclusive-marketing-session',
    v_public_yes,
    'property_code_divergent',
    'Confirmar a informação de exclusividade.'
  );
  perform public.marketing_v2_resolve_manager_review(
    'test-exclusive-manager-session',
    v_review_id,
    'modified',
    'Exclusividade conferida com o corretor.',
    jsonb_build_object('isExclusive', false)
  );
  if not exists (
    select 1
    from public.marketing_requests q
    join public.marketing_manager_reviews r on r.request_id = q.id
    where q.id = v_public_yes and q.is_exclusive is false and r.id = v_review_id and r.status = 'modified'
  ) then raise exception 'TEST_59_REVIEW_EXCLUSIVITY_CHANGE_FAILED'; end if;
  if not exists (
    select 1
    from public.marketing_request_events
    where request_id = v_public_yes
      and event_type = 'auditoria_modificada'
      and details->'changes'->'isExclusive'->>'fromLabel' = 'Sim'
      and details->'changes'->'isExclusive'->>'toLabel' = 'Não'
  ) then raise exception 'TEST_60_EXCLUSIVITY_HISTORY_FAILED'; end if;

  select request_id into v_queue_first
  from public.marketing_v2_create_request(
    p_session_token => 'test-exclusive-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Fila Não Exclusivo',
    p_has_property_code => true,
    p_property_reference => 'EXC-QUEUE-FIRST',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => false
  );
  select request_id into v_queue_second
  from public.marketing_v2_create_request(
    p_session_token => 'test-exclusive-manager-session',
    p_team_id => v_team_id,
    p_broker_name => 'Corretor Fila Exclusivo',
    p_has_property_code => true,
    p_property_reference => 'EXC-QUEUE-SECOND',
    p_request_kind => 'edit_only',
    p_content_types => array['video']::text[],
    p_is_exclusive => true,
    p_urgency_requested => true,
    p_urgency_reason => 'Solicitação sem aprovação para testar neutralidade.'
  );
  begin
    perform public.marketing_v2_update_request(
      'test-exclusive-marketing-session',
      v_queue_second,
      'save_management',
      jsonb_build_object('status', 'aguardando_edicao')
    );
    raise exception 'TEST_61_EXPECTED_EXCLUSIVE_QUEUE_BLOCK';
  exception when others then
    if sqlerrm not like '%MARKETING_QUEUE_ORDER_BLOCKED%' then raise; end if;
  end;
  if position(
    'is_exclusive' in pg_get_functiondef(
      'public.marketing_v2_update_request(text,uuid,text,jsonb)'::regprocedure
    )
  ) <> 0 then raise exception 'TEST_61_EXCLUSIVITY_REFERENCED_BY_QUEUE_RULE'; end if;

  select id into v_first_queue_id
  from public.marketing_requests
  where id in (v_queue_first, v_queue_second)
  order by urgency_approved desc, created_at asc, request_number asc
  limit 1;
  if v_first_queue_id <> v_queue_first or not exists (
    select 1 from public.marketing_requests
    where id = v_queue_second
      and is_exclusive is true
      and urgency_requested is true
      and urgency_approved is false
      and urgency_decided_at is null
  ) then raise exception 'TEST_62_EXCLUSIVITY_PRIORITY_LEAK'; end if;
end;
$test$;
