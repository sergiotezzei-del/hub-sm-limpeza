create table if not exists public.guard_payment_profiles (
  id uuid primary key default gen_random_uuid(),
  guard_id text not null,
  operational_name text not null,
  payment_name text,
  bank_name text,
  agency text,
  account_type text,
  account_number text,
  cpf text,
  pix text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guard_payment_profiles_guard_id_unique unique (guard_id)
);

create table if not exists public.guard_payment_records (
  id uuid primary key default gen_random_uuid(),
  payment_date date not null,
  period_label text not null,
  period_start date not null,
  period_end date not null,
  guard_id text not null,
  guard_display_name text not null,
  base_amount numeric(12, 2) not null default 1000.00,
  holiday_extra_amount numeric(12, 2) not null default 0.00,
  shift_extra_amount numeric(12, 2) not null default 0.00,
  extra_description text,
  total_amount numeric(12, 2) not null,
  status text not null default 'PENDENTE',
  notes text,
  finance_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guard_payment_records_status_check check (status in ('PENDENTE', 'ENVIADO AO FINANCEIRO', 'PAGO')),
  constraint guard_payment_records_amounts_check check (
    base_amount >= 0
    and holiday_extra_amount >= 0
    and shift_extra_amount >= 0
    and total_amount >= 0
  )
);

create index if not exists guard_payment_records_payment_date_idx on public.guard_payment_records (payment_date desc);
create index if not exists guard_payment_records_period_idx on public.guard_payment_records (period_start, period_end);
create index if not exists guard_payment_records_guard_id_idx on public.guard_payment_records (guard_id);
create index if not exists guard_payment_records_status_idx on public.guard_payment_records (status);

create or replace function public.set_guard_payment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guard_payment_profiles_updated_at on public.guard_payment_profiles;
create trigger guard_payment_profiles_updated_at
before update on public.guard_payment_profiles
for each row
execute function public.set_guard_payment_updated_at();

drop trigger if exists guard_payment_records_updated_at on public.guard_payment_records;
create trigger guard_payment_records_updated_at
before update on public.guard_payment_records
for each row
execute function public.set_guard_payment_updated_at();

alter table public.guard_payment_profiles enable row level security;
alter table public.guard_payment_records enable row level security;

revoke all on table public.guard_payment_profiles from anon;
revoke all on table public.guard_payment_records from anon;

grant select, insert, update on table public.guard_payment_profiles to authenticated;
grant select, insert, update on table public.guard_payment_records to authenticated;
grant select, insert, update, delete on table public.guard_payment_profiles to service_role;
grant select, insert, update, delete on table public.guard_payment_records to service_role;

drop policy if exists "guard_payment_profiles_admin_select" on public.guard_payment_profiles;
create policy "guard_payment_profiles_admin_select"
on public.guard_payment_profiles
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_payment_profiles_admin_insert" on public.guard_payment_profiles;
create policy "guard_payment_profiles_admin_insert"
on public.guard_payment_profiles
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_payment_profiles_admin_update" on public.guard_payment_profiles;
create policy "guard_payment_profiles_admin_update"
on public.guard_payment_profiles
for update
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_payment_records_admin_select" on public.guard_payment_records;
create policy "guard_payment_records_admin_select"
on public.guard_payment_records
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_payment_records_admin_insert" on public.guard_payment_records;
create policy "guard_payment_records_admin_insert"
on public.guard_payment_records
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_payment_records_admin_update" on public.guard_payment_records;
create policy "guard_payment_records_admin_update"
on public.guard_payment_records
for update
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);
