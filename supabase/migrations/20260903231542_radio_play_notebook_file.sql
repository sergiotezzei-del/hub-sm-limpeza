create or replace function public.radio_play_notebook_file(
  p_id uuid,
  p_file_name text,
  p_storage_path text
)
returns public.radio_playlist_sessions
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_session public.radio_playlist_sessions%rowtype;
  v_name text;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'RADIO_NOTEBOOK_ID_REQUIRED' using errcode = '22023';
  end if;

  v_name := nullif(btrim(p_file_name), '');
  if v_name is null then
    raise exception 'RADIO_NOTEBOOK_FILE_NAME_REQUIRED' using errcode = '22023';
  end if;

  if p_storage_path is null
     or p_storage_path not like ('notebook/' || p_id::text || '/%') then
    raise exception 'RADIO_NOTEBOOK_STORAGE_PATH_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'radio-playlists'
       and o.name = p_storage_path
  ) then
    raise exception 'RADIO_NOTEBOOK_FILE_NOT_FOUND' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.radio_playlist_sessions s
     where s.status in ('queued','claimed','playing','stop_requested')
  ) then
    raise exception 'RADIO_PLAYLIST_ALREADY_ACTIVE' using errcode = '55000';
  end if;

  perform public.radio_start_temporary_mode();

  insert into public.radio_playlist_sessions (
    id, created_by, title, status, source_type, source_id, triggered_by
  )
  values (
    p_id,
    auth.uid(),
    left('Notebook · ' || v_name, 120),
    'queued',
    'temporary',
    null,
    'manual'
  )
  returning * into v_session;

  insert into public.radio_playlist_tracks (
    session_id, position, file_name, storage_path, cleanup_after_play
  )
  values (
    p_id,
    1,
    left(v_name, 255),
    p_storage_path,
    true
  );

  return v_session;
end;
$$;

revoke all on function public.radio_play_notebook_file(uuid,text,text) from public;
grant execute on function public.radio_play_notebook_file(uuid,text,text) to authenticated;
