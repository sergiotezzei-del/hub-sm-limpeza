-- Fluxo de recebimento de mercadoria com conferência prévia de estoque e aprovação de divergência.
-- A tela não recebe mais a contagem anterior manualmente: usa a última conferência de estoque registrada.

alter table public.cleaning_deliveries
  add column if not exists stock_check_id uuid references public.stock_checks(id) on delete restrict,
  add column if not exists approval_id uuid,
  add column if not exists has_divergence boolean not null default false;

create table if not exists public.cleaning_delivery_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stock_check_id uuid not null references public.stock_checks(id) on delete restrict,
  requested_by_id text not null,
  requested_by_name text not null,
  supervisor_id text not null default 'tezzei',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','used')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_auth_user uuid,
  decided_by_name text,
  decision_note text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cleaning_deliveries
  drop constraint if exists cleaning_deliveries_approval_id_fkey;
alter table public.cleaning_deliveries
  add constraint cleaning_deliveries_approval_id_fkey
  foreign key (approval_id) references public.cleaning_delivery_approvals(id) on delete restrict;

create index if not exists cleaning_delivery_approvals_order_idx
  on public.cleaning_delivery_approvals(order_id, requested_at desc);
create index if not exists cleaning_delivery_approvals_pending_supervisor_idx
  on public.cleaning_delivery_approvals(supervisor_id, requested_at desc)
  where status = 'pending';
create index if not exists cleaning_deliveries_stock_check_idx
  on public.cleaning_deliveries(stock_check_id);

alter table public.cleaning_delivery_approvals enable row level security;

grant select, insert on table public.cleaning_delivery_approvals to anon, authenticated, service_role;
grant update on table public.cleaning_delivery_approvals to authenticated, service_role;

 drop policy if exists cleaning_delivery_approvals_read on public.cleaning_delivery_approvals;
create policy cleaning_delivery_approvals_read
  on public.cleaning_delivery_approvals
  for select
  to anon, authenticated
  using (true);

 drop policy if exists cleaning_delivery_approvals_insert on public.cleaning_delivery_approvals;
create policy cleaning_delivery_approvals_insert
  on public.cleaning_delivery_approvals
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and decided_at is null
    and decided_by_auth_user is null
    and decided_by_name is null
  );

 drop policy if exists cleaning_delivery_approvals_admin_update on public.cleaning_delivery_approvals;
create policy cleaning_delivery_approvals_admin_update
  on public.cleaning_delivery_approvals
  for update
  to authenticated
  using (public.is_hub_master_map_admin())
  with check (public.is_hub_master_map_admin());

create or replace function public.request_cleaning_delivery_approval(
  p_request_id uuid,
  p_order_id uuid,
  p_stock_check_id uuid,
  p_requested_by_id text,
  p_requested_by_name text,
  p_supervisor_id text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_order_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_received numeric;
  v_expected numeric;
  v_previous_received numeric;
  v_has_divergence boolean := false;
  v_normalized_items jsonb := '[]'::jsonb;
  v_item_count integer := 0;
  v_seen_items uuid[] := array[]::uuid[];
begin
  if p_request_id is null or p_order_id is null or p_stock_check_id is null then
    raise exception 'Pedido, conferência de estoque e solicitação são obrigatórios.';
  end if;
  if nullif(trim(p_requested_by_id), '') is null or nullif(trim(p_requested_by_name), '') is null then
    raise exception 'Não foi possível identificar quem solicitou a liberação.';
  end if;
  if nullif(trim(p_supervisor_id), '') is null then
    raise exception 'Supervisor não informado.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe os itens recebidos.';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id and deleted_at is null and status = 'Pedido feito'
  ) then
    raise exception 'O pedido não está disponível para recebimento.';
  end if;
  if p_stock_check_id is distinct from (
    select id from public.stock_checks order by created_at desc limit 1
  ) then
    raise exception 'A conferência de estoque informada não é a mais recente.';
  end if;
  if not exists (
    select 1 from public.stock_checks
    where id = p_stock_check_id and created_at >= now() - interval '24 hours'
  ) then
    raise exception 'Faça uma nova conferência de estoque antes de receber o pedido.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_count := v_item_count + 1;
    select * into v_order_item
    from public.order_items
    where id = nullif(v_item->>'order_item_id', '')::uuid
      and order_id = p_order_id;
    if not found then
      raise exception 'Item do pedido inválido.';
    end if;
    if v_order_item.id = any(v_seen_items) then
      raise exception 'O item % foi informado mais de uma vez.', v_order_item.product_name;
    end if;
    v_seen_items := array_append(v_seen_items, v_order_item.id);

    select * into v_product
    from public.products
    where slug = nullif(trim(v_item->>'product_slug'), '')
      and category_slug = 'limpeza'
      and active = true;
    if not found then
      raise exception 'Produto do estoque não encontrado para %.', v_order_item.product_name;
    end if;

    v_received := (v_item->>'received_quantity')::numeric;
    if v_received < 0 then
      raise exception 'A quantidade recebida não pode ser negativa.';
    end if;
    select coalesce(sum(received_quantity), 0)
      into v_previous_received
    from public.cleaning_delivery_items
    where order_item_id = v_order_item.id;
    v_expected := greatest(v_order_item.quantity - v_previous_received, 0);
    if v_expected <= 0 then
      raise exception 'O item % já foi recebido por completo.', v_order_item.product_name;
    end if;
    if v_received <> v_expected then
      v_has_divergence := true;
    end if;

    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'order_item_id', v_order_item.id,
      'product_slug', v_product.slug,
      'product_name', v_product.name,
      'unit', v_product.unit,
      'expected_quantity', v_expected,
      'received_quantity', v_received
    ));
  end loop;

  if not v_has_divergence then
    raise exception 'As quantidades conferem. A entrega não precisa de liberação.';
  end if;

  insert into public.cleaning_delivery_approvals (
    id, order_id, stock_check_id, requested_by_id, requested_by_name,
    supervisor_id, status, items
  ) values (
    p_request_id, p_order_id, p_stock_check_id, trim(p_requested_by_id), trim(p_requested_by_name),
    trim(p_supervisor_id), 'pending', v_normalized_items
  );

  return p_request_id;
end;
$$;

revoke all on function public.request_cleaning_delivery_approval(uuid, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.request_cleaning_delivery_approval(uuid, uuid, uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;

create or replace function public.decide_cleaning_delivery_approval(
  p_request_id uuid,
  p_decision text,
  p_supervisor_name text,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_hub_master_map_admin() then
    raise exception 'Somente o supervisor autorizado pode liberar esta entrega.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decisão inválida.';
  end if;
  if nullif(trim(p_supervisor_name), '') is null then
    raise exception 'Supervisor não identificado.';
  end if;

  update public.cleaning_delivery_approvals
  set status = p_decision,
      decided_at = now(),
      decided_by_auth_user = auth.uid(),
      decided_by_name = trim(p_supervisor_name),
      decision_note = nullif(trim(p_note), ''),
      updated_at = now()
  where id = p_request_id
    and status = 'pending';

  if not found then
    raise exception 'Solicitação não encontrada ou já decidida.';
  end if;
  return p_request_id;
end;
$$;

revoke all on function public.decide_cleaning_delivery_approval(uuid, text, text, text) from public;
grant execute on function public.decide_cleaning_delivery_approval(uuid, text, text, text)
  to authenticated, service_role;

create or replace function public.register_cleaning_delivery_v2(
  p_delivery_id uuid,
  p_order_id uuid,
  p_stock_check_id uuid,
  p_approval_id uuid,
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
  v_order_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_product_locked public.products%rowtype;
  v_received numeric;
  v_expected numeric;
  v_previous_received numeric;
  v_pre_stock numeric;
  v_system_stock numeric;
  v_adjustment numeric;
  v_final_stock numeric;
  v_has_divergence boolean := false;
  v_normalized_items jsonb := '[]'::jsonb;
  v_approval_items jsonb;
  v_item_count integer := 0;
  v_pending_count integer;
  v_seen_items uuid[] := array[]::uuid[];
  v_inserted integer;
begin
  if p_delivery_id is null or p_order_id is null or p_stock_check_id is null then
    raise exception 'Entrega, pedido e conferência de estoque são obrigatórios.';
  end if;
  if nullif(trim(p_received_by_id), '') is null or nullif(trim(p_received_by_name), '') is null then
    raise exception 'Não foi possível identificar quem recebeu o pedido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe os itens recebidos.';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id and deleted_at is null and status = 'Pedido feito'
  ) then
    raise exception 'O pedido não está disponível para recebimento.';
  end if;
  if p_stock_check_id is distinct from (
    select id from public.stock_checks order by created_at desc limit 1
  ) then
    raise exception 'A conferência de estoque não é a mais recente. Faça uma nova contagem.';
  end if;
  if not exists (
    select 1 from public.stock_checks
    where id = p_stock_check_id and created_at >= now() - interval '24 hours'
  ) then
    raise exception 'A conferência de estoque venceu. Faça uma nova contagem.';
  end if;

  select count(*) into v_pending_count
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.quantity > coalesce((
      select sum(cdi.received_quantity)
      from public.cleaning_delivery_items cdi
      where cdi.order_item_id = oi.id
    ), 0);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_count := v_item_count + 1;
    select * into v_order_item
    from public.order_items
    where id = nullif(v_item->>'order_item_id', '')::uuid
      and order_id = p_order_id;
    if not found then
      raise exception 'Item do pedido inválido.';
    end if;
    if v_order_item.id = any(v_seen_items) then
      raise exception 'O item % foi informado mais de uma vez.', v_order_item.product_name;
    end if;
    v_seen_items := array_append(v_seen_items, v_order_item.id);

    select * into v_product
    from public.products
    where slug = nullif(trim(v_item->>'product_slug'), '')
      and category_slug = 'limpeza'
      and active = true;
    if not found then
      raise exception 'Produto do estoque não encontrado para %.', v_order_item.product_name;
    end if;

    v_received := (v_item->>'received_quantity')::numeric;
    if v_received < 0 then
      raise exception 'A quantidade recebida não pode ser negativa.';
    end if;
    select coalesce(sum(received_quantity), 0)
      into v_previous_received
    from public.cleaning_delivery_items
    where order_item_id = v_order_item.id;
    v_expected := greatest(v_order_item.quantity - v_previous_received, 0);
    if v_expected <= 0 then
      raise exception 'O item % já foi recebido por completo.', v_order_item.product_name;
    end if;
    if v_received <> v_expected then
      v_has_divergence := true;
    end if;

    select sci.quantity into v_pre_stock
    from public.stock_check_items sci
    where sci.stock_check_id = p_stock_check_id
      and lower(trim(sci.product_name)) = lower(trim(v_product.name))
    limit 1;
    if not found then
      -- A tela atual de conferência não salva linhas deixadas em branco; nesse processo elas representam estoque zero.
      v_pre_stock := 0;
    end if;

    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'order_item_id', v_order_item.id,
      'product_slug', v_product.slug,
      'product_name', v_product.name,
      'unit', v_product.unit,
      'ordered_quantity', v_order_item.quantity,
      'expected_quantity', v_expected,
      'received_quantity', v_received,
      'pre_stock_quantity', v_pre_stock,
      'observation', nullif(trim(v_item->>'observation'), '')
    ));
  end loop;

  if v_item_count <> v_pending_count then
    raise exception 'A conferência deve incluir todos os itens ainda pendentes do pedido.';
  end if;

  if v_has_divergence then
    if p_approval_id is null then
      raise exception 'A entrega divergente precisa da liberação do supervisor.';
    end if;
    select items into v_approval_items
    from public.cleaning_delivery_approvals
    where id = p_approval_id
      and order_id = p_order_id
      and stock_check_id = p_stock_check_id
      and status = 'approved';
    if not found then
      raise exception 'A liberação do supervisor não está válida.';
    end if;
    if jsonb_array_length(v_approval_items) <> v_item_count then
      raise exception 'As quantidades foram alteradas depois da liberação. Solicite novamente.';
    end if;
    for v_item in select value from jsonb_array_elements(v_normalized_items)
    loop
      if not exists (
        select 1
        from jsonb_array_elements(v_approval_items) a
        where (a->>'order_item_id')::uuid = (v_item->>'order_item_id')::uuid
          and a->>'product_slug' = v_item->>'product_slug'
          and (a->>'received_quantity')::numeric = (v_item->>'received_quantity')::numeric
      ) then
        raise exception 'As quantidades foram alteradas depois da liberação. Solicite novamente.';
      end if;
    end loop;
  elsif p_approval_id is not null then
    raise exception 'Esta entrega não possui divergência e não precisa de liberação.';
  end if;

  insert into public.cleaning_deliveries (
    id, order_id, stock_check_id, approval_id, has_divergence,
    received_by_id, received_by_name, notes
  ) values (
    p_delivery_id, p_order_id, p_stock_check_id, p_approval_id, v_has_divergence,
    trim(p_received_by_id), trim(p_received_by_name), nullif(trim(p_notes), '')
  ) on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return p_delivery_id;
  end if;

  for v_item in select value from jsonb_array_elements(v_normalized_items)
  loop
    select * into v_product_locked
    from public.products
    where slug = v_item->>'product_slug'
    for update;

    v_system_stock := coalesce(v_product_locked.current_stock, 0);
    v_pre_stock := (v_item->>'pre_stock_quantity')::numeric;
    v_received := (v_item->>'received_quantity')::numeric;
    v_adjustment := v_pre_stock - v_system_stock;
    v_final_stock := v_pre_stock + v_received;

    insert into public.cleaning_delivery_items (
      delivery_id, order_item_id, product_slug, product_name, unit,
      ordered_quantity, pre_stock_quantity, system_stock_before,
      adjustment_quantity, received_quantity, final_stock_quantity, observation
    ) values (
      p_delivery_id,
      (v_item->>'order_item_id')::uuid,
      v_product_locked.slug,
      v_product_locked.name,
      v_product_locked.unit,
      (v_item->>'ordered_quantity')::numeric,
      v_pre_stock,
      v_system_stock,
      v_adjustment,
      v_received,
      v_final_stock,
      nullif(v_item->>'observation', '')
    );

    update public.products
    set current_stock = v_final_stock,
        updated_at = now()
    where slug = v_product_locked.slug;

    if v_adjustment <> 0 then
      insert into public.stock_movements (
        product_slug, product_name, unit, barcode, movement_type, quantity,
        user_id, user_name, observation, source
      ) values (
        v_product_locked.slug, v_product_locked.name, v_product_locked.unit, v_product_locked.barcode,
        'ajuste', v_adjustment, trim(p_received_by_id), trim(p_received_by_name),
        format('Ajuste conforme conferência de estoque %s antes da entrega %s.', p_stock_check_id, p_delivery_id),
        'cleaning-delivery'
      );
    end if;

    if v_received > 0 then
      insert into public.stock_movements (
        product_slug, product_name, unit, barcode, movement_type, quantity,
        user_id, user_name, observation, source
      ) values (
        v_product_locked.slug, v_product_locked.name, v_product_locked.unit, v_product_locked.barcode,
        'entrada', v_received, trim(p_received_by_id), trim(p_received_by_name),
        concat_ws(' — ', 'Entrada por pedido recebido', nullif(v_item->>'observation', '')),
        'cleaning-delivery'
      );
    end if;
  end loop;

  if v_has_divergence then
    update public.cleaning_delivery_approvals
    set status = 'used', updated_at = now()
    where id = p_approval_id and status = 'approved';
  end if;

  return p_delivery_id;
end;
$$;

revoke all on function public.register_cleaning_delivery_v2(uuid, uuid, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.register_cleaning_delivery_v2(uuid, uuid, uuid, uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;

-- Impede que a função antiga seja usada para contornar a aprovação.
revoke execute on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  from anon, authenticated;
grant execute on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  to service_role;

-- Atualiza a documentação funcional do quadro no Mapa Mestre.
update public.hub_map_nodes
set description = 'Tela para confirmar a conferência prévia do estoque, selecionar o pedido recebido, conferir as quantidades e solicitar liberação quando houver divergência.',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{actions}',
      jsonb_build_array(
        jsonb_build_object('id','validar-estoque','label','Validar conferência do estoque','actionType','VALIDATE','description','Antes de abrir a entrega, confirma se o estoque foi contado sem incluir a mercadoria nova.'),
        jsonb_build_object('id','selecionar-pedido','label','Selecionar pedido recebido','actionType','OPEN_SCREEN','description','Carrega todos os produtos e preenche as quantidades conforme o pedido.'),
        jsonb_build_object('id','registrar-divergencia','label','Pedido com divergência','actionType','REQUEST_APPROVAL','description','Envia uma solicitação interna ao supervisor e bloqueia a confirmação.'),
        jsonb_build_object('id','liberar-divergencia','label','Liberar entrega divergente','actionType','APPROVE','description','O supervisor confere as diferenças e libera ou recusa a conclusão.'),
        jsonb_build_object('id','confirmar-entrega','label','Confirmar entrega','actionType','UPDATE_DATA','description','Atualiza o estoque usando a conferência anterior e grava o histórico de pedidos recebidos.')
      ),
      true
    ),
    updated_at = now()
where module_key = 'limpeza-conferencia-entrega'
  and is_active;
