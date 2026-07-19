revoke all on table public.hub_dynamic_pages from authenticated;
revoke all on table public.hub_dynamic_page_blocks from authenticated;
revoke all on table public.hub_dynamic_page_templates from authenticated;

grant select, insert, update, delete on table public.hub_dynamic_pages to authenticated;
grant select, insert, update, delete on table public.hub_dynamic_page_blocks to authenticated;
grant select, insert, update, delete on table public.hub_dynamic_page_templates to authenticated;

revoke all on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) from public;
revoke all on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) from anon;
grant execute on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) to authenticated;
grant execute on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) to service_role;

revoke all on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) from public;
revoke all on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) from anon;
grant execute on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) to authenticated;
grant execute on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) to service_role;
