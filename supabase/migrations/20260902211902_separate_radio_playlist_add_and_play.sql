alter table public.radio_playlist_sessions
  drop constraint if exists radio_playlist_sessions_status_check;

alter table public.radio_playlist_sessions
  add constraint radio_playlist_sessions_status_check
  check (status in ('draft','queued','claimed','playing','stop_requested','completed','failed','cancelled'));

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
      from public.radio_playlist_sessions s
     where s.status in ('draft','queued','claimed','playing','stop_requested')
  ) then
    raise exception 'RADIO_PLAYLIST_ALREADY_ACTIVE' using errcode = '55000';
  end if;

  insert into public.radio_playlist_sessions (id, created_by, title, status)
  values (p_id, auth.uid(), left(btrim(p_title), 120), 'draft')
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
        from storage.objects o
       where o.bucket_id = 'radio-playlists'
         and o.name = v_storage_path
    ) then
      raise exception 'RADIO_PLAYLIST_FILE_NOT_FOUND' using errcode = '22023';
    end if;

    insert into public.radio_playlist_tracks (session_id, position, file_name, storage_path)
    values (p_id, v_position, left(v_file_name, 255), v_storage_path);
  end loop;

  return v_session;
end;
$$;

create or replace function public.radio_start_playlist(p_id uuid)
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

  select * into v_session
    from public.radio_playlist_sessions s
   where s.id = p_id
   for update;

  if not found then
    raise exception 'RADIO_PLAYLIST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.status in ('queued','claimed','playing','stop_requested') then
    return v_session;
  end if;

  if v_session.status <> 'draft' then
    raise exception 'RADIO_PLAYLIST_NOT_READY' using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.radio_playlist_sessions s
     where s.id <> p_id
       and s.status in ('queued','claimed','playing','stop_requested')
  ) then
    raise exception 'RADIO_PLAYLIST_ALREADY_ACTIVE' using errcode = '55000';
  end if;

  perform public.radio_start_temporary_mode();

  update public.radio_playlist_sessions s
     set status = 'queued',
         claimed_at = null,
         started_at = null,
         stop_requested_at = null,
         completed_at = null,
         attempts = 0,
         last_error = null
   where s.id = p_id
   returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.radio_start_playlist(uuid) from public;
grant execute on function public.radio_start_playlist(uuid) to authenticated;
