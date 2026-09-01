create table if not exists public.radio_player_state (
  id text primary key default 'main' check (id = 'main'),
  device_name text,
  title text,
  artist text,
  album text,
  player_status text,
  volume integer check (volume between 0 and 100),
  mute boolean not null default false,
  mode integer,
  current_ms bigint,
  total_ms bigint,
  updated_at timestamptz not null default now(),
  last_error text
);

insert into public.radio_player_state (id) values ('main') on conflict (id) do nothing;

alter table public.radio_player_state enable row level security;

drop policy if exists radio_player_state_admin_select on public.radio_player_state;
create policy radio_player_state_admin_select
  on public.radio_player_state for select to authenticated
  using ((select public.is_hub_admin()));

grant select on public.radio_player_state to authenticated;
revoke all on public.radio_player_state from anon;

create table if not exists public.radio_player_commands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  command text not null check (command in ('pause','resume','next','previous','volume','mute','unmute')),
  value integer,
  status text not null default 'queued' check (status in ('queued','claimed','completed','failed','cancelled')),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text,
  constraint radio_player_commands_value_check check (
    (command = 'volume' and value between 0 and 100)
    or (command <> 'volume' and value is null)
  )
);

create index if not exists radio_player_commands_queue_idx
  on public.radio_player_commands (status, created_at);

alter table public.radio_player_commands enable row level security;

drop policy if exists radio_player_commands_admin_select on public.radio_player_commands;
create policy radio_player_commands_admin_select
  on public.radio_player_commands for select to authenticated
  using ((select public.is_hub_admin()));

drop policy if exists radio_player_commands_admin_insert on public.radio_player_commands;
create policy radio_player_commands_admin_insert
  on public.radio_player_commands for insert to authenticated
  with check ((select public.is_hub_admin()));

drop policy if exists radio_player_commands_admin_update on public.radio_player_commands;
create policy radio_player_commands_admin_update
  on public.radio_player_commands for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));

grant select, insert, update on public.radio_player_commands to authenticated;
revoke all on public.radio_player_commands from anon;

create or replace function public.radio_bridge_set_player_state(
  p_token text,
  p_device_name text,
  p_title text,
  p_artist text,
  p_album text,
  p_player_status text,
  p_volume integer,
  p_mute boolean,
  p_mode integer,
  p_current_ms bigint,
  p_total_ms bigint,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  insert into public.radio_player_state (
    id, device_name, title, artist, album, player_status, volume, mute, mode,
    current_ms, total_ms, updated_at, last_error
  ) values (
    'main', nullif(p_device_name, ''), nullif(p_title, ''), nullif(p_artist, ''), nullif(p_album, ''),
    nullif(p_player_status, ''), greatest(0, least(100, coalesce(p_volume, 0))), coalesce(p_mute, false), p_mode,
    p_current_ms, p_total_ms, now(), nullif(left(coalesce(p_error, ''), 1000), '')
  )
  on conflict (id) do update set
    device_name = excluded.device_name,
    title = excluded.title,
    artist = excluded.artist,
    album = excluded.album,
    player_status = excluded.player_status,
    volume = excluded.volume,
    mute = excluded.mute,
    mode = excluded.mode,
    current_ms = excluded.current_ms,
    total_ms = excluded.total_ms,
    updated_at = excluded.updated_at,
    last_error = excluded.last_error;

  return true;
end;
$$;

create or replace function public.radio_bridge_claim_command(p_token text)
returns setof public.radio_player_commands
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_command public.radio_player_commands%rowtype;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_command
    from public.radio_player_commands
   where attempts < 3
     and (
       status = 'queued'
       or (status = 'claimed' and claimed_at < now() - interval '30 seconds')
     )
   order by created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.radio_player_commands
     set status = 'claimed', claimed_at = now(), completed_at = null,
         attempts = attempts + 1, last_error = null
   where id = v_command.id
   returning * into v_command;

  return next v_command;
end;
$$;

create or replace function public.radio_bridge_finish_command(
  p_token text,
  p_id uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  update public.radio_player_commands
     set status = case when p_success then 'completed' else 'failed' end,
         completed_at = now(),
         last_error = case when p_success then null else left(coalesce(p_error, 'Falha sem detalhe'), 1000) end
   where id = p_id and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.radio_bridge_set_player_state(text,text,text,text,text,text,integer,boolean,integer,bigint,bigint,text) from public;
revoke all on function public.radio_bridge_claim_command(text) from public;
revoke all on function public.radio_bridge_finish_command(text,uuid,boolean,text) from public;
grant execute on function public.radio_bridge_set_player_state(text,text,text,text,text,text,integer,boolean,integer,bigint,bigint,text) to anon, authenticated;
grant execute on function public.radio_bridge_claim_command(text) to anon, authenticated;
grant execute on function public.radio_bridge_finish_command(text,uuid,boolean,text) to anon, authenticated;
