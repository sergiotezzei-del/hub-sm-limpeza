-- Marketing: horários flexíveis entre 08:00 e 18:00, em passos de 30 minutos,
-- mantendo no máximo duas saídas/agendamentos por dia.

update public.marketing_capture_windows
set active = false,
    updated_at = now()
where active is true;

create or replace function private.marketing_capture_range_is_valid(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
  v_start_minutes integer;
  v_workday_start_minutes integer;
begin
  if p_start_at is null or p_duration_minutes is null or p_duration_minutes <= 0 then
    return false;
  end if;

  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null then
    return false;
  end if;

  v_local_start := p_start_at at time zone v_settings.timezone;
  v_local_end := v_local_start + p_duration_minutes * interval '1 minute';
  v_start_minutes := extract(hour from v_local_start)::integer * 60 + extract(minute from v_local_start)::integer;
  v_workday_start_minutes := extract(hour from v_settings.workday_start)::integer * 60 + extract(minute from v_settings.workday_start)::integer;

  return extract(isodow from v_local_start)::smallint = any(v_settings.working_days)
    and date_trunc('minute', v_local_start) = v_local_start
    and mod(v_start_minutes - v_workday_start_minutes, 30) = 0
    and v_local_start::time >= v_settings.workday_start
    and v_local_end::date = v_local_start::date
    and v_local_end::time <= v_settings.workday_end;
end;
$$;

create or replace function private.marketing_capture_window_is_valid(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_options integer[];
begin
  select s.duration_options_minutes into v_options
  from public.marketing_schedule_settings s
  where s.id = 'default';

  return v_options is not null
    and p_duration_minutes = any(v_options)
    and private.marketing_capture_range_is_valid(p_start_at, p_duration_minutes);
end;
$$;

create or replace function private.marketing_capture_period_selection_is_valid(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.marketing_capture_window_is_valid(p_start_at, p_duration_minutes);
$$;

create or replace function private.marketing_capture_period_bounds(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns table (
  capture_window_id text,
  period_start_at timestamptz,
  period_end_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    null::text,
    p_start_at,
    p_start_at + p_duration_minutes * interval '1 minute'
  where p_start_at is not null
    and p_duration_minutes is not null
    and p_duration_minutes > 0;
$$;

create or replace function private.marketing_capture_period_capacity_minutes(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null or p_start_at is null then return 0; end if;

  v_local_start := p_start_at at time zone v_settings.timezone;
  v_local_end := v_local_start::date + v_settings.workday_end;
  return greatest(0, extract(epoch from (v_local_end - v_local_start))::integer / 60);
end;
$$;

create or replace function private.marketing_capture_conflicts(
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_excluded_request_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.marketing_capture_reservations r
    where r.booking_key is distinct from coalesce(
      (select q.capture_group_id from public.marketing_requests q where q.id = p_excluded_request_id),
      p_excluded_request_id
    )
      and tstzrange(r.start_at, r.end_at, '[)')
        && tstzrange(p_start_at, p_start_at + p_duration_minutes * interval '1 minute', '[)')
  );
$$;

create or replace function private.marketing_capture_period_conflicts(
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_capture_group_id uuid default null,
  p_excluded_request_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.marketing_capture_reservations r
    where r.booking_key is distinct from coalesce(p_capture_group_id, p_excluded_request_id)
      and tstzrange(r.start_at, r.end_at, '[)')
        && tstzrange(p_start_at, p_start_at + p_duration_minutes * interval '1 minute', '[)')
  );
$$;

create or replace function private.marketing_schedule_occupied_slots()
returns table (
  booking_key uuid,
  representative_request_id uuid,
  capture_group_id uuid,
  team_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  is_confirmed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_preferred as (
    select
      coalesce(q.capture_group_id, q.id) as booking_key,
      (array_agg(q.id order by q.request_number, q.id))[1] as representative_request_id,
      (array_agg(q.capture_group_id order by q.request_number, q.id))[1] as capture_group_id,
      (array_agg(q.team_id order by q.request_number, q.id))[1] as team_id,
      min(q.preferred_capture_at) as start_at,
      max(q.preferred_capture_at) as max_start_at,
      sum(q.preferred_capture_duration_minutes)::integer as total_duration,
      count(*)::integer as row_count,
      count(q.preferred_capture_at)::integer as start_count,
      count(q.preferred_capture_duration_minutes)::integer as duration_count
    from public.marketing_requests q
    where q.deleted_at is null
      and q.status <> 'cancelado'
      and q.request_kind = 'capture_edit'
    group by coalesce(q.capture_group_id, q.id)
  )
  select
    r.booking_key,
    r.representative_request_id,
    r.capture_group_id,
    q.team_id,
    r.start_at,
    r.end_at,
    true
  from private.marketing_capture_reservations r
  join public.marketing_requests q on q.id = r.representative_request_id

  union all

  select
    p.booking_key,
    p.representative_request_id,
    p.capture_group_id,
    p.team_id,
    p.start_at,
    p.start_at + p.total_duration * interval '1 minute',
    false
  from active_preferred p
  where p.row_count = p.start_count
    and p.row_count = p.duration_count
    and p.start_at is not null
    and p.start_at = p.max_start_at
    and not exists (
      select 1
      from private.marketing_capture_reservations r
      where r.booking_key = p.booking_key
    );
$$;

create or replace function private.marketing_validate_capture_booking(
  p_booking_key uuid,
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_local_date date;
  v_other_count integer;
begin
  if not private.marketing_capture_range_is_valid(p_start_at, p_duration_minutes) then
    raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
  end if;

  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  v_local_date := (p_start_at at time zone v_settings.timezone)::date;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing_capture_day:' || v_local_date::text, 0)
  );

  select count(*)::integer into v_other_count
  from private.marketing_schedule_occupied_slots() s
  where s.booking_key is distinct from p_booking_key
    and (s.start_at at time zone v_settings.timezone)::date = v_local_date;

  if v_other_count >= 2 then
    raise exception 'MARKETING_CAPTURE_DAY_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from p_booking_key
      and tstzrange(s.start_at, s.end_at, '[)')
        && tstzrange(p_start_at, p_start_at + p_duration_minutes * interval '1 minute', '[)')
  ) then
    raise exception 'MARKETING_CAPTURE_CONFLICT';
  end if;
end;
$$;

create or replace function private.marketing_validate_public_capture_group_capacity(
  p_capture_group_id uuid,
  p_preferred_capture_at timestamptz,
  p_preferred_capture_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count integer;
  v_with_preference integer;
  v_without_preference integer;
  v_existing_start timestamptz;
  v_existing_max_start timestamptz;
  v_existing_total integer;
  v_total integer;
begin
  if p_capture_group_id is null then return; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing_capture_group:' || p_capture_group_id::text, 0)
  );

  select
    count(*)::integer,
    count(*) filter (where q.preferred_capture_at is not null)::integer,
    count(*) filter (where q.preferred_capture_at is null)::integer,
    min(q.preferred_capture_at),
    max(q.preferred_capture_at),
    coalesce(sum(q.preferred_capture_duration_minutes), 0)::integer
  into
    v_active_count,
    v_with_preference,
    v_without_preference,
    v_existing_start,
    v_existing_max_start,
    v_existing_total
  from public.marketing_requests q
  where q.capture_group_id = p_capture_group_id
    and q.deleted_at is null
    and q.status <> 'cancelado'
    and q.request_kind = 'capture_edit';

  if v_active_count = 0 then return; end if;

  if p_preferred_capture_at is null then
    if v_with_preference > 0 then raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH'; end if;
    return;
  end if;

  if p_preferred_capture_duration_minutes is null then
    raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
  end if;
  if v_without_preference > 0 then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;
  if exists (
    select 1
    from public.marketing_requests q
    where q.capture_group_id = p_capture_group_id
      and q.deleted_at is null
      and q.status <> 'cancelado'
      and q.request_kind = 'capture_edit'
      and q.preferred_capture_at is not null
      and q.preferred_capture_duration_minutes is null
  ) then
    raise exception 'MARKETING_CAPTURE_GROUP_DATA_INVALID';
  end if;
  if v_existing_start is distinct from v_existing_max_start
    or v_existing_start is distinct from p_preferred_capture_at then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;

  v_total := v_existing_total + p_preferred_capture_duration_minutes;
  if not private.marketing_capture_range_is_valid(p_preferred_capture_at, v_total) then
    raise exception 'MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED';
  end if;
end;
$$;

create or replace function private.marketing_validate_preferred_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.marketing_requests%rowtype;
  v_booking_key uuid;
  v_active_count integer;
  v_with_preference integer;
  v_without_preference integer;
  v_start timestamptz;
  v_max_start timestamptz;
  v_total integer;
  v_all_individual_valid boolean;
begin
  select q.* into v_current
  from public.marketing_requests q
  where q.id = new.id;

  if v_current.id is null
    or v_current.deleted_at is not null
    or v_current.status = 'cancelado'
    or v_current.request_kind <> 'capture_edit' then
    return new;
  end if;

  -- Quando já existe captação confirmada, a reserva confirmada é a fonte da agenda.
  if v_current.confirmed_capture_at is not null
    and v_current.confirmed_capture_duration_minutes is not null then
    return new;
  end if;

  v_booking_key := coalesce(v_current.capture_group_id, v_current.id);

  select
    count(*)::integer,
    count(*) filter (where q.preferred_capture_at is not null)::integer,
    count(*) filter (where q.preferred_capture_at is null)::integer,
    min(q.preferred_capture_at),
    max(q.preferred_capture_at),
    coalesce(sum(q.preferred_capture_duration_minutes), 0)::integer,
    bool_and(
      q.preferred_capture_at is null
      or (
        q.preferred_capture_duration_minutes is not null
        and private.marketing_capture_window_is_valid(q.preferred_capture_at, q.preferred_capture_duration_minutes)
      )
    )
  into
    v_active_count,
    v_with_preference,
    v_without_preference,
    v_start,
    v_max_start,
    v_total,
    v_all_individual_valid
  from public.marketing_requests q
  where coalesce(q.capture_group_id, q.id) = v_booking_key
    and q.deleted_at is null
    and q.status <> 'cancelado'
    and q.request_kind = 'capture_edit';

  if v_active_count = 0 or v_with_preference = 0 then return new; end if;
  if v_without_preference > 0 then raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH'; end if;
  if not coalesce(v_all_individual_valid, false) then raise exception 'MARKETING_CAPTURE_WINDOW_INVALID'; end if;
  if v_start is distinct from v_max_start then raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH'; end if;
  if not private.marketing_capture_range_is_valid(v_start, v_total) then
    raise exception 'MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED';
  end if;

  perform private.marketing_validate_capture_booking(v_booking_key, v_start, v_total);
  return new;
end;
$$;

drop trigger if exists marketing_requests_validate_preferred_schedule on public.marketing_requests;
create constraint trigger marketing_requests_validate_preferred_schedule
after insert or update of
  capture_group_id,
  preferred_capture_at,
  preferred_capture_duration_minutes,
  request_kind,
  status,
  deleted_at,
  confirmed_capture_at,
  confirmed_capture_duration_minutes
on public.marketing_requests
deferrable initially deferred
for each row execute function private.marketing_validate_preferred_schedule_trigger();

create or replace function private.marketing_refresh_capture_reservation(p_booking_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_representative_request_id uuid;
  v_capture_group_id uuid;
  v_start timestamptz;
  v_max_start timestamptz;
  v_total_duration integer;
  v_end timestamptz;
begin
  select
    (array_agg(q.id order by q.request_number, q.id))[1],
    (array_agg(q.capture_group_id order by q.request_number, q.id))[1],
    min(q.confirmed_capture_at),
    max(q.confirmed_capture_at),
    coalesce(sum(q.confirmed_capture_duration_minutes), 0)::integer
  into
    v_representative_request_id,
    v_capture_group_id,
    v_start,
    v_max_start,
    v_total_duration
  from public.marketing_requests q
  where coalesce(q.capture_group_id, q.id) = p_booking_key
    and q.deleted_at is null
    and q.request_kind = 'capture_edit'
    and q.status <> 'cancelado'
    and q.confirmed_capture_at is not null
    and q.confirmed_capture_duration_minutes is not null;

  if v_representative_request_id is null then
    delete from private.marketing_capture_reservations r where r.booking_key = p_booking_key;
    return;
  end if;

  if v_start is distinct from v_max_start then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;
  if not private.marketing_capture_range_is_valid(v_start, v_total_duration) then
    raise exception 'MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED';
  end if;

  perform private.marketing_validate_capture_booking(p_booking_key, v_start, v_total_duration);
  v_end := v_start + v_total_duration * interval '1 minute';

  insert into private.marketing_capture_reservations (
    booking_key,
    representative_request_id,
    capture_group_id,
    capture_window_id,
    start_at,
    end_at,
    updated_at
  ) values (
    p_booking_key,
    v_representative_request_id,
    v_capture_group_id,
    null,
    v_start,
    v_end,
    now()
  )
  on conflict (booking_key) do update
  set representative_request_id = excluded.representative_request_id,
      capture_group_id = excluded.capture_group_id,
      capture_window_id = null,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.marketing_v2_update_request_grouped(
  p_session_token text,
  p_request_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_request public.marketing_requests%rowtype;
  v_confirmed timestamptz;
  v_duration integer;
  v_status text;
  v_booking_key uuid;
  v_existing_start timestamptz;
  v_existing_max_start timestamptz;
  v_existing_total integer;
  v_total integer;
begin
  select r.user_id into v_user_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request
  from public.marketing_requests q
  where q.id = p_request_id
    and q.deleted_at is null
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  if p_action = 'save_management' and v_request.request_kind = 'capture_edit' then
    v_confirmed := case
      when p_payload ? 'confirmedCaptureAt' then nullif(p_payload->>'confirmedCaptureAt', '')::timestamptz
      else v_request.confirmed_capture_at
    end;
    v_duration := case
      when p_payload ? 'confirmedCaptureDurationMinutes' then nullif(p_payload->>'confirmedCaptureDurationMinutes', '')::integer
      else v_request.confirmed_capture_duration_minutes
    end;
    v_status := coalesce(nullif(p_payload->>'status', ''), v_request.status);

    if (v_confirmed is null) <> (v_duration is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;

    if v_confirmed is not null and v_status <> 'cancelado' then
      if not private.marketing_capture_window_is_valid(v_confirmed, v_duration) then
        raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
      end if;

      v_booking_key := coalesce(v_request.capture_group_id, v_request.id);
      v_total := v_duration;

      if v_request.capture_group_id is not null then
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended('marketing_capture_group:' || v_request.capture_group_id::text, 0)
        );

        select
          min(q.confirmed_capture_at),
          max(q.confirmed_capture_at),
          coalesce(sum(q.confirmed_capture_duration_minutes), 0)::integer
        into v_existing_start, v_existing_max_start, v_existing_total
        from public.marketing_requests q
        where q.capture_group_id = v_request.capture_group_id
          and q.id <> v_request.id
          and q.deleted_at is null
          and q.status <> 'cancelado'
          and q.request_kind = 'capture_edit'
          and q.confirmed_capture_at is not null
          and q.confirmed_capture_duration_minutes is not null;

        if v_existing_start is not null
          and (v_existing_start is distinct from v_existing_max_start
            or v_existing_start is distinct from v_confirmed) then
          raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
        end if;

        v_total := coalesce(v_existing_total, 0) + v_duration;
        if not private.marketing_capture_range_is_valid(v_confirmed, v_total) then
          raise exception 'MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED';
        end if;
      end if;

      perform private.marketing_validate_capture_booking(v_booking_key, v_confirmed, v_total);
    end if;
  end if;

  perform private.marketing_v2_update_request_grouped_v124_base(
    p_session_token,
    p_request_id,
    p_action,
    p_payload
  );
end;
$$;

create or replace function public.marketing_public_get_availability_v22()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_start_date date;
  v_end_date date;
begin
  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  v_start_date := (now() at time zone v_settings.timezone)::date;
  v_end_date := v_start_date + 35;

  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', to_char(v_settings.workday_start, 'HH24:MI'),
      'workdayEnd', to_char(v_settings.workday_end, 'HH24:MI'),
      'durationOptionsMinutes', v_settings.duration_options_minutes,
      'captureWindows', '[]'::jsonb
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'startAt', s.start_at,
        'durationMinutes', extract(epoch from (s.end_at - s.start_at))::integer / 60
      ) order by s.start_at, s.booking_key)
      from private.marketing_schedule_occupied_slots() s
      where (s.start_at at time zone v_settings.timezone)::date >= v_start_date
        and (s.start_at at time zone v_settings.timezone)::date < v_end_date
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.marketing_v2_get_operation_schedule(p_session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_team_id uuid;
  v_settings public.marketing_schedule_settings%rowtype;
begin
  select r.user_id, r.access_role, r.team_id
    into v_user_id, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', to_char(v_settings.workday_start, 'HH24:MI'),
      'workdayEnd', to_char(v_settings.workday_end, 'HH24:MI'),
      'durationOptionsMinutes', v_settings.duration_options_minutes,
      'captureWindows', '[]'::jsonb
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'requestId', case
            when v_role <> 'sales_manager' or s.team_id = v_team_id then s.representative_request_id
            else null
          end,
          'captureGroupId', case
            when v_role <> 'sales_manager' or s.team_id = v_team_id then s.capture_group_id
            else null
          end,
          'startAt', s.start_at,
          'durationMinutes', extract(epoch from (s.end_at - s.start_at))::integer / 60
        ))
        order by s.start_at, s.booking_key
      )
      from private.marketing_schedule_occupied_slots() s
    ), '[]'::jsonb),
    'captureGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'captureGroupId', grouped.capture_group_id,
        'requestIds', grouped.request_ids,
        'requestNumbers', grouped.request_numbers
      ) order by grouped.first_request_number)
      from (
        select
          q.capture_group_id,
          array_agg(q.id order by q.request_number) as request_ids,
          array_agg(q.request_number order by q.request_number) as request_numbers,
          min(q.request_number) as first_request_number
        from public.marketing_requests q
        where q.capture_group_id is not null
          and q.deleted_at is null
          and (v_role <> 'sales_manager' or q.team_id = v_team_id)
        group by q.capture_group_id
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.marketing_capture_range_is_valid(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_window_is_valid(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_period_selection_is_valid(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_period_bounds(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_period_capacity_minutes(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_conflicts(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function private.marketing_capture_period_conflicts(timestamptz, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function private.marketing_schedule_occupied_slots() from public, anon, authenticated;
revoke all on function private.marketing_validate_capture_booking(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_validate_public_capture_group_capacity(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_validate_preferred_schedule_trigger() from public, anon, authenticated;
revoke all on function private.marketing_refresh_capture_reservation(uuid) from public, anon, authenticated;
revoke all on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_public_get_availability_v22() from public, anon, authenticated;
revoke all on function public.marketing_v2_get_operation_schedule(text) from public, anon, authenticated;

grant execute on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.marketing_public_get_availability_v22() to anon, authenticated;
grant execute on function public.marketing_v2_get_operation_schedule(text) to anon, authenticated;

notify pgrst, 'reload schema';
