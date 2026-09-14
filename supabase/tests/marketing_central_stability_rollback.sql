-- Run only after 20260914170440_marketing_central_stability.sql.
-- All fixture writes are rolled back.
begin;

do $test$
declare
  v_team_id uuid;
  v_manager_team_id uuid;
  v_group_id uuid := gen_random_uuid();
  v_request_a uuid := gen_random_uuid();
  v_request_b uuid := gen_random_uuid();
  v_request_c uuid := gen_random_uuid();
  v_request_d uuid := gen_random_uuid();
  v_request_e uuid := gen_random_uuid();
  v_slot timestamptz;
  v_special_slot timestamptz;
  v_group_slot timestamptz;
  v_preferred_only_slot timestamptz;
  v_updated_at timestamptz;
  v_ack_count integer;
begin
  select a.team_id into v_manager_team_id
  from public.marketing_access a
  where a.managed_user_id = 'gerente-teste' and a.active is true;
  v_team_id := v_manager_team_id;
  if v_team_id is null then
    select t.id into v_team_id from public.marketing_teams t where t.active is true order by t.sort_order limit 1;
  end if;
  if v_team_id is null then raise exception 'TEST_TEAM_NOT_FOUND'; end if;

  v_slot := (
    select (candidate::date + time '09:00') at time zone 'America/Sao_Paulo'
    from generate_series(
      ((now() at time zone 'America/Sao_Paulo')::date + 7)::timestamp,
      ((now() at time zone 'America/Sao_Paulo')::date + 14)::timestamp,
      interval '1 day'
    ) candidate
    where extract(isodow from candidate) between 1 and 5
      and not exists (
        select 1
        from private.marketing_schedule_occupied_slots() occupied
        where tstzrange(occupied.start_at, occupied.end_at, '[)')
          && tstzrange(
            (candidate::date + time '09:00') at time zone 'America/Sao_Paulo',
            (candidate::date + time '10:00') at time zone 'America/Sao_Paulo',
            '[)'
          )
      )
      and not exists (
        select 1
        from private.marketing_schedule_occupied_slots() occupied
        where tstzrange(occupied.start_at, occupied.end_at, '[)')
          && tstzrange(
            (candidate::date + time '14:00') at time zone 'America/Sao_Paulo',
            (candidate::date + time '15:00') at time zone 'America/Sao_Paulo',
            '[)'
          )
      )
    order by candidate
    limit 1
  );
  v_special_slot := date_trunc('day', v_slot at time zone 'America/Sao_Paulo') + time '12:30';
  v_special_slot := v_special_slot at time zone 'America/Sao_Paulo';
  v_group_slot := v_slot + interval '5 hours';
  v_preferred_only_slot := (
    select (candidate::date + time '10:00') at time zone 'America/Sao_Paulo'
    from generate_series(
      ((now() at time zone 'America/Sao_Paulo')::date + 15)::timestamp,
      ((now() at time zone 'America/Sao_Paulo')::date + 21)::timestamp,
      interval '1 day'
    ) candidate
    where extract(isodow from candidate) between 1 and 5
      and not exists (
        select 1
        from private.marketing_schedule_occupied_slots() occupied
        where tstzrange(occupied.start_at, occupied.end_at, '[)')
          && tstzrange(
            (candidate::date + time '10:00') at time zone 'America/Sao_Paulo',
            (candidate::date + time '11:00') at time zone 'America/Sao_Paulo',
            '[)'
          )
      )
    order by candidate
    limit 1
  );

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('central-stability-maria', 'sha256'), 'hex'), 'maria', null, now() + interval '1 hour'),
    (encode(extensions.digest('central-stability-arthur', 'sha256'), 'hex'), 'arthur', null, now() + interval '1 hour'),
    (encode(extensions.digest('central-stability-tezzei', 'sha256'), 'hex'), 'tezzei', null, now() + interval '1 hour');

  insert into public.marketing_capture_groups(id, team_id, broker_name, requester_name, request_source)
  values (v_group_id, v_team_id, 'Fixture grupo', 'Teste transacional', 'hub');

  insert into public.marketing_requests(
    id, request_number, team_id, manager_name, broker_name, has_property_code,
    property_reference, request_kind, content_types, capture_location, is_exclusive,
    created_by_user_id, created_by_name, capture_group_id
  ) values
    (v_request_a, nextval(pg_get_serial_sequence('public.marketing_requests', 'request_number')), v_team_id, 'Fixture', 'Fixture A', true, 'TEST-A', 'capture_edit', array['video'], 'Teste', false, 'gerente-teste', 'Teste', v_group_id),
    (v_request_b, nextval(pg_get_serial_sequence('public.marketing_requests', 'request_number')), v_team_id, 'Fixture', 'Fixture B', true, 'TEST-B', 'capture_edit', array['video'], 'Teste', false, 'gerente-teste', 'Teste', v_group_id),
    (v_request_c, nextval(pg_get_serial_sequence('public.marketing_requests', 'request_number')), v_team_id, 'Fixture', 'Fixture C', true, 'TEST-C', 'capture_edit', array['video'], 'Teste', false, 'gerente-teste', 'Teste', null),
    (v_request_d, nextval(pg_get_serial_sequence('public.marketing_requests', 'request_number')), v_team_id, 'Fixture', 'Fixture D', true, 'TEST-D', 'capture_edit', array['video'], 'Teste', false, 'gerente-teste', 'Teste', null),
    (v_request_e, nextval(pg_get_serial_sequence('public.marketing_requests', 'request_number')), v_team_id, 'Fixture', 'Fixture E', true, 'TEST-E', 'capture_edit', array['video'], 'Teste', false, 'gerente-teste', 'Teste', null);

  update public.marketing_requests
  set preferred_capture_at = v_preferred_only_slot,
      preferred_capture_duration_minutes = 60
  where id = v_request_d;

  if exists (
    select 1 from private.marketing_schedule_occupied_slots() s where s.booking_key = v_request_d
  ) then raise exception 'TEST_REQUESTED_DATE_OCCUPIED_SCHEDULE'; end if;

  begin
    update public.marketing_requests
    set confirmed_capture_at = v_preferred_only_slot,
        confirmed_capture_duration_minutes = 60
    where id = v_request_d;
    raise exception 'TEST_EXPECTED_CONFIRMED_REQUESTED_STATE_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_CONFIRMED_CAPTURE_STATE_INVALID%' then raise; end if;
  end;

  update public.marketing_requests
  set assigned_marketing_name = 'Arthur',
      status = 'agendado',
      confirmed_capture_at = v_preferred_only_slot,
      confirmed_capture_duration_minutes = 60
  where id = v_request_e;

  begin
    update public.marketing_requests
    set status = 'agendado', confirmed_capture_at = v_slot, confirmed_capture_duration_minutes = 60
    where id = v_request_c;
    raise exception 'TEST_EXPECTED_ASSIGNEE_REQUIRED';
  exception when others then
    if sqlerrm not like '%MARKETING_SCHEDULE_ASSIGNEE_REQUIRED%' then raise; end if;
  end;

  begin
    update public.marketing_requests set status = 'pronto' where id = v_request_c;
    raise exception 'TEST_EXPECTED_INVALID_TRANSITION';
  exception when others then
    if sqlerrm not like '%MARKETING_STATUS_TRANSITION_INVALID%' then raise; end if;
  end;

  update public.marketing_requests
  set assigned_marketing_name = 'Maria', status = 'agendado',
      confirmed_capture_at = v_slot, confirmed_capture_duration_minutes = 60
  where id = v_request_c;

  if not exists (
    select 1 from private.marketing_capture_reservations r where r.booking_key = v_request_c
  ) then raise exception 'TEST_RESERVATION_NOT_CREATED'; end if;

  select q.updated_at into v_updated_at from public.marketing_requests q where q.id = v_request_c;
  begin
    perform public.marketing_v2_update_request_grouped(
      'central-stability-maria', v_request_c, 'save_management',
      jsonb_build_object('marketingNotes', 'stale', 'expectedUpdatedAt', v_updated_at - interval '1 second')
    );
    raise exception 'TEST_EXPECTED_STALE_WRITE';
  exception when others then
    if sqlerrm not like '%MARKETING_REQUEST_STALE%' then raise; end if;
  end;

  perform public.marketing_v2_update_request_grouped(
    'central-stability-maria', v_request_a, 'save_management',
    jsonb_build_object('assignedMarketingName', 'Maria')
  );
  if exists (
    select 1 from public.marketing_requests q
    where q.capture_group_id = v_group_id and q.assigned_marketing_name is distinct from 'Maria'
  ) then raise exception 'TEST_GROUP_ASSIGNEE_NOT_PROPAGATED'; end if;

  perform public.marketing_v2_request_period_exception(
    'central-stability-maria', v_request_a, v_special_slot, 'Teste transacional de exceção agrupada'
  );
  if (select count(*) from public.marketing_request_events e
      where e.request_id in (v_request_a, v_request_b) and e.event_type = 'excecao_agenda_solicitada') <> 2 then
    raise exception 'TEST_GROUP_SPECIAL_EVENTS_MISSING';
  end if;
  perform public.marketing_v2_acknowledge_request_alert('central-stability-tezzei', v_request_a, 'special_capture');
  select count(*) into v_ack_count
  from public.marketing_v2_get_acknowledged_request_alerts('central-stability-tezzei') a
  where a.request_id in (v_request_a, v_request_b) and a.alert_kind = 'special_capture';
  if v_ack_count <> 2 then raise exception 'TEST_GROUP_SPECIAL_ACK_FAILED'; end if;

  begin
    perform public.marketing_v2_decide_special_capture('central-stability-arthur', v_request_a, 'approved');
    raise exception 'TEST_EXPECTED_GROUP_TEZZEI_ONLY_DECISION';
  exception when others then
    if sqlerrm not like '%MARKETING_SPECIAL_DECISION_DENIED%' then raise; end if;
  end;
  perform public.marketing_v2_decide_special_capture('central-stability-tezzei', v_request_a, 'rejected');

  update public.marketing_requests
  set status = 'agendado', confirmed_capture_at = v_group_slot, confirmed_capture_duration_minutes = 60
  where id in (v_request_a, v_request_b);
  if (select count(*) from private.marketing_capture_reservations r where r.booking_key = v_group_id) <> 1 then
    raise exception 'TEST_GROUP_RESERVATION_NOT_SINGLE';
  end if;

  begin
    update public.marketing_requests set assigned_marketing_name = 'Arthur' where id = v_request_b;
    raise exception 'TEST_EXPECTED_GROUP_ASSIGNEE_MISMATCH';
  exception when others then
    if sqlerrm not like '%MARKETING_GROUP_ASSIGNEE_MISMATCH%' then raise; end if;
  end;

  perform public.marketing_v2_reschedule_request('central-stability-maria', v_request_a);
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_request_a and q.status = 'solicitado' and q.capture_group_id is null
      and q.confirmed_capture_at is null
  ) then raise exception 'TEST_GROUP_MEMBER_RESCHEDULE_FAILED'; end if;
  if not exists (
    select 1 from private.marketing_capture_reservations r
    where r.booking_key = v_group_id and r.representative_request_id = v_request_b
  ) then raise exception 'TEST_GROUP_RESERVATION_LOST_FOR_REMAINING_MEMBER'; end if;
  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id = v_request_a
      and e.event_type = 'pedido_reagendado_para_fim_da_fila'
      and e.details->>'previousCaptureGroupId' = v_group_id::text
  ) then raise exception 'TEST_PREVIOUS_GROUP_NOT_AUDITED'; end if;
  if not exists (
    select 1 from private.marketing_google_calendar_sync_queue q where q.request_id = v_request_a
  ) then raise exception 'TEST_RESCHEDULE_NOT_QUEUED_FOR_GOOGLE'; end if;

  update public.marketing_requests set assigned_marketing_name = 'Maria' where id = v_request_c;
  update public.marketing_requests
  set status = 'solicitado', confirmed_capture_at = null, confirmed_capture_duration_minutes = null
  where id = v_request_c;

  perform public.marketing_v2_request_period_exception(
    'central-stability-maria', v_request_c, v_special_slot, 'Teste transacional de horário especial'
  );
  if not exists (
    select 1 from public.marketing_requests q where q.id = v_request_c and q.special_capture_status = 'pending'
  ) then raise exception 'TEST_SPECIAL_REQUEST_NOT_PENDING'; end if;

  begin
    perform public.marketing_v2_decide_special_capture('central-stability-arthur', v_request_c, 'approved');
    raise exception 'TEST_EXPECTED_TEZZEI_ONLY_DECISION';
  exception when others then
    if sqlerrm not like '%MARKETING_SPECIAL_DECISION_DENIED%' then raise; end if;
  end;

  perform public.marketing_v2_decide_special_capture('central-stability-tezzei', v_request_c, 'approved');
  if not exists (
    select 1 from public.marketing_requests q
    where q.id = v_request_c and q.status = 'agendado'
      and q.confirmed_capture_at = v_special_slot and q.assigned_marketing_name = 'Maria'
  ) then raise exception 'TEST_SPECIAL_APPROVAL_FAILED'; end if;

  perform public.marketing_v2_acknowledge_request_alert('central-stability-tezzei', v_request_c, 'special_capture');
  select count(*) into v_ack_count
  from public.marketing_v2_get_acknowledged_request_alerts('central-stability-tezzei') a
  where a.request_id = v_request_c and a.alert_kind = 'special_capture';
  if v_ack_count <> 1 then raise exception 'TEST_SPECIAL_ACK_FAILED'; end if;

  perform public.marketing_v2_acknowledge_request_alert('central-stability-tezzei', v_request_a, 'request');
  update public.marketing_requests set queue_entered_at = now() + interval '1 second' where id = v_request_a;
  if exists (
    select 1 from public.marketing_v2_get_acknowledged_request_alerts('central-stability-tezzei') a
    where a.request_id = v_request_a and a.alert_kind = 'request'
  ) then raise exception 'TEST_RESCHEDULED_ALERT_STAYED_ACKNOWLEDGED'; end if;

  begin
    update public.marketing_requests
    set status = 'agendado',
        confirmed_capture_at = now() - interval '1 hour',
        confirmed_capture_duration_minutes = 60
    where id = v_request_a;
    raise exception 'TEST_EXPECTED_PAST_CAPTURE_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_IN_PAST%' then raise; end if;
  end;

  if pg_catalog.has_function_privilege('anon', 'private.marketing_standard_capture_period(timestamptz)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'private.marketing_standard_capture_period(timestamptz)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'private.marketing_validate_special_capture_booking(uuid,timestamptz)', 'execute') then
    raise exception 'TEST_PRIVATE_HELPER_EXECUTE_LEAK';
  end if;
end;
$test$;

rollback;
