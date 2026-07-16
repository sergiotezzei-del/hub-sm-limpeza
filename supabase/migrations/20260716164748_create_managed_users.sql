create table if not exists public.managed_users (
  id text primary key,
  name text not null,
  access_code text not null,
  user_type text,
  job_title text,
  department text,
  photo_data text,
  permissions text[] not null default '{}',
  active boolean not null default true,
  protected boolean not null default false,
  system boolean not null default false,
  linked_employee_id text,
  linked_guard_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_users_access_code_unique unique (access_code)
);

create index if not exists managed_users_active_idx on public.managed_users (active);
create index if not exists managed_users_department_idx on public.managed_users (department);
create index if not exists managed_users_user_type_idx on public.managed_users (user_type);

create or replace function public.set_managed_users_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists managed_users_updated_at on public.managed_users;
create trigger managed_users_updated_at
before update on public.managed_users
for each row
execute function public.set_managed_users_updated_at();

alter table public.managed_users enable row level security;

revoke all on table public.managed_users from anon;

grant select, insert, update, delete on table public.managed_users to authenticated;
grant select, insert, update, delete on table public.managed_users to service_role;

drop policy if exists "managed_users_admin_select" on public.managed_users;
create policy "managed_users_admin_select"
on public.managed_users
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "managed_users_admin_insert" on public.managed_users;
create policy "managed_users_admin_insert"
on public.managed_users
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "managed_users_admin_update" on public.managed_users;
create policy "managed_users_admin_update"
on public.managed_users
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

drop policy if exists "managed_users_admin_delete" on public.managed_users;
create policy "managed_users_admin_delete"
on public.managed_users
for delete
to authenticated
using (
  not system
  and not protected
  and (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
    or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
  )
);
