create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.marketing_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  managed_user_id text not null references public.managed_users(id) on update cascade on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists marketing_sessions_user_idx
  on private.marketing_sessions(managed_user_id, expires_at desc);
create index if not exists marketing_sessions_expiry_idx
  on private.marketing_sessions(expires_at)
  where revoked_at is null;

alter table private.marketing_sessions enable row level security;
revoke all on private.marketing_sessions from public, anon, authenticated;

create or replace function private.marketing_resolve_session(p_session_token text)
returns table (
  session_id uuid,
  user_id text,
  user_name text,
  access_role text,
  team_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    u.id,
    u.name,
    a.role,
    a.team_id
  from private.marketing_sessions s
  join public.managed_users u on u.id = s.managed_user_id and u.active is true
  join public.marketing_access a on a.managed_user_id = u.id and a.active is true
  where nullif(btrim(p_session_token), '') is not null
    and s.token_hash = encode(extensions.digest(btrim(p_session_token), 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
    and (s.auth_user_id is null or s.auth_user_id = (select auth.uid()))
    and (
      u.id = 'tezzei'
      or 'painel-admin' = any(coalesce(u.permissions, '{}'::text[]))
      or 'marketing' = any(coalesce(u.permissions, '{}'::text[]))
    )
  limit 1;
$$;

revoke all on function private.marketing_resolve_session(text) from public, anon, authenticated;

create or replace function public.marketing_start_session(p_access_code text)
returns table (
  session_token text,
  user_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_token text;
  v_expires_at timestamptz := now() + interval '12 hours';
  v_auth_user_id uuid := auth.uid();
  v_is_hub_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
    or coalesce((auth.jwt() -> 'app_metadata' -> 'permissions') ? 'painel-admin', false);
begin
  select u.id into v_user_id
  from public.managed_users u
  join public.marketing_access a on a.managed_user_id = u.id and a.active is true
  where u.active is true
    and nullif(btrim(p_access_code), '') is not null
    and u.access_code_hash = extensions.crypt(btrim(p_access_code), u.access_code_hash)
    and (
      u.id = 'tezzei'
      or 'painel-admin' = any(coalesce(u.permissions, '{}'::text[]))
      or 'marketing' = any(coalesce(u.permissions, '{}'::text[]))
    )
  limit 1;

  if v_user_id is null then
    raise exception 'MARKETING_ACCESS_DENIED';
  end if;
  if v_user_id = 'tezzei' and (v_auth_user_id is null or not v_is_hub_admin) then
    raise exception 'MARKETING_AUTH_REQUIRED';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_user_id,
    v_auth_user_id,
    v_expires_at
  );

  return query select v_token, v_user_id, v_expires_at;
end;
$$;

create or replace function public.marketing_end_session(p_session_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.marketing_sessions s
  set revoked_at = coalesce(s.revoked_at, now())
  where nullif(btrim(p_session_token), '') is not null
    and s.token_hash = encode(extensions.digest(btrim(p_session_token), 'sha256'), 'hex')
    and (s.auth_user_id is null or s.auth_user_id = (select auth.uid()));
$$;

drop function if exists public.marketing_get_dashboard(text);
drop function if exists public.marketing_create_request(text, uuid, text, boolean, text, text, text[], text, timestamptz, text, boolean, text, boolean, text);
drop function if exists public.marketing_update_request(text, uuid, text, jsonb);
drop function if exists public.marketing_save_access(text, text, text, uuid, boolean);
drop function if exists public.marketing_resolve_actor(text);

create function public.marketing_get_dashboard(p_session_token text)
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
  v_team_name text;
  v_result jsonb;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;

  select t.manager_name into v_team_name
  from public.marketing_teams t
  where t.id = v_team_id;

  select jsonb_build_object(
    'context', jsonb_build_object(
      'userId', v_user_id,
      'userName', v_user_name,
      'role', v_role,
      'teamId', v_team_id,
      'teamName', v_team_name
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'managerName', t.manager_name,
        'active', t.active,
        'sortOrder', t.sort_order
      ) order by t.sort_order, t.manager_name)
      from public.marketing_teams t
      where t.active is true
        and (v_role <> 'sales_manager' or t.id = v_team_id)
    ), '[]'::jsonb),
    'brokers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'teamId', b.team_id,
        'name', b.name,
        'active', b.active
      ) order by b.name)
      from public.marketing_brokers b
      where b.active is true
        and (v_role <> 'sales_manager' or b.team_id = v_team_id)
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'requestNumber', q.request_number,
        'teamId', q.team_id,
        'managerName', q.manager_name,
        'brokerId', q.broker_id,
        'brokerName', q.broker_name,
        'hasPropertyCode', q.has_property_code,
        'propertyReference', q.property_reference,
        'requestKind', q.request_kind,
        'contentTypes', q.content_types,
        'captureLocation', q.capture_location,
        'preferredCaptureAt', q.preferred_capture_at,
        'confirmedCaptureAt', q.confirmed_capture_at,
        'assetLink', q.asset_link,
        'paidTraffic', q.paid_traffic,
        'requesterNotes', q.requester_notes,
        'marketingNotes', q.marketing_notes,
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
      ) order by q.urgency_approved desc, q.created_at asc)
      from public.marketing_requests q
      where (v_role <> 'sales_manager' or q.team_id = v_team_id)
    ), '[]'::jsonb),
    'access', case when v_role = 'admin' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'managedUserId', a.managed_user_id,
        'userName', u.name,
        'role', a.role,
        'teamId', a.team_id,
        'active', a.active
      ) order by u.name)
      from public.marketing_access a
      join public.managed_users u on u.id = a.managed_user_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'availableUsers', case when v_role = 'admin' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'jobTitle', u.job_title,
        'department', u.department,
        'active', u.active
      ) order by u.name)
      from public.managed_users u
      where u.active is true
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result;

  return v_result;
end;
$$;

create function public.marketing_create_request(
  p_session_token text,
  p_team_id uuid,
  p_broker_name text,
  p_has_property_code boolean,
  p_property_reference text,
  p_request_kind text,
  p_content_types text[],
  p_capture_location text default null,
  p_preferred_capture_at timestamptz default null,
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
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_actor_team_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_role not in ('admin', 'sales_manager') then
    raise exception 'MARKETING_CREATE_DENIED';
  end if;
  if v_role = 'sales_manager' and p_team_id is distinct from v_actor_team_id then
    raise exception 'MARKETING_TEAM_DENIED';
  end if;
  if nullif(btrim(coalesce(p_broker_name, '')), '') is null then
    raise exception 'MARKETING_BROKER_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_property_reference, '')), '') is null then
    raise exception 'MARKETING_PROPERTY_REQUIRED';
  end if;
  if p_request_kind not in ('capture_edit', 'edit_only') then
    raise exception 'MARKETING_KIND_INVALID';
  end if;
  if coalesce(cardinality(p_content_types), 0) = 0 then
    raise exception 'MARKETING_CONTENT_REQUIRED';
  end if;
  if p_urgency_requested and nullif(btrim(coalesce(p_urgency_reason, '')), '') is null then
    raise exception 'MARKETING_URGENCY_REASON_REQUIRED';
  end if;

  select t.manager_name into v_manager_name
  from public.marketing_teams t
  where t.id = p_team_id and t.active is true;
  if v_manager_name is null then
    raise exception 'MARKETING_TEAM_NOT_FOUND';
  end if;

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
    team_id, manager_name, broker_id, broker_name,
    has_property_code, property_reference, request_kind, content_types,
    capture_location, preferred_capture_at, asset_link, paid_traffic,
    requester_notes, urgency_requested, urgency_reason,
    created_by_user_id, created_by_name
  ) values (
    p_team_id, v_manager_name, v_broker_id, btrim(p_broker_name),
    coalesce(p_has_property_code, true), btrim(p_property_reference), p_request_kind, p_content_types,
    nullif(btrim(coalesce(p_capture_location, '')), ''), p_preferred_capture_at,
    nullif(btrim(coalesce(p_asset_link, '')), ''), coalesce(p_paid_traffic, false),
    nullif(btrim(coalesce(p_requester_notes, '')), ''), coalesce(p_urgency_requested, false),
    nullif(btrim(coalesce(p_urgency_reason, '')), ''),
    v_user_id, v_user_name
  ) returning id, marketing_requests.request_number into v_request_id, v_request_number;

  insert into public.marketing_request_events (
    request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
  ) values (
    v_request_id, 'criado', null, 'solicitado', v_user_id, v_user_name,
    jsonb_build_object('urgencyRequested', coalesce(p_urgency_requested, false))
  );

  return query select v_request_id, v_request_number;
end;
$$;

create function public.marketing_update_request(
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
  v_promised timestamptz;
  v_assigned text;
  v_marketing_notes text;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_actor_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request from public.marketing_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  if p_action = 'cancel' then
    if v_role = 'sales_manager' and v_request.team_id is distinct from v_actor_team_id then
      raise exception 'MARKETING_REQUEST_DENIED';
    end if;
    if v_role not in ('admin', 'marketing', 'sales_manager') then raise exception 'MARKETING_REQUEST_DENIED'; end if;
    update public.marketing_requests
      set status = 'cancelado', completed_at = now()
      where id = p_request_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
      values (p_request_id, 'cancelado', v_request.status, 'cancelado', v_user_id, v_user_name, p_payload);
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
  v_confirmed := case when p_payload ? 'confirmedCaptureAt' then nullif(p_payload->>'confirmedCaptureAt', '')::timestamptz else v_request.confirmed_capture_at end;
  v_promised := case when p_payload ? 'promisedAt' then nullif(p_payload->>'promisedAt', '')::timestamptz else v_request.promised_at end;
  v_assigned := case when p_payload ? 'assignedMarketingName' then nullif(btrim(p_payload->>'assignedMarketingName'), '') else v_request.assigned_marketing_name end;
  v_marketing_notes := case when p_payload ? 'marketingNotes' then nullif(btrim(p_payload->>'marketingNotes'), '') else v_request.marketing_notes end;

  update public.marketing_requests
  set status = v_status,
      confirmed_capture_at = v_confirmed,
      promised_at = v_promised,
      assigned_marketing_name = v_assigned,
      marketing_notes = v_marketing_notes,
      completed_at = case when v_status in ('pronto', 'cancelado') then coalesce(completed_at, now()) else null end
  where id = p_request_id;

  insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
  values (p_request_id, 'gestao_atualizada', v_request.status, v_status, v_user_id, v_user_name, p_payload);
end;
$$;

create function public.marketing_save_access(
  p_session_token text,
  p_managed_user_id text,
  p_role text,
  p_team_id uuid default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
begin
  select r.user_id, r.access_role into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;
  if p_role not in ('admin', 'marketing', 'sales_manager') then raise exception 'MARKETING_ROLE_INVALID'; end if;
  if p_role = 'sales_manager' and p_team_id is null then raise exception 'MARKETING_TEAM_REQUIRED'; end if;
  if not exists (select 1 from public.managed_users where id = p_managed_user_id and active is true) then
    raise exception 'MARKETING_USER_NOT_FOUND';
  end if;

  insert into public.marketing_access(managed_user_id, role, team_id, active)
  values (p_managed_user_id, p_role, case when p_role = 'sales_manager' then p_team_id else null end, coalesce(p_active, true))
  on conflict (managed_user_id) do update
    set role = excluded.role,
        team_id = excluded.team_id,
        active = excluded.active;
end;
$$;

revoke all on function public.touch_marketing_updated_at() from public, anon, authenticated;
revoke all on function public.marketing_start_session(text) from public, anon, authenticated;
revoke all on function public.marketing_end_session(text) from public, anon, authenticated;
revoke all on function public.marketing_get_dashboard(text) from public, anon, authenticated;
revoke all on function public.marketing_create_request(text, uuid, text, boolean, text, text, text[], text, timestamptz, text, boolean, text, boolean, text) from public, anon, authenticated;
revoke all on function public.marketing_update_request(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_save_access(text, text, text, uuid, boolean) from public, anon, authenticated;

grant execute on function public.marketing_start_session(text) to anon, authenticated;
grant execute on function public.marketing_end_session(text) to anon, authenticated;
grant execute on function public.marketing_get_dashboard(text) to anon, authenticated;
grant execute on function public.marketing_create_request(text, uuid, text, boolean, text, text, text[], text, timestamptz, text, boolean, text, boolean, text) to anon, authenticated;
grant execute on function public.marketing_update_request(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.marketing_save_access(text, text, text, uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
