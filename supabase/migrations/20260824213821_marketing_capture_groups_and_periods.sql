create table if not exists public.marketing_capture_windows (
  id text primary key,
  label text not null check (btrim(label) <> ''),
  start_time time not null,
  end_time time not null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

insert into public.marketing_capture_windows (id, label, start_time, end_time, sort_order)
values
  ('morning', 'Manhã', time '08:30', time '11:00', 10),
  ('afternoon', 'Tarde', time '14:00', time '16:00', 20)
on conflict (id) do update
set label = excluded.label,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

create table if not exists public.marketing_capture_groups (
  id uuid primary key,
  team_id uuid not null references public.marketing_teams(id) on update cascade on delete restrict,
  broker_name text not null check (char_length(btrim(broker_name)) between 2 and 120),
  requester_name text not null check (char_length(btrim(requester_name)) between 2 and 120),
  request_source text not null default 'public' check (request_source in ('hub', 'public')),
  created_at timestamptz not null default now()
);

alter table public.marketing_requests
  add column if not exists capture_group_id uuid references public.marketing_capture_groups(id) on update cascade on delete restrict;

comment on column public.marketing_requests.capture_group_id is
  'Vincula pedidos individuais que pertencem à mesma saída de captação sem alterar sua ordem na fila.';

create index if not exists marketing_requests_capture_group_idx
  on public.marketing_requests(capture_group_id, request_number)
  where capture_group_id is not null;

create table if not exists private.marketing_capture_reservations (
  booking_key uuid primary key,
  representative_request_id uuid not null references public.marketing_requests(id) on update cascade on delete restrict,
  capture_group_id uuid references public.marketing_capture_groups(id) on update cascade on delete restrict,
  capture_window_id text references public.marketing_capture_windows(id) on update cascade on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (start_at < end_at)
);

alter table public.marketing_capture_windows enable row level security;
alter table public.marketing_capture_groups enable row level security;
alter table private.marketing_capture_reservations enable row level security;

revoke all on public.marketing_capture_windows from public, anon, authenticated;
revoke all on public.marketing_capture_groups from public, anon, authenticated;
revoke all on private.marketing_capture_reservations from public, anon, authenticated;

create or replace function private.marketing_capture_period_bounds(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns table (
  capture_window_id text,
  period_start_at timestamptz,
  period_end_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_start timestamp;
  v_window public.marketing_capture_windows%rowtype;
begin
  if p_start_at is null or p_duration_minutes is null or p_duration_minutes <= 0 then
    return;
  end if;

  select s.timezone into v_timezone
  from public.marketing_schedule_settings s
  where s.id = 'default';
  if v_timezone is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  v_local_start := p_start_at at time zone v_timezone;
  select w.* into v_window
  from public.marketing_capture_windows w
  where w.active is true
    and v_local_start::time >= w.start_time
    and v_local_start::time < w.end_time
  order by w.sort_order, w.id
  limit 1;

  if v_window.id is null then
    select w.* into v_window
    from public.marketing_capture_windows w
    where w.active is true
    order by abs(extract(epoch from (v_local_start::time - w.start_time))), w.sort_order, w.id
    limit 1;
  end if;

  if v_window.id is null then
    return query select null::text, p_start_at, p_start_at + p_duration_minutes * interval '1 minute';
    return;
  end if;

  return query select
    v_window.id,
    (v_local_start::date + v_window.start_time) at time zone v_timezone,
    (v_local_start::date + v_window.end_time) at time zone v_timezone;
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
  select exists (
    select 1
    from public.marketing_schedule_settings s
    join public.marketing_capture_windows w on w.active is true
    where s.id = 'default'
      and extract(isodow from (p_start_at at time zone s.timezone))::smallint = any(s.working_days)
      and (p_start_at at time zone s.timezone)::time = w.start_time
      and p_duration_minutes = any(s.duration_options_minutes)
  );
$$;

create or replace function private.marketing_refresh_capture_reservation(p_booking_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.marketing_requests%rowtype;
  v_bounds record;
  v_expected_start timestamptz;
  v_expected_end timestamptz;
  v_window_id text;
  v_representative_request_id uuid;
  v_capture_group_id uuid;
begin
  for v_request in
    select q.*
    from public.marketing_requests q
    where coalesce(q.capture_group_id, q.id) = p_booking_key
      and q.deleted_at is null
      and q.request_kind = 'capture_edit'
      and q.status <> 'cancelado'
      and q.confirmed_capture_at is not null
      and q.confirmed_capture_duration_minutes is not null
    order by q.request_number, q.id
  loop
    select * into v_bounds
    from private.marketing_capture_period_bounds(
      v_request.confirmed_capture_at,
      v_request.confirmed_capture_duration_minutes
    );

    if v_representative_request_id is null then
      v_representative_request_id := v_request.id;
      v_capture_group_id := v_request.capture_group_id;
      v_window_id := v_bounds.capture_window_id;
      v_expected_start := v_bounds.period_start_at;
      v_expected_end := v_bounds.period_end_at;
    elsif v_bounds.period_start_at is distinct from v_expected_start
      or v_bounds.period_end_at is distinct from v_expected_end then
      raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
    end if;
  end loop;

  if v_representative_request_id is null then
    delete from private.marketing_capture_reservations r where r.booking_key = p_booking_key;
    return;
  end if;

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
    v_window_id,
    v_expected_start,
    v_expected_end,
    now()
  )
  on conflict (booking_key) do update
  set representative_request_id = excluded.representative_request_id,
      capture_group_id = excluded.capture_group_id,
      capture_window_id = excluded.capture_window_id,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function private.marketing_sync_capture_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_key uuid;
  v_new_key uuid;
begin
  if tg_op <> 'INSERT' then v_old_key := coalesce(old.capture_group_id, old.id); end if;
  if tg_op <> 'DELETE' then v_new_key := coalesce(new.capture_group_id, new.id); end if;

  if v_old_key is not null and v_old_key is distinct from v_new_key then
    perform private.marketing_refresh_capture_reservation(v_old_key);
  end if;
  if v_new_key is not null then
    perform private.marketing_refresh_capture_reservation(v_new_key);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.marketing_capture_period_bounds(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_period_selection_is_valid(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_refresh_capture_reservation(uuid) from public, anon, authenticated;
revoke all on function private.marketing_sync_capture_reservation() from public, anon, authenticated;

do $$
declare
  v_booking_key uuid;
begin
  for v_booking_key in
    select distinct coalesce(q.capture_group_id, q.id)
    from public.marketing_requests q
    where q.deleted_at is null
      and q.request_kind = 'capture_edit'
      and q.status <> 'cancelado'
      and q.confirmed_capture_at is not null
      and q.confirmed_capture_duration_minutes is not null
  loop
    perform private.marketing_refresh_capture_reservation(v_booking_key);
  end loop;
end;
$$;

alter table private.marketing_capture_reservations
  drop constraint if exists marketing_capture_reservations_no_overlap;
alter table private.marketing_capture_reservations
  add constraint marketing_capture_reservations_no_overlap
  exclude using gist (tstzrange(start_at, end_at, '[)') with &&);

alter table public.marketing_requests
  drop constraint if exists marketing_requests_confirmed_capture_no_overlap;

drop trigger if exists marketing_requests_sync_capture_reservation on public.marketing_requests;
create trigger marketing_requests_sync_capture_reservation
after insert or delete or update of
  capture_group_id,
  confirmed_capture_at,
  confirmed_capture_duration_minutes,
  request_kind,
  status,
  deleted_at
on public.marketing_requests
for each row execute function private.marketing_sync_capture_reservation();

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
    cross join lateral private.marketing_capture_period_bounds(p_start_at, p_duration_minutes) b
    where r.booking_key is distinct from coalesce(
        (select q.capture_group_id from public.marketing_requests q where q.id = p_excluded_request_id),
        p_excluded_request_id
      )
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(b.period_start_at, b.period_end_at, '[)')
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
    cross join lateral private.marketing_capture_period_bounds(p_start_at, p_duration_minutes) b
    where r.booking_key is distinct from coalesce(p_capture_group_id, p_excluded_request_id)
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(b.period_start_at, b.period_end_at, '[)')
  );
$$;

revoke all on function private.marketing_capture_conflicts(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function private.marketing_capture_period_conflicts(timestamptz, integer, uuid, uuid) from public, anon, authenticated;

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

  select * into v_settings from public.marketing_schedule_settings where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', to_char(v_settings.workday_start, 'HH24:MI'),
      'workdayEnd', to_char(v_settings.workday_end, 'HH24:MI'),
      'durationOptionsMinutes', v_settings.duration_options_minutes,
      'captureWindows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id,
          'label', w.label,
          'start', to_char(w.start_time, 'HH24:MI'),
          'end', to_char(w.end_time, 'HH24:MI')
        ) order by w.sort_order, w.id)
        from public.marketing_capture_windows w
        where w.active is true
      ), '[]'::jsonb)
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId', r.representative_request_id,
        'captureGroupId', r.capture_group_id,
        'startAt', r.start_at,
        'durationMinutes', extract(epoch from (r.end_at - r.start_at))::integer / 60
      ) order by r.start_at, r.booking_key)
      from private.marketing_capture_reservations r
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
  select * into v_settings from public.marketing_schedule_settings where id = 'default';
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
      'captureWindows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id,
          'label', w.label,
          'start', to_char(w.start_time, 'HH24:MI'),
          'end', to_char(w.end_time, 'HH24:MI')
        ) order by w.sort_order, w.id)
        from public.marketing_capture_windows w where w.active is true
      ), '[]'::jsonb)
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'startAt', r.start_at,
        'durationMinutes', extract(epoch from (r.end_at - r.start_at))::integer / 60
      ) order by r.start_at)
      from private.marketing_capture_reservations r
      where (r.start_at at time zone v_settings.timezone)::date >= v_start_date
        and (r.start_at at time zone v_settings.timezone)::date < v_end_date
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.marketing_public_create_grouped_request(
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
  p_preferred_capture_duration_minutes integer default null,
  p_asset_link text default null,
  p_paid_traffic boolean default false,
  p_requester_notes text default null,
  p_urgency_requested boolean default false,
  p_urgency_reason text default null,
  p_website text default null,
  p_capture_group_id uuid default null
)
returns table (request_number bigint, team_name text, created_at timestamptz, capture_group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt record;
  v_request public.marketing_requests%rowtype;
  v_group public.marketing_capture_groups%rowtype;
  v_group_attached boolean := false;
begin
  if p_request_kind = 'capture_edit' and p_preferred_capture_at is not null
    and not private.marketing_capture_period_selection_is_valid(p_preferred_capture_at, p_preferred_capture_duration_minutes) then
    raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
  end if;
  if p_capture_group_id is not null and p_request_kind <> 'capture_edit' then
    raise exception 'MARKETING_CAPTURE_GROUP_KIND_INVALID';
  end if;

  if p_capture_group_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_group:' || p_capture_group_id::text, 0));
    insert into public.marketing_capture_groups(id, team_id, broker_name, requester_name, request_source)
    values (p_capture_group_id, p_team_id, btrim(p_broker_name), btrim(p_requester_name), 'public')
    on conflict (id) do nothing;

    select * into v_group from public.marketing_capture_groups where id = p_capture_group_id for update;
    if v_group.team_id is distinct from p_team_id
      or lower(btrim(v_group.broker_name)) <> lower(btrim(p_broker_name))
      or lower(btrim(v_group.requester_name)) <> lower(btrim(p_requester_name))
      or v_group.request_source <> 'public' then
      raise exception 'MARKETING_CAPTURE_GROUP_MISMATCH';
    end if;
  end if;

  select * into v_receipt
  from public.marketing_public_create_request(
    p_submission_id,
    p_requester_name,
    p_team_id,
    p_broker_name,
    p_has_property_code,
    p_property_reference,
    p_request_kind,
    p_content_types,
    p_is_exclusive,
    p_capture_location,
    p_preferred_capture_at,
    p_preferred_capture_duration_minutes,
    p_asset_link,
    p_paid_traffic,
    p_requester_notes,
    p_urgency_requested,
    p_urgency_reason,
    p_website
  );

  select q.* into v_request
  from public.marketing_requests q
  where q.public_submission_id = p_submission_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.capture_group_id is not null and v_request.capture_group_id is distinct from p_capture_group_id then
    raise exception 'MARKETING_CAPTURE_GROUP_MISMATCH';
  end if;

  if p_capture_group_id is not null and v_request.capture_group_id is null then
    update public.marketing_requests set capture_group_id = p_capture_group_id where id = v_request.id;
    v_group_attached := true;
  end if;

  if v_group_attached then
    insert into public.marketing_request_events(
      request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
    ) values (
      v_request.id,
      'saida_captacao_agrupada',
      v_request.status,
      v_request.status,
      null,
      btrim(p_requester_name),
      jsonb_build_object('captureGroupId', p_capture_group_id, 'origin', 'public')
    );
  end if;

  return query select v_receipt.request_number, v_receipt.team_name, v_receipt.created_at, p_capture_group_id;
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
begin
  select r.user_id into v_user_id from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request
  from public.marketing_requests q
  where q.id = p_request_id and q.deleted_at is null
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
      if not private.marketing_capture_period_selection_is_valid(v_confirmed, v_duration) then
        raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_schedule', 0));
      if private.marketing_capture_period_conflicts(v_confirmed, v_duration, v_request.capture_group_id, p_request_id) then
        raise exception 'MARKETING_CAPTURE_CONFLICT';
      end if;
    end if;
  end if;

  perform public.marketing_v2_update_request(p_session_token, p_request_id, p_action, p_payload);
end;
$$;

revoke all on function public.marketing_v2_get_operation_schedule(text) from public, anon, authenticated;
revoke all on function public.marketing_public_get_availability_v22() from public, anon, authenticated;
revoke all on function public.marketing_public_create_grouped_request(uuid, text, uuid, text, boolean, text, text, text[], boolean, text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid) from public, anon, authenticated;
revoke all on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.marketing_v2_get_operation_schedule(text) to anon, authenticated;
grant execute on function public.marketing_public_get_availability_v22() to anon, authenticated;
grant execute on function public.marketing_public_create_grouped_request(uuid, text, uuid, text, boolean, text, text, text[], boolean, text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid) to anon, authenticated;
grant execute on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
