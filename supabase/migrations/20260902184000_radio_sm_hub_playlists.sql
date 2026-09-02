insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'radio-playlists',
  'radio-playlists',
  false,
  26214400,
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists radio_playlists_admin_insert on storage.objects;
create policy radio_playlists_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'radio-playlists'
    and (select public.is_hub_admin())
  );

drop policy if exists radio_playlists_admin_select on storage.objects;
create policy radio_playlists_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'radio-playlists'
    and (select public.is_hub_admin())
  );

drop policy if exists radio_playlists_admin_delete on storage.objects;
create policy radio_playlists_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'radio-playlists'
    and (select public.is_hub_admin())
  );

create table if not exists public.radio_playlist_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  title text not null,
  status text not null default 'queued'
    check (status in ('queued','claimed','playing','stop_requested','completed','failed','cancelled')),
  claimed_at timestamptz,
  started_at timestamptz,
  stop_requested_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text
);

create index if not exists radio_playlist_sessions_queue_idx
  on public.radio_playlist_sessions (status, created_at);

create table if not exists public.radio_playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.radio_playlist_sessions(id) on delete cascade,
  position integer not null check (position between 1 and 100),
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (session_id, position),
  unique (storage_path)
);

create index if not exists radio_playlist_tracks_session_idx
  on public.radio_playlist_tracks (session_id, position);

alter table public.radio_playlist_sessions enable row level security;
alter table public.radio_playlist_tracks enable row level security;

drop policy if exists radio_playlist_sessions_admin_select on public.radio_playlist_sessions;
create policy radio_playlist_sessions_admin_select
  on public.radio_playlist_sessions for select to authenticated
  using ((select public.is_hub_admin()));

drop policy if exists radio_playlist_tracks_admin_select on public.radio_playlist_tracks;
create policy radio_playlist_tracks_admin_select
  on public.radio_playlist_tracks for select to authenticated
  using ((select public.is_hub_admin()));

grant select on public.radio_playlist_sessions to authenticated;
grant select on public.radio_playlist_tracks to authenticated;
revoke all on public.radio_playlist_sessions from anon;
revoke all on public.radio_playlist_tracks from anon;

create or replace function public.radio_create_playlist_session(
  p_id uuid,
  p_title text,
  p_tracks jsonb
)
returns public.radio_playlist_sessions
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_session public.radio_playlist_sessions%rowtype;
  v_track jsonb;
  v_count integer;
  v_position integer;
  v_file_name text;
  v_storage_path text;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'RADIO_PLAYLIST_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_title is null or not btrim(p_title) <> '' then
    raise exception 'RADIO_PLAYLIST_TITLE_REQUIRED' using errcode = '22023';
  end if;

  if jsonb_typeof(p_tracks) <> 'array' then
    raise exception 'RADIO_PLAYLIST_TRACKS_REQUIRED' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_tracks);
  if v_count < 1 or v_count > 30 then
    raise exception 'RADIO_PLAYLIST_TRACK_COUNT_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.radio_playlist_sessions
     where status in ('queued','claimed','playing','stop_requested')
  ) then
    raise exception 'RADIO_PLAYLIST_ALREADY_ACTIVE' using errcode = '55000';
  end if;

  perform public.radio_start_temporary_mode();

  insert into public.radio_playlist_sessions (id, created_by, title, status)
  values (p_id, auth.uid(), left(btrim(p_title), 120), 'queued')
  returning * into v_session;

  for v_track in select value from jsonb_array_elements(p_tracks)
  loop
    v_position := nullif(v_track->>'position', '')::integer;
    v_file_name := nullif(btrim(v_track->>'file_name'), '');
    v_storage_path := nullif(btrim(v_track->>'storage_path'), '');

    if v_position is null or v_position < 1 or v_position > 100 then
      raise exception 'RADIO_PLAYLIST_POSITION_INVALID' using errcode = '22023';
    end if;
    if v_file_name is null then
      raise exception 'RADIO_PLAYLIST_FILE_NAME_REQUIRED' using errcode = '22023';
    end if;
    if v_storage_path is null or v_storage_path not like p_id::text || '/%' then
      raise exception 'RADIO_PLAYLIST_STORAGE_PATH_INVALID' using errcode = '22023';
    end if;

    if not exists (
      select 1
        from storage.objects
       where bucket_id = 'radio-playlists'
         and name = v_storage_path
    ) then
      raise exception 'RADIO_PLAYLIST_FILE_NOT_FOUND' using errcode = '22023';
    end if;

    insert into public.radio_playlist_tracks (session_id, position, file_name, storage_path)
    values (p_id, v_position, left(v_file_name, 255), v_storage_path);
  end loop;

  return v_session;
end;
$$;

create or replace function public.radio_request_stop_playlist(p_id uuid)
returns public.radio_playlist_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.radio_playlist_sessions%rowtype;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.radio_playlist_sessions
     set status = case
           when status in ('queued','claimed','playing') then 'stop_requested'
           else status
         end,
         stop_requested_at = case
           when status in ('queued','claimed','playing') then now()
           else stop_requested_at
         end
   where id = p_id
   returning * into v_session;

  if not found then
    raise exception 'RADIO_PLAYLIST_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

create or replace function public.radio_bridge_claim_playlist(p_token text)
returns table (
  id uuid,
  title text,
  status text,
  tracks jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.radio_playlist_sessions%rowtype;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_session
    from public.radio_playlist_sessions
   where attempts < 3
     and (
       status = 'queued'
       or (status = 'claimed' and claimed_at < now() - interval '45 seconds')
     )
   order by created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.radio_playlist_sessions
     set status = 'claimed',
         claimed_at = now(),
         attempts = attempts + 1,
         last_error = null
   where radio_playlist_sessions.id = v_session.id
   returning * into v_session;

  return query
  select
    v_session.id,
    v_session.title,
    v_session.status,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'position', t.position,
            'file_name', t.file_name,
            'storage_path', t.storage_path
          )
          order by t.position
        )
          from public.radio_playlist_tracks t
         where t.session_id = v_session.id
      ),
      '[]'::jsonb
    );
end;
$$;

create or replace function public.radio_bridge_playlist_started(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
declare
  v_updated integer;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  update public.radio_playlist_sessions
     set status = 'playing', started_at = coalesce(started_at, now())
   where id = p_id and status in ('claimed','playing');

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.radio_bridge_playlist_should_stop(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
declare
  v_status text;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  select status into v_status
    from public.radio_playlist_sessions
   where id = p_id;

  return coalesce(v_status = 'stop_requested', true);
end;
$$;

create or replace function public.radio_bridge_playlist_track(
  p_token text,
  p_session_id uuid,
  p_track_id uuid
)
returns table (storage_path text, file_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  return query
  select t.storage_path, t.file_name
    from public.radio_playlist_tracks t
   where t.session_id = p_session_id
     and t.id = p_track_id;
end;
$$;

create or replace function public.radio_bridge_playlist_finish(
  p_token text,
  p_id uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
declare
  v_updated integer;
  v_runtime public.radio_runtime_state%rowtype;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  update public.radio_playlist_sessions
     set status = case when p_success then 'completed' else 'failed' end,
         completed_at = now(),
         last_error = case when p_success then null else left(coalesce(p_error, 'Falha sem detalhe'), 1000) end
   where id = p_id
     and status in ('claimed','playing','stop_requested')
   returning 1 into v_updated;

  if coalesce(v_updated, 0) <> 1 then
    return false;
  end if;

  select * into v_runtime
    from public.radio_runtime_state
   where id = 'main'
   for update;

  if v_runtime.operating_mode = 'temporary' then
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
     where id = 'main';
  end if;

  return true;
end;
$$;

revoke all on function public.radio_create_playlist_session(uuid,text,jsonb) from public;
revoke all on function public.radio_request_stop_playlist(uuid) from public;
revoke all on function public.radio_bridge_claim_playlist(text) from public;
revoke all on function public.radio_bridge_playlist_started(text,uuid) from public;
revoke all on function public.radio_bridge_playlist_should_stop(text,uuid) from public;
revoke all on function public.radio_bridge_playlist_track(text,uuid,uuid) from public;
revoke all on function public.radio_bridge_playlist_finish(text,uuid,boolean,text) from public;

grant execute on function public.radio_create_playlist_session(uuid,text,jsonb) to authenticated;
grant execute on function public.radio_request_stop_playlist(uuid) to authenticated;
grant execute on function public.radio_bridge_claim_playlist(text) to anon, authenticated;
grant execute on function public.radio_bridge_playlist_started(text,uuid) to anon, authenticated;
grant execute on function public.radio_bridge_playlist_should_stop(text,uuid) to anon, authenticated;
grant execute on function public.radio_bridge_playlist_track(text,uuid,uuid) to anon, authenticated;
grant execute on function public.radio_bridge_playlist_finish(text,uuid,boolean,text) to anon, authenticated;
