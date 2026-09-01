alter table public.marketing_requests
  add column if not exists special_capture_at timestamptz,
  add column if not exists special_capture_reason text,
  add column if not exists special_capture_status text,
  add column if not exists special_capture_decided_by_user_id text,
  add column if not exists special_capture_decided_by_name text,
  add column if not exists special_capture_decided_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'marketing_requests_special_capture_status_check'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_special_capture_status_check
      check (special_capture_status is null or special_capture_status in ('pending','approved','rejected'));
  end if;
end $$;

update public.marketing_schedule_settings
set workday_start = time '08:00',
    workday_end = time '18:00',
    duration_options_minutes = array[60]::integer[],
    updated_at = now()
where id = 'default';

create or replace function private.marketing_standard_capture_period(p_start_at timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_local timestamp;
  v_time time;
begin
  if p_start_at is null then return null; end if;
  select * into v_settings from public.marketing_schedule_settings where id = 'default';
  if v_settings.id is null then return null; end if;
  v_local := p_start_at at time zone v_settings.timezone;
  if extract(isodow from v_local)::smallint <> all(v_settings.working_days)
     and not (extract(isodow from v_local)::smallint = any(v_settings.working_days)) then
    return null;
  end if;
  if date_trunc('minute', v_local) <> v_local then return null; end if;
  v_time := v_local::time;
  if v_time in (time '08:00', time '09:00', time '10:00', time '11:00') then return 'morning'; end if;
  if v_time in (time '14:00', time '15:00', time '16:00', time '17:00') then return 'afternoon'; end if;
  return null;
end;
$$;

create or replace function private.marketing_capture_range_is_valid(p_start_at timestamptz, p_duration_minutes integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_start_at is not null
    and p_duration_minutes is not null
    and p_duration_minutes > 0
    and private.marketing_standard_capture_period(p_start_at) is not null;
$$;

create or replace function private.marketing_capture_window_is_valid(p_start_at timestamptz, p_duration_minutes integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_duration_minutes = 60
    and private.marketing_standard_capture_period(p_start_at) is not null;
$$;

create or replace function private.marketing_capture_period_selection_is_valid(p_start_at timestamptz, p_duration_minutes integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.marketing_capture_window_is_valid(p_start_at, p_duration_minutes);
$$;

create or replace function private.marketing_schedule_occupied_slots()
returns table(
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
      count(*)::integer as row_count,
      count(q.preferred_capture_at)::integer as start_count
    from public.marketing_requests q
    where q.deleted_at is null
      and q.status <> 'cancelado'
      and q.request_kind = 'capture_edit'
      and q.special_capture_status is distinct from 'pending'
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
    p.start_at + interval '60 minutes',
    false
  from active_preferred p
  where p.row_count = p.start_count
    and p.start_at is not null
    and p.start_at = p.max_start_at
    and not exists (
      select 1 from private.marketing_capture_reservations r where r.booking_key = p.booking_key
    );
$$;

create or replace function private.marketing_capture_conflicts(
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_excluded_request_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_period text;
  v_date date;
  v_booking_key uuid;
begin
  v_period := private.marketing_standard_capture_period(p_start_at);
  if v_period is null then return true; end if;
  select * into v_settings from public.marketing_schedule_settings where id='default';
  v_date := (p_start_at at time zone v_settings.timezone)::date;
  v_booking_key := coalesce((select q.capture_group_id from public.marketing_requests q where q.id=p_excluded_request_id), p_excluded_request_id);
  return exists (
    select 1 from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from v_booking_key
      and (
        ((s.start_at at time zone v_settings.timezone)::date = v_date
          and private.marketing_standard_capture_period(s.start_at) = v_period)
        or tstzrange(s.start_at, s.end_at, '[)') && tstzrange(p_start_at, p_start_at + interval '60 minutes', '[)')
      )
  );
end;
$$;

create or replace function private.marketing_capture_period_conflicts(
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_capture_group_id uuid default null,
  p_excluded_request_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_period text;
  v_date date;
  v_booking_key uuid;
begin
  v_period := private.marketing_standard_capture_period(p_start_at);
  if v_period is null then return true; end if;
  select * into v_settings from public.marketing_schedule_settings where id='default';
  v_date := (p_start_at at time zone v_settings.timezone)::date;
  v_booking_key := coalesce(p_capture_group_id, p_excluded_request_id);
  return exists (
    select 1 from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from v_booking_key
      and (
        ((s.start_at at time zone v_settings.timezone)::date = v_date
          and private.marketing_standard_capture_period(s.start_at) = v_period)
        or tstzrange(s.start_at, s.end_at, '[)') && tstzrange(p_start_at, p_start_at + interval '60 minutes', '[)')
      )
  );
end;
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
  v_period text;
  v_date date;
begin
  if not private.marketing_capture_window_is_valid(p_start_at, 60) then
    raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
  end if;
  select * into v_settings from public.marketing_schedule_settings where id='default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;
  v_period := private.marketing_standard_capture_period(p_start_at);
  v_date := (p_start_at at time zone v_settings.timezone)::date;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_period:' || v_date::text || ':' || v_period, 0));

  if exists (
    select 1 from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from p_booking_key
      and (s.start_at at time zone v_settings.timezone)::date = v_date
      and private.marketing_standard_capture_period(s.start_at) = v_period
  ) then
    raise exception 'MARKETING_CAPTURE_PERIOD_RESERVED';
  end if;

  if exists (
    select 1 from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from p_booking_key
      and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(p_start_at, p_start_at + interval '60 minutes', '[)')
  ) then
    raise exception 'MARKETING_CAPTURE_CONFLICT';
  end if;
end;
$$;

create or replace function private.marketing_validate_special_capture_booking(p_booking_key uuid, p_start_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_start_at is null or p_start_at <= now() then raise exception 'MARKETING_SPECIAL_TIME_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_special_capture:' || date_trunc('minute', p_start_at)::text, 0));
  if exists (
    select 1 from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from p_booking_key
      and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(p_start_at, p_start_at + interval '60 minutes', '[)')
  ) then
    raise exception 'MARKETING_CAPTURE_CONFLICT';
  end if;
end;
$$;

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
  v_special boolean;
  v_end timestamptz;
begin
  select
    (array_agg(q.id order by q.request_number, q.id))[1],
    (array_agg(q.capture_group_id order by q.request_number, q.id))[1],
    min(q.confirmed_capture_at),
    max(q.confirmed_capture_at),
    bool_and(q.special_capture_status = 'approved')
  into v_representative_request_id, v_capture_group_id, v_start, v_max_start, v_special
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
  if v_start is distinct from v_max_start then raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH'; end if;

  if coalesce(v_special, false) then
    perform private.marketing_validate_special_capture_booking(p_booking_key, v_start);
  else
    perform private.marketing_validate_capture_booking(p_booking_key, v_start, 60);
  end if;

  v_end := v_start + interval '60 minutes';
  insert into private.marketing_capture_reservations(
    booking_key, representative_request_id, capture_group_id, capture_window_id, start_at, end_at, updated_at
  ) values (p_booking_key, v_representative_request_id, v_capture_group_id, null, v_start, v_end, now())
  on conflict (booking_key) do update
  set representative_request_id = excluded.representative_request_id,
      capture_group_id = excluded.capture_group_id,
      capture_window_id = null,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      updated_at = excluded.updated_at;
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
begin
  if p_capture_group_id is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_group:' || p_capture_group_id::text, 0));
  select count(*)::integer,
         count(*) filter (where q.preferred_capture_at is not null)::integer,
         count(*) filter (where q.preferred_capture_at is null)::integer,
         min(q.preferred_capture_at), max(q.preferred_capture_at)
  into v_active_count, v_with_preference, v_without_preference, v_existing_start, v_existing_max_start
  from public.marketing_requests q
  where q.capture_group_id = p_capture_group_id
    and q.deleted_at is null and q.status <> 'cancelado' and q.request_kind='capture_edit';

  if v_active_count = 0 then return; end if;
  if p_preferred_capture_at is null then
    if v_with_preference > 0 then raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH'; end if;
    return;
  end if;
  if v_without_preference > 0 then raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH'; end if;
  if v_existing_start is distinct from v_existing_max_start or v_existing_start is distinct from p_preferred_capture_at then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;
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
  select * into v_settings from public.marketing_schedule_settings where id='default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;
  v_start_date := (now() at time zone v_settings.timezone)::date;
  v_end_date := v_start_date + 35;
  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', '08:00',
      'workdayEnd', '18:00',
      'durationOptionsMinutes', jsonb_build_array(60),
      'standardTimes', jsonb_build_array('08:00','09:00','10:00','11:00','14:00','15:00','16:00','17:00'),
      'captureWindows', jsonb_build_array(
        jsonb_build_object('id','morning','label','Manhã','start','08:00','end','12:00'),
        jsonb_build_object('id','afternoon','label','Tarde','start','14:00','end','18:00')
      )
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'startAt', s.start_at,
        'durationMinutes', 60
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
  select r.user_id, r.access_role, r.team_id into v_user_id, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  select * into v_settings from public.marketing_schedule_settings where id='default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', '08:00',
      'workdayEnd', '18:00',
      'durationOptionsMinutes', jsonb_build_array(60),
      'standardTimes', jsonb_build_array('08:00','09:00','10:00','11:00','14:00','15:00','16:00','17:00'),
      'captureWindows', jsonb_build_array(
        jsonb_build_object('id','morning','label','Manhã','start','08:00','end','12:00'),
        jsonb_build_object('id','afternoon','label','Tarde','start','14:00','end','18:00')
      )
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'requestId', case when v_role <> 'sales_manager' or s.team_id=v_team_id then s.representative_request_id else null end,
        'captureGroupId', case when v_role <> 'sales_manager' or s.team_id=v_team_id then s.capture_group_id else null end,
        'startAt', s.start_at,
        'durationMinutes', 60
      )) order by s.start_at, s.booking_key)
      from private.marketing_schedule_occupied_slots() s
    ), '[]'::jsonb),
    'captureGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'captureGroupId', grouped.capture_group_id,
        'requestIds', grouped.request_ids,
        'requestNumbers', grouped.request_numbers
      ) order by grouped.first_request_number)
      from (
        select q.capture_group_id,
               array_agg(q.id order by q.request_number) as request_ids,
               array_agg(q.request_number order by q.request_number) as request_numbers,
               min(q.request_number) as first_request_number
        from public.marketing_requests q
        where q.capture_group_id is not null and q.deleted_at is null
          and (v_role <> 'sales_manager' or q.team_id=v_team_id)
        group by q.capture_group_id
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.marketing_public_create_grouped_request_v3(
  p_submission_id uuid,
  p_requester_name text,
  p_team_id uuid,
  p_broker_name text,
  p_has_property_code boolean,
  p_property_reference text,
  p_request_kind text,
  p_content_types text[],
  p_is_exclusive boolean,
  p_capture_location text default null,
  p_preferred_capture_at timestamptz default null,
  p_asset_link text default null,
  p_paid_traffic boolean default false,
  p_requester_notes text default null,
  p_urgency_requested boolean default false,
  p_urgency_reason text default null,
  p_website text default null,
  p_capture_group_id uuid default null,
  p_special_capture_at timestamptz default null,
  p_special_capture_reason text default null
)
returns table(request_number bigint, team_name text, created_at timestamptz, capture_group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt record;
  v_request_id uuid;
  v_existing_count integer;
  v_existing_special timestamptz;
  v_existing_special_max timestamptz;
begin
  if p_preferred_capture_at is not null and p_special_capture_at is not null then
    raise exception 'MARKETING_CAPTURE_MODE_INVALID';
  end if;
  if p_special_capture_at is not null then
    if p_request_kind <> 'capture_edit' then raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED'; end if;
    if p_special_capture_at <= now() then raise exception 'MARKETING_SPECIAL_TIME_INVALID'; end if;
    if nullif(btrim(coalesce(p_special_capture_reason,'')), '') is null then raise exception 'MARKETING_SPECIAL_REASON_REQUIRED'; end if;
    if private.marketing_standard_capture_period(p_special_capture_at) is not null then raise exception 'MARKETING_SPECIAL_TIME_STANDARD_SLOT'; end if;
    if p_capture_group_id is not null then
      select count(*)::integer, min(q.special_capture_at), max(q.special_capture_at)
        into v_existing_count, v_existing_special, v_existing_special_max
      from public.marketing_requests q
      where q.capture_group_id=p_capture_group_id and q.deleted_at is null and q.status<>'cancelado';
      if v_existing_count > 0 and (v_existing_special is null or v_existing_special is distinct from v_existing_special_max or v_existing_special is distinct from p_special_capture_at) then
        raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
      end if;
    end if;
  elsif p_capture_group_id is not null and exists (
    select 1 from public.marketing_requests q
    where q.capture_group_id=p_capture_group_id and q.deleted_at is null and q.status<>'cancelado' and q.special_capture_at is not null
  ) then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;

  select * into v_receipt
  from public.marketing_public_create_grouped_request(
    p_submission_id, p_requester_name, p_team_id, p_broker_name, p_has_property_code,
    p_property_reference, p_request_kind, p_content_types, p_is_exclusive, p_capture_location,
    case when p_special_capture_at is null then p_preferred_capture_at else null end,
    case when p_special_capture_at is null and p_preferred_capture_at is not null then 60 else null end,
    p_asset_link, p_paid_traffic, p_requester_notes, p_urgency_requested, p_urgency_reason, p_website, p_capture_group_id
  );

  if p_special_capture_at is not null then
    select q.id into v_request_id from public.marketing_requests q where q.public_submission_id=p_submission_id;
    update public.marketing_requests q
    set special_capture_at=p_special_capture_at,
        special_capture_reason=btrim(p_special_capture_reason),
        special_capture_status='pending',
        special_capture_decided_by_user_id=null,
        special_capture_decided_by_name=null,
        special_capture_decided_at=null
    where q.id=v_request_id;
    insert into public.marketing_request_events(request_id,event_type,from_status,to_status,actor_user_id,actor_name,details)
    values(v_request_id,'horario_especial_solicitado','solicitado','solicitado',null,btrim(p_requester_name),
      jsonb_build_object('specialCaptureAt',p_special_capture_at,'reason',btrim(p_special_capture_reason)));
  end if;

  return query select v_receipt.request_number, v_receipt.team_name, v_receipt.created_at, v_receipt.capture_group_id;
end;
$$;

create or replace function public.marketing_v2_create_request_v3(
  p_session_token text,
  p_team_id uuid,
  p_broker_name text,
  p_has_property_code boolean,
  p_property_reference text,
  p_request_kind text,
  p_content_types text[],
  p_is_exclusive boolean,
  p_capture_location text default null,
  p_preferred_capture_at timestamptz default null,
  p_asset_link text default null,
  p_paid_traffic boolean default false,
  p_requester_notes text default null,
  p_urgency_requested boolean default false,
  p_urgency_reason text default null,
  p_special_capture_at timestamptz default null,
  p_special_capture_reason text default null
)
returns table(request_id uuid, request_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created record;
  v_user_id text;
  v_user_name text;
begin
  if p_preferred_capture_at is not null and p_special_capture_at is not null then raise exception 'MARKETING_CAPTURE_MODE_INVALID'; end if;
  if p_special_capture_at is not null then
    if p_request_kind <> 'capture_edit' then raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED'; end if;
    if p_special_capture_at <= now() then raise exception 'MARKETING_SPECIAL_TIME_INVALID'; end if;
    if nullif(btrim(coalesce(p_special_capture_reason,'')), '') is null then raise exception 'MARKETING_SPECIAL_REASON_REQUIRED'; end if;
    if private.marketing_standard_capture_period(p_special_capture_at) is not null then raise exception 'MARKETING_SPECIAL_TIME_STANDARD_SLOT'; end if;
  end if;

  select * into v_created from public.marketing_v2_create_request(
    p_session_token,p_team_id,p_broker_name,p_has_property_code,p_property_reference,p_request_kind,p_content_types,p_is_exclusive,
    p_capture_location,
    case when p_special_capture_at is null then p_preferred_capture_at else null end,
    case when p_special_capture_at is null and p_preferred_capture_at is not null then 60 else null end,
    p_asset_link,p_paid_traffic,p_requester_notes,p_urgency_requested,p_urgency_reason
  );

  if p_special_capture_at is not null then
    select r.user_id,r.user_name into v_user_id,v_user_name from private.marketing_resolve_session(p_session_token) r;
    update public.marketing_requests q
    set special_capture_at=p_special_capture_at,
        special_capture_reason=btrim(p_special_capture_reason),
        special_capture_status='pending'
    where q.id=v_created.request_id;
    insert into public.marketing_request_events(request_id,event_type,from_status,to_status,actor_user_id,actor_name,details)
    values(v_created.request_id,'horario_especial_solicitado','solicitado','solicitado',v_user_id,v_user_name,
      jsonb_build_object('specialCaptureAt',p_special_capture_at,'reason',btrim(p_special_capture_reason)));
  end if;

  return query select v_created.request_id, v_created.request_number;
end;
$$;

create or replace function public.marketing_v2_decide_special_capture(
  p_session_token text,
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_booking_key uuid;
  v_special_at timestamptz;
  v_member record;
begin
  select r.user_id,r.user_name,r.access_role into v_user_id,v_user_name,v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if not (v_role='admin' or (v_role='marketing' and v_user_id in ('maria','arthur'))) then
    raise exception 'MARKETING_SPECIAL_DECISION_DENIED';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'MARKETING_SPECIAL_DECISION_INVALID'; end if;

  select * into v_request from public.marketing_requests q
  where q.id=p_request_id and q.deleted_at is null for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.special_capture_status <> 'pending' or v_request.special_capture_at is null then
    raise exception 'MARKETING_SPECIAL_NOT_PENDING';
  end if;
  v_booking_key := coalesce(v_request.capture_group_id,v_request.id);
  v_special_at := v_request.special_capture_at;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_group:' || v_booking_key::text,0));

  if p_decision='approved' then
    perform private.marketing_validate_special_capture_booking(v_booking_key,v_special_at);
  end if;

  for v_member in
    select q.id,q.status,q.request_number,q.broker_name
    from public.marketing_requests q
    where q.deleted_at is null and q.status<>'cancelado'
      and coalesce(q.capture_group_id,q.id)=v_booking_key
      and q.special_capture_status='pending'
      and q.special_capture_at=v_special_at
    for update
  loop
    if p_decision='approved' then
      update public.marketing_requests
      set special_capture_status='approved',
          special_capture_decided_by_user_id=v_user_id,
          special_capture_decided_by_name=v_user_name,
          special_capture_decided_at=now(),
          confirmed_capture_at=v_special_at,
          confirmed_capture_duration_minutes=60,
          status='agendado',
          completed_at=null,
          assigned_marketing_name=coalesce(assigned_marketing_name,case when v_user_id in ('maria','arthur') then v_user_name else assigned_marketing_name end)
      where id=v_member.id;
      insert into public.marketing_request_events(request_id,event_type,from_status,to_status,actor_user_id,actor_name,details)
      values(v_member.id,'horario_especial_aprovado',v_member.status,'agendado',v_user_id,v_user_name,
        jsonb_build_object('specialCaptureAt',v_special_at));
      perform private.marketing_notify_manager(v_member.id,'status_alterado','Horário especial aprovado',
        format('Pedido #%s · %s teve o horário fora do padrão aprovado.',v_member.request_number,v_member.broker_name),v_user_id,v_user_name);
    else
      update public.marketing_requests
      set special_capture_status='rejected',
          special_capture_decided_by_user_id=v_user_id,
          special_capture_decided_by_name=v_user_name,
          special_capture_decided_at=now()
      where id=v_member.id;
      insert into public.marketing_request_events(request_id,event_type,from_status,to_status,actor_user_id,actor_name,details)
      values(v_member.id,'horario_especial_rejeitado',v_member.status,v_member.status,v_user_id,v_user_name,
        jsonb_build_object('specialCaptureAt',v_special_at));
      perform private.marketing_notify_manager(v_member.id,'status_alterado','Horário especial não aprovado',
        format('Pedido #%s · %s: o horário fora do padrão não foi aprovado e continua aguardando agendamento.',v_member.request_number,v_member.broker_name),v_user_id,v_user_name);
    end if;
  end loop;
end;
$$;

create or replace function private.marketing_v2_get_dashboard_review_unfiltered_v21(p_session_token text)
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
  v_result jsonb;
  v_requests jsonb;
begin
  select r.user_id,r.access_role,r.team_id into v_user_id,v_role,v_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  v_result := public.marketing_v2_get_dashboard(p_session_token);

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'requestSource',q.request_source,
      'publicRequesterName',q.public_requester_name,
      'isExclusive',q.is_exclusive,
      'managerReviewStatus',latest_review.status,
      'managerReviewUpdatedAt',latest_review.updated_at,
      'specialCaptureAt',q.special_capture_at,
      'specialCaptureReason',q.special_capture_reason,
      'specialCaptureStatus',q.special_capture_status,
      'specialCaptureDecidedByName',q.special_capture_decided_by_name,
      'specialCaptureDecidedAt',q.special_capture_decided_at
    ) order by (item->>'urgencyApproved')::boolean desc,coalesce(q.queue_entered_at,q.created_at) asc,(item->>'requestNumber')::bigint asc
  ),'[]'::jsonb) into v_requests
  from jsonb_array_elements(coalesce(v_result->'requests','[]'::jsonb)) item
  join public.marketing_requests q on q.id=(item->>'id')::uuid
  left join lateral (
    select r.status,r.updated_at from public.marketing_manager_reviews r
    where r.request_id=q.id order by r.created_at desc limit 1
  ) latest_review on true;

  return v_result || jsonb_build_object(
    'requests',v_requests,
    'managerReviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',review.id,'requestId',review.request_id,'requestNumber',q.request_number,'teamId',review.team_id,
        'managerName',q.manager_name,'brokerName',q.broker_name,
        'propertyLabel',case when q.has_property_code then q.property_reference else 'Sem código informado' end,
        'openedByUserId',review.opened_by_user_id,'openedByName',review.opened_by_name,'reason',review.reason,'details',review.details,
        'status',review.status,'managerUserId',review.manager_user_id,'reviewManagerName',review.manager_name,
        'managerResponse',review.manager_response,'decidedAt',review.decided_at,'returnStatus',review.return_status,
        'createdAt',review.created_at,'updatedAt',review.updated_at
      ) order by (review.status='pending') desc,review.updated_at desc)
      from public.marketing_manager_reviews review
      join public.marketing_requests q on q.id=review.request_id
      where (v_role in ('admin','marketing')) or (v_role='sales_manager' and review.manager_user_id=v_user_id and review.team_id=v_team_id)
    ),'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.marketing_public_create_grouped_request_v3(uuid,text,uuid,text,boolean,text,text,text[],boolean,text,timestamptz,text,boolean,text,boolean,text,text,uuid,timestamptz,text) from public;
grant execute on function public.marketing_public_create_grouped_request_v3(uuid,text,uuid,text,boolean,text,text,text[],boolean,text,timestamptz,text,boolean,text,boolean,text,text,uuid,timestamptz,text) to anon, authenticated;

revoke execute on function public.marketing_v2_create_request_v3(text,uuid,text,boolean,text,text,text[],boolean,text,timestamptz,text,boolean,text,boolean,text,timestamptz,text) from public;
grant execute on function public.marketing_v2_create_request_v3(text,uuid,text,boolean,text,text,text[],boolean,text,timestamptz,text,boolean,text,boolean,text,timestamptz,text) to anon, authenticated;

revoke execute on function public.marketing_v2_decide_special_capture(text,uuid,text) from public;
grant execute on function public.marketing_v2_decide_special_capture(text,uuid,text) to anon, authenticated;
