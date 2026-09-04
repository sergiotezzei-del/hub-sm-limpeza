alter table public.radio_player_commands
  drop constraint if exists radio_player_commands_command_check;

alter table public.radio_player_commands
  add constraint radio_player_commands_command_check
  check (command in ('pause','resume','next','previous','volume','mute','unmute'));

alter table public.radio_notebook_audio_state
  add column if not exists status text not null default 'idle',
  add column if not exists last_error text,
  add column if not exists bridge_updated_at timestamptz;

alter table public.radio_notebook_audio_state
  drop constraint if exists radio_notebook_audio_state_status_check;

alter table public.radio_notebook_audio_state
  add constraint radio_notebook_audio_state_status_check
  check (status in ('idle','requested','starting','streaming','stopping','error'));

update public.radio_notebook_audio_state
   set active = false,
       started_at = null,
       started_by = null,
       status = 'idle',
       last_error = null,
       bridge_updated_at = null,
       updated_at = now()
 where id = 'main';

create or replace function public.radio_start_notebook_audio()
returns public.radio_notebook_audio_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.radio_notebook_audio_state%rowtype;
  v_runtime public.radio_runtime_state%rowtype;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_state
    from public.radio_notebook_audio_state
   where id = 'main'
   for update;

  if v_state.active then
    return v_state;
  end if;

  if exists (
    select 1 from public.radio_playlist_sessions s
     where s.status in ('queued','claimed','playing','stop_requested')
  ) then
    raise exception 'RADIO_PLAYLIST_ALREADY_ACTIVE' using errcode = '55000';
  end if;

  select * into v_runtime
    from public.radio_runtime_state
   where id = 'main';

  if v_runtime.operating_mode <> 'automation' then
    raise exception 'RADIO_TEMPORARY_MODE_ALREADY_ACTIVE' using errcode = '55000';
  end if;

  update public.radio_notebook_audio_state
     set active = true,
         started_at = now(),
         started_by = auth.uid(),
         status = 'requested',
         last_error = null,
         bridge_updated_at = null,
         updated_at = now()
   where id = 'main'
   returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.radio_stop_notebook_audio()
returns public.radio_notebook_audio_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.radio_notebook_audio_state%rowtype;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.radio_notebook_audio_state
     set active = false,
         status = case when status in ('requested','starting','streaming') then 'stopping' else 'idle' end,
         started_by = null,
         updated_at = now()
   where id = 'main'
   returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.radio_bridge_get_notebook_audio(p_token text)
returns table (
  active boolean,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  return query
  select s.active, s.status
    from public.radio_notebook_audio_state s
   where s.id = 'main';
end;
$$;

create or replace function public.radio_bridge_set_notebook_audio_status(
  p_token text,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  if p_status not in ('idle','starting','streaming','stopping','error') then
    raise exception 'RADIO_NOTEBOOK_STATUS_INVALID' using errcode = '22023';
  end if;

  update public.radio_notebook_audio_state
     set status = p_status,
         active = case when p_status in ('idle','error') then false else active end,
         started_at = case when p_status in ('idle','error') then null else started_at end,
         started_by = case when p_status in ('idle','error') then null else started_by end,
         last_error = case when p_status = 'error' then left(coalesce(p_error,'Falha sem detalhe'),1000) else null end,
         bridge_updated_at = now(),
         updated_at = now()
   where id = 'main';

  return true;
end;
$$;

create or replace function public.radio_finish_temporary_mode()
returns public.radio_runtime_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.radio_runtime_state%rowtype;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_runtime
    from public.radio_runtime_state
   where id = 'main'
   for update;

  if v_runtime.operating_mode <> 'temporary' then
    return v_runtime;
  end if;

  if v_runtime.resume_on_exit then
    insert into public.radio_player_commands (command, value)
    values ('resume', null);
  end if;

  update public.radio_runtime_state
     set operating_mode = 'automation',
         temporary_started_at = null,
         temporary_started_by = null,
         resume_on_exit = false,
         updated_at = now()
   where id = 'main'
   returning * into v_runtime;

  return v_runtime;
end;
$$;

revoke all on function public.radio_bridge_get_notebook_audio(text) from public;
revoke all on function public.radio_bridge_set_notebook_audio_status(text,text,text) from public;
grant execute on function public.radio_bridge_get_notebook_audio(text) to anon, authenticated;
grant execute on function public.radio_bridge_set_notebook_audio_status(text,text,text) to anon, authenticated;
