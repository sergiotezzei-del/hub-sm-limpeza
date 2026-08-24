alter table public.marketing_requests
  add column if not exists preferred_capture_duration_minutes integer,
  add column if not exists confirmed_capture_duration_minutes integer,
  add column if not exists confirmed_capture_end_at timestamptz,
  add column if not exists is_exclusive boolean;

comment on column public.marketing_requests.is_exclusive is
  'Informação declarada sobre exclusividade do imóvel. NULL identifica pedidos legados sem resposta.';

create or replace function private.marketing_sync_capture_end_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.confirmed_capture_end_at := case
    when new.confirmed_capture_at is not null and new.confirmed_capture_duration_minutes is not null
      then new.confirmed_capture_at + new.confirmed_capture_duration_minutes * interval '1 minute'
    else null
  end;
  return new;
end;
$$;

revoke all on function private.marketing_sync_capture_end_at() from public, anon, authenticated;

drop trigger if exists marketing_requests_sync_capture_end on public.marketing_requests;
create trigger marketing_requests_sync_capture_end
before insert or update of confirmed_capture_at, confirmed_capture_duration_minutes
on public.marketing_requests
for each row execute function private.marketing_sync_capture_end_at();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_preferred_duration_positive'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_preferred_duration_positive
      check (preferred_capture_duration_minutes is null or preferred_capture_duration_minutes > 0);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_confirmed_duration_positive'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_confirmed_duration_positive
      check (confirmed_capture_duration_minutes is null or confirmed_capture_duration_minutes > 0);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_confirmed_capture_no_overlap'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_confirmed_capture_no_overlap
      exclude using gist (
        tstzrange(
          confirmed_capture_at,
          confirmed_capture_end_at,
          '[)'
        ) with &&
      )
      where (
        request_kind = 'capture_edit'
        and status <> 'cancelado'
        and confirmed_capture_at is not null
        and confirmed_capture_duration_minutes is not null
        and confirmed_capture_end_at is not null
      );
  end if;
end;
$$;

create table if not exists public.marketing_schedule_settings (
  id text primary key default 'default' check (id = 'default'),
  timezone text not null default 'America/Sao_Paulo' check (btrim(timezone) <> ''),
  working_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  workday_start time not null default time '08:00',
  workday_end time not null default time '18:00',
  duration_options_minutes integer[] not null default array[30, 60, 90, 120, 180],
  updated_at timestamptz not null default now(),
  check (workday_start < workday_end),
  check (cardinality(working_days) > 0),
  check (cardinality(duration_options_minutes) > 0)
);

insert into public.marketing_schedule_settings (
  id,
  timezone,
  working_days,
  workday_start,
  workday_end,
  duration_options_minutes
)
values (
  'default',
  'America/Sao_Paulo',
  array[1, 2, 3, 4, 5]::smallint[],
  time '08:00',
  time '18:00',
  array[30, 60, 90, 120, 180]
)
on conflict (id) do nothing;

create table if not exists public.marketing_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id text not null references public.managed_users(id) on update cascade on delete cascade,
  request_id uuid not null references public.marketing_requests(id) on delete restrict,
  type text not null check (btrim(type) <> ''),
  title text not null check (btrim(title) <> ''),
  message text not null check (btrim(message) <> ''),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_notifications_recipient_idx
  on public.marketing_notifications(recipient_user_id, created_at desc);
create index if not exists marketing_notifications_unread_idx
  on public.marketing_notifications(recipient_user_id, created_at desc)
  where read_at is null;
create index if not exists marketing_notifications_request_idx
  on public.marketing_notifications(request_id, created_at desc);

create table if not exists public.marketing_queue_override_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests(id) on delete restrict,
  blocking_request_id uuid references public.marketing_requests(id) on delete restrict,
  requested_by_user_id text not null references public.managed_users(id) on update cascade on delete restrict,
  requested_by_name text not null check (btrim(requested_by_name) <> ''),
  reason text not null check (btrim(reason) <> ''),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_user_id text references public.managed_users(id) on update cascade on delete restrict,
  decided_by_name text,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and decided_at is null and decided_by_user_id is null)
    or (status in ('approved', 'rejected') and decided_at is not null and decided_by_user_id is not null)
  ),
  check (consumed_at is null or status = 'approved')
);

create unique index if not exists marketing_queue_override_pending_uidx
  on public.marketing_queue_override_requests(request_id)
  where status = 'pending';
create index if not exists marketing_queue_override_admin_idx
  on public.marketing_queue_override_requests(status, created_at asc);
create index if not exists marketing_queue_override_request_idx
  on public.marketing_queue_override_requests(request_id, created_at desc);
create index if not exists marketing_queue_override_blocker_idx
  on public.marketing_queue_override_requests(blocking_request_id)
  where blocking_request_id is not null;
create index if not exists marketing_queue_override_requester_idx
  on public.marketing_queue_override_requests(requested_by_user_id, created_at desc);
create index if not exists marketing_queue_override_decider_idx
  on public.marketing_queue_override_requests(decided_by_user_id)
  where decided_by_user_id is not null;

alter table public.marketing_schedule_settings enable row level security;
alter table public.marketing_notifications enable row level security;
alter table public.marketing_queue_override_requests enable row level security;

revoke all on public.marketing_schedule_settings from public, anon, authenticated;
revoke all on public.marketing_notifications from public, anon, authenticated;
revoke all on public.marketing_queue_override_requests from public, anon, authenticated;

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
  v_settings public.marketing_schedule_settings%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if p_start_at is null or p_duration_minutes is null then
    return false;
  end if;

  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';

  if v_settings.id is null
    or not (p_duration_minutes = any(v_settings.duration_options_minutes)) then
    return false;
  end if;

  v_local_start := p_start_at at time zone v_settings.timezone;
  v_local_end := v_local_start + p_duration_minutes * interval '1 minute';

  return extract(isodow from v_local_start)::smallint = any(v_settings.working_days)
    and v_local_start::time >= v_settings.workday_start
    and v_local_end::date = v_local_start::date
    and v_local_end::time <= v_settings.workday_end;
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
    from public.marketing_requests q
    where q.request_kind = 'capture_edit'
      and q.status <> 'cancelado'
      and q.confirmed_capture_at is not null
      and q.confirmed_capture_duration_minutes is not null
      and q.id is distinct from p_excluded_request_id
      and tstzrange(
        q.confirmed_capture_at,
        q.confirmed_capture_at + q.confirmed_capture_duration_minutes * interval '1 minute',
        '[)'
      ) && tstzrange(
        p_start_at,
        p_start_at + p_duration_minutes * interval '1 minute',
        '[)'
      )
  );
$$;

create or replace function private.marketing_status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'solicitado' then 'Solicitado'
    when 'agendado' then 'Agendado'
    when 'aguardando_edicao' then 'Fila de edição'
    when 'em_edicao' then 'Em edição'
    when 'em_aprovacao' then 'Em aprovação'
    when 'revisao' then 'Revisão'
    when 'pronto' then 'Pronto'
    when 'bloqueado' then 'Bloqueado'
    when 'cancelado' then 'Cancelado'
    else p_status
  end;
$$;

create or replace function private.marketing_notify_manager(
  p_request_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_actor_user_id text,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.marketing_requests%rowtype;
  v_recipient_user_id text;
  v_notification_id uuid;
begin
  select * into v_request
  from public.marketing_requests
  where id = p_request_id;

  if v_request.id is null then
    return null;
  end if;

  select a.managed_user_id into v_recipient_user_id
  from public.marketing_access a
  join public.managed_users u on u.id = a.managed_user_id and u.active is true
  where a.managed_user_id = v_request.created_by_user_id
    and a.role = 'sales_manager'
    and a.team_id = v_request.team_id
    and a.active is true
  limit 1;

  if v_recipient_user_id is null then
    select a.managed_user_id into v_recipient_user_id
    from public.marketing_access a
    join public.managed_users u on u.id = a.managed_user_id and u.active is true
    where a.role = 'sales_manager'
      and a.team_id = v_request.team_id
      and a.active is true
    order by a.updated_at desc, a.managed_user_id
    limit 1;
  end if;

  if v_recipient_user_id is null then
    return null;
  end if;

  insert into public.marketing_notifications (
    recipient_user_id,
    request_id,
    type,
    title,
    message
  ) values (
    v_recipient_user_id,
    p_request_id,
    p_type,
    p_title,
    p_message
  ) returning id into v_notification_id;

  insert into public.marketing_request_events (
    request_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    details
  ) values (
    p_request_id,
    'notificacao_criada',
    v_request.status,
    v_request.status,
    p_actor_user_id,
    coalesce(nullif(btrim(p_actor_name), ''), 'Marketing'),
    jsonb_build_object(
      'notificationId', v_notification_id,
      'recipientUserId', v_recipient_user_id,
      'type', p_type
    )
  );

  return v_notification_id;
end;
$$;

revoke all on function private.marketing_capture_window_is_valid(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_capture_conflicts(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function private.marketing_status_label(text) from public, anon, authenticated;
revoke all on function private.marketing_notify_manager(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.marketing_v2_get_dashboard(p_session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_team_id uuid;
  v_result jsonb;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;

  v_result := public.marketing_session_get_dashboard(p_session_token);

  return v_result || jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'requestNumber', q.request_number,
        'teamId', q.team_id,
        'managerName', q.manager_name,
        'brokerId', q.broker_id,
        'brokerName', q.broker_name,
        'hasPropertyCode', q.has_property_code,
        'propertyReference', case when q.has_property_code then q.property_reference else 'Sem código informado' end,
        'isExclusive', q.is_exclusive,
        'requestKind', q.request_kind,
        'contentTypes', q.content_types,
        'captureLocation', case when q.request_kind = 'capture_edit' then q.capture_location else null end,
        'preferredCaptureAt', case when q.request_kind = 'capture_edit' then q.preferred_capture_at else null end,
        'preferredCaptureDurationMinutes', case when q.request_kind = 'capture_edit' then q.preferred_capture_duration_minutes else null end,
        'confirmedCaptureAt', case when q.request_kind = 'capture_edit' then q.confirmed_capture_at else null end,
        'confirmedCaptureDurationMinutes', case when q.request_kind = 'capture_edit' then q.confirmed_capture_duration_minutes else null end,
        'assetLink', q.asset_link,
        'paidTraffic', q.paid_traffic,
        'requesterNotes', q.requester_notes,
        'marketingNotes', case when v_role = 'sales_manager' then null else q.marketing_notes end,
        'status', q.status,
        'assignedMarketingName', q.assigned_marketing_name,
        'promisedAt', q.promised_at,
        'urgencyRequested', q.urgency_requested,
        'urgencyReason', q.urgency_reason,
        'urgencyApproved', q.urgency_approved,
        'urgencyDecidedByName', q.urgency_decided_by_name,
        'urgencyDecidedAt', q.urgency_decided_at,
        'createdByUserId', q.created_by_user_id,
        'createdByName', q.created_by_name,
        'completedAt', q.completed_at,
        'createdAt', q.created_at,
        'updatedAt', q.updated_at
      ) order by q.urgency_approved desc, q.created_at asc, q.request_number asc)
      from public.marketing_requests q
      where v_role <> 'sales_manager' or q.team_id = v_team_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'recipientUserId', n.recipient_user_id,
        'requestId', n.request_id,
        'requestNumber', q.request_number,
        'brokerName', q.broker_name,
        'type', n.type,
        'title', n.title,
        'message', n.message,
        'readAt', n.read_at,
        'createdAt', n.created_at
      ) order by n.created_at desc)
      from public.marketing_notifications n
      join public.marketing_requests q on q.id = n.request_id
      where n.recipient_user_id = v_user_id
    ), '[]'::jsonb),
    'queueOverrideRequests', case when v_role in ('admin', 'marketing') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'requestId', o.request_id,
        'requestNumber', q.request_number,
        'brokerName', q.broker_name,
        'managerName', q.manager_name,
        'blockingRequestId', o.blocking_request_id,
        'blockingRequestNumber', blocker.request_number,
        'requestedByUserId', o.requested_by_user_id,
        'requestedByName', o.requested_by_name,
        'reason', o.reason,
        'status', o.status,
        'decidedByUserId', o.decided_by_user_id,
        'decidedByName', o.decided_by_name,
        'decidedAt', o.decided_at,
        'consumedAt', o.consumed_at,
        'createdAt', o.created_at
      ) order by (o.status = 'pending') desc, o.created_at desc)
      from public.marketing_queue_override_requests o
      join public.marketing_requests q on q.id = o.request_id
      left join public.marketing_requests blocker on blocker.id = o.blocking_request_id
      where v_role = 'admin' or o.requested_by_user_id = v_user_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId', q.id,
        'startAt', q.confirmed_capture_at,
        'durationMinutes', q.confirmed_capture_duration_minutes
      ) order by q.confirmed_capture_at)
      from public.marketing_requests q
      where q.request_kind = 'capture_edit'
        and q.status <> 'cancelado'
        and q.confirmed_capture_at is not null
        and q.confirmed_capture_duration_minutes is not null
    ), '[]'::jsonb),
    'scheduleConfig', (
      select jsonb_build_object(
        'timezone', s.timezone,
        'workingDays', s.working_days,
        'workdayStart', to_char(s.workday_start, 'HH24:MI'),
        'workdayEnd', to_char(s.workday_end, 'HH24:MI'),
        'durationOptionsMinutes', s.duration_options_minutes
      )
      from public.marketing_schedule_settings s
      where s.id = 'default'
    )
  );
end;
$$;

create or replace function public.marketing_v2_create_request(
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
  p_preferred_capture_duration_minutes integer default null,
  p_asset_link text default null,
  p_paid_traffic boolean default false,
  p_requester_notes text default null,
  p_urgency_requested boolean default false,
  p_urgency_reason text default null
)
returns table (request_id uuid, request_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_actor_team_id uuid;
  v_manager_name text;
  v_broker_id uuid;
  v_request_id uuid;
  v_request_number bigint;
  v_has_property_code boolean := coalesce(p_has_property_code, true);
  v_property_reference text;
  v_preferred_capture_at timestamptz;
  v_preferred_duration integer;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_actor_team_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role not in ('admin', 'sales_manager') then raise exception 'MARKETING_CREATE_DENIED'; end if;
  if v_role = 'sales_manager' and p_team_id is distinct from v_actor_team_id then
    raise exception 'MARKETING_TEAM_DENIED';
  end if;
  if nullif(btrim(coalesce(p_broker_name, '')), '') is null then
    raise exception 'MARKETING_BROKER_REQUIRED';
  end if;
  if p_request_kind not in ('capture_edit', 'edit_only') then
    raise exception 'MARKETING_KIND_INVALID';
  end if;
  if coalesce(cardinality(p_content_types), 0) = 0 then
    raise exception 'MARKETING_CONTENT_REQUIRED';
  end if;
  if p_is_exclusive is null then
    raise exception 'MARKETING_EXCLUSIVITY_REQUIRED';
  end if;
  if p_urgency_requested and nullif(btrim(coalesce(p_urgency_reason, '')), '') is null then
    raise exception 'MARKETING_URGENCY_REASON_REQUIRED';
  end if;

  if v_has_property_code then
    v_property_reference := nullif(btrim(coalesce(p_property_reference, '')), '');
    if v_property_reference is null then raise exception 'MARKETING_PROPERTY_REQUIRED'; end if;
  else
    v_property_reference := 'SEM CÓDIGO';
  end if;

  if p_request_kind = 'capture_edit' then
    v_preferred_capture_at := p_preferred_capture_at;
    v_preferred_duration := p_preferred_capture_duration_minutes;
    if (v_preferred_capture_at is null) <> (v_preferred_duration is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;
    if v_preferred_capture_at is not null then
      if not private.marketing_capture_window_is_valid(v_preferred_capture_at, v_preferred_duration) then
        raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
      end if;
      if private.marketing_capture_conflicts(v_preferred_capture_at, v_preferred_duration) then
        raise exception 'MARKETING_CAPTURE_CONFLICT';
      end if;
    end if;
  else
    v_preferred_capture_at := null;
    v_preferred_duration := null;
  end if;

  select t.manager_name into v_manager_name
  from public.marketing_teams t
  where t.id = p_team_id and t.active is true;
  if v_manager_name is null then raise exception 'MARKETING_TEAM_NOT_FOUND'; end if;

  select b.id into v_broker_id
  from public.marketing_brokers b
  where b.team_id = p_team_id
    and lower(btrim(b.name)) = lower(btrim(p_broker_name))
  limit 1;

  if v_broker_id is null then
    insert into public.marketing_brokers (team_id, name)
    values (p_team_id, btrim(p_broker_name))
    returning id into v_broker_id;
  end if;

  insert into public.marketing_requests (
    team_id,
    manager_name,
    broker_id,
    broker_name,
    has_property_code,
    property_reference,
    is_exclusive,
    request_kind,
    content_types,
    capture_location,
    preferred_capture_at,
    preferred_capture_duration_minutes,
    asset_link,
    paid_traffic,
    requester_notes,
    urgency_requested,
    urgency_reason,
    created_by_user_id,
    created_by_name
  ) values (
    p_team_id,
    v_manager_name,
    v_broker_id,
    btrim(p_broker_name),
    v_has_property_code,
    v_property_reference,
    p_is_exclusive,
    p_request_kind,
    p_content_types,
    case when p_request_kind = 'capture_edit' then nullif(btrim(coalesce(p_capture_location, '')), '') else null end,
    v_preferred_capture_at,
    v_preferred_duration,
    nullif(btrim(coalesce(p_asset_link, '')), ''),
    coalesce(p_paid_traffic, false),
    nullif(btrim(coalesce(p_requester_notes, '')), ''),
    coalesce(p_urgency_requested, false),
    nullif(btrim(coalesce(p_urgency_reason, '')), ''),
    v_user_id,
    v_user_name
  ) returning id, marketing_requests.request_number into v_request_id, v_request_number;

  insert into public.marketing_request_events (
    request_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    details
  ) values (
    v_request_id,
    'criado',
    null,
    'solicitado',
    v_user_id,
    v_user_name,
    jsonb_build_object(
      'urgencyRequested', coalesce(p_urgency_requested, false),
      'preferredCaptureAt', v_preferred_capture_at,
      'preferredCaptureDurationMinutes', v_preferred_duration,
      'hasPropertyCode', v_has_property_code,
      'isExclusive', p_is_exclusive
    )
  );

  if v_preferred_capture_at is not null then
    insert into public.marketing_request_events (
      request_id,
      event_type,
      from_status,
      to_status,
      actor_user_id,
      actor_name,
      details
    ) values (
      v_request_id,
      'data_solicitada',
      'solicitado',
      'solicitado',
      v_user_id,
      v_user_name,
      jsonb_build_object(
        'preferredCaptureAt', v_preferred_capture_at,
        'preferredCaptureDurationMinutes', v_preferred_duration
      )
    );
  end if;

  return query select v_request_id, v_request_number;
end;
$$;

create or replace function public.marketing_v2_update_request(
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
  v_user_name text;
  v_role text;
  v_actor_team_id uuid;
  v_request public.marketing_requests%rowtype;
  v_status text;
  v_confirmed timestamptz;
  v_confirmed_duration integer;
  v_promised timestamptz;
  v_assigned text;
  v_marketing_notes text;
  v_blocking_request_id uuid;
  v_override_id uuid;
  v_timezone text;
  v_capture_message text;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_actor_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  select s.timezone into v_timezone
  from public.marketing_schedule_settings s
  where s.id = 'default';

  if p_action = 'cancel' then
    if v_role = 'sales_manager' and v_request.team_id is distinct from v_actor_team_id then
      raise exception 'MARKETING_REQUEST_DENIED';
    end if;
    if v_role not in ('admin', 'marketing', 'sales_manager') then
      raise exception 'MARKETING_REQUEST_DENIED';
    end if;

    update public.marketing_requests
    set status = 'cancelado', completed_at = now()
    where id = p_request_id;

    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'cancelado', v_request.status, 'cancelado', v_user_id, v_user_name, p_payload);

    if v_role <> 'sales_manager' and v_request.status <> 'cancelado' then
      perform private.marketing_notify_manager(
        p_request_id,
        'status_alterado',
        'Pedido cancelado',
        format('Pedido #%s · %s foi cancelado.', v_request.request_number, v_request.broker_name),
        v_user_id,
        v_user_name
      );
    end if;
    return;
  end if;

  if p_action = 'approve_urgency' then
    if v_role <> 'admin' then raise exception 'MARKETING_URGENCY_DENIED'; end if;
    update public.marketing_requests
    set urgency_requested = true,
        urgency_approved = true,
        urgency_decided_by_name = v_user_name,
        urgency_decided_at = now()
    where id = p_request_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'urgencia_aprovada', v_request.status, v_request.status, v_user_id, v_user_name, p_payload);
    return;
  end if;

  if p_action = 'reject_urgency' then
    if v_role <> 'admin' then raise exception 'MARKETING_URGENCY_DENIED'; end if;
    update public.marketing_requests
    set urgency_approved = false,
        urgency_decided_by_name = v_user_name,
        urgency_decided_at = now()
    where id = p_request_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'urgencia_mantida_na_fila', v_request.status, v_request.status, v_user_id, v_user_name, p_payload);
    return;
  end if;

  if p_action <> 'save_management' or v_role not in ('admin', 'marketing') then
    raise exception 'MARKETING_UPDATE_DENIED';
  end if;

  v_status := coalesce(nullif(p_payload->>'status', ''), v_request.status);
  if v_status not in ('solicitado', 'agendado', 'aguardando_edicao', 'em_edicao', 'em_aprovacao', 'revisao', 'pronto', 'bloqueado', 'cancelado') then
    raise exception 'MARKETING_STATUS_INVALID';
  end if;

  v_promised := case
    when p_payload ? 'promisedAt' then nullif(p_payload->>'promisedAt', '')::timestamptz
    else v_request.promised_at
  end;
  v_assigned := case
    when p_payload ? 'assignedMarketingName' then nullif(btrim(p_payload->>'assignedMarketingName'), '')
    else v_request.assigned_marketing_name
  end;
  v_marketing_notes := case
    when p_payload ? 'marketingNotes' then nullif(btrim(p_payload->>'marketingNotes'), '')
    else v_request.marketing_notes
  end;

  if v_assigned is not null and v_assigned not in ('Maria', 'Arthur') then
    raise exception 'MARKETING_ASSIGNEE_INVALID';
  end if;

  if v_request.request_kind = 'edit_only' then
    if (p_payload ? 'confirmedCaptureAt' and nullif(p_payload->>'confirmedCaptureAt', '') is not null)
      or (p_payload ? 'confirmedCaptureDurationMinutes' and nullif(p_payload->>'confirmedCaptureDurationMinutes', '') is not null) then
      raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED';
    end if;
    v_confirmed := v_request.confirmed_capture_at;
    v_confirmed_duration := v_request.confirmed_capture_duration_minutes;
  else
    v_confirmed := case
      when p_payload ? 'confirmedCaptureAt' then nullif(p_payload->>'confirmedCaptureAt', '')::timestamptz
      else v_request.confirmed_capture_at
    end;
    v_confirmed_duration := case
      when p_payload ? 'confirmedCaptureDurationMinutes' then nullif(p_payload->>'confirmedCaptureDurationMinutes', '')::integer
      else v_request.confirmed_capture_duration_minutes
    end;

    if (v_confirmed is null) <> (v_confirmed_duration is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;

    if v_confirmed is not null and v_status <> 'cancelado' then
      if not private.marketing_capture_window_is_valid(v_confirmed, v_confirmed_duration) then
        raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_schedule', 0));
      if private.marketing_capture_conflicts(v_confirmed, v_confirmed_duration, p_request_id) then
        raise exception 'MARKETING_CAPTURE_CONFLICT';
      end if;
    end if;
  end if;

  if v_request.status in ('solicitado', 'bloqueado')
    and v_status not in ('solicitado', 'bloqueado', 'cancelado') then
    select q.id into v_blocking_request_id
    from public.marketing_requests q
    where q.status = 'solicitado'
      and q.id <> p_request_id
      and (
        (q.urgency_approved is true and v_request.urgency_approved is false)
        or (
          q.urgency_approved = v_request.urgency_approved
          and (q.created_at, q.request_number) < (v_request.created_at, v_request.request_number)
        )
      )
    order by q.urgency_approved desc, q.created_at asc, q.request_number asc
    limit 1;

    if v_blocking_request_id is not null then
      select o.id into v_override_id
      from public.marketing_queue_override_requests o
      where o.request_id = p_request_id
        and o.status = 'approved'
        and o.consumed_at is null
        and o.blocking_request_id = v_blocking_request_id
      order by o.decided_at desc
      limit 1
      for update;

      if v_override_id is null then
        raise exception 'MARKETING_QUEUE_ORDER_BLOCKED';
      end if;
    end if;
  end if;

  update public.marketing_requests
  set status = v_status,
      confirmed_capture_at = case when v_request.request_kind = 'capture_edit' then v_confirmed else confirmed_capture_at end,
      confirmed_capture_duration_minutes = case when v_request.request_kind = 'capture_edit' then v_confirmed_duration else confirmed_capture_duration_minutes end,
      promised_at = v_promised,
      assigned_marketing_name = v_assigned,
      marketing_notes = v_marketing_notes,
      completed_at = case when v_status in ('pronto', 'cancelado') then coalesce(completed_at, now()) else null end
  where id = p_request_id;

  if v_override_id is not null then
    update public.marketing_queue_override_requests
    set consumed_at = now()
    where id = v_override_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      'alteracao_fila_utilizada',
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('overrideRequestId', v_override_id, 'blockingRequestId', v_blocking_request_id)
    );
  end if;

  if v_request.status is distinct from v_status then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'status_alterado', v_request.status, v_status, v_user_id, v_user_name, jsonb_build_object('status', v_status));

    perform private.marketing_notify_manager(
      p_request_id,
      case
        when v_status = 'pronto' then 'pedido_pronto'
        when v_status = 'bloqueado' then 'pedido_bloqueado'
        when v_request.status = 'bloqueado' then 'pedido_desbloqueado'
        else 'status_alterado'
      end,
      case
        when v_status = 'pronto' then 'Pedido pronto'
        when v_status = 'bloqueado' then 'Pedido bloqueado'
        when v_request.status = 'bloqueado' then 'Pedido desbloqueado'
        else 'Status do pedido atualizado'
      end,
      format(
        'Pedido #%s · %s: %s.',
        v_request.request_number,
        v_request.broker_name,
        private.marketing_status_label(v_status)
      ),
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.request_kind = 'capture_edit'
    and (
      v_request.confirmed_capture_at is distinct from v_confirmed
      or v_request.confirmed_capture_duration_minutes is distinct from v_confirmed_duration
    ) then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      case when v_request.confirmed_capture_at is null then 'data_confirmada' else 'data_confirmada_alterada' end,
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('confirmedCaptureAt', v_confirmed, 'confirmedCaptureDurationMinutes', v_confirmed_duration)
    );

    v_capture_message := case
      when v_confirmed is null then 'A captação voltou a aguardar definição do Marketing.'
      else format(
        'Captação confirmada: %s · duração de %s minutos.',
        to_char(v_confirmed at time zone v_timezone, 'DD/MM/YYYY "às" HH24:MI'),
        v_confirmed_duration
      )
    end;

    perform private.marketing_notify_manager(
      p_request_id,
      case when v_request.confirmed_capture_at is null then 'captacao_confirmada' else 'captacao_alterada' end,
      case when v_request.confirmed_capture_at is null then 'Captação confirmada' else 'Captação alterada' end,
      v_capture_message,
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.promised_at is distinct from v_promised then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      case when v_request.promised_at is null then 'previsao_entrega_definida' else 'previsao_entrega_alterada' end,
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('promisedAt', v_promised)
    );
    perform private.marketing_notify_manager(
      p_request_id,
      'previsao_entrega',
      'Previsão de entrega atualizada',
      case
        when v_promised is null then 'A previsão de entrega foi retirada e será redefinida pelo Marketing.'
        else format('Previsão de entrega: %s.', to_char(v_promised at time zone v_timezone, 'DD/MM/YYYY "às" HH24:MI'))
      end,
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.assigned_marketing_name is distinct from v_assigned then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      'responsavel_definido',
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('assignedMarketingName', v_assigned)
    );
    perform private.marketing_notify_manager(
      p_request_id,
      'responsavel_definido',
      'Responsável do Marketing atualizado',
      case when v_assigned is null then 'O pedido está aguardando definição de responsável.' else format('Responsável: %s.', v_assigned) end,
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.marketing_notes is distinct from v_marketing_notes then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      'observacao_interna_atualizada',
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      '{}'::jsonb
    );
  end if;
end;
$$;

create or replace function public.marketing_v2_request_queue_override(
  p_session_token text,
  p_request_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_blocking_request_id uuid;
  v_override_id uuid;
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'marketing' then raise exception 'MARKETING_OVERRIDE_REQUEST_DENIED'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'MARKETING_OVERRIDE_REASON_REQUIRED';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.status not in ('solicitado', 'bloqueado') then
    raise exception 'MARKETING_OVERRIDE_NOT_NEEDED';
  end if;

  select q.id into v_blocking_request_id
  from public.marketing_requests q
  where q.status = 'solicitado'
    and q.id <> p_request_id
    and (
      (q.urgency_approved is true and v_request.urgency_approved is false)
      or (
        q.urgency_approved = v_request.urgency_approved
        and (q.created_at, q.request_number) < (v_request.created_at, v_request.request_number)
      )
    )
  order by q.urgency_approved desc, q.created_at asc, q.request_number asc
  limit 1;

  if v_blocking_request_id is null then
    raise exception 'MARKETING_OVERRIDE_NOT_NEEDED';
  end if;
  if exists (
    select 1 from public.marketing_queue_override_requests o
    where o.request_id = p_request_id and o.status = 'pending'
  ) then
    raise exception 'MARKETING_OVERRIDE_ALREADY_PENDING';
  end if;

  begin
    insert into public.marketing_queue_override_requests (
      request_id,
      blocking_request_id,
      requested_by_user_id,
      requested_by_name,
      reason
    ) values (
      p_request_id,
      v_blocking_request_id,
      v_user_id,
      v_user_name,
      btrim(p_reason)
    ) returning id into v_override_id;
  exception when unique_violation then
    raise exception 'MARKETING_OVERRIDE_ALREADY_PENDING';
  end;

  insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
  values (
    p_request_id,
    'alteracao_fila_solicitada',
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('overrideRequestId', v_override_id, 'blockingRequestId', v_blocking_request_id, 'reason', btrim(p_reason))
  );

  return v_override_id;
end;
$$;

create or replace function public.marketing_v2_decide_queue_override(
  p_session_token text,
  p_override_request_id uuid,
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
  v_override public.marketing_queue_override_requests%rowtype;
  v_request public.marketing_requests%rowtype;
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'MARKETING_OVERRIDE_DECISION_INVALID';
  end if;

  select * into v_override
  from public.marketing_queue_override_requests
  where id = p_override_request_id
  for update;
  if v_override.id is null then raise exception 'MARKETING_OVERRIDE_NOT_FOUND'; end if;
  if v_override.status <> 'pending' then raise exception 'MARKETING_OVERRIDE_ALREADY_DECIDED'; end if;

  select * into v_request
  from public.marketing_requests
  where id = v_override.request_id;

  update public.marketing_queue_override_requests
  set status = p_decision,
      decided_by_user_id = v_user_id,
      decided_by_name = v_user_name,
      decided_at = now()
  where id = p_override_request_id;

  insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
  values (
    v_override.request_id,
    case when p_decision = 'approved' then 'alteracao_fila_aprovada' else 'alteracao_fila_rejeitada' end,
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('overrideRequestId', p_override_request_id, 'decision', p_decision)
  );
end;
$$;

create or replace function public.marketing_v2_mark_notifications_read(
  p_session_token text,
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_count integer;
begin
  select r.user_id into v_user_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  update public.marketing_notifications n
  set read_at = coalesce(n.read_at, now())
  where n.recipient_user_id = v_user_id
    and n.read_at is null
    and (p_notification_ids is null or n.id = any(p_notification_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.marketing_v2_get_dashboard(text) from public, anon, authenticated;
revoke all on function public.marketing_v2_create_request(text, uuid, text, boolean, text, text, text[], boolean, text, timestamptz, integer, text, boolean, text, boolean, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_update_request(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_v2_request_queue_override(text, uuid, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_decide_queue_override(text, uuid, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_mark_notifications_read(text, uuid[]) from public, anon, authenticated;

grant execute on function public.marketing_v2_get_dashboard(text) to anon, authenticated;
grant execute on function public.marketing_v2_create_request(text, uuid, text, boolean, text, text, text[], boolean, text, timestamptz, integer, text, boolean, text, boolean, text) to anon, authenticated;
grant execute on function public.marketing_v2_update_request(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.marketing_v2_request_queue_override(text, uuid, text) to anon, authenticated;
grant execute on function public.marketing_v2_decide_queue_override(text, uuid, text) to anon, authenticated;
grant execute on function public.marketing_v2_mark_notifications_read(text, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
