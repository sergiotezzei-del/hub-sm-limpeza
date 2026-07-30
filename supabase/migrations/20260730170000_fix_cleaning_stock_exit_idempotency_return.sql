create or replace function public.register_cleaning_stock_exit(
  p_product_slug text,
  p_quantity numeric,
  p_user_id text,
  p_user_name text,
  p_observation text default null,
  p_source text default 'app',
  p_movement_id uuid default gen_random_uuid()
)
returns table(
  movement_id uuid,
  product_slug text,
  current_stock numeric
)
language plpgsql
set search_path to 'public'
as $function$
declare
  selected_product public.products%rowtype;
  existing_product_slug text;
  existing_current_stock numeric;
  inserted_movement_id uuid;
  updated_stock numeric;
  safe_movement_id uuid;
  available_stock numeric;
begin
  if p_product_slug is null or btrim(p_product_slug) = '' then
    raise exception 'Produto invalido';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade invalida';
  end if;

  safe_movement_id := coalesce(p_movement_id, gen_random_uuid());

  select stock_movements.product_slug
    into existing_product_slug
    from public.stock_movements
   where stock_movements.id = safe_movement_id;

  if found then
    select coalesce(products.current_stock, 0)
      into existing_current_stock
      from public.products
     where products.slug = existing_product_slug;

    movement_id := safe_movement_id;
    product_slug := existing_product_slug;
    current_stock := coalesce(existing_current_stock, 0);
    return next;
    return;
  end if;

  select *
    into selected_product
    from public.products
   where slug = p_product_slug
     and category_slug = 'limpeza'
     and active = true
   for update;

  if not found then
    raise exception 'Produto de limpeza nao encontrado';
  end if;

  available_stock := coalesce(selected_product.current_stock, 0);

  if p_quantity > available_stock then
    raise exception 'Estoque insuficiente. Disponivel: % %', available_stock, selected_product.unit;
  end if;

  insert into public.stock_movements (
    id,
    product_slug,
    product_name,
    unit,
    barcode,
    movement_type,
    quantity,
    user_id,
    user_name,
    observation,
    source
  )
  values (
    safe_movement_id,
    selected_product.slug,
    selected_product.name,
    selected_product.unit,
    selected_product.barcode,
    'saida',
    p_quantity,
    p_user_id,
    p_user_name,
    nullif(btrim(coalesce(p_observation, '')), ''),
    coalesce(nullif(btrim(p_source), ''), 'app')
  )
  on conflict (id) do nothing
  returning id into inserted_movement_id;

  if inserted_movement_id is null then
    movement_id := safe_movement_id;
    product_slug := selected_product.slug;
    current_stock := selected_product.current_stock;
    return next;
    return;
  end if;

  update public.products as product
     set current_stock = coalesce(product.current_stock, 0) - p_quantity,
         updated_at = now()
   where product.slug = selected_product.slug
  returning product.current_stock into updated_stock;

  movement_id := inserted_movement_id;
  product_slug := selected_product.slug;
  current_stock := updated_stock;
  return next;
end;
$function$;

revoke all on function public.register_cleaning_stock_exit(text, numeric, text, text, text, text, uuid) from public;
grant execute on function public.register_cleaning_stock_exit(text, numeric, text, text, text, text, uuid) to anon;
grant execute on function public.register_cleaning_stock_exit(text, numeric, text, text, text, text, uuid) to authenticated;
