-- Corrective migration for the public Marketing Web Push flow.
-- Keeps the public preparation RPC available while restricting every server RPC
-- to service_role and making claims, events, reminders and dispatch leases finite.

alter table private.marketing_push_claims
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by_subscription_id uuid
    references private.marketing_push_subscriptions(id) on delete set null,
  add column if not exists revoked_at timestamptz;

alter table private.marketing_push_events
  add column if not exists superseded_at timestamptz;

alter table private.marketing_push_deliveries
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

-- Claims used before this migration must not remain replayable.
update private.marketing_push_claims c
set consumed_at = c.last_used_at
where c.consumed_at is null
  and c.last_used_at is not null;

update private.marketing_push_claims c
set revoked_at = clock_timestamp()
where c.consumed_at is null
  and c.revoked_at is null;

create unique index if not exists marketing_push_claims_one_active_per_request_idx
  on private.marketing_push_claims (request_id)
  where consumed_at is null and revoked_at is null;

create index if not exists marketing_push_deliveries_dispatch_idx
  on private.marketing_push_deliveries (
    invalidated_at,
    acknowledged_at,
    lease_expires_at,
    last_sent_at
  );

alter table private.marketing_push_claims enable row level security;
alter table private.marketing_push_subscriptions enable row level security;
alter table private.marketing_push_events enable row level security;
alter table private.marketing_push_deliveries enable row level security;

revoke all on schema private from public, anon, authenticated;
revoke all on table private.marketing_push_claims from public, anon, authenticated;
revoke all on table private.marketing_push_subscriptions from public, anon, authenticated;
revoke all on table private.marketing_push_events from public, anon, authenticated;
revoke all on table private.marketing_push_deliveries from public, anon, authenticated;

create or replace function public.marketing_public_prepare_push(p_submission_id uuid)
returns table (
  claim_token text,
  pair_code text,
  request_number bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_request_id uuid;
  v_request_number bigint;
  v_token text;
  v_pair_code text;
  v_expires_at timestamptz := clock_timestamp() + interval '30 minutes';
begin
  select r.id, r.request_number
    into v_request_id, v_request_number
  from public.marketing_requests r
  where r.public_submission_id = p_submission_id
    and r.request_source = 'public'
    and r.deleted_at is null
  order by r.created_at desc
  limit 1
  for update;

  if v_request_id is null then
    raise exception 'MARKETING_PUSH_REQUEST_NOT_FOUND';
  end if;

  delete from private.marketing_push_claims c
  where c.expires_at <= clock_timestamp()
    and c.created_at < clock_timestamp() - interval '1 day';

  update private.marketing_push_claims c
  set revoked_at = clock_timestamp()
  where c.request_id = v_request_id
    and c.consumed_at is null
    and c.revoked_at is null;

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
set search_path = pg_catalog, private, extensions
as $$
declare
  v_claim_id uuid;
  v_claim_request_id uuid;
  v_request_id uuid;
  v_endpoint_hash text;
  v_capture_group_id uuid;
  v_subscription_id uuid;
  v_active_subscription_count integer;
  v_consumed_count integer;
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
    select c.id, c.request_id
      into v_claim_id, v_claim_request_id
    from private.marketing_push_claims c
    join public.marketing_requests r on r.id = c.request_id
    where c.token_hash = encode(extensions.digest(trim(p_claim_token), 'sha256'), 'hex')
      and c.expires_at > clock_timestamp()
      and c.consumed_at is null
      and c.revoked_at is null
      and r.request_source = 'public'
      and r.deleted_at is null
    order by c.created_at desc
    limit 1
    for update of c;
  elsif p_request_number is not null and nullif(trim(coalesce(p_pair_code, '')), '') is not null then
    select c.id, c.request_id
      into v_claim_id, v_claim_request_id
    from private.marketing_push_claims c
    join public.marketing_requests r on r.id = c.request_id
    where r.request_number = p_request_number
      and c.pair_code_hash = encode(
        extensions.digest(upper(replace(trim(p_pair_code), '-', '')), 'sha256'),
        'hex'
      )
      and c.expires_at > clock_timestamp()
      and c.consumed_at is null
      and c.revoked_at is null
      and r.request_source = 'public'
      and r.deleted_at is null
    order by c.created_at desc
    limit 1
    for update of c;
  end if;

  if v_claim_id is null or v_claim_request_id is null then
    raise exception 'MARKETING_PUSH_CLAIM_INVALID';
  end if;

  v_request_id := v_claim_request_id;

  select r.capture_group_id
    into v_capture_group_id
  from public.marketing_requests r
  where r.id = v_claim_request_id;

  if v_capture_group_id is not null then
    select r.id
      into v_request_id
    from public.marketing_requests r
    where r.capture_group_id = v_capture_group_id
      and r.request_source = 'public'
      and r.deleted_at is null
    order by r.request_number asc
    limit 1;
  end if;

  if v_request_id is null then
    raise exception 'MARKETING_PUSH_REQUEST_NOT_FOUND';
  end if;

  -- Serializes subscription count checks for the canonical request.
  perform 1
  from public.marketing_requests r
  where r.id = v_request_id
  for update;

  v_endpoint_hash := encode(extensions.digest(p_endpoint, 'sha256'), 'hex');

  select count(*)::integer
    into v_active_subscription_count
  from private.marketing_push_subscriptions s
  where s.request_id = v_request_id
    and s.active is true
    and s.endpoint_hash <> v_endpoint_hash;

  if v_active_subscription_count >= 3 then
    raise exception 'MARKETING_PUSH_SUBSCRIPTION_LIMIT_REACHED';
  end if;

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
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (request_id, endpoint_hash) do update
  set endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning id into v_subscription_id;

  update private.marketing_push_claims c
  set consumed_at = clock_timestamp(),
      consumed_by_subscription_id = v_subscription_id,
      last_used_at = clock_timestamp()
  where c.id = v_claim_id
    and c.consumed_at is null
    and c.revoked_at is null;
  get diagnostics v_consumed_count = row_count;

  if v_consumed_count <> 1 then
    raise exception 'MARKETING_PUSH_CLAIM_ALREADY_USED';
  end if;

  update private.marketing_push_claims c
  set revoked_at = clock_timestamp()
  where c.id <> v_claim_id
    and c.consumed_at is null
    and c.revoked_at is null
    and (
      c.request_id = v_claim_request_id
      or (
        v_capture_group_id is not null
        and c.request_id in (
          select grouped_request.id
          from public.marketing_requests grouped_request
          where grouped_request.capture_group_id = v_capture_group_id
        )
      )
    );

  return v_request_id;
end;
$$;

-- Existing historical events remain, but only the latest event that still
-- represents the current request state may stay dispatchable.
with ranked_events as (
  select
    e.id,
    row_number() over (
      partition by e.request_id
      order by e.created_at desc, e.id desc
    ) as event_rank
  from private.marketing_push_events e
  where e.superseded_at is null
)
update private.marketing_push_events e
set superseded_at = clock_timestamp()
from ranked_events ranked
where ranked.id = e.id
  and ranked.event_rank > 1;

update private.marketing_push_events e
set superseded_at = clock_timestamp()
from public.marketing_requests r
where r.id = e.request_id
  and e.superseded_at is null
  and (
    r.deleted_at is not null
    or r.status <> 'agendado'
    or r.confirmed_capture_at is null
    or r.confirmed_capture_at <= clock_timestamp()
    or r.confirmed_capture_at is distinct from e.capture_at
    or r.confirmed_capture_duration_minutes is distinct from e.capture_duration_minutes
    or r.capture_location is distinct from e.capture_location
  );

update private.marketing_push_deliveries d
set invalidated_at = clock_timestamp(),
    invalidation_reason = 'evento_substituido_migration',
    lease_token = null,
    lease_expires_at = null
from private.marketing_push_events e
where e.id = d.event_id
  and e.superseded_at is not null
  and d.invalidated_at is null;

create or replace function private.marketing_enqueue_public_push_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_kind text;
  v_event_key text;
  v_primary_request_id uuid := new.id;
  v_now timestamptz := clock_timestamp();
begin
  if new.capture_group_id is not null then
    select r.id
      into v_primary_request_id
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

  if new.request_source is distinct from 'public'
     or new.deleted_at is not null
     or new.status <> 'agendado'
     or new.confirmed_capture_at is null
     or new.confirmed_capture_at <= v_now then
    update private.marketing_push_deliveries d
    set invalidated_at = v_now,
        invalidation_reason = case
          when new.deleted_at is not null then 'pedido_excluido'
          when new.status = 'cancelado' then 'pedido_cancelado'
          when new.status = 'pronto' then 'pedido_concluido'
          else 'agendamento_inativo'
        end,
        lease_token = null,
        lease_expires_at = null
    from private.marketing_push_events e
    where e.id = d.event_id
      and e.request_id = old.id
      and d.invalidated_at is null;

    update private.marketing_push_events e
    set superseded_at = coalesce(e.superseded_at, v_now)
    where e.request_id = old.id
      and e.superseded_at is null;
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

  update private.marketing_push_deliveries d
  set invalidated_at = v_now,
      invalidation_reason = 'reagendado',
      lease_token = null,
      lease_expires_at = null
  from private.marketing_push_events e
  where e.id = d.event_id
    and e.request_id = v_primary_request_id
    and d.invalidated_at is null;

  update private.marketing_push_events e
  set superseded_at = v_now
  where e.request_id = v_primary_request_id
    and e.superseded_at is null;

  -- The trigger already suppresses saves with no state transition. A random
  -- event identity allows a legitimate A -> B -> A -> B sequence.
  v_event_key := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.marketing_push_events (
    request_id,
    event_kind,
    event_key,
    capture_at,
    capture_duration_minutes,
    capture_location
  ) values (
    v_primary_request_id,
    v_kind,
    v_event_key,
    new.confirmed_capture_at,
    new.confirmed_capture_duration_minutes,
    new.capture_location
  );

  return new;
end;
$$;

drop trigger if exists trg_marketing_enqueue_public_push_event on public.marketing_requests;
create trigger trg_marketing_enqueue_public_push_event
after update of status, confirmed_capture_at, confirmed_capture_duration_minutes, capture_location, deleted_at
on public.marketing_requests
for each row
execute function private.marketing_enqueue_public_push_event();

drop function if exists public.marketing_push_get_dispatch_batch(uuid, boolean);
create function public.marketing_push_get_dispatch_batch(
  p_request_id uuid default null,
  p_reminders boolean default false
)
returns table (
  delivery_id uuid,
  lease_token uuid,
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
set search_path = pg_catalog, private, extensions
as $$
begin
  insert into private.marketing_push_deliveries (event_id, subscription_id)
  select e.id, s.id
  from private.marketing_push_events e
  join private.marketing_push_subscriptions s
    on s.request_id = e.request_id
   and s.active is true
  join public.marketing_requests r on r.id = e.request_id
  where e.superseded_at is null
    and r.deleted_at is null
    and r.status = 'agendado'
    and r.confirmed_capture_at > clock_timestamp()
    and r.confirmed_capture_at is not distinct from e.capture_at
    and r.confirmed_capture_duration_minutes is not distinct from e.capture_duration_minutes
    and r.capture_location is not distinct from e.capture_location
    and (p_request_id is null or e.request_id = p_request_id)
  on conflict on constraint marketing_push_deliveries_event_id_subscription_id_key do nothing;

  return query
  with candidates as materialized (
    select d.id
    from private.marketing_push_deliveries d
    join private.marketing_push_events e on e.id = d.event_id
    join private.marketing_push_subscriptions s on s.id = d.subscription_id
    join public.marketing_requests r on r.id = e.request_id
    where d.acknowledged_at is null
      and d.invalidated_at is null
      and d.sent_count < 12
      and (d.lease_expires_at is null or d.lease_expires_at <= clock_timestamp())
      and e.superseded_at is null
      and s.active is true
      and r.deleted_at is null
      and r.status = 'agendado'
      and r.confirmed_capture_at > clock_timestamp()
      and r.confirmed_capture_at is not distinct from e.capture_at
      and r.confirmed_capture_duration_minutes is not distinct from e.capture_duration_minutes
      and r.capture_location is not distinct from e.capture_location
      and (p_request_id is null or r.id = p_request_id)
      and (
        (p_reminders is false and d.last_sent_at is null)
        or
        (p_reminders is true and (
          d.last_sent_at is null
          or d.last_sent_at <= clock_timestamp() - interval '5 minutes'
        ))
      )
    order by d.last_sent_at nulls first, e.created_at asc, d.created_at asc
    for update of d skip locked
    limit 50
  ), claimed as (
    update private.marketing_push_deliveries d
    set lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + interval '10 minutes'
    from candidates c
    where d.id = c.id
    returning d.id, d.lease_token
  )
  select
    d.id,
    claimed.lease_token,
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
  from claimed
  join private.marketing_push_deliveries d on d.id = claimed.id
  join private.marketing_push_events e on e.id = d.event_id
  join private.marketing_push_subscriptions s on s.id = d.subscription_id
  join public.marketing_requests r on r.id = e.request_id
  order by e.created_at asc, d.created_at asc;
end;
$$;

create or replace function public.marketing_push_record_delivery_server(
  p_delivery_id uuid,
  p_success boolean,
  p_terminal boolean default false,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_event_id uuid;
  v_subscription_id uuid;
begin
  update private.marketing_push_deliveries d
  set last_sent_at = clock_timestamp(),
      sent_count = d.sent_count + 1,
      last_error = case when p_success then null else left(coalesce(p_error, 'Falha no envio.'), 1000) end,
      lease_token = null,
      lease_expires_at = null
  where d.id = p_delivery_id
  returning d.event_id, d.subscription_id into v_event_id, v_subscription_id;

  if v_event_id is null then
    return;
  end if;

  if p_success then
    update private.marketing_push_events e
    set first_sent_at = coalesce(e.first_sent_at, clock_timestamp()),
        last_error = null
    where e.id = v_event_id;
  else
    update private.marketing_push_events e
    set last_error = left(coalesce(p_error, 'Falha no envio.'), 1000)
    where e.id = v_event_id;
  end if;

  if p_terminal then
    update private.marketing_push_subscriptions s
    set active = false,
        updated_at = clock_timestamp()
    where s.id = v_subscription_id;
  end if;
end;
$$;

create or replace function public.marketing_push_record_delivery_leased_server(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_terminal boolean default false,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_event_id uuid;
  v_subscription_id uuid;
begin
  update private.marketing_push_deliveries d
  set last_sent_at = clock_timestamp(),
      sent_count = d.sent_count + 1,
      last_error = case when p_success then null else left(coalesce(p_error, 'Falha no envio.'), 1000) end,
      lease_token = null,
      lease_expires_at = null
  where d.id = p_delivery_id
    and d.lease_token = p_lease_token
  returning d.event_id, d.subscription_id into v_event_id, v_subscription_id;

  if v_event_id is null then
    return false;
  end if;

  if p_success then
    update private.marketing_push_events e
    set first_sent_at = coalesce(e.first_sent_at, clock_timestamp()),
        last_error = null
    where e.id = v_event_id;
  else
    update private.marketing_push_events e
    set last_error = left(coalesce(p_error, 'Falha no envio.'), 1000)
    where e.id = v_event_id;
  end if;

  if p_terminal then
    update private.marketing_push_subscriptions s
    set active = false,
        updated_at = clock_timestamp()
    where s.id = v_subscription_id;
  end if;

  return true;
end;
$$;

create or replace function public.marketing_push_ack_server(p_ack_token text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_count integer;
begin
  update private.marketing_push_deliveries d
  set acknowledged_at = coalesce(d.acknowledged_at, clock_timestamp()),
      lease_token = null,
      lease_expires_at = null
  where d.ack_token = p_ack_token
    and d.acknowledged_at is null
    and d.invalidated_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

alter function public.marketing_push_get_server_secrets()
  set search_path = pg_catalog, vault;
alter function public.marketing_push_store_vapid_keys_server(text, text)
  set search_path = pg_catalog, vault;
alter function private.marketing_kick_push_dispatch()
  set search_path = pg_catalog, private, vault, net;
alter function private.marketing_push_cron_dispatch()
  set search_path = pg_catalog, private, vault, net;

-- Postgres/Supabase may carry explicit default EXECUTE grants for anon and
-- authenticated. Revoke every internal Push RPC from all public API roles.
do $grants$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'marketing_push_%'
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_function.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      v_function.signature
    );
  end loop;
end;
$grants$;

revoke all on function public.marketing_public_prepare_push(uuid)
  from public, anon, authenticated;
grant execute on function public.marketing_public_prepare_push(uuid)
  to anon, authenticated, service_role;

revoke all on function private.marketing_enqueue_public_push_event()
  from public, anon, authenticated, service_role;
revoke all on function private.marketing_kick_push_dispatch()
  from public, anon, authenticated, service_role;
revoke all on function private.marketing_push_cron_dispatch()
  from public, anon, authenticated, service_role;
