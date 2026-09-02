create table if not exists private.marketing_google_calendar_connections (
  managed_user_id text primary key references public.managed_users(id) on update cascade on delete cascade,
  refresh_token_secret_id uuid,
  google_email text,
  calendar_id text not null default 'primary' check (btrim(calendar_id) <> ''),
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  check (managed_user_id in ('arthur', 'maria'))
);

create table if not exists private.marketing_google_calendar_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  managed_user_id text not null references public.managed_users(id) on update cascade on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (managed_user_id in ('arthur', 'maria'))
);

create index if not exists marketing_google_calendar_oauth_states_expiry_idx
  on private.marketing_google_calendar_oauth_states(expires_at);

create table if not exists private.marketing_google_calendar_sync_queue (
  request_id uuid primary key references public.marketing_requests(id) on delete cascade,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text
);

create index if not exists marketing_google_calendar_sync_queue_queued_idx
  on private.marketing_google_calendar_sync_queue(queued_at);

alter table private.marketing_google_calendar_connections enable row level security;
alter table private.marketing_google_calendar_oauth_states enable row level security;
alter table private.marketing_google_calendar_sync_queue enable row level security;
revoke all on private.marketing_google_calendar_connections from public, anon, authenticated;
revoke all on private.marketing_google_calendar_oauth_states from public, anon, authenticated;
revoke all on private.marketing_google_calendar_sync_queue from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'hub_marketing_google_calendar_sync_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'hub_marketing_google_calendar_sync_secret',
      'Segredo interno para sincronizar a agenda do Marketing com Google Calendar'
    );
  end if;
end;
$$;

create or replace function private.marketing_google_calendar_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'hub_marketing_google_calendar_sync_secret'
      and nullif(btrim(p_secret), '') is not null
      and s.decrypted_secret = btrim(p_secret)
  );
$$;

revoke all on function private.marketing_google_calendar_secret_matches(text) from public, anon, authenticated;

create or replace function public.marketing_google_calendar_get_status(p_session_token text)
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
  v_configured boolean := false;
  v_users jsonb := '[]'::jsonb;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;

  select exists (
    select 1
    from public.google_calendar_connections c
    where c.client_id_secret_id is not null
  ) into v_configured;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', u.id,
    'userName', u.name,
    'connected', (c.connected_at is not null and c.refresh_token_secret_id is not null),
    'googleEmail', coalesce(c.google_email, ''),
    'calendarId', coalesce(c.calendar_id, 'primary'),
    'connectedAt', c.connected_at,
    'lastSyncedAt', c.last_synced_at,
    'lastError', c.last_error
  ) order by case u.id when 'maria' then 1 when 'arthur' then 2 else 3 end), '[]'::jsonb)
  into v_users
  from public.managed_users u
  left join private.marketing_google_calendar_connections c on c.managed_user_id = u.id
  where u.id in ('arthur', 'maria')
    and u.active is true
    and (
      v_user_id = 'tezzei'
      or v_role = 'admin'
      or u.id = v_user_id
    );

  return jsonb_build_object(
    'configured', v_configured,
    'canConnect', v_user_id in ('arthur', 'maria') and v_role = 'marketing',
    'currentUserId', v_user_id,
    'currentUserName', v_user_name,
    'users', v_users
  );
end;
$$;

create or replace function public.marketing_google_calendar_create_oauth_state(
  p_session_token text,
  p_state_hash text,
  p_expires_at timestamptz
)
returns table (client_id text, managed_user_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_client_id text;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_user_id not in ('arthur', 'maria') or v_role <> 'marketing' then
    raise exception 'MARKETING_GOOGLE_CONNECT_DENIED';
  end if;
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'MARKETING_GOOGLE_STATE_INVALID';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    raise exception 'MARKETING_GOOGLE_STATE_EXPIRY_INVALID';
  end if;

  select ds.decrypted_secret
    into v_client_id
  from public.google_calendar_connections c
  join vault.decrypted_secrets ds on ds.id = c.client_id_secret_id
  where c.client_id_secret_id is not null
  order by c.updated_at desc
  limit 1;

  if nullif(btrim(coalesce(v_client_id, '')), '') is null then
    raise exception 'MARKETING_GOOGLE_NOT_CONFIGURED';
  end if;

  delete from private.marketing_google_calendar_oauth_states
  where expires_at <= now() or managed_user_id = v_user_id;

  insert into private.marketing_google_calendar_oauth_states(state_hash, managed_user_id, expires_at)
  values (p_state_hash, v_user_id, p_expires_at);

  return query select v_client_id, v_user_id;
end;
$$;

create or replace function public.marketing_google_calendar_oauth_state_context(
  p_session_token text,
  p_state_hash text
)
returns table (client_id text, managed_user_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_client_id text;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_user_id not in ('arthur', 'maria') or v_role <> 'marketing' then
    raise exception 'MARKETING_GOOGLE_CONNECT_DENIED';
  end if;

  if not exists (
    select 1
    from private.marketing_google_calendar_oauth_states s
    where s.state_hash = p_state_hash
      and s.managed_user_id = v_user_id
      and s.expires_at > now()
  ) then
    raise exception 'MARKETING_GOOGLE_STATE_INVALID';
  end if;

  select ds.decrypted_secret
    into v_client_id
  from public.google_calendar_connections c
  join vault.decrypted_secrets ds on ds.id = c.client_id_secret_id
  where c.client_id_secret_id is not null
  order by c.updated_at desc
  limit 1;

  if nullif(btrim(coalesce(v_client_id, '')), '') is null then
    raise exception 'MARKETING_GOOGLE_NOT_CONFIGURED';
  end if;

  return query select v_client_id, v_user_id;
end;
$$;

create or replace function private.marketing_google_calendar_sync_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from private.marketing_google_calendar_sync_queue) then
    return;
  end if;

  select s.decrypted_secret
    into v_secret
  from vault.decrypted_secrets s
  where s.name = 'hub_marketing_google_calendar_sync_secret'
  limit 1;

  if nullif(btrim(coalesce(v_secret, '')), '') is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://hubsantamariatem.vercel.app/api/marketing-google-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hub-marketing-calendar-secret', v_secret
    ),
    body := jsonb_build_object('action', 'sync')
  );
end;
$$;

revoke all on function private.marketing_google_calendar_sync_dispatch() from public, anon, authenticated;

create or replace function public.marketing_google_calendar_save_connection(
  p_session_token text,
  p_state_hash text,
  p_refresh_token text,
  p_google_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_refresh_secret uuid;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_user_id not in ('arthur', 'maria') or v_role <> 'marketing' then
    raise exception 'MARKETING_GOOGLE_CONNECT_DENIED';
  end if;
  if nullif(btrim(coalesce(p_refresh_token, '')), '') is null then
    raise exception 'MARKETING_GOOGLE_REFRESH_TOKEN_REQUIRED';
  end if;

  if not exists (
    select 1
    from private.marketing_google_calendar_oauth_states s
    where s.state_hash = p_state_hash
      and s.managed_user_id = v_user_id
      and s.expires_at > now()
  ) then
    raise exception 'MARKETING_GOOGLE_STATE_INVALID';
  end if;

  select c.refresh_token_secret_id
    into v_refresh_secret
  from private.marketing_google_calendar_connections c
  where c.managed_user_id = v_user_id;

  if v_refresh_secret is null then
    v_refresh_secret := vault.create_secret(
      btrim(p_refresh_token),
      'hub_marketing_google_refresh_' || v_user_id,
      'Google Calendar refresh token do Marketing - ' || v_user_id
    );
  else
    perform vault.update_secret(v_refresh_secret, btrim(p_refresh_token));
  end if;

  insert into private.marketing_google_calendar_connections(
    managed_user_id, refresh_token_secret_id, google_email, calendar_id,
    connected_at, last_error, updated_at
  ) values (
    v_user_id, v_refresh_secret, nullif(btrim(coalesce(p_google_email, '')), ''), 'primary',
    now(), null, now()
  )
  on conflict (managed_user_id) do update
  set refresh_token_secret_id = excluded.refresh_token_secret_id,
      google_email = excluded.google_email,
      calendar_id = 'primary',
      connected_at = now(),
      last_error = null,
      updated_at = now();

  delete from private.marketing_google_calendar_oauth_states
  where state_hash = p_state_hash and managed_user_id = v_user_id;

  insert into private.marketing_google_calendar_sync_queue(request_id, queued_at, attempts, last_error)
  select q.id, now(), 0, null
  from public.marketing_requests q
  where q.request_kind = 'capture_edit'
    and q.confirmed_capture_at is not null
    and q.confirmed_capture_at >= now() - interval '1 day'
  on conflict (request_id) do update
  set queued_at = now(), attempts = 0, last_error = null;

  perform private.marketing_google_calendar_sync_dispatch();
end;
$$;

create or replace function public.marketing_google_calendar_disconnect(p_session_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_refresh_secret uuid;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_user_id not in ('arthur', 'maria') or v_role <> 'marketing' then
    raise exception 'MARKETING_GOOGLE_CONNECT_DENIED';
  end if;

  select c.refresh_token_secret_id
    into v_refresh_secret
  from private.marketing_google_calendar_connections c
  where c.managed_user_id = v_user_id;

  if v_refresh_secret is not null then
    delete from vault.secrets where id = v_refresh_secret;
  end if;

  update private.marketing_google_calendar_connections
  set refresh_token_secret_id = null,
      google_email = null,
      connected_at = null,
      last_synced_at = null,
      last_error = null,
      updated_at = now()
  where managed_user_id = v_user_id;
end;
$$;

create or replace function public.marketing_google_calendar_server_batch(
  p_secret text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id text;
  v_queue_ids jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_connections jsonb := '[]'::jsonb;
begin
  if not private.marketing_google_calendar_secret_matches(p_secret) then
    raise exception 'MARKETING_GOOGLE_SERVER_DENIED';
  end if;

  select ds.decrypted_secret
    into v_client_id
  from public.google_calendar_connections c
  join vault.decrypted_secrets ds on ds.id = c.client_id_secret_id
  where c.client_id_secret_id is not null
  order by c.updated_at desc
  limit 1;

  with queued as (
    select q.request_id
    from private.marketing_google_calendar_sync_queue q
    order by q.queued_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), queued_groups as (
    select distinct r.capture_group_id
    from public.marketing_requests r
    join queued q on q.request_id = r.id
    where r.capture_group_id is not null
  ), relevant as (
    select r.*
    from public.marketing_requests r
    where r.id in (select request_id from queued)
       or (r.capture_group_id is not null and r.capture_group_id in (select capture_group_id from queued_groups))
  )
  select
    coalesce((select jsonb_agg(q.request_id) from queued q), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'requestNumber', r.request_number,
      'requestKind', r.request_kind,
      'status', r.status,
      'brokerName', r.broker_name,
      'managerName', r.manager_name,
      'propertyReference', r.property_reference,
      'captureLocation', r.capture_location,
      'confirmedCaptureAt', r.confirmed_capture_at,
      'assignedMarketingName', r.assigned_marketing_name,
      'captureGroupId', r.capture_group_id,
      'contentTypes', r.content_types,
      'deletedAt', r.deleted_at
    ) order by r.request_number) from relevant r), '[]'::jsonb)
  into v_queue_ids, v_requests;

  select coalesce(jsonb_agg(jsonb_build_object(
    'managedUserId', c.managed_user_id,
    'googleEmail', coalesce(c.google_email, ''),
    'calendarId', coalesce(c.calendar_id, 'primary'),
    'refreshToken', rt.decrypted_secret
  ) order by c.managed_user_id), '[]'::jsonb)
  into v_connections
  from private.marketing_google_calendar_connections c
  join vault.decrypted_secrets rt on rt.id = c.refresh_token_secret_id
  where c.connected_at is not null
    and c.refresh_token_secret_id is not null;

  return jsonb_build_object(
    'clientId', coalesce(v_client_id, ''),
    'queueRequestIds', v_queue_ids,
    'requests', v_requests,
    'connections', v_connections
  );
end;
$$;

create or replace function public.marketing_google_calendar_server_mark_request(
  p_secret text,
  p_request_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.marketing_google_calendar_secret_matches(p_secret) then
    raise exception 'MARKETING_GOOGLE_SERVER_DENIED';
  end if;

  if coalesce(p_success, false) then
    delete from private.marketing_google_calendar_sync_queue where request_id = p_request_id;
  else
    update private.marketing_google_calendar_sync_queue
    set attempts = attempts + 1,
        last_error = left(coalesce(p_error, 'Falha ao sincronizar Google Agenda'), 1000),
        queued_at = now()
    where request_id = p_request_id;
  end if;
end;
$$;

create or replace function public.marketing_google_calendar_server_record_connection(
  p_secret text,
  p_managed_user_id text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.marketing_google_calendar_secret_matches(p_secret) then
    raise exception 'MARKETING_GOOGLE_SERVER_DENIED';
  end if;

  update private.marketing_google_calendar_connections
  set last_synced_at = case when nullif(btrim(coalesce(p_error, '')), '') is null then now() else last_synced_at end,
      last_error = nullif(left(btrim(coalesce(p_error, '')), 1000), ''),
      updated_at = now()
  where managed_user_id = p_managed_user_id;
end;
$$;

create or replace function private.marketing_google_calendar_queue_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.marketing_google_calendar_sync_queue(request_id, queued_at, attempts, last_error)
  values (new.id, now(), 0, null)
  on conflict (request_id) do update
  set queued_at = now(), attempts = 0, last_error = null;

  perform private.marketing_google_calendar_sync_dispatch();
  return new;
end;
$$;

revoke all on function private.marketing_google_calendar_queue_request() from public, anon, authenticated;

drop trigger if exists marketing_google_calendar_queue_request on public.marketing_requests;
create trigger marketing_google_calendar_queue_request
after insert or update of confirmed_capture_at, assigned_marketing_name, status, capture_location, broker_name, manager_name, property_reference, capture_group_id, deleted_at
on public.marketing_requests
for each row execute function private.marketing_google_calendar_queue_request();

revoke all on function public.marketing_google_calendar_get_status(text) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_create_oauth_state(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_oauth_state_context(text, text) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_save_connection(text, text, text, text) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_disconnect(text) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_server_batch(text, integer) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_server_mark_request(text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.marketing_google_calendar_server_record_connection(text, text, text) from public, anon, authenticated;

grant execute on function public.marketing_google_calendar_get_status(text) to anon, authenticated;
grant execute on function public.marketing_google_calendar_create_oauth_state(text, text, timestamptz) to anon, authenticated;
grant execute on function public.marketing_google_calendar_oauth_state_context(text, text) to anon, authenticated;
grant execute on function public.marketing_google_calendar_save_connection(text, text, text, text) to anon, authenticated;
grant execute on function public.marketing_google_calendar_disconnect(text) to anon, authenticated;
grant execute on function public.marketing_google_calendar_server_batch(text, integer) to anon;
grant execute on function public.marketing_google_calendar_server_mark_request(text, uuid, boolean, text) to anon;
grant execute on function public.marketing_google_calendar_server_record_connection(text, text, text) to anon;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'marketing-google-calendar-sync' loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'marketing-google-calendar-sync',
  '*/5 * * * *',
  'select private.marketing_google_calendar_sync_dispatch();'
);
