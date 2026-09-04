create or replace function public.radio_bridge_claim(p_token text)
returns setof public.radio_announcements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.radio_announcements%rowtype;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  if exists (
    select 1 from public.radio_notebook_audio_state s
     where s.id = 'main' and s.active
  ) then
    return;
  end if;

  select *
    into v_job
    from public.radio_announcements
   where scheduled_for <= now()
     and attempts < 3
     and (
       status = 'queued'
       or (status = 'claimed' and claimed_at < now() - interval '2 minutes')
     )
   order by scheduled_for asc, created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.radio_announcements
     set status = 'claimed',
         claimed_at = now(),
         completed_at = null,
         attempts = attempts + 1,
         last_error = null
   where id = v_job.id
   returning * into v_job;

  return next v_job;
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

  if exists (
    select 1 from public.radio_notebook_audio_state ns
     where ns.id = 'main' and ns.active
  ) then
    return;
  end if;

  select s.* into v_session
    from public.radio_playlist_sessions as s
   where s.attempts < 3
     and (
       s.status = 'queued'
       or (s.status = 'claimed' and s.claimed_at < now() - interval '45 seconds')
     )
   order by s.created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.radio_playlist_sessions as s
     set status = 'claimed',
         claimed_at = now(),
         attempts = s.attempts + 1,
         last_error = null
   where s.id = v_session.id
   returning s.* into v_session;

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
          from public.radio_playlist_tracks as t
         where t.session_id = v_session.id
      ),
      '[]'::jsonb
    );
end;
$$;
