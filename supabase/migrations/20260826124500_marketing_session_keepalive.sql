create or replace function public.marketing_refresh_session(p_session_token text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  select r.session_id
    into v_session_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_session_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;

  v_expires_at := now() + interval '12 hours';

  update private.marketing_sessions
  set expires_at = v_expires_at
  where id = v_session_id
    and revoked_at is null;

  return v_expires_at;
end;
$$;

revoke all on function public.marketing_refresh_session(text) from public;
grant execute on function public.marketing_refresh_session(text) to anon, authenticated;
