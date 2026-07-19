create or replace function public.is_hub_master_map_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false);
$$;

revoke all on function public.is_hub_master_map_admin() from public;
revoke all on function public.is_hub_master_map_admin() from anon;
grant execute on function public.is_hub_master_map_admin() to authenticated;
grant execute on function public.is_hub_master_map_admin() to service_role;
