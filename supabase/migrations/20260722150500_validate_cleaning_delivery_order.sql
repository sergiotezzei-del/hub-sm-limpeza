-- Garante a regra também para inserções diretas na tabela, além da validação do RPC.
create or replace function public.validate_cleaning_delivery_order()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.orders
    where id = new.order_id
      and deleted_at is null
      and status = 'Pedido feito'
  ) then
    raise exception 'O pedido precisa estar marcado como Pedido feito antes da conferência de entrega.';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_cleaning_delivery_order() from public;

drop trigger if exists validate_cleaning_delivery_order_before_insert on public.cleaning_deliveries;
create trigger validate_cleaning_delivery_order_before_insert
before insert on public.cleaning_deliveries
for each row execute function public.validate_cleaning_delivery_order();
