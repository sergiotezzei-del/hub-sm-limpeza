-- Run after 20260826130640_fix_marketing_public_push_critical.sql in the same
-- transaction. The caller must finish with ROLLBACK.

do $security$
declare
  v_signature regprocedure;
begin
  if not has_function_privilege('anon', 'public.marketing_public_prepare_push(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.marketing_public_prepare_push(uuid)', 'execute') then
    raise exception 'TEST_PUSH_PUBLIC_PREPARE_NOT_AVAILABLE';
  end if;

  foreach v_signature in array array[
    'public.marketing_push_register_server(text,bigint,text,text,text,text,text)'::regprocedure,
    'public.marketing_push_get_server_secrets()'::regprocedure,
    'public.marketing_push_get_dispatch_batch(uuid,boolean)'::regprocedure,
    'public.marketing_push_record_delivery_server(uuid,boolean,boolean,text)'::regprocedure,
    'public.marketing_push_record_delivery_leased_server(uuid,uuid,boolean,boolean,text)'::regprocedure,
    'public.marketing_push_ack_server(text)'::regprocedure,
    'public.marketing_push_store_vapid_keys_server(text,text)'::regprocedure
  ] loop
    if has_function_privilege('anon', v_signature, 'execute')
       or has_function_privilege('authenticated', v_signature, 'execute') then
      raise exception 'TEST_PUSH_INTERNAL_RPC_PUBLIC: %', v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'TEST_PUSH_INTERNAL_RPC_SERVICE_DENIED: %', v_signature;
    end if;
  end loop;

  if has_schema_privilege('anon', 'private', 'usage')
     or has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'TEST_PUSH_PRIVATE_SCHEMA_EXPOSED';
  end if;
end;
$security$;

set local role anon;
do $anon_denied$
begin
  begin
    perform * from public.marketing_push_get_server_secrets();
    raise exception 'TEST_PUSH_ANON_INTERNAL_RPC_WAS_EXECUTABLE';
  exception when insufficient_privilege then
    null;
  end;
end;
$anon_denied$;
reset role;

set local role authenticated;
do $authenticated_denied$
begin
  begin
    perform * from public.marketing_push_get_server_secrets();
    raise exception 'TEST_PUSH_AUTHENTICATED_INTERNAL_RPC_WAS_EXECUTABLE';
  exception when insufficient_privilege then
    null;
  end;
end;
$authenticated_denied$;
reset role;

set local role service_role;
do $service_allowed$
declare
  v_rows integer;
begin
  select count(*)::integer
    into v_rows
  from public.marketing_push_get_server_secrets();
  if v_rows <> 1 then
    raise exception 'TEST_PUSH_SERVICE_INTERNAL_RPC_FAILED';
  end if;
end;
$service_allowed$;
reset role;

do $push_flow$
declare
  v_team_id uuid;
  v_manager_name text;
  v_request_id uuid := gen_random_uuid();
  v_submission_id uuid := gen_random_uuid();
  v_prepare_first record;
  v_prepare_current record;
  v_batch_first record;
  v_batch_reclaimed record;
  v_batch_reminder record;
  v_batch_current record;
  v_old_lease uuid;
  v_request_returned uuid;
  v_event_count integer;
  v_active_event_count integer;
  v_batch_count integer;
  v_active_subscription_count integer;
  v_attempt integer;
  v_processed boolean;
  v_time_a timestamptz := '2099-01-05 11:30:00+00';
  v_time_b timestamptz := '2099-01-06 11:30:00+00';
  v_time_c timestamptz := '2099-01-07 11:30:00+00';
  v_time_d timestamptz := '2099-01-08 11:30:00+00';
begin
  select t.id, t.manager_name
    into v_team_id, v_manager_name
  from public.marketing_teams t
  where t.active is true
  order by t.sort_order, t.manager_name
  limit 1;

  if v_team_id is null then
    raise exception 'TEST_PUSH_ACTIVE_TEAM_NOT_FOUND';
  end if;

  insert into public.marketing_requests (
    id,
    request_number,
    team_id,
    manager_name,
    broker_name,
    has_property_code,
    property_reference,
    request_kind,
    content_types,
    capture_location,
    paid_traffic,
    status,
    created_by_user_id,
    created_by_name,
    is_exclusive,
    request_source,
    public_requester_name,
    public_submission_id
  ) values (
    v_request_id,
    -990001,
    v_team_id,
    v_manager_name,
    'Teste Push Rollback',
    true,
    'PUSH-ROLLBACK',
    'capture_edit',
    array['video']::text[],
    'Local Push Rollback',
    false,
    'solicitado',
    null,
    'Solicitante Push Rollback',
    false,
    'public',
    'Solicitante Push Rollback',
    v_submission_id
  );

  select * into v_prepare_first
  from public.marketing_public_prepare_push(v_submission_id);
  select * into v_prepare_current
  from public.marketing_public_prepare_push(v_submission_id);

  if v_prepare_current.expires_at <= clock_timestamp() + interval '25 minutes'
     or v_prepare_current.expires_at > clock_timestamp() + interval '31 minutes' then
    raise exception 'TEST_PUSH_CLAIM_TTL_INVALID';
  end if;

  if not exists (
    select 1
    from private.marketing_push_claims c
    where c.token_hash = encode(extensions.digest(v_prepare_first.claim_token, 'sha256'), 'hex')
      and c.revoked_at is not null
  ) then
    raise exception 'TEST_PUSH_PREVIOUS_CLAIM_NOT_REVOKED';
  end if;

  if (
    select count(*)
    from private.marketing_push_claims c
    where c.request_id = v_request_id
      and c.consumed_at is null
      and c.revoked_at is null
  ) <> 1 then
    raise exception 'TEST_PUSH_MULTIPLE_ACTIVE_CLAIMS';
  end if;

  select public.marketing_push_register_server(
    v_prepare_current.claim_token,
    null,
    null,
    'https://push.example.test/subscription/primary-0000000001',
    repeat('p', 64),
    repeat('a', 24),
    'Marketing Push rollback test'
  ) into v_request_returned;

  if v_request_returned is distinct from v_request_id then
    raise exception 'TEST_PUSH_REGISTER_WRONG_REQUEST';
  end if;
  if not exists (
    select 1
    from private.marketing_push_claims c
    where c.token_hash = encode(extensions.digest(v_prepare_current.claim_token, 'sha256'), 'hex')
      and c.consumed_at is not null
      and c.consumed_by_subscription_id is not null
  ) then
    raise exception 'TEST_PUSH_CLAIM_NOT_CONSUMED';
  end if;

  begin
    perform public.marketing_push_register_server(
      v_prepare_current.claim_token,
      null,
      null,
      'https://push.example.test/subscription/replay-00000000001',
      repeat('p', 64),
      repeat('a', 24),
      'Marketing Push replay test'
    );
    raise exception 'TEST_PUSH_CONSUMED_CLAIM_REUSED';
  exception when others then
    if sqlerrm not like '%MARKETING_PUSH_CLAIM_INVALID%'
       and sqlerrm not like '%MARKETING_PUSH_CLAIM_ALREADY_USED%' then
      raise;
    end if;
  end;

  update public.marketing_requests r
  set status = 'agendado',
      confirmed_capture_at = v_time_a,
      confirmed_capture_duration_minutes = 60
  where r.id = v_request_id;

  select * into v_batch_first
  from public.marketing_push_get_dispatch_batch(v_request_id, false);
  if v_batch_first.delivery_id is null or v_batch_first.lease_token is null then
    raise exception 'TEST_PUSH_INITIAL_BATCH_EMPTY';
  end if;
  v_old_lease := v_batch_first.lease_token;

  select count(*)::integer into v_batch_count
  from public.marketing_push_get_dispatch_batch(v_request_id, false);
  if v_batch_count <> 0 then
    raise exception 'TEST_PUSH_CONCURRENT_LEASE_DUPLICATED';
  end if;

  update private.marketing_push_deliveries d
  set lease_expires_at = clock_timestamp() - interval '1 second'
  where d.id = v_batch_first.delivery_id;

  select * into v_batch_reclaimed
  from public.marketing_push_get_dispatch_batch(v_request_id, false);
  if v_batch_reclaimed.delivery_id is distinct from v_batch_first.delivery_id
     or v_batch_reclaimed.lease_token is null
     or v_batch_reclaimed.lease_token = v_old_lease then
    raise exception 'TEST_PUSH_EXPIRED_LEASE_NOT_RECLAIMED';
  end if;

  select public.marketing_push_record_delivery_leased_server(
    v_batch_first.delivery_id,
    v_old_lease,
    true,
    false,
    null
  ) into v_processed;
  if v_processed is true then
    raise exception 'TEST_PUSH_STALE_LEASE_ACCEPTED';
  end if;

  select public.marketing_push_record_delivery_leased_server(
    v_batch_reclaimed.delivery_id,
    v_batch_reclaimed.lease_token,
    true,
    false,
    null
  ) into v_processed;
  if v_processed is not true then
    raise exception 'TEST_PUSH_CURRENT_LEASE_REJECTED';
  end if;

  update private.marketing_push_deliveries d
  set last_sent_at = clock_timestamp() - interval '6 minutes'
  where d.id = v_batch_reclaimed.delivery_id;

  select * into v_batch_reminder
  from public.marketing_push_get_dispatch_batch(v_request_id, true);
  if v_batch_reminder.delivery_id is null then
    raise exception 'TEST_PUSH_REMINDER_NOT_DUE';
  end if;

  if not public.marketing_push_ack_server(v_batch_reminder.ack_token) then
    raise exception 'TEST_PUSH_ACK_FAILED';
  end if;
  select count(*)::integer into v_batch_count
  from public.marketing_push_get_dispatch_batch(v_request_id, true);
  if v_batch_count <> 0 then
    raise exception 'TEST_PUSH_ACK_DID_NOT_STOP_REMINDER';
  end if;

  update public.marketing_requests r
  set confirmed_capture_at = v_time_b
  where r.id = v_request_id;
  update public.marketing_requests r
  set confirmed_capture_at = v_time_a
  where r.id = v_request_id;
  update public.marketing_requests r
  set confirmed_capture_at = v_time_b
  where r.id = v_request_id;

  select count(*)::integer,
         count(*) filter (where e.superseded_at is null)::integer
    into v_event_count, v_active_event_count
  from private.marketing_push_events e
  where e.request_id = v_request_id;

  if v_event_count <> 4 or v_active_event_count <> 1 then
    raise exception 'TEST_PUSH_A_B_A_B_EVENT_COUNT: total %, active %', v_event_count, v_active_event_count;
  end if;
  if not exists (
    select 1
    from private.marketing_push_events e
    where e.request_id = v_request_id
      and e.superseded_at is null
      and e.capture_at = v_time_b
  ) then
    raise exception 'TEST_PUSH_LAST_B_NOT_CURRENT';
  end if;
  if exists (
    select 1
    from private.marketing_push_deliveries d
    join private.marketing_push_events e on e.id = d.event_id
    where e.request_id = v_request_id
      and e.superseded_at is not null
      and d.invalidated_at is null
  ) then
    raise exception 'TEST_PUSH_OLD_DELIVERY_NOT_INVALIDATED';
  end if;

  select * into v_batch_current
  from public.marketing_push_get_dispatch_batch(v_request_id, false);
  if v_batch_current.delivery_id is null
     or v_batch_current.event_id is distinct from (
       select e.id
       from private.marketing_push_events e
       where e.request_id = v_request_id and e.superseded_at is null
     ) then
    raise exception 'TEST_PUSH_NON_CURRENT_EVENT_DISPATCHED';
  end if;

  update public.marketing_requests r
  set status = 'cancelado'
  where r.id = v_request_id;
  select count(*)::integer into v_batch_count
  from public.marketing_push_get_dispatch_batch(v_request_id, true);
  if v_batch_count <> 0 then
    raise exception 'TEST_PUSH_CANCELLED_STILL_DISPATCHED';
  end if;

  update public.marketing_requests r
  set status = 'agendado',
      confirmed_capture_at = v_time_c
  where r.id = v_request_id;
  update public.marketing_requests r
  set confirmed_capture_at = '2020-01-06 11:30:00+00'
  where r.id = v_request_id;
  select count(*)::integer into v_batch_count
  from public.marketing_push_get_dispatch_batch(v_request_id, true);
  if v_batch_count <> 0 then
    raise exception 'TEST_PUSH_PAST_CAPTURE_STILL_DISPATCHED';
  end if;

  update public.marketing_requests r
  set confirmed_capture_at = v_time_d
  where r.id = v_request_id;

  for v_attempt in 1..12 loop
    if v_attempt = 1 then
      select * into v_batch_current
      from public.marketing_push_get_dispatch_batch(v_request_id, false);
    else
      update private.marketing_push_deliveries d
      set last_sent_at = clock_timestamp() - interval '6 minutes'
      where d.id = v_batch_current.delivery_id;
      select * into v_batch_current
      from public.marketing_push_get_dispatch_batch(v_request_id, true);
    end if;

    if v_batch_current.delivery_id is null then
      raise exception 'TEST_PUSH_ATTEMPT_MISSING: %', v_attempt;
    end if;
    if not public.marketing_push_record_delivery_leased_server(
      v_batch_current.delivery_id,
      v_batch_current.lease_token,
      false,
      false,
      'Falha controlada de rollback'
    ) then
      raise exception 'TEST_PUSH_ATTEMPT_RECORD_FAILED: %', v_attempt;
    end if;
  end loop;

  update private.marketing_push_deliveries d
  set last_sent_at = clock_timestamp() - interval '6 minutes'
  where d.id = v_batch_current.delivery_id;
  select count(*)::integer into v_batch_count
  from public.marketing_push_get_dispatch_batch(v_request_id, true);
  if v_batch_count <> 0 then
    raise exception 'TEST_PUSH_ATTEMPT_LIMIT_IGNORED';
  end if;

  -- Three active endpoints are allowed; a fourth is rejected.
  for v_attempt in 2..4 loop
    select * into v_prepare_current
    from public.marketing_public_prepare_push(v_submission_id);
    begin
      perform public.marketing_push_register_server(
        v_prepare_current.claim_token,
        null,
        null,
        'https://push.example.test/subscription/limited-' || v_attempt::text || '-0000000000',
        repeat('p', 64),
        repeat('a', 24),
        'Marketing Push subscription limit test'
      );
      if v_attempt = 4 then
        raise exception 'TEST_PUSH_SUBSCRIPTION_LIMIT_IGNORED';
      end if;
    exception when others then
      if v_attempt <> 4 or sqlerrm not like '%MARKETING_PUSH_SUBSCRIPTION_LIMIT_REACHED%' then
        raise;
      end if;
    end;
  end loop;

  select count(*)::integer
    into v_active_subscription_count
  from private.marketing_push_subscriptions s
  where s.request_id = v_request_id
    and s.active is true;
  if v_active_subscription_count <> 3 then
    raise exception 'TEST_PUSH_SUBSCRIPTION_LIMIT_COUNT: %', v_active_subscription_count;
  end if;
end;
$push_flow$;
