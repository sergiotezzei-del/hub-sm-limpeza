create table public.google_calendar_connections (
  auth_user_id uuid primary key,
  google_email text,
  calendar_id text not null default 'primary' check (btrim(calendar_id) <> ''),
  client_id_secret_id uuid,
  client_secret_secret_id uuid,
  refresh_token_secret_id uuid,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.google_calendar_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  auth_user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index google_calendar_oauth_states_expiry_idx
  on public.google_calendar_oauth_states(expires_at);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth_states enable row level security;

grant select, insert, update, delete on public.google_calendar_connections to authenticated;
grant select, insert, update, delete on public.google_calendar_oauth_states to authenticated;
revoke all on public.google_calendar_connections from anon;
revoke all on public.google_calendar_oauth_states from anon;

create policy google_calendar_connections_admin_select
  on public.google_calendar_connections for select to authenticated
  using ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));
create policy google_calendar_connections_admin_insert
  on public.google_calendar_connections for insert to authenticated
  with check ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));
create policy google_calendar_connections_admin_update
  on public.google_calendar_connections for update to authenticated
  using ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()))
  with check ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));
create policy google_calendar_connections_admin_delete
  on public.google_calendar_connections for delete to authenticated
  using ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));

create policy google_calendar_oauth_states_admin_select
  on public.google_calendar_oauth_states for select to authenticated
  using ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));
create policy google_calendar_oauth_states_admin_insert
  on public.google_calendar_oauth_states for insert to authenticated
  with check ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));
create policy google_calendar_oauth_states_admin_delete
  on public.google_calendar_oauth_states for delete to authenticated
  using ((select auth.uid()) = auth_user_id and (select public.is_hub_admin()));

create or replace function public.save_google_calendar_oauth_config(
  p_client_id text,
  p_client_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_client_id_secret uuid;
  v_client_secret_secret uuid;
begin
  if v_user is null or not public.is_hub_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if btrim(coalesce(p_client_id, '')) = '' or btrim(coalesce(p_client_secret, '')) = '' then
    raise exception 'Client ID e Client Secret são obrigatórios.';
  end if;

  insert into public.google_calendar_connections(auth_user_id)
  values (v_user)
  on conflict (auth_user_id) do nothing;

  select client_id_secret_id, client_secret_secret_id
    into v_client_id_secret, v_client_secret_secret
  from public.google_calendar_connections
  where auth_user_id = v_user;

  if v_client_id_secret is null then
    v_client_id_secret := vault.create_secret(
      btrim(p_client_id),
      'hub_google_calendar_client_id_' || v_user::text,
      'Google Calendar OAuth Client ID do HUB SM'
    );
  else
    perform vault.update_secret(v_client_id_secret, btrim(p_client_id));
  end if;

  if v_client_secret_secret is null then
    v_client_secret_secret := vault.create_secret(
      btrim(p_client_secret),
      'hub_google_calendar_client_secret_' || v_user::text,
      'Google Calendar OAuth Client Secret do HUB SM'
    );
  else
    perform vault.update_secret(v_client_secret_secret, btrim(p_client_secret));
  end if;

  update public.google_calendar_connections
  set client_id_secret_id = v_client_id_secret,
      client_secret_secret_id = v_client_secret_secret,
      updated_at = now()
  where auth_user_id = v_user;
end;
$$;

create or replace function public.get_google_calendar_server_credentials()
returns table (
  client_id text,
  client_secret text,
  refresh_token text,
  google_email text,
  calendar_id text,
  connected boolean
)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_hub_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
  select
    cid.decrypted_secret,
    csecret.decrypted_secret,
    rtoken.decrypted_secret,
    c.google_email,
    c.calendar_id,
    (c.connected_at is not null and c.refresh_token_secret_id is not null) as connected
  from public.google_calendar_connections c
  left join vault.decrypted_secrets cid on cid.id = c.client_id_secret_id
  left join vault.decrypted_secrets csecret on csecret.id = c.client_secret_secret_id
  left join vault.decrypted_secrets rtoken on rtoken.id = c.refresh_token_secret_id
  where c.auth_user_id = v_user;
end;
$$;

create or replace function public.save_google_calendar_connection(
  p_refresh_token text,
  p_google_email text default null,
  p_calendar_id text default 'primary'
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_refresh_secret uuid;
begin
  if v_user is null or not public.is_hub_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  insert into public.google_calendar_connections(auth_user_id)
  values (v_user)
  on conflict (auth_user_id) do nothing;

  select refresh_token_secret_id
    into v_refresh_secret
  from public.google_calendar_connections
  where auth_user_id = v_user;

  if btrim(coalesce(p_refresh_token, '')) <> '' then
    if v_refresh_secret is null then
      v_refresh_secret := vault.create_secret(
        btrim(p_refresh_token),
        'hub_google_calendar_refresh_token_' || v_user::text,
        'Google Calendar OAuth Refresh Token do HUB SM'
      );
    else
      perform vault.update_secret(v_refresh_secret, btrim(p_refresh_token));
    end if;
  elsif v_refresh_secret is null then
    raise exception 'Refresh token não recebido pelo Google.';
  end if;

  update public.google_calendar_connections
  set refresh_token_secret_id = v_refresh_secret,
      google_email = nullif(btrim(coalesce(p_google_email, '')), ''),
      calendar_id = coalesce(nullif(btrim(coalesce(p_calendar_id, '')), ''), 'primary'),
      connected_at = now(),
      updated_at = now()
  where auth_user_id = v_user;
end;
$$;

create or replace function public.disconnect_google_calendar()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_refresh_secret uuid;
begin
  if v_user is null or not public.is_hub_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  select refresh_token_secret_id
    into v_refresh_secret
  from public.google_calendar_connections
  where auth_user_id = v_user;

  if v_refresh_secret is not null then
    delete from vault.secrets where id = v_refresh_secret;
  end if;

  update public.google_calendar_connections
  set refresh_token_secret_id = null,
      google_email = null,
      connected_at = null,
      updated_at = now()
  where auth_user_id = v_user;
end;
$$;

revoke all on function public.save_google_calendar_oauth_config(text, text) from public, anon;
revoke all on function public.get_google_calendar_server_credentials() from public, anon;
revoke all on function public.save_google_calendar_connection(text, text, text) from public, anon;
revoke all on function public.disconnect_google_calendar() from public, anon;

grant execute on function public.save_google_calendar_oauth_config(text, text) to authenticated;
grant execute on function public.get_google_calendar_server_credentials() to authenticated;
grant execute on function public.save_google_calendar_connection(text, text, text) to authenticated;
grant execute on function public.disconnect_google_calendar() to authenticated;
