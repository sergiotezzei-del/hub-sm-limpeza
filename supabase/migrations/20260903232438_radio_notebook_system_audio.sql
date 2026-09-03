alter table public.radio_player_commands
  drop constraint if exists radio_player_commands_command_check;

alter table public.radio_player_commands
  add constraint radio_player_commands_command_check
  check (command in ('pause','resume','next','previous','volume','mute','unmute','source_bluetooth','source_wifi'));

create table if not exists public.radio_notebook_audio_state (
  id text primary key default 'main' check (id = 'main'),
  active boolean not null default false,
  started_at timestamptz,
  started_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.radio_notebook_audio_state (id)
values ('main')
on conflict (id) do nothing;

alter table public.radio_notebook_audio_state enable row level security;

drop policy if exists radio_notebook_audio_state_admin_select on public.radio_notebook_audio_state;
create policy radio_notebook_audio_state_admin_select
  on public.radio_notebook_audio_state for select to authenticated
  using ((select public.is_hub_admin()));

grant select on public.radio_notebook_audio_state to authenticated;
revoke all on public.radio_notebook_audio_state from anon;

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

  perform public.radio_start_temporary_mode();

  insert into public.radio_player_commands (command, value)
  values ('source_bluetooth', null);

  update public.radio_notebook_audio_state
     set active = true,
         started_at = now(),
         started_by = auth.uid(),
         updated_at = now()
   where id = 'main'
   returning * into v_state;

  return v_state;
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
  v_notebook_active boolean := false;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_runtime
    from public.radio_runtime_state
   where id = 'main'
   for update;

  select coalesce(active, false) into v_notebook_active
    from public.radio_notebook_audio_state
   where id = 'main'
   for update;

  if coalesce(v_notebook_active, false) then
    insert into public.radio_player_commands (command, value)
    values ('source_wifi', null);

    update public.radio_notebook_audio_state
       set active = false,
           started_at = null,
           started_by = null,
           updated_at = now()
     where id = 'main';
  end if;

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

  perform public.radio_finish_temporary_mode();

  select * into v_state
    from public.radio_notebook_audio_state
   where id = 'main';

  return v_state;
end;
$$;

drop function if exists public.radio_play_notebook_file(uuid,text,text);

revoke all on function public.radio_start_notebook_audio() from public;
revoke all on function public.radio_stop_notebook_audio() from public;
grant execute on function public.radio_start_notebook_audio() to authenticated;
grant execute on function public.radio_stop_notebook_audio() to authenticated;
