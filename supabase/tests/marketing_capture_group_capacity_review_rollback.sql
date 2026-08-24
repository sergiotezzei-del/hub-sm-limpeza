-- Execute após as migrations da PR #124 dentro de uma transação e finalize com ROLLBACK.
-- Não altera dados reais de forma permanente.

create temporary table marketing_capacity_real_snapshot on commit drop as
select q.id, to_jsonb(q) as row_data
from public.marketing_requests q
where q.request_number in (3, 4);

do $test$
declare
  v_manager_team uuid;
  v_other_team uuid;
  v_group_morning uuid := '51111111-2222-4333-8444-555555555551';
  v_group_afternoon uuid := '51111111-2222-4333-8444-555555555552';
  v_submission_1 uuid := '61111111-2222-4333-8444-555555555551';
  v_submission_2 uuid := '61111111-2222-4333-8444-555555555552';
  v_submission_3 uuid := '61111111-2222-4333-8444-555555555553';
  v_submission_4 uuid := '61111111-2222-4333-8444-555555555554';
  v_submission_5 uuid := '61111111-2222-4333-8444-555555555555';
  v_submission_6 uuid := '61111111-2222-4333-8444-555555555556';
  v_submission_7 uuid := '61111111-2222-4333-8444-555555555557';
  v_submission_other uuid := '61111111-2222-4333-8444-555555555558';
  v_other_request uuid;
  v_manager_schedule jsonb;
  v_public_schedule jsonb;
begin
  select a.team_id into v_manager_team
  from public.marketing_access a
  where a.managed_user_id = 'gerente-teste'
    and a.role = 'sales_manager'
    and a.active is true;
  if v_manager_team is null then raise exception 'TEST_CAPACITY_MANAGER_TEAM_NOT_FOUND'; end if;

  select t.id into v_other_team
  from public.marketing_teams t
  where t.active is true and t.id <> v_manager_team
  order by t.manager_name
  limit 1;
  if v_other_team is null then raise exception 'TEST_CAPACITY_OTHER_TEAM_NOT_FOUND'; end if;

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values
    (encode(extensions.digest('test-capacity-marketing-session', 'sha256'), 'hex'), 'mkteste', null, now() + interval '1 hour'),
    (encode(extensions.digest('test-capacity-manager-session', 'sha256'), 'hex'), 'gerente-teste', null, now() + interval '1 hour');

  if (select duration_options_minutes from public.marketing_schedule_settings where id = 'default')
    is distinct from array[30, 60, 90, 120]::integer[] then
    raise exception 'TEST_CAPACITY_DURATION_OPTIONS_FAILED';
  end if;

  -- Manhã: 90 + 60 = 150 minutos, capacidade máxima permitida.
  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_submission_1,
    p_requester_name => 'Solicitante Capacidade',
    p_team_id => v_manager_team,
    p_broker_name => 'Corretor Capacidade',
    p_has_property_code => true,
    p_property_reference => 'CAP-M-1',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => true,
    p_capture_location => 'Local 1',
    p_preferred_capture_at => '2026-09-15 08:30:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 90,
    p_capture_group_id => v_group_morning
  );

  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_submission_2,
    p_requester_name => 'Solicitante Capacidade',
    p_team_id => v_manager_team,
    p_broker_name => 'Corretor Capacidade',
    p_has_property_code => true,
    p_property_reference => 'CAP-M-2',
    p_request_kind => 'capture_edit',
    p_content_types => array['fotos']::text[],
    p_is_exclusive => false,
    p_capture_location => 'Local 2',
    p_preferred_capture_at => '2026-09-15 08:30:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 60,
    p_capture_group_id => v_group_morning
  );

  if (select coalesce(sum(q.preferred_capture_duration_minutes), 0)
      from public.marketing_requests q
      where q.capture_group_id = v_group_morning and q.deleted_at is null and q.status <> 'cancelado') <> 150 then
    raise exception 'TEST_CAPACITY_MORNING_150_FAILED';
  end if;

  begin
    perform public.marketing_public_create_grouped_request(
      p_submission_id => v_submission_3,
      p_requester_name => 'Solicitante Capacidade',
      p_team_id => v_manager_team,
      p_broker_name => 'Corretor Capacidade',
      p_has_property_code => true,
      p_property_reference => 'CAP-M-3',
      p_request_kind => 'capture_edit',
      p_content_types => array['video']::text[],
      p_is_exclusive => false,
      p_capture_location => 'Local 3',
      p_preferred_capture_at => '2026-09-15 08:30:00-03'::timestamptz,
      p_preferred_capture_duration_minutes => 30,
      p_capture_group_id => v_group_morning
    );
    raise exception 'TEST_CAPACITY_EXPECTED_MORNING_OVERFLOW';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED%' then raise; end if;
  end;

  begin
    perform public.marketing_public_create_grouped_request(
      p_submission_id => v_submission_4,
      p_requester_name => 'Solicitante Capacidade',
      p_team_id => v_manager_team,
      p_broker_name => 'Corretor Capacidade',
      p_has_property_code => true,
      p_property_reference => 'CAP-M-4',
      p_request_kind => 'capture_edit',
      p_content_types => array['video']::text[],
      p_is_exclusive => false,
      p_capture_location => 'Local 4',
      p_preferred_capture_at => '2026-09-15 14:00:00-03'::timestamptz,
      p_preferred_capture_duration_minutes => 30,
      p_capture_group_id => v_group_morning
    );
    raise exception 'TEST_CAPACITY_EXPECTED_SLOT_MISMATCH';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_GROUP_SLOT_MISMATCH%' then raise; end if;
  end;

  -- Tarde: 90 + 30 = 120 minutos, capacidade máxima permitida.
  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_submission_5,
    p_requester_name => 'Solicitante Tarde',
    p_team_id => v_manager_team,
    p_broker_name => 'Corretor Tarde',
    p_has_property_code => true,
    p_property_reference => 'CAP-T-1',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => true,
    p_capture_location => 'Local T1',
    p_preferred_capture_at => '2026-09-16 14:00:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 90,
    p_capture_group_id => v_group_afternoon
  );

  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_submission_6,
    p_requester_name => 'Solicitante Tarde',
    p_team_id => v_manager_team,
    p_broker_name => 'Corretor Tarde',
    p_has_property_code => true,
    p_property_reference => 'CAP-T-2',
    p_request_kind => 'capture_edit',
    p_content_types => array['fotos']::text[],
    p_is_exclusive => false,
    p_capture_location => 'Local T2',
    p_preferred_capture_at => '2026-09-16 14:00:00-03'::timestamptz,
    p_preferred_capture_duration_minutes => 30,
    p_capture_group_id => v_group_afternoon
  );

  begin
    perform public.marketing_public_create_grouped_request(
      p_submission_id => v_submission_7,
      p_requester_name => 'Solicitante Tarde',
      p_team_id => v_manager_team,
      p_broker_name => 'Corretor Tarde',
      p_has_property_code => true,
      p_property_reference => 'CAP-T-3',
      p_request_kind => 'capture_edit',
      p_content_types => array['video']::text[],
      p_is_exclusive => false,
      p_capture_location => 'Local T3',
      p_preferred_capture_at => '2026-09-16 14:00:00-03'::timestamptz,
      p_preferred_capture_duration_minutes => 30,
      p_capture_group_id => v_group_afternoon
    );
    raise exception 'TEST_CAPACITY_EXPECTED_AFTERNOON_OVERFLOW';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED%' then raise; end if;
  end;

  -- Novos pedidos não aceitam mais 180 minutos.
  begin
    perform public.marketing_public_create_grouped_request(
      p_submission_id => '71111111-2222-4333-8444-555555555551'::uuid,
      p_requester_name => 'Solicitante 180',
      p_team_id => v_manager_team,
      p_broker_name => 'Corretor 180',
      p_has_property_code => true,
      p_property_reference => 'CAP-180',
      p_request_kind => 'capture_edit',
      p_content_types => array['video']::text[],
      p_is_exclusive => false,
      p_capture_location => 'Local 180',
      p_preferred_capture_at => '2026-09-17 08:30:00-03'::timestamptz,
      p_preferred_capture_duration_minutes => 180,
      p_capture_group_id => '81111111-2222-4333-8444-555555555551'::uuid
    );
    raise exception 'TEST_CAPACITY_EXPECTED_180_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_WINDOW_INVALID%' then raise; end if;
  end;

  -- Cria uma reserva de outra equipe; gerente deve enxergar somente a ocupação, sem IDs internos.
  perform public.marketing_public_create_grouped_request(
    p_submission_id => v_submission_other,
    p_requester_name => 'Solicitante Outra Equipe',
    p_team_id => v_other_team,
    p_broker_name => 'Corretor Outra Equipe',
    p_has_property_code => true,
    p_property_reference => 'CAP-OUTRA',
    p_request_kind => 'capture_edit',
    p_content_types => array['video']::text[],
    p_is_exclusive => false,
    p_capture_location => 'Outro local'
  );

  select q.id into v_other_request
  from public.marketing_requests q
  where q.public_submission_id = v_submission_other;

  perform public.marketing_v2_update_request_grouped(
    'test-capacity-marketing-session',
    v_other_request,
    'save_management',
    jsonb_build_object(
      'confirmedCaptureAt', '2026-09-18 08:30:00-03',
      'confirmedCaptureDurationMinutes', 60
    )
  );

  v_manager_schedule := public.marketing_v2_get_operation_schedule('test-capacity-manager-session');
  if exists (
    select 1
    from jsonb_array_elements(v_manager_schedule->'occupiedCaptureSlots') slot
    where slot->>'startAt' like '2026-09-18%'
      and (slot ? 'requestId' or slot ? 'captureGroupId')
  ) then raise exception 'TEST_CAPACITY_MANAGER_OTHER_TEAM_IDS_LEAKED'; end if;

  v_public_schedule := public.marketing_public_get_availability_v22();
  if exists (
    select 1
    from jsonb_array_elements(v_public_schedule->'occupiedCaptureSlots') slot
    where slot ? 'requestId' or slot ? 'captureGroupId' or slot ? 'brokerName' or slot ? 'teamId'
  ) then raise exception 'TEST_CAPACITY_PUBLIC_IDS_LEAKED'; end if;

  if exists (
    select 1
    from marketing_capacity_real_snapshot snapshot
    join public.marketing_requests q on q.id = snapshot.id
    where to_jsonb(q) is distinct from snapshot.row_data
  ) then raise exception 'TEST_CAPACITY_REAL_REQUESTS_CHANGED'; end if;
end;
$test$;
