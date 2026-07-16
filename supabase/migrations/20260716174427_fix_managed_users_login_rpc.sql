create extension if not exists pgcrypto with schema extensions;

alter table public.managed_users
  add column if not exists access_code_hash text;

update public.managed_users
set access_code_hash = extensions.crypt(access_code, extensions.gen_salt('bf'))
where access_code_hash is null;

alter table public.managed_users
  alter column access_code_hash set not null;

create or replace function public.set_managed_users_access_code_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.access_code_hash = extensions.crypt(new.access_code, extensions.gen_salt('bf'));
    return new;
  end if;

  if new.access_code_hash is null
    or new.access_code is distinct from old.access_code then
    new.access_code_hash = extensions.crypt(new.access_code, extensions.gen_salt('bf'));
  end if;

  return new;
end;
$$;

drop trigger if exists managed_users_access_code_hash on public.managed_users;
create trigger managed_users_access_code_hash
before insert or update of access_code, access_code_hash on public.managed_users
for each row
execute function public.set_managed_users_access_code_hash();

revoke all on function public.set_managed_users_access_code_hash() from public;

create or replace function public.login_managed_user(p_access_code text)
returns table (
  id text,
  name text,
  user_type text,
  job_title text,
  department text,
  photo_data text,
  permissions text[],
  active boolean,
  protected boolean,
  system boolean,
  linked_employee_id text,
  linked_guard_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    managed_users.id,
    managed_users.name,
    managed_users.user_type,
    managed_users.job_title,
    managed_users.department,
    managed_users.photo_data,
    managed_users.permissions,
    managed_users.active,
    managed_users.protected,
    managed_users.system,
    managed_users.linked_employee_id,
    managed_users.linked_guard_id,
    managed_users.created_at,
    managed_users.updated_at
  from public.managed_users
  where
    managed_users.active is true
    and nullif(btrim(p_access_code), '') is not null
    and (
      managed_users.access_code_hash = extensions.crypt(btrim(p_access_code), managed_users.access_code_hash)
      or (
        managed_users.access_code_hash is null
        and managed_users.access_code = btrim(p_access_code)
      )
    )
  limit 1;
$$;

revoke all on function public.login_managed_user(text) from public;
grant execute on function public.login_managed_user(text) to anon, authenticated;

notify pgrst, 'reload schema';
