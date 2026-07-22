-- Conferência de entrega da Limpeza.
-- Registra a contagem física anterior, a quantidade recebida e a entrada no estoque em uma única transação.

create table if not exists public.cleaning_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  received_at timestamptz not null default now(),
  received_by_id text not null,
  received_by_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cleaning_delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.cleaning_deliveries(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_slug text not null references public.products(slug),
  product_name text not null,
  unit text not null,
  ordered_quantity numeric not null check (ordered_quantity >= 0),
  pre_stock_quantity numeric not null check (pre_stock_quantity >= 0),
  system_stock_before numeric not null,
  adjustment_quantity numeric not null,
  received_quantity numeric not null check (received_quantity >= 0),
  final_stock_quantity numeric not null check (final_stock_quantity >= 0),
  observation text,
  created_at timestamptz not null default now(),
  unique (delivery_id, order_item_id)
);

create index if not exists cleaning_deliveries_order_id_idx
  on public.cleaning_deliveries(order_id);
create index if not exists cleaning_deliveries_received_at_idx
  on public.cleaning_deliveries(received_at desc);
create index if not exists cleaning_delivery_items_delivery_id_idx
  on public.cleaning_delivery_items(delivery_id);
create index if not exists cleaning_delivery_items_order_item_id_idx
  on public.cleaning_delivery_items(order_item_id);

alter table public.cleaning_deliveries enable row level security;
alter table public.cleaning_delivery_items enable row level security;

grant select, insert on table public.cleaning_deliveries to anon, authenticated, service_role;
grant select, insert on table public.cleaning_delivery_items to anon, authenticated, service_role;

 drop policy if exists cleaning_deliveries_read on public.cleaning_deliveries;
create policy cleaning_deliveries_read
  on public.cleaning_deliveries
  for select
  to anon, authenticated
  using (true);

 drop policy if exists cleaning_deliveries_insert on public.cleaning_deliveries;
create policy cleaning_deliveries_insert
  on public.cleaning_deliveries
  for insert
  to anon, authenticated
  with check (true);

 drop policy if exists cleaning_delivery_items_read on public.cleaning_delivery_items;
create policy cleaning_delivery_items_read
  on public.cleaning_delivery_items
  for select
  to anon, authenticated
  using (true);

 drop policy if exists cleaning_delivery_items_insert on public.cleaning_delivery_items;
create policy cleaning_delivery_items_insert
  on public.cleaning_delivery_items
  for insert
  to anon, authenticated
  with check (true);

create or replace function public.register_cleaning_delivery(
  p_delivery_id uuid,
  p_order_id uuid,
  p_received_by_id text,
  p_received_by_name text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_order_item_id uuid;
  v_product_slug text;
  v_ordered_quantity numeric;
  v_pre_stock_quantity numeric;
  v_received_quantity numeric;
  v_observation text;
  v_product public.products%rowtype;
  v_system_stock_before numeric;
  v_adjustment_quantity numeric;
  v_final_stock_quantity numeric;
  v_inserted integer;
  v_item_count integer := 0;
  v_seen_slugs text[] := array[]::text[];
begin
  if p_delivery_id is null or p_order_id is null then
    raise exception 'Entrega e pedido são obrigatórios.';
  end if;
  if nullif(trim(p_received_by_id), '') is null or nullif(trim(p_received_by_name), '') is null then
    raise exception 'Informe quem recebeu e conferiu a mercadoria.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe os itens recebidos.';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then
    raise exception 'Pedido não encontrado ou excluído.';
  end if;

  insert into public.cleaning_deliveries (
    id, order_id, received_by_id, received_by_name, notes
  ) values (
    p_delivery_id, p_order_id, trim(p_received_by_id), trim(p_received_by_name), nullif(trim(p_notes), '')
  )
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return p_delivery_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_count := v_item_count + 1;
    v_order_item_id := nullif(v_item->>'order_item_id', '')::uuid;
    v_product_slug := nullif(trim(v_item->>'product_slug'), '');
    v_ordered_quantity := (v_item->>'ordered_quantity')::numeric;
    v_pre_stock_quantity := (v_item->>'pre_stock_quantity')::numeric;
    v_received_quantity := (v_item->>'received_quantity')::numeric;
    v_observation := nullif(trim(v_item->>'observation'), '');

    if v_order_item_id is null or not exists (
      select 1 from public.order_items
      where id = v_order_item_id and order_id = p_order_id
    ) then
      raise exception 'Item do pedido inválido.';
    end if;
    if v_product_slug is null then
      raise exception 'Selecione o produto do estoque para todos os itens.';
    end if;
    if v_product_slug = any(v_seen_slugs) then
      raise exception 'O produto % foi informado mais de uma vez na mesma entrega.', v_product_slug;
    end if;
    v_seen_slugs := array_append(v_seen_slugs, v_product_slug);
    if v_ordered_quantity < 0 or v_pre_stock_quantity < 0 or v_received_quantity < 0 then
      raise exception 'As quantidades não podem ser negativas.';
    end if;

    select * into v_product
    from public.products
    where slug = v_product_slug
      and category_slug = 'limpeza'
      and active = true
    for update;

    if not found then
      raise exception 'Produto % não encontrado no estoque da Limpeza.', v_product_slug;
    end if;

    v_system_stock_before := coalesce(v_product.current_stock, 0);
    v_adjustment_quantity := v_pre_stock_quantity - v_system_stock_before;
    v_final_stock_quantity := v_pre_stock_quantity + v_received_quantity;

    insert into public.cleaning_delivery_items (
      delivery_id,
      order_item_id,
      product_slug,
      product_name,
      unit,
      ordered_quantity,
      pre_stock_quantity,
      system_stock_before,
      adjustment_quantity,
      received_quantity,
      final_stock_quantity,
      observation
    ) values (
      p_delivery_id,
      v_order_item_id,
      v_product.slug,
      v_product.name,
      v_product.unit,
      v_ordered_quantity,
      v_pre_stock_quantity,
      v_system_stock_before,
      v_adjustment_quantity,
      v_received_quantity,
      v_final_stock_quantity,
      v_observation
    );

    update public.products
    set current_stock = v_final_stock_quantity,
        updated_at = now()
    where slug = v_product.slug;

    if v_adjustment_quantity <> 0 then
      insert into public.stock_movements (
        product_slug, product_name, unit, barcode, movement_type, quantity,
        user_id, user_name, observation, source
      ) values (
        v_product.slug,
        v_product.name,
        v_product.unit,
        v_product.barcode,
        'ajuste',
        v_adjustment_quantity,
        trim(p_received_by_id),
        trim(p_received_by_name),
        format(
          'Conferência de entrega: estoque do sistema %s; contagem física anterior %s. Entrega %s.',
          v_system_stock_before,
          v_pre_stock_quantity,
          p_delivery_id
        ),
        'cleaning-delivery'
      );
    end if;

    if v_received_quantity > 0 then
      insert into public.stock_movements (
        product_slug, product_name, unit, barcode, movement_type, quantity,
        user_id, user_name, observation, source
      ) values (
        v_product.slug,
        v_product.name,
        v_product.unit,
        v_product.barcode,
        'entrada',
        v_received_quantity,
        trim(p_received_by_id),
        trim(p_received_by_name),
        concat_ws(' — ', 'Entrada por conferência de entrega', v_observation),
        'cleaning-delivery'
      );
    end if;
  end loop;

  if v_item_count = 0 then
    raise exception 'Nenhum item válido foi informado.';
  end if;

  return p_delivery_id;
end;
$$;

revoke all on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;

-- Inclui a tela visível no Mapa Mestre sem criar quadro para rotinas internas.
do $$
declare
  v_map_id uuid;
  v_cleaning_id uuid;
  v_delivery_node_id uuid;
  v_orders_id uuid;
  v_stock_id uuid;
  v_history_id uuid;
  v_is_new boolean := false;
begin
  select id into v_map_id from public.hub_maps where slug = 'hub-sm-geral' and is_active limit 1;
  select id into v_cleaning_id from public.hub_map_nodes where map_id = v_map_id and module_key = 'limpeza' and is_active limit 1;
  if v_map_id is null or v_cleaning_id is null then
    return;
  end if;

  select id into v_delivery_node_id
  from public.hub_map_nodes
  where map_id = v_map_id and module_key = 'limpeza-conferencia-entrega'
  limit 1;

  if v_delivery_node_id is null then
    v_delivery_node_id := gen_random_uuid();
    v_is_new := true;
  end if;

  if v_is_new then
    update public.hub_map_nodes
    set metadata = jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{outlineOrder}',
          to_jsonb(coalesce((metadata->>'outlineOrder')::integer, 0) + 1),
          true
        ),
        updated_at = now()
    where map_id = v_map_id
      and is_active
      and metadata->>'parentId' = v_cleaning_id::text
      and coalesce((metadata->>'outlineOrder')::integer, 0) >= 2;
  end if;

  insert into public.hub_map_nodes (
    id, map_id, title, description, node_type, icon_key, module_key, status,
    target_screen, destination_type, position_x, position_y,
    is_collapsed, is_active, metadata
  ) values (
    v_delivery_node_id,
    v_map_id,
    'Conferência de Entrega',
    'Tela para selecionar o pedido recebido, registrar o estoque físico anterior, conferir a entrega e dar entrada no estoque.',
    'submodule',
    'stock',
    'limpeza-conferencia-entrega',
    'COMPLETED',
    null,
    'NONE',
    -1350,
    -430,
    false,
    true,
    jsonb_build_object(
      'parentId', v_cleaning_id::text,
      'outlineOrder', 2,
      'cardKind', 'SCREEN',
      'screenKey', 'cleaning-delivery',
      'actions', jsonb_build_array(
        jsonb_build_object('id','selecionar-pedido','label','Selecionar pedido recebido','actionType','OPEN_SCREEN','description','Carrega os itens de um pedido marcado como Pedido feito.'),
        jsonb_build_object('id','registrar-contagem-anterior','label','Concluir contagem anterior','actionType','CREATE_RECORD','description','Exige a contagem física sem incluir a mercadoria recém-chegada.'),
        jsonb_build_object('id','confirmar-entrega','label','Confirmar entrega e dar entrada','actionType','UPDATE_DATA','description','Ajusta o saldo pela contagem anterior, registra a entrada e salva o histórico da entrega.')
      )
    )
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    node_type = excluded.node_type,
    icon_key = excluded.icon_key,
    module_key = excluded.module_key,
    status = excluded.status,
    target_screen = excluded.target_screen,
    destination_type = excluded.destination_type,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    is_active = true,
    metadata = excluded.metadata,
    updated_at = now();

  delete from public.hub_map_edges
  where map_id = v_map_id and relation_type = 'BELONGS_TO' and target_node_id = v_delivery_node_id;
  insert into public.hub_map_edges (
    id, map_id, source_node_id, target_node_id, relation_type, is_active, metadata
  ) values (
    gen_random_uuid(), v_map_id, v_cleaning_id, v_delivery_node_id, 'BELONGS_TO', true, '{}'::jsonb
  );

  select id into v_orders_id from public.hub_map_nodes where map_id = v_map_id and module_key = 'limpeza-pedidos-sinval' and is_active limit 1;
  select id into v_stock_id from public.hub_map_nodes where map_id = v_map_id and module_key = 'limpeza-estoque-atual' and is_active limit 1;
  select id into v_history_id from public.hub_map_nodes where map_id = v_map_id and module_key = 'limpeza-historico-saidas' and is_active limit 1;

  delete from public.hub_map_edges
  where map_id = v_map_id and source_node_id = v_delivery_node_id and relation_type <> 'BELONGS_TO';

  if v_orders_id is not null then
    insert into public.hub_map_edges (id,map_id,source_node_id,target_node_id,relation_type,label,is_active,metadata)
    values (gen_random_uuid(),v_map_id,v_delivery_node_id,v_orders_id,'DEPENDS_ON','usa pedido marcado como feito',true,'{}'::jsonb);
  end if;
  if v_stock_id is not null then
    insert into public.hub_map_edges (id,map_id,source_node_id,target_node_id,relation_type,label,is_active,metadata)
    values (gen_random_uuid(),v_map_id,v_delivery_node_id,v_stock_id,'TRIGGERS','atualiza o estoque após a conferência',true,'{}'::jsonb);
  end if;
  if v_history_id is not null then
    insert into public.hub_map_edges (id,map_id,source_node_id,target_node_id,relation_type,label,is_active,metadata)
    values (gen_random_uuid(),v_map_id,v_delivery_node_id,v_history_id,'TRIGGERS','gera ajuste e entrada no histórico',true,'{}'::jsonb);
  end if;
end;
$$;
