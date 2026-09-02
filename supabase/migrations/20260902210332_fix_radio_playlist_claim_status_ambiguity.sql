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

revoke all on function public.radio_bridge_claim_playlist(text) from public;
grant execute on function public.radio_bridge_claim_playlist(text) to anon, authenticated;
