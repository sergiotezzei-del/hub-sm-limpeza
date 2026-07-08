create table if not exists public.shift_sessions (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid references auth.users(id),
  scheduled_date date not null,
  scheduled_start time not null,
  scheduled_end time not null,
  status text not null default 'pending',
  started_at timestamptz,
  start_latitude decimal,
  start_longitude decimal,
  start_accuracy decimal,
  ended_at timestamptz,
  end_latitude decimal,
  end_longitude decimal,
  end_accuracy decimal,
  created_at timestamptz not null default now(),
  constraint shift_sessions_status_check check (status in ('pending', 'active', 'ended', 'auto_ended'))
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shift_sessions_guard_id_idx on public.shift_sessions (guard_id);
create index if not exists shift_sessions_status_idx on public.shift_sessions (status);
create index if not exists shift_sessions_scheduled_date_idx on public.shift_sessions (scheduled_date);
create unique index if not exists shift_sessions_one_active_per_guard_idx
  on public.shift_sessions (guard_id)
  where status = 'active';

create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at);

create or replace function public.set_shift_session_server_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status <> 'active')
    and new.started_at is null then
    new.started_at = now();
  end if;

  if new.status in ('ended', 'auto_ended')
    and (tg_op = 'INSERT' or old.status not in ('ended', 'auto_ended'))
    and new.ended_at is null then
    new.ended_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists shift_sessions_server_timestamps on public.shift_sessions;
create trigger shift_sessions_server_timestamps
before insert or update on public.shift_sessions
for each row
execute function public.set_shift_session_server_timestamps();

alter table public.shift_sessions enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.shift_sessions from anon;
revoke all on table public.audit_logs from anon;

grant select, insert, update on table public.shift_sessions to authenticated;
grant select, insert on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.shift_sessions to service_role;
grant select, insert, update, delete on table public.audit_logs to service_role;

drop policy if exists "shift_sessions_select_own_or_admin" on public.shift_sessions;
create policy "shift_sessions_select_own_or_admin"
on public.shift_sessions
for select
to authenticated
using (
  guard_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "shift_sessions_insert_own_or_admin" on public.shift_sessions;
create policy "shift_sessions_insert_own_or_admin"
on public.shift_sessions
for insert
to authenticated
with check (
  guard_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "shift_sessions_update_own_or_admin" on public.shift_sessions;
create policy "shift_sessions_update_own_or_admin"
on public.shift_sessions
for update
to authenticated
using (
  guard_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
)
with check (
  guard_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "shift_sessions_admin_delete" on public.shift_sessions;
create policy "shift_sessions_admin_delete"
on public.shift_sessions
for delete
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
create policy "audit_logs_select_own_or_admin"
on public.audit_logs
for select
to authenticated
using (
  user_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "audit_logs_insert_own_or_admin" on public.audit_logs;
create policy "audit_logs_insert_own_or_admin"
on public.audit_logs
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);
