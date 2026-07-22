-- Ajuste de grants minimos apos validar a migration de recebimento no Supabase real.
-- Aprovacao de divergencia nao pode ser decidida por anon e escrita direta segue bloqueada.

revoke all on table public.cleaning_deliveries from anon, authenticated;
grant select on table public.cleaning_deliveries to anon, authenticated;
grant all on table public.cleaning_deliveries to service_role;

revoke all on table public.cleaning_delivery_items from anon, authenticated;
grant select on table public.cleaning_delivery_items to anon, authenticated;
grant all on table public.cleaning_delivery_items to service_role;

revoke all on table public.cleaning_delivery_approvals from anon, authenticated;
grant select on table public.cleaning_delivery_approvals to authenticated;
grant all on table public.cleaning_delivery_approvals to service_role;

revoke all on function public.decide_cleaning_delivery_approval(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.decide_cleaning_delivery_approval(uuid, text, text, text)
  to authenticated, service_role;

revoke all on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  to service_role;

revoke all on function public.cleaning_delivery_normalize_name(text)
  from public, anon, authenticated;
revoke all on function public.assert_cleaning_delivery_stock_check_ready(uuid)
  from public, anon, authenticated;
