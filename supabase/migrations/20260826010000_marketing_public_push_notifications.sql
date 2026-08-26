create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create schema if not exists private;

create table if not exists private.marketing_push_claims (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests(id) on delete cascade,
  token_hash text not null unique,
  pair_code_hash text not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_push_claims_request_idx
  on private.marketing_push_claims (request_id, expires_at desc);
create index if not exists marketing_push_claims_pair_idx
  on private.marketing_push_claims (pair_code_hash, expires_at desc);

create table if not exists private.marketing_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests(id) on delete cascade,
  endpoint text not null,
  endpoint_hash text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, endpoint_hash)
);

create index if not exists marketing_push_subscriptions_active_idx
  on private.marketing_push_subscriptions (request_id, active);

create table if not exists private.marketing_push_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests(id) on delete cascade,
  event_kind text not null check (event_kind in ('confirmed', 'updated')),
  event_key text not null,
  capture_at timestamptz not null,
  capture_duration_minutes integer,
  capture_location text,
  first_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (request_id, event_key)
);

create index if not exists marketing_push_events_request_idx
  on private.marketing_push_events (request_id, created_at desc);

create table if not exists private.marketing_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references private.marketing_push_events(id) on delete cascade,
  subscription_id uuid not null references private.marketing_push_subscriptions(id) on delete cascade,
  ack_token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  acknowledged_at timestamptz,
  last_sent_at timestamptz,
  sent_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_id, subscription_id)
);

create index if not exists marketing_push_deliveries_pending_idx
  on private.marketing_push_deliveries (acknowledged_at, last_sent_at);

revoke all on private.marketing_push_claims from public, anon, authenticated;
revoke all on private.marketing_push_subscriptions from public, anon, authenticated;
revoke all on private.marketing_push_events from public, anon, authenticated;
revoke all on private.marketing_push_deliveries from public, anon, authenticated;

create or replace function public.marketing_public_prepare_push(p_submission_id uuid)
returns table (
  claim_token text,
  pair_code text,
  request_number bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_request_id uuid;
  v_request_number bigint;
  v_token text;
  v_pair_code text;
  v_expires_at timestamptz := now() + interval '45 days';
begin
  select r.id, r.request_number
    into v_request_id, v_request_number
  from public.marketing_requests r
  where r.public_submission_id = p_submission_id
    and r.request_source = 'public'
    and r.deleted_at is null
  order by r.created_at desc
  limit 1;

  if v_request_id is null then
    raise exception 'MARKETING_PUSH_REQUEST_NOT_FOUND';
  end if;

  delete from private.marketing_push_claims
  where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_pair_code := upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 12));

  insert into private.marketing_push_claims (
    request_id,
    token_hash,
    pair_code_hash,
    expires_at
  ) values (
    v_request_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_pair_code, 'sha256'), 'hex'),
    v_expires_at
  );

  return query select v_token, v_pair_code, v_request_number, v_expires_at;
end;
$$;

revoke all on function public.marketing_public_prepare_push(uuid) from public;
grant execute on function public.marketing_public_prepare_push(uuid) to anon, authenticated;

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
    and expires_at > now();

  return v_request_id;
end;
$$;

revoke all on function public.marketing_push_register_server(text, bigint, text, text, text, text, text) from public;
grant execute on function public.marketing_push_register_server(text, bigint, text, text, text, text, text) to service_role;

create or replace function public.marketing_push_get_server_secrets()
returns table (
  webhook_secret text,
  vapid_public_key text,
  vapid_private_key text
)
language sql
security definer
set search_path = public, vault
as $$
  select
    max(decrypted_secret) filter (where name = 'marketing_push_webhook_secret') as webhook_secret,
    max(decrypted_secret) filter (where name = 'marketing_push_vapid_public_key') as vapid_public_key,
    max(decrypted_secret) filter (where name = 'marketing_push_vapid_private_key') as vapid_private_key
  from vault.decrypted_secrets
  where name in (
    'marketing_push_webhook_secret',
    'marketing_push_vapid_public_key',
    'marketing_push_vapid_private_key'
  );
$$;

revoke all on function public.marketing_push_get_server_secrets() from public;
grant execute on function public.marketing_push_get_server_secrets() to service_role;

create or replace function public.marketing_push_get_dispatch_batch(
  p_request_id uuid default null,
  p_reminders boolean default false
)
returns table (
  delivery_id uuid,
  event_id uuid,
  request_id uuid,
  request_number bigint,
  broker_name text,
  property_reference text,
  capture_location text,
  confirmed_capture_at timestamptz,
  confirmed_duration_minutes integer,
  event_kind text,
  endpoint text,
  p256dh text,
  auth text,
  ack_token text,
  sent_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into private.marketing_push_deliveries (event_id, subscription_id)
  select e.id, s.id
  from private.marketing_push_events e
  join private.marketing_push_subscriptions s
    on s.request_id = e.request_id
   and s.active = true
  where (p_request_id is null or e.request_id = p_request_id)
  on conflict (event_id, subscription_id) do nothing;

  return query
  select
    d.id,
    e.id,
    r.id,
    r.request_number,
    r.broker_name,
    coalesce(nullif(r.property_reference, ''), 'Sem código'),
    coalesce(nullif(r.capture_location, ''), 'Local não informado'),
    e.capture_at,
    e.capture_duration_minutes,
    e.event_kind,
    s.endpoint,
    s.p256dh,
    s.auth,
    d.ack_token,
    d.sent_count
  from private.marketing_push_deliveries d
  join private.marketing_push_events e on e.id = d.event_id
  join private.marketing_push_subscriptions s on s.id = d.subscription_id
  join public.marketing_requests r on r.id = e.request_id
  where d.acknowledged_at is null
    and s.active = true
    and r.deleted_at is null
    and r.status <> 'cancelado'
    and (p_request_id is null or r.id = p_request_id)
    and (
      (p_reminders = false and d.last_sent_at is null)
      or
      (p_reminders = true
       and d.last_sent_at is not null
       and d.last_sent_at <= now() - interval '5 minutes'
       and e.created_at >= now() - interval '7 days')
    )
  order by e.created_at asc, d.created_at asc
  limit 200;
end;
$$;

revoke all on function public.marketing_push_get_dispatch_batch(uuid, boolean) from public;
grant execute on function public.marketing_push_get_dispatch_batch(uuid, boolean) to service_role;

create or replace function public.marketing_push_record_delivery_server(
  p_delivery_id uuid,
  p_success boolean,
  p_terminal boolean default false,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_subscription_id uuid;
begin
  update private.marketing_push_deliveries
  set last_sent_at = now(),
      sent_count = sent_count + 1,
      last_error = case when p_success then null else left(coalesce(p_error, 'Falha no envio.'), 1000) end
  where id = p_delivery_id
  returning event_id, subscription_id into v_event_id, v_subscription_id;

  if v_event_id is null then
    return;
  end if;

  if p_success then
    update private.marketing_push_events
    set first_sent_at = coalesce(first_sent_at, now()),
        last_error = null
    where id = v_event_id;
  else
    update private.marketing_push_events
    set last_error = left(coalesce(p_error, 'Falha no envio.'), 1000)
    where id = v_event_id;
  end if;

  if p_terminal then
    update private.marketing_push_subscriptions
    set active = false,
        updated_at = now()
    where id = v_subscription_id;
  end if;
end;
$$;

revoke all on function public.marketing_push_record_delivery_server(uuid, boolean, boolean, text) from public;
grant execute on function public.marketing_push_record_delivery_server(uuid, boolean, boolean, text) to service_role;

create or replace function public.marketing_push_ack_server(p_ack_token text)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer;
begin
  update private.marketing_push_deliveries
  set acknowledged_at = coalesce(acknowledged_at, now())
  where ack_token = p_ack_token
    and acknowledged_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.marketing_push_ack_server(text) from public;
grant execute on function public.marketing_push_ack_server(text) to service_role;

create or replace function private.marketing_enqueue_public_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_kind text;
  v_event_key text;
begin
  if new.request_source <> 'public'
     or new.deleted_at is not null
     or new.status <> 'agendado'
     or new.confirmed_capture_at is null then
    return new;
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

drop trigger if exists trg_marketing_enqueue_public_push_event on public.marketing_requests;
create trigger trg_marketing_enqueue_public_push_event
after update of status, confirmed_capture_at, confirmed_capture_duration_minutes, capture_location
on public.marketing_requests
for each row
execute function private.marketing_enqueue_public_push_event();

create or replace function private.marketing_kick_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, private, vault, net
as $$
declare
  v_secret text;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'marketing_push_webhook_secret'
  order by created_at desc
  limit 1;

  if nullif(v_secret, '') is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://dtdepfpkyiqtnsjztjit.supabase.co/functions/v1/marketing-public-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hub-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'dispatch',
      'requestId', new.request_id::text
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  return new;
end;
$$;

revoke all on function private.marketing_kick_push_dispatch() from public;

drop trigger if exists trg_marketing_kick_push_dispatch on private.marketing_push_events;
create trigger trg_marketing_kick_push_dispatch
after insert on private.marketing_push_events
for each row
execute function private.marketing_kick_push_dispatch();

create or replace function private.marketing_push_cron_dispatch()
returns void
language plpgsql
security definer
set search_path = public, private, vault, net
as $$
declare
  v_secret text;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'marketing_push_webhook_secret'
  order by created_at desc
  limit 1;

  if nullif(v_secret, '') is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://dtdepfpkyiqtnsjztjit.supabase.co/functions/v1/marketing-public-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hub-push-secret', v_secret
    ),
    body := jsonb_build_object('action', 'remind'),
    timeout_milliseconds := 5000
  );
exception when others then
  return;
end;
$$;

revoke all on function private.marketing_push_cron_dispatch() from public;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'marketing-public-push-reminders') then
    perform cron.schedule(
      'marketing-public-push-reminders',
      '*/5 * * * *',
      'select private.marketing_push_cron_dispatch();'
    );
  end if;
end;
$$;
