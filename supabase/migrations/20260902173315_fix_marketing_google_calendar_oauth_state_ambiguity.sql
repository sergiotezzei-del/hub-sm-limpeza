create or replace function public.marketing_google_calendar_create_oauth_state(
  p_session_token text,
  p_state_hash text,
  p_expires_at timestamptz
)
returns table (client_id text, managed_user_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_client_id text;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_user_id not in ('arthur', 'maria') or v_role <> 'marketing' then
    raise exception 'MARKETING_GOOGLE_CONNECT_DENIED';
  end if;
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'MARKETING_GOOGLE_STATE_INVALID';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    raise exception 'MARKETING_GOOGLE_STATE_EXPIRY_INVALID';
  end if;

  select ds.decrypted_secret
    into v_client_id
  from public.google_calendar_connections c
  join vault.decrypted_secrets ds on ds.id = c.client_id_secret_id
  where c.client_id_secret_id is not null
  order by c.updated_at desc
  limit 1;

  if nullif(btrim(coalesce(v_client_id, '')), '') is null then
    raise exception 'MARKETING_GOOGLE_NOT_CONFIGURED';
  end if;

  delete from private.marketing_google_calendar_oauth_states s
  where s.expires_at <= now() or s.managed_user_id = v_user_id;

  insert into private.marketing_google_calendar_oauth_states(state_hash, managed_user_id, expires_at)
  values (p_state_hash, v_user_id, p_expires_at);

  return query select v_client_id, v_user_id;
end;
$$;

revoke all on function public.marketing_google_calendar_create_oauth_state(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_google_calendar_create_oauth_state(text, text, timestamptz) to anon, authenticated;
