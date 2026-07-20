alter function public.apply_hub_map_node_positions(uuid, jsonb) security invoker;
alter function public.apply_hub_map_node_layout_updates(uuid, jsonb) security invoker;

revoke all on function public.apply_hub_map_node_positions(uuid, jsonb) from public;
revoke all on function public.apply_hub_map_node_positions(uuid, jsonb) from anon;
grant execute on function public.apply_hub_map_node_positions(uuid, jsonb) to authenticated;
grant execute on function public.apply_hub_map_node_positions(uuid, jsonb) to service_role;

revoke all on function public.apply_hub_map_node_layout_updates(uuid, jsonb) from public;
revoke all on function public.apply_hub_map_node_layout_updates(uuid, jsonb) from anon;
grant execute on function public.apply_hub_map_node_layout_updates(uuid, jsonb) to authenticated;
grant execute on function public.apply_hub_map_node_layout_updates(uuid, jsonb) to service_role;
