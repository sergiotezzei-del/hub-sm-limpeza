begin;

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists private.hub_public_push_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  source_reference text not null,
  token_hash text not null unique,
  pair_code_hash text not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint hub_public_push_claim_source_type_check check (char_length(source_type) between 2 and 40),
  constraint hub_public_push_claim_reference_check check (char_length(source_reference) between 1 and 120)
);

create index if not exists hub_public_push_claims_source_idx
  on private.hub_public_push_claims (source_type, source_id, expires_at desc);
create index if not exists hub_public_push_claims_pair_idx
  on private.hub_public_push_claims (source_type, source_reference, pair_code_hash, expires_at desc);

create table if not exists private.hub_public_push_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  endpoint text not null,
  endpoint_hash text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_seen_at timestamptz not null default clock_timestamp(),
  last_sent_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists hub_public_push_devices_active_idx
  on private.hub_public_push_devices (active, last_seen_at desc);

create table if not exists private.hub_public_push_links (
  id uuid primary key default extensions.gen_random_uuid(),
  device_id uuid not null references private.hub_public_push_devices(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  source_reference text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (device_id, source_type, source_id)
);

create index if not exists hub_public_push_links_source_idx
  on private.hub_public_push_links (source_type, source_id);
create index if not exists hub_public_push_links_reference_idx
  on private.hub_public_push_links (source_type, source_reference);

revoke all on table private.hub_public_push_claims from public, anon, authenticated;
revoke all on table private.hub_public_push_devices from public, anon, authenticated;
revoke all on table private.hub_public_push_links from public, anon, authenticated;

create or replace function private.hub_public_push_webhook_secret_valid(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(length(p_secret), 0) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name = 'marketing_push_webhook_secret'
        and s.decrypted_secret = p_secret
    );
$$;

revoke execute on function private.hub_public_push_webhook_secret_valid(text) from public, anon, authenticated;

create or replace function private.hub_public_push_create_claim(
  p_source_type text,
  p_source_id uuid,
  p_source_reference text
)
returns table (
  claim_token text,
  pair_code text,
  source_type text,
  source_reference text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_reference text := trim(coalesce(p_source_reference, ''));
  v_token text;
  v_pair text;
  v_expires timestamptz := clock_timestamp() + interval '90 days';
begin
  if p_source_id is null or length(v_source_type) < 2 or length(v_reference) < 1 then
    raise exception 'HUB_PUBLIC_PUSH_SOURCE_INVALID';
  end if;

  delete from private.hub_public_push_claims where expires_at <= clock_timestamp();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_pair := upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 12));

  insert into private.hub_public_push_claims (
    source_type, source_id, source_reference, token_hash, pair_code_hash, expires_at
  ) values (
    v_source_type,
    p_source_id,
    left(v_reference, 120),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_pair, 'sha256'), 'hex'),
    v_expires
  );

  return query select v_token, v_pair, v_source_type, left(v_reference, 120), v_expires;
end;
$$;

revoke execute on function private.hub_public_push_create_claim(text, uuid, text) from public, anon, authenticated;

create or replace function public.auditorio_public_prepare_push(p_submission_id uuid)
returns table (
  claim_token text,
  pair_code text,
  source_type text,
  source_reference text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_protocol bigint;
begin
  select r.id, r.protocolo
  into v_id, v_protocol
  from public.auditorio_reservas r
  where r.public_submission_id = p_submission_id
  limit 1;

  if v_id is null then
    raise exception 'AUDITORIO_PUSH_REQUEST_NOT_FOUND';
  end if;

  return query
  select * from private.hub_public_push_create_claim('auditorio', v_id, v_protocol::text);
end;
$$;

revoke execute on function public.auditorio_public_prepare_push(uuid) from public, anon, authenticated;
grant execute on function public.auditorio_public_prepare_push(uuid) to anon, authenticated;

create or replace function public.service_request_public_prepare_push(p_submission_id uuid)
returns table (
  claim_token text,
  pair_code text,
  source_type text,
  source_reference text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_protocol bigint;
begin
  select r.id, r.protocol_number
  into v_id, v_protocol
  from public.service_requests r
  where r.public_submission_id = p_submission_id
  limit 1;

  if v_id is null then
    raise exception 'SERVICE_REQUEST_PUSH_REQUEST_NOT_FOUND';
  end if;

  return query
  select * from private.hub_public_push_create_claim('service_request', v_id, v_protocol::text);
end;
$$;

revoke execute on function public.service_request_public_prepare_push(uuid) from public, anon, authenticated;
grant execute on function public.service_request_public_prepare_push(uuid) to anon, authenticated;

create or replace function public.hub_public_push_register_direct_server(
  p_source_type text,
  p_source_id uuid,
  p_source_reference text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_reference text := trim(coalesce(p_source_reference, ''));
  v_endpoint text := trim(coalesce(p_endpoint, ''));
  v_p256dh text := trim(coalesce(p_p256dh, ''));
  v_auth text := trim(coalesce(p_auth, ''));
  v_hash text;
  v_device_id uuid;
begin
  if p_source_id is null or length(v_source_type) < 2 or length(v_reference) < 1 then
    raise exception 'HUB_PUBLIC_PUSH_SOURCE_INVALID';
  end if;
  if length(v_endpoint) < 20 or length(v_endpoint) > 4000
     or length(v_p256dh) < 20 or length(v_p256dh) > 2000
     or length(v_auth) < 8 or length(v_auth) > 1000 then
    raise exception 'HUB_PUBLIC_PUSH_SUBSCRIPTION_INVALID';
  end if;

  v_hash := encode(extensions.digest(v_endpoint, 'sha256'), 'hex');

  insert into private.hub_public_push_devices (
    endpoint, endpoint_hash, p256dh, auth, user_agent,
    active, last_seen_at, last_error, updated_at
  ) values (
    v_endpoint, v_hash, v_p256dh, v_auth,
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000),
    true, clock_timestamp(), null, clock_timestamp()
  )
  on conflict (endpoint_hash) do update
  set endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      active = true,
      last_seen_at = clock_timestamp(),
      last_error = null,
      updated_at = clock_timestamp()
  returning id into v_device_id;

  insert into private.hub_public_push_links (
    device_id, source_type, source_id, source_reference, updated_at
  ) values (
    v_device_id, v_source_type, p_source_id, left(v_reference, 120), clock_timestamp()
  )
  on conflict (device_id, source_type, source_id) do update
  set source_reference = excluded.source_reference,
      updated_at = clock_timestamp();

  return v_device_id;
end;
$$;

revoke execute on function public.hub_public_push_register_direct_server(text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hub_public_push_register_direct_server(text, uuid, text, text, text, text, text) to service_role;

create or replace function public.hub_public_push_register_server(
  p_claim_token text,
  p_source_type text,
  p_source_reference text,
  p_pair_code text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim private.hub_public_push_claims%rowtype;
  v_token text := trim(coalesce(p_claim_token, ''));
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_reference text := trim(coalesce(p_source_reference, ''));
  v_pair text := upper(regexp_replace(trim(coalesce(p_pair_code, '')), '[^A-Fa-f0-9]', '', 'g'));
  v_device_id uuid;
begin
  if v_token <> '' then
    select * into v_claim
    from private.hub_public_push_claims c
    where c.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
      and c.expires_at > clock_timestamp()
    order by c.created_at desc
    limit 1;
  elsif v_source_type <> '' and v_reference <> '' and v_pair <> '' then
    select * into v_claim
    from private.hub_public_push_claims c
    where c.source_type = v_source_type
      and c.source_reference = v_reference
      and c.pair_code_hash = encode(extensions.digest(v_pair, 'sha256'), 'hex')
      and c.expires_at > clock_timestamp()
    order by c.created_at desc
    limit 1;
  end if;

  if v_claim.id is null then
    raise exception 'HUB_PUBLIC_PUSH_CLAIM_INVALID';
  end if;

  v_device_id := public.hub_public_push_register_direct_server(
    v_claim.source_type,
    v_claim.source_id,
    v_claim.source_reference,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent
  );

  update private.hub_public_push_claims
  set last_used_at = clock_timestamp()
  where id = v_claim.id;

  return v_device_id;
end;
$$;

revoke execute on function public.hub_public_push_register_server(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hub_public_push_register_server(text, text, text, text, text, text, text, text) to service_role;

create or replace function public.hub_public_push_get_targets_server(
  p_source_type text default null,
  p_source_id uuid default null
)
returns table (
  device_id uuid,
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
set search_path = ''
as $$
  select distinct d.id, d.endpoint, d.p256dh, d.auth
  from private.hub_public_push_devices d
  where d.active = true
    and (
      nullif(trim(coalesce(p_source_type, '')), '') is null
      or exists (
        select 1
        from private.hub_public_push_links l
        where l.device_id = d.id
          and l.source_type = lower(trim(p_source_type))
          and (p_source_id is null or l.source_id = p_source_id)
      )
    )
  order by d.id;
$$;

revoke execute on function public.hub_public_push_get_targets_server(text, uuid) from public, anon, authenticated;
grant execute on function public.hub_public_push_get_targets_server(text, uuid) to service_role;

create or replace function public.hub_public_push_record_device_server(
  p_device_id uuid,
  p_success boolean,
  p_terminal boolean default false,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.hub_public_push_devices
  set active = case when p_terminal then false else active end,
      last_sent_at = clock_timestamp(),
      last_success_at = case when p_success then clock_timestamp() else last_success_at end,
      last_error = case when p_success then null else left(coalesce(p_error, 'push_send_failed'), 500) end,
      updated_at = clock_timestamp()
  where id = p_device_id;
end;
$$;

revoke execute on function public.hub_public_push_record_device_server(uuid, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.hub_public_push_record_device_server(uuid, boolean, boolean, text) to service_role;

create or replace function public.hub_public_push_admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED';
  end if;

  select jsonb_build_object(
    'activeDevices', count(*) filter (where d.active),
    'auditorio', count(distinct d.id) filter (where d.active and exists (select 1 from private.hub_public_push_links l where l.device_id=d.id and l.source_type='auditorio')),
    'serviceRequest', count(distinct d.id) filter (where d.active and exists (select 1 from private.hub_public_push_links l where l.device_id=d.id and l.source_type='service_request')),
    'marketing', count(distinct d.id) filter (where d.active and exists (select 1 from private.hub_public_push_links l where l.device_id=d.id and l.source_type='marketing'))
  ) into v_result
  from private.hub_public_push_devices d;

  return coalesce(v_result, jsonb_build_object('activeDevices',0,'auditorio',0,'serviceRequest',0,'marketing',0));
end;
$$;

revoke execute on function public.hub_public_push_admin_stats() from public, anon;
grant execute on function public.hub_public_push_admin_stats() to authenticated;

-- Backfill existing Marketing push devices so future manual HUB broadcasts reach them too.
insert into private.hub_public_push_devices (
  endpoint, endpoint_hash, p256dh, auth, user_agent, active, last_seen_at, created_at, updated_at
)
select distinct on (s.endpoint_hash)
  s.endpoint,
  s.endpoint_hash,
  s.p256dh,
  s.auth,
  s.user_agent,
  s.active,
  s.last_seen_at,
  s.created_at,
  s.updated_at
from private.marketing_push_subscriptions s
order by s.endpoint_hash, s.updated_at desc
on conflict (endpoint_hash) do update
set endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    active = excluded.active or private.hub_public_push_devices.active,
    last_seen_at = greatest(private.hub_public_push_devices.last_seen_at, excluded.last_seen_at),
    updated_at = clock_timestamp();

insert into private.hub_public_push_links (device_id, source_type, source_id, source_reference)
select d.id, 'marketing', s.request_id, r.request_number::text
from private.marketing_push_subscriptions s
join private.hub_public_push_devices d on d.endpoint_hash = s.endpoint_hash
join public.marketing_requests r on r.id = s.request_id
on conflict (device_id, source_type, source_id) do update
set source_reference = excluded.source_reference,
    updated_at = clock_timestamp();

create or replace function private.hub_push_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'marketing_push_webhook_secret'
  limit 1;
$$;

revoke execute on function private.hub_push_secret() from public, anon, authenticated;

create or replace function private.hub_admin_push_dispatch_event(
  p_title text,
  p_body text,
  p_url text default '/',
  p_kind text default 'hub',
  p_tag text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  v_secret := private.hub_push_secret();
  if v_secret is null then return; end if;

  perform net.http_post(
    url := 'https://dtdepfpkyiqtnsjztjit.supabase.co/functions/v1/hub-admin-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hub-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'dispatch_event',
      'title', left(coalesce(p_title, 'Novo aviso do HUB'), 160),
      'body', left(coalesce(p_body, 'Abra o HUB para conferir.'), 1000),
      'url', coalesce(nullif(trim(p_url), ''), '/'),
      'kind', coalesce(nullif(trim(p_kind), ''), 'hub'),
      'tag', coalesce(nullif(trim(p_tag), ''), 'hub-event')
    ),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end;
$$;

revoke execute on function private.hub_admin_push_dispatch_event(text, text, text, text, text) from public, anon, authenticated;

create or replace function private.hub_public_push_dispatch_request_update(
  p_source_type text,
  p_source_id uuid,
  p_title text,
  p_body text,
  p_url text default '/',
  p_kind text default 'hub',
  p_tag text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  v_secret := private.hub_push_secret();
  if v_secret is null or p_source_id is null then return; end if;

  perform net.http_post(
    url := 'https://dtdepfpkyiqtnsjztjit.supabase.co/functions/v1/hub-public-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hub-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'request_update',
      'sourceType', lower(trim(p_source_type)),
      'sourceId', p_source_id,
      'title', left(coalesce(p_title, 'Atualização do HUB'), 160),
      'body', left(coalesce(p_body, 'Abra o HUB para conferir.'), 1000),
      'url', coalesce(nullif(trim(p_url), ''), '/'),
      'kind', coalesce(nullif(trim(p_kind), ''), 'hub'),
      'tag', coalesce(nullif(trim(p_tag), ''), 'hub-request-update')
    ),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end;
$$;

revoke execute on function private.hub_public_push_dispatch_request_update(text, uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function private.hub_notify_admin_new_auditorio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hub_admin_push_dispatch_event(
    '🏛️ Nova solicitação de auditório',
    format('%s solicitou %s para %s às %s.', new.solicitante_nome, new.nome_evento, to_char(new.data_evento, 'DD/MM/YYYY'), to_char(new.horario_inicio, 'HH24:MI')),
    '/',
    'auditorio_admin',
    'hub-admin-auditorio-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_hub_notify_admin_new_auditorio on public.auditorio_reservas;
create trigger trg_hub_notify_admin_new_auditorio
after insert on public.auditorio_reservas
for each row execute function private.hub_notify_admin_new_auditorio();

create or replace function private.hub_notify_admin_new_service_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hub_admin_push_dispatch_event(
    '🛠️ Novo chamado #' || new.protocol_number::text,
    format('%s · %s: %s', new.requester_name, new.department, left(new.request_text, 220)),
    '/',
    'service_request_admin',
    'hub-admin-chamado-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_hub_notify_admin_new_service_request on public.service_requests;
create trigger trg_hub_notify_admin_new_service_request
after insert on public.service_requests
for each row execute function private.hub_notify_admin_new_service_request();

create or replace function private.hub_notify_admin_new_marketing_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.request_source = 'public' and new.deleted_at is null then
    perform private.hub_admin_push_dispatch_event(
      '📣 Novo pedido de Marketing #' || new.request_number::text,
      format('%s · Imóvel %s', new.broker_name, coalesce(nullif(new.property_reference, ''), 'sem código')),
      '/',
      'marketing_admin',
      'hub-admin-marketing-' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hub_notify_admin_new_marketing_request on public.marketing_requests;
create trigger trg_hub_notify_admin_new_marketing_request
after insert on public.marketing_requests
for each row execute function private.hub_notify_admin_new_marketing_request();

create or replace function private.hub_notify_public_auditorio_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('aprovado', 'recusado', 'cancelado') then return new; end if;

  v_title := case new.status
    when 'aprovado' then '✅ Auditório aprovado'
    when 'recusado' then '❌ Solicitação de auditório recusada'
    else '⚠️ Reserva de auditório cancelada'
  end;
  v_body := format('%s · %s · %s às %s%s',
    new.nome_evento,
    to_char(new.data_evento, 'DD/MM/YYYY'),
    to_char(new.horario_inicio, 'HH24:MI'),
    to_char(new.horario_fim, 'HH24:MI'),
    case when nullif(trim(coalesce(new.observacao_administrativa, '')), '') is not null then ' · ' || left(new.observacao_administrativa, 260) else '' end
  );

  perform private.hub_public_push_dispatch_request_update(
    'auditorio', new.id, v_title, v_body, '/auditorio/consulta', 'auditorio', 'auditorio-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_hub_notify_public_auditorio_status on public.auditorio_reservas;
create trigger trg_hub_notify_public_auditorio_status
after update of status, observacao_administrativa on public.auditorio_reservas
for each row execute function private.hub_notify_public_auditorio_status();

create or replace function private.hub_notify_public_service_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_label := case new.status
    when 'em_andamento' then 'Em andamento'
    when 'aguardando' then 'Aguardando'
    when 'cancelado' then 'Cancelado'
    when 'concluido' then 'Concluído'
    else initcap(replace(new.status, '_', ' '))
  end;
  perform private.hub_public_push_dispatch_request_update(
    'service_request',
    new.id,
    '🔔 Chamado #' || new.protocol_number::text || ' atualizado',
    v_label || case when nullif(trim(coalesce(new.admin_notes, '')), '') is not null then ' · ' || left(new.admin_notes, 300) else '' end,
    '/chamados',
    'service_request',
    'service-request-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_hub_notify_public_service_request_status on public.service_requests;
create trigger trg_hub_notify_public_service_request_status
after update of status, admin_notes on public.service_requests
for each row execute function private.hub_notify_public_service_request_status();

create or replace function private.hub_notify_public_service_request_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hub_public_push_dispatch_request_update(
    'service_request',
    old.id,
    '✅ Chamado #' || old.protocol_number::text || ' concluído',
    'Seu chamado foi concluído pelo responsável.',
    '/chamados',
    'service_request',
    'service-request-' || old.id::text
  );
  return old;
end;
$$;

drop trigger if exists trg_hub_notify_public_service_request_delete on public.service_requests;
create trigger trg_hub_notify_public_service_request_delete
before delete on public.service_requests
for each row execute function private.hub_notify_public_service_request_delete();

notify pgrst, 'reload schema';
commit;
