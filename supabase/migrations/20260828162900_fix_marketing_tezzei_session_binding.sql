-- Mantem a validacao forte no inicio da sessao do admin Tezzei,
-- mas deixa a sessao interna do Marketing independente do JWT nas chamadas seguintes.
-- Isso evita MARKETING_SESSION_EXPIRED quando o frontend usa o token interno do Marketing.

CREATE OR REPLACE FUNCTION public.marketing_start_session(p_access_code text)
RETURNS TABLE(session_token text, user_id text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_user_id text;
  v_token text;
  v_expires_at timestamptz := now() + interval '12 hours';
  v_auth_user_id uuid := auth.uid();
  v_is_hub_admin boolean := coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
    or coalesce((auth.jwt() -> 'app_metadata' -> 'permissions') ? 'painel-admin', false);
begin
  select u.id into v_user_id
  from public.managed_users u
  join public.marketing_access a on a.managed_user_id = u.id and a.active is true
  where u.active is true
    and nullif(btrim(p_access_code), '') is not null
    and u.access_code_hash = extensions.crypt(btrim(p_access_code), u.access_code_hash)
    and (
      u.id = 'tezzei'
      or 'painel-admin' = any(coalesce(u.permissions, '{}'::text[]))
      or 'marketing' = any(coalesce(u.permissions, '{}'::text[]))
    )
  limit 1;

  if v_user_id is null then
    raise exception 'MARKETING_ACCESS_DENIED';
  end if;

  if v_user_id = 'tezzei' and (v_auth_user_id is null or not v_is_hub_admin) then
    raise exception 'MARKETING_AUTH_REQUIRED';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.marketing_sessions(token_hash, managed_user_id, auth_user_id, expires_at)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_user_id,
    case when v_user_id = 'tezzei' then null else v_auth_user_id end,
    v_expires_at
  );

  return query select v_token, v_user_id, v_expires_at;
end;
$function$;

UPDATE private.marketing_sessions
SET auth_user_id = NULL
WHERE managed_user_id = 'tezzei'
  AND revoked_at IS NULL
  AND expires_at > now();
