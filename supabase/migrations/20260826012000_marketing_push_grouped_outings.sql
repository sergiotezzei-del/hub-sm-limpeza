create or replace function public.marketing_push_register_server(
  p_claim_token text,
  p_request_number bigint,
  p_pair_code text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_request_id uuid;
  v_endpoint_hash text;
  v_capture_group_id uuid;
begin
  if coalesce(length(p_endpoint), 0) < 20 or coalesce(length(p_endpoint), 0) > 4000 then
    raise exception 'MARKETING_PUSH_ENDPOINT_INVALID';
  end if;
  if coalesce(length(p_p256dh), 0) < 20 or coalesce(length(p_p256dh), 0) > 1000 then
    raise exception 'MARKETING_PUSH_KEY_INVALID';
  end if;
  if coalesce(length(p_auth), 0) < 8 or coalesce(length(p_auth), 0) > 500 then
    raise exception 'MARKETING_PUSH_AUTH_INVALID';
  end if;

  if nullif(trim(coalesce(p_claim_token, '')), '') is not null then
    select c.request_id
      into v_request_id
    from private.marketing_push_claims c
    join public.marketing_requests r on r.id = c.request_id
    where c.token_hash = encode(extensions.digest(trim(p_claim_token), 'sha256'), 'hex')
      and c.expires_at > now()
      and r.request_source = 'public'
      and r.deleted_at is null
    order by c.created_at desc
    limit 1;
  elsif p_request_number is not null and nullif(trim(coalesce(p_pair_code, '')), '') is not null then
    select c.request_id
      into v_request_id
    from private.marketing_push_claims c
    join public.marketing_requests r on r.id = c.request_id
    where r.request_number = p_request_number
      and c.pair_code_hash = encode(extensions.digest(upper(replace(trim(p_pair_code), '-', '')), 'sha256'), 'hex')
      and c.expires_at > now()
      and r.request_source = 'public'
      and r.deleted_at is null
    order by c.created_at desc
    limit 1;
  end if;

  if v_request_id is null then
    raise exception 'MARKETING_PUSH_CLAIM_INVALID';
  end if;

  select capture_group_id into v_capture_group_id
  from public.marketing_requests
  where id = v_request_id;

  if v_capture_group_id is not null then
    select r.id into v_request_id
    from public.marketing_requests r
    where r.capture_group_id = v_capture_group_id
      and r.request_source = 'public'
      and r.deleted_at is null
    order by r.request_number asc
    limit 1;
  end if;

  v_endpoint_hash := encode(extensions.digest(p_endpoint, 'sha256'), 'hex');

  insert into private.marketing_push_subscriptions (
    request_id,
    endpoint,
    endpoint_hash,
    p256dh,
    auth,
    user_agent,
    active,
    last_seen_at,
    updated_at
  ) values (
    v_request_id,
    p_endpoint,
    v_endpoint_hash,
    p_p256dh,
    p_auth,
    left(p_user_agent, 500),
    true,
    now(),
    now()
  )
  on conflict (request_id, endpoint_hash) do update
  set endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      active = true,
      last_seen_at = now(),
      updated_at = now();

  update private.marketing_push_claims
  set last_used_at = now()
  where request_id = v_request_id
     or request_id in (
       select r.id
       from public.marketing_requests r
       where v_capture_group_id is not null
         and r.capture_group_id = v_capture_group_id
     );

  return v_request_id;
end;
$$;

revoke all on function public.marketing_push_register_server(text, bigint, text, text, text, text, text) from public;
grant execute on function public.marketing_push_register_server(text, bigint, text, text, text, text, text) to service_role;

create or replace function private.marketing_enqueue_public_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_kind text;
  v_event_key text;
  v_primary_request_id uuid;
begin
  if new.request_source <> 'public'
     or new.deleted_at is not null
     or new.status <> 'agendado'
     or new.confirmed_capture_at is null then
    return new;
  end if;

  if new.capture_group_id is not null then
    select r.id into v_primary_request_id
    from public.marketing_requests r
    where r.capture_group_id = new.capture_group_id
      and r.request_source = 'public'
      and r.deleted_at is null
    order by r.request_number asc
    limit 1;

    if v_primary_request_id is distinct from new.id then
      return new;
    end if;
  end if;

  if old.confirmed_capture_at is null or old.status <> 'agendado' then
    v_kind := 'confirmed';
  elsif old.confirmed_capture_at is distinct from new.confirmed_capture_at
     or old.confirmed_capture_duration_minutes is distinct from new.confirmed_capture_duration_minutes
     or old.capture_location is distinct from new.capture_location then
    v_kind := 'updated';
  else
    return new;
  end if;

  v_event_key := encode(extensions.digest(
    concat_ws('|',
      v_kind,
      new.confirmed_capture_at::text,
      coalesce(new.confirmed_capture_duration_minutes::text, ''),
      coalesce(new.capture_location, '')
    ),
    'sha256'
  ), 'hex');

  insert into private.marketing_push_events (
    request_id,
    event_kind,
    event_key,
    capture_at,
    capture_duration_minutes,
    capture_location
  ) values (
    new.id,
    v_kind,
    v_event_key,
    new.confirmed_capture_at,
    new.confirmed_capture_duration_minutes,
    new.capture_location
  )
  on conflict (request_id, event_key) do nothing;

  return new;
end;
$$;

revoke all on function private.marketing_enqueue_public_push_event() from public;
