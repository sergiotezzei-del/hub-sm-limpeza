create table if not exists public.radio_runtime_state (
  id text primary key default 'main' check (id = 'main'),
  operating_mode text not null default 'automation' check (operating_mode in ('automation','temporary')),
  temporary_started_at timestamptz,
  temporary_started_by uuid,
  resume_on_exit boolean not null default false,
  saved_player_status text,
  saved_title text,
  saved_artist text,
  saved_album text,
  saved_mode integer,
  saved_current_ms bigint,
  saved_total_ms bigint,
  updated_at timestamptz not null default now()
);

insert into public.radio_runtime_state (id)
values ('main')
on conflict (id) do nothing;

alter table public.radio_runtime_state enable row level security;

drop policy if exists radio_runtime_state_admin_select on public.radio_runtime_state;
create policy radio_runtime_state_admin_select
  on public.radio_runtime_state for select to authenticated
  using ((select public.is_hub_admin()));

grant select on public.radio_runtime_state to authenticated;
revoke all on public.radio_runtime_state from anon;

create or replace function public.radio_start_temporary_mode()
returns public.radio_runtime_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.radio_runtime_state%rowtype;
  v_player public.radio_player_state%rowtype;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_runtime
    from public.radio_runtime_state
   where id = 'main'
   for update;

  if v_runtime.operating_mode = 'temporary' then
    return v_runtime;
  end if;

  select * into v_player
    from public.radio_player_state
   where id = 'main';

  update public.radio_runtime_state
     set operating_mode = 'temporary',
         temporary_started_at = now(),
         temporary_started_by = auth.uid(),
         resume_on_exit = coalesce(v_player.player_status = 'play', false),
         saved_player_status = v_player.player_status,
         saved_title = v_player.title,
         saved_artist = v_player.artist,
         saved_album = v_player.album,
         saved_mode = v_player.mode,
         saved_current_ms = v_player.current_ms,
         saved_total_ms = v_player.total_ms,
         updated_at = now()
   where id = 'main'
   returning * into v_runtime;

  if v_runtime.resume_on_exit then
    insert into public.radio_player_commands (command, value)
    values ('pause', null);
  end if;

  return v_runtime;
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

revoke all on function public.radio_start_temporary_mode() from public;
revoke all on function public.radio_finish_temporary_mode() from public;
grant execute on function public.radio_start_temporary_mode() to authenticated;
grant execute on function public.radio_finish_temporary_mode() to authenticated;
