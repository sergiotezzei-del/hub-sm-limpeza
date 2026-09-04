alter table public.radio_notebook_audio_state
  drop constraint if exists radio_notebook_audio_state_source_kind_check;

alter table public.radio_notebook_audio_state
  add constraint radio_notebook_audio_state_source_kind_check
  check (source_kind in ('system','spotify','edge','chrome','microphone'));

create or replace function public.radio_start_notebook_audio(p_source_kind text default 'system')
returns public.radio_notebook_audio_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.radio_notebook_audio_state%rowtype;
  v_runtime public.radio_runtime_state%rowtype;
  v_kind text := lower(trim(coalesce(p_source_kind,'system')));
  v_process text;
  v_label text;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'RADIO_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if v_kind not in ('system','spotify','edge','chrome','microphone') then
    raise exception 'RADIO_NOTEBOOK_SOURCE_INVALID' using errcode = '22023';
  end if;

  v_process := case v_kind
    when 'spotify' then 'Spotify.exe'
    when 'edge' then 'msedge.exe'
    when 'chrome' then 'chrome.exe'
    else null
  end;

  v_label := case v_kind
    when 'spotify' then 'Spotify'
    when 'edge' then 'YouTube / navegador - Microsoft Edge'
    when 'chrome' then 'YouTube / navegador - Google Chrome'
    when 'microphone' then 'Microfone do notebook'
    else 'Som inteiro do notebook'
  end;

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
         source_kind = v_kind,
         source_process_name = v_process,
         source_label = v_label,
         last_error = null,
         bridge_updated_at = null,
         updated_at = now()
   where id = 'main'
   returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.radio_start_notebook_audio(text) from public;
grant execute on function public.radio_start_notebook_audio(text) to authenticated;
