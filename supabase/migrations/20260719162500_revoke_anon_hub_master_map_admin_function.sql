revoke all on function public.is_hub_master_map_admin() from public;
revoke all on function public.is_hub_master_map_admin() from anon;
grant execute on function public.is_hub_master_map_admin() to authenticated;
grant execute on function public.is_hub_master_map_admin() to service_role;
