create table public.hub_alert_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  description text,
  recurrence_type text not null check (recurrence_type in ('weekly', 'biweekly', 'once')),
  weekdays smallint[] not null default '{}'::smallint[],
  anchor_date date,
  active boolean not null default true,
  created_by_user_id text references public.managed_users(id) on update cascade on delete set null,
  created_by_name text not null check (btrim(created_by_name) <> ''),
  created_by_auth_user uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_alert_rules_weekdays_valid check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint hub_alert_rules_schedule_valid check (
    (recurrence_type = 'weekly' and cardinality(weekdays) > 0 and anchor_date is null)
    or (recurrence_type in ('biweekly', 'once') and cardinality(weekdays) = 0 and anchor_date is not null)
  )
);

create index hub_alert_rules_active_idx
  on public.hub_alert_rules(active, created_at)
  where active;

create table public.hub_alert_completions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.hub_alert_rules(id) on delete restrict,
  occurrence_date date not null,
  completed_by_user_id text references public.managed_users(id) on update cascade on delete set null,
  completed_by_name text not null check (btrim(completed_by_name) <> ''),
  completed_by_auth_user uuid default auth.uid(),
  completed_at timestamptz not null default now(),
  unique (rule_id, occurrence_date)
);

create index hub_alert_completions_rule_date_idx
  on public.hub_alert_completions(rule_id, occurrence_date desc);

create or replace function public.prepare_hub_alert_rule_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger hub_alert_rules_prepare_state
before update on public.hub_alert_rules
for each row execute function public.prepare_hub_alert_rule_state();

alter table public.hub_alert_rules enable row level security;
alter table public.hub_alert_completions enable row level security;

revoke all on public.hub_alert_rules from anon;
revoke all on public.hub_alert_completions from anon;
grant select, insert, update on public.hub_alert_rules to authenticated;
grant select, insert on public.hub_alert_completions to authenticated;

create policy hub_alert_rules_admin_select
  on public.hub_alert_rules for select to authenticated
  using ((select public.is_hub_admin()));
create policy hub_alert_rules_admin_insert
  on public.hub_alert_rules for insert to authenticated
  with check ((select public.is_hub_admin()));
create policy hub_alert_rules_admin_update
  on public.hub_alert_rules for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));

create policy hub_alert_completions_admin_select
  on public.hub_alert_completions for select to authenticated
  using ((select public.is_hub_admin()));
create policy hub_alert_completions_admin_insert
  on public.hub_alert_completions for insert to authenticated
  with check ((select public.is_hub_admin()));

revoke all on function public.prepare_hub_alert_rule_state() from public;

insert into public.hub_alert_rules (
  title,
  description,
  recurrence_type,
  weekdays,
  anchor_date,
  active,
  created_by_user_id,
  created_by_name
)
select
  'Limpeza das calhas',
  'Rotina de limpeza das calhas da imobiliária.',
  'weekly',
  array[1,3,5]::smallint[],
  null,
  true,
  'tezzei',
  'Admin Tezzei'
where not exists (
  select 1
  from public.hub_alert_rules
  where lower(title) = lower('Limpeza das calhas')
    and active
);
