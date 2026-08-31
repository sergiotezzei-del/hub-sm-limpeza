-- PREPARAÇÃO DA INTEGRAÇÃO INTELBRAS AMT 8000 LITE
-- Esta migration cria apenas estruturas de auditoria/cache.
-- Não cria transporte, segredo, senha, comando real ou acesso à central.

create table if not exists public.hub_alarm_command_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id text not null,
  actor_name text not null,
  command_type text not null check (command_type in ('arm_all','disarm_all','arm_partition','disarm_partition','bypass_zone','restore_zone')),
  partition_id integer null,
  zone_id integer null,
  source text not null check (source in ('hub_web','hub_pwa','server','local_bridge')),
  status text not null check (status in ('blocked','queued','success','failed')),
  message text not null default '',
  provider_request_id text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists hub_alarm_command_audit_created_at_idx
  on public.hub_alarm_command_audit (created_at desc);

create table if not exists public.hub_alarm_event_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  event_type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  partition_id integer null,
  zone_id integer null,
  title text not null,
  message text not null default '',
  acknowledged_at timestamptz null,
  acknowledged_by text null,
  raw_metadata jsonb not null default '{}'::jsonb
);

create index if not exists hub_alarm_event_log_occurred_at_idx
  on public.hub_alarm_event_log (occurred_at desc);
create index if not exists hub_alarm_event_log_open_idx
  on public.hub_alarm_event_log (acknowledged_at, severity, occurred_at desc);

create table if not exists public.hub_alarm_snapshot_cache (
  panel_key text primary key,
  panel_name text not null,
  model text not null,
  firmware text null,
  online boolean null,
  battery_active boolean null,
  siren_active boolean null,
  partitions jsonb not null default '[]'::jsonb,
  zones jsonb not null default '[]'::jsonb,
  provider text null,
  updated_at timestamptz not null default now()
);

alter table public.hub_alarm_command_audit enable row level security;
alter table public.hub_alarm_event_log enable row level security;
alter table public.hub_alarm_snapshot_cache enable row level security;

revoke all on public.hub_alarm_command_audit from anon;
revoke all on public.hub_alarm_event_log from anon;
revoke all on public.hub_alarm_snapshot_cache from anon;

create policy hub_alarm_command_audit_admin_select
  on public.hub_alarm_command_audit for select to authenticated
  using (public.is_hub_admin());

create policy hub_alarm_event_log_admin_select
  on public.hub_alarm_event_log for select to authenticated
  using (public.is_hub_admin());

create policy hub_alarm_snapshot_cache_admin_select
  on public.hub_alarm_snapshot_cache for select to authenticated
  using (public.is_hub_admin());

-- Escrita fica reservada ao backend/integração futura.
-- Não conceder INSERT/UPDATE/DELETE ao frontend até o transporte oficial ser implementado.
