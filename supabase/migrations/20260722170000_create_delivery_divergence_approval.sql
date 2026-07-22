-- Fluxo de recebimento de mercadoria com conferencia previa de estoque e aprovacao de divergencia.
-- A validade da conferencia e operacional: precisa ser a mais recente, do dia atual em America/Sao_Paulo,
-- completa para todos os produtos ativos da Limpeza e ainda nao consumida por outra entrega.

create or replace function public.cleaning_delivery_normalize_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$$;

revoke all on function public.cleaning_delivery_normalize_name(text) from public;

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
create index if not exists cleaning_delivery_approvals_requester_order_idx
  on public.cleaning_delivery_approvals(requested_by_id, order_id, requested_at desc);
create index if not exists cleaning_delivery_approvals_stock_check_idx
  on public.cleaning_delivery_approvals(stock_check_id);
create index if not exists cleaning_delivery_approvals_pending_supervisor_idx
  on public.cleaning_delivery_approvals(supervisor_id, requested_at desc)
  where status = 'pending';
create index if not exists cleaning_deliveries_stock_check_idx
  on public.cleaning_deliveries(stock_check_id);
create index if not exists cleaning_deliveries_approval_idx
  on public.cleaning_deliveries(approval_id);
create unique index if not exists cleaning_deliveries_stock_check_unique_idx
  on public.cleaning_deliveries(stock_check_id)
  where stock_check_id is not null;

drop trigger if exists cleaning_delivery_approvals_updated_at on public.cleaning_delivery_approvals;
create trigger cleaning_delivery_approvals_updated_at
before update on public.cleaning_delivery_approvals
for each row
execute function public.set_hub_master_map_updated_at();

alter table public.cleaning_delivery_approvals enable row level security;

revoke all on table public.cleaning_delivery_approvals from anon, authenticated;
grant select on table public.cleaning_delivery_approvals to authenticated;
grant all on table public.cleaning_delivery_approvals to service_role;

revoke insert, update, delete on table public.cleaning_deliveries from anon, authenticated;
revoke insert, update, delete on table public.cleaning_delivery_items from anon, authenticated;

drop policy if exists cleaning_delivery_approvals_read on public.cleaning_delivery_approvals;
drop policy if exists cleaning_delivery_approvals_insert on public.cleaning_delivery_approvals;
drop policy if exists cleaning_delivery_approvals_admin_update on public.cleaning_delivery_approvals;
create policy cleaning_delivery_approvals_admin_read
  on public.cleaning_delivery_approvals
  for select
  to authenticated
  using (public.is_hub_master_map_admin());

drop policy if exists cleaning_deliveries_insert on public.cleaning_deliveries;
drop policy if exists cleaning_delivery_items_insert on public.cleaning_delivery_items;

create or replace function public.validate_cleaning_delivery_stock_check(p_stock_check_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock_check public.stock_checks%rowtype;
  v_latest_stock_check_id uuid;
  v_effective_stock_check_id uuid;
  v_missing_products jsonb := '[]'::jsonb;
begin
  select id
    into v_latest_stock_check_id
  from public.stock_checks
  order by created_at desc, id desc
  limit 1;

  v_effective_stock_check_id := coalesce(p_stock_check_id, v_latest_stock_check_id);

  if v_effective_stock_check_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Faca a Conferencia de Estoque antes de receber a mercadoria.',
      'missing_products', '[]'::jsonb
    );
  end if;

  select *
    into v_stock_check
  from public.stock_checks
  where id = v_effective_stock_check_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'stock_check_id', v_effective_stock_check_id,
      'message', 'A Conferencia de Estoque informada nao foi encontrada.',
      'missing_products', '[]'::jsonb
    );
  end if;

  if v_effective_stock_check_id is distinct from v_latest_stock_check_id then
    return jsonb_build_object(
      'ok', false,
      'stock_check_id', v_stock_check.id,
      'data', v_stock_check.data,
      'hora', v_stock_check.hora,
      'created_at', v_stock_check.created_at,
      'message', 'A Conferencia de Estoque precisa ser a mais recente. Faca uma nova contagem antes desta entrega.',
      'missing_products', '[]'::jsonb
    );
  end if;

  if (v_stock_check.created_at at time zone 'America/Sao_Paulo')::date
     <> (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object(
      'ok', false,
      'stock_check_id', v_stock_check.id,
      'data', v_stock_check.data,
      'hora', v_stock_check.hora,
      'created_at', v_stock_check.created_at,
      'message', 'A Conferencia de Estoque encontrada nao e do dia operacional atual. Faca uma nova contagem antes desta entrega.',
      'missing_products', '[]'::jsonb
    );
  end if;

  if exists (
    select 1
    from public.cleaning_deliveries cd
    where cd.stock_check_id = v_stock_check.id
  ) then
    return jsonb_build_object(
      'ok', false,
      'stock_check_id', v_stock_check.id,
      'data', v_stock_check.data,
      'hora', v_stock_check.hora,
      'created_at', v_stock_check.created_at,
      'message', 'Esta Conferencia de Estoque ja foi usada em uma entrega. Faca uma nova contagem para a proxima entrada.',
      'missing_products', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
    into v_missing_products
  from public.products p
  where p.category_slug = 'limpeza'
    and p.active = true
    and not exists (
      select 1
      from public.stock_check_items sci
      where sci.stock_check_id = v_stock_check.id
        and public.cleaning_delivery_normalize_name(sci.product_name) = public.cleaning_delivery_normalize_name(p.name)
    );

  if jsonb_array_length(v_missing_products) > 0 then
    return jsonb_build_object(
      'ok', false,
      'stock_check_id', v_stock_check.id,
      'data', v_stock_check.data,
      'hora', v_stock_check.hora,
      'created_at', v_stock_check.created_at,
      'message', 'A Conferencia de Estoque esta incompleta. Conte todos os produtos, usando 0 quando estiver zerado.',
      'missing_products', v_missing_products
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'stock_check_id', v_stock_check.id,
    'data', v_stock_check.data,
    'hora', v_stock_check.hora,
    'created_at', v_stock_check.created_at,
    'message', 'Conferencia de Estoque valida para esta entrega.',
    'missing_products', '[]'::jsonb
  );
end;
$$;

revoke all on function public.validate_cleaning_delivery_stock_check(uuid) from public;
grant execute on function public.validate_cleaning_delivery_stock_check(uuid) to anon, authenticated, service_role;

create or replace function public.assert_cleaning_delivery_stock_check_ready(p_stock_check_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
begin
  v_validation := public.validate_cleaning_delivery_stock_check(p_stock_check_id);
  if coalesce((v_validation->>'ok')::boolean, false) is not true then
    raise exception '%', coalesce(v_validation->>'message', 'A Conferencia de Estoque nao esta valida para recebimento.');
  end if;
end;
$$;

revoke all on function public.assert_cleaning_delivery_stock_check_ready(uuid) from public;

create or replace function public.list_cleaning_delivery_approvals(
  p_requester_id text default null,
  p_pending_supervisor_id text default null,
  p_order_id uuid default null
)
returns table (
  id uuid,
  order_id uuid,
  stock_check_id uuid,
  requested_by_id text,
  requested_by_name text,
  supervisor_id text,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  decided_by_name text,
  decision_note text,
  items jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(coalesce(p_pending_supervisor_id, '')), '') is not null then
    if auth.uid() is null or not public.is_hub_master_map_admin() then
      raise exception 'Somente o Admin Tezzei pode consultar liberacoes pendentes.';
    end if;

    return query
    select a.id, a.order_id, a.stock_check_id, a.requested_by_id, a.requested_by_name,
           a.supervisor_id, a.status, a.requested_at, a.decided_at,
           a.decided_by_name, a.decision_note, a.items
    from public.cleaning_delivery_approvals a
    where a.supervisor_id = trim(p_pending_supervisor_id)
      and a.status = 'pending'
    order by a.requested_at desc
    limit 100;
    return;
  end if;

  if nullif(trim(coalesce(p_requester_id, '')), '') is null or p_order_id is null then
    raise exception 'Informe os filtros da liberacao.';
  end if;

  return query
  select a.id, a.order_id, a.stock_check_id, a.requested_by_id, a.requested_by_name,
         a.supervisor_id, a.status, a.requested_at, a.decided_at,
         a.decided_by_name, a.decision_note, a.items
  from public.cleaning_delivery_approvals a
  where a.requested_by_id = trim(p_requester_id)
    and a.order_id = p_order_id
  order by a.requested_at desc
  limit 20;
end;
$$;

revoke all on function public.list_cleaning_delivery_approvals(text, text, uuid) from public;
grant execute on function public.list_cleaning_delivery_approvals(text, text, uuid) to anon, authenticated, service_role;

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
security definer
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
  v_pending_count integer;
  v_seen_items uuid[] := array[]::uuid[];
begin
  if p_request_id is null or p_order_id is null or p_stock_check_id is null then
    raise exception 'Pedido, Conferencia de Estoque e solicitacao sao obrigatorios.';
  end if;
  if nullif(trim(p_requested_by_id), '') is null or nullif(trim(p_requested_by_name), '') is null then
    raise exception 'Nao foi possivel identificar quem solicitou a liberacao.';
  end if;
  if nullif(trim(p_supervisor_id), '') is null then
    raise exception 'Supervisor nao informado.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe os itens recebidos.';
  end if;

  perform public.assert_cleaning_delivery_stock_check_ready(p_stock_check_id);

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.deleted_at is null
      and o.status = 'Pedido feito'
  ) then
    raise exception 'O pedido nao esta disponivel para recebimento.';
  end if;

  select count(*)
    into v_pending_count
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

    select *
      into v_order_item
    from public.order_items
    where id = nullif(v_item->>'order_item_id', '')::uuid
      and order_id = p_order_id;
    if not found then
      raise exception 'Item do pedido invalido.';
    end if;
    if v_order_item.id = any(v_seen_items) then
      raise exception 'O item % foi informado mais de uma vez.', v_order_item.product_name;
    end if;
    v_seen_items := array_append(v_seen_items, v_order_item.id);

    select *
      into v_product
    from public.products
    where slug = nullif(trim(v_item->>'product_slug'), '')
      and category_slug = 'limpeza'
      and active = true;
    if not found then
      raise exception 'Produto do estoque nao encontrado para %.', v_order_item.product_name;
    end if;
    if public.cleaning_delivery_normalize_name(v_order_item.product_name) <> public.cleaning_delivery_normalize_name(v_product.name) then
      raise exception 'O produto % nao corresponde ao cadastro de estoque informado.', v_order_item.product_name;
    end if;
    if not exists (
      select 1
      from public.stock_check_items sci
      where sci.stock_check_id = p_stock_check_id
        and public.cleaning_delivery_normalize_name(sci.product_name) = public.cleaning_delivery_normalize_name(v_product.name)
    ) then
      raise exception 'O produto % nao apareceu na Conferencia de Estoque.', v_product.name;
    end if;

    v_received := (v_item->>'received_quantity')::numeric;
    if v_received < 0 then
      raise exception 'A quantidade recebida nao pode ser negativa.';
    end if;

    select coalesce(sum(received_quantity), 0)
      into v_previous_received
    from public.cleaning_delivery_items
    where order_item_id = v_order_item.id;

    v_expected := greatest(v_order_item.quantity - v_previous_received, 0);
    if v_expected <= 0 then
      raise exception 'O item % ja foi recebido por completo.', v_order_item.product_name;
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

  if v_item_count <> v_pending_count then
    raise exception 'A solicitacao deve incluir todos os itens ainda pendentes do pedido.';
  end if;
  if not v_has_divergence then
    raise exception 'As quantidades conferem. A entrega nao precisa de liberacao.';
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
security definer
set search_path = public, pg_temp
as $$
declare
  v_decided_id uuid;
begin
  if auth.uid() is null or not public.is_hub_master_map_admin() then
    raise exception 'Somente o supervisor autorizado pode liberar esta entrega.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decisao invalida.';
  end if;
  if nullif(trim(p_supervisor_name), '') is null then
    raise exception 'Supervisor nao identificado.';
  end if;

  update public.cleaning_delivery_approvals
  set status = p_decision,
      decided_at = now(),
      decided_by_auth_user = auth.uid(),
      decided_by_name = trim(p_supervisor_name),
      decision_note = nullif(trim(p_note), ''),
      updated_at = now()
  where id = p_request_id
    and status = 'pending'
  returning id into v_decided_id;

  if v_decided_id is null then
    raise exception 'Solicitacao nao encontrada ou ja decidida.';
  end if;

  return v_decided_id;
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
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_order public.orders%rowtype;
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
  v_existing_id uuid;
begin
  if p_delivery_id is null or p_order_id is null or p_stock_check_id is null then
    raise exception 'Entrega, pedido e Conferencia de Estoque sao obrigatorios.';
  end if;
  if nullif(trim(p_received_by_id), '') is null or nullif(trim(p_received_by_name), '') is null then
    raise exception 'Nao foi possivel identificar quem recebeu o pedido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe os itens recebidos.';
  end if;

  select id
    into v_existing_id
  from public.cleaning_deliveries
  where id = p_delivery_id;
  if v_existing_id is not null then
    return p_delivery_id;
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
    and deleted_at is null
    and status = 'Pedido feito'
  for update;
  if not found then
    raise exception 'O pedido nao esta disponivel para recebimento.';
  end if;

  perform 1
  from public.stock_checks
  where id = p_stock_check_id
  for update;
  if not found then
    raise exception 'A Conferencia de Estoque informada nao foi encontrada.';
  end if;

  perform public.assert_cleaning_delivery_stock_check_ready(p_stock_check_id);

  perform 1
  from public.cleaning_deliveries
  where stock_check_id = p_stock_check_id
  for update;
  if found then
    raise exception 'Esta Conferencia de Estoque ja foi usada em uma entrega. Faca uma nova contagem para a proxima entrada.';
  end if;

  select count(*)
    into v_pending_count
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

    select *
      into v_order_item
    from public.order_items
    where id = nullif(v_item->>'order_item_id', '')::uuid
      and order_id = p_order_id;
    if not found then
      raise exception 'Item do pedido invalido.';
    end if;
    if v_order_item.id = any(v_seen_items) then
      raise exception 'O item % foi informado mais de uma vez.', v_order_item.product_name;
    end if;
    v_seen_items := array_append(v_seen_items, v_order_item.id);

    select *
      into v_product
    from public.products
    where slug = nullif(trim(v_item->>'product_slug'), '')
      and category_slug = 'limpeza'
      and active = true;
    if not found then
      raise exception 'Produto do estoque nao encontrado para %.', v_order_item.product_name;
    end if;
    if public.cleaning_delivery_normalize_name(v_order_item.product_name) <> public.cleaning_delivery_normalize_name(v_product.name) then
      raise exception 'O produto % nao corresponde ao cadastro de estoque informado.', v_order_item.product_name;
    end if;

    v_received := (v_item->>'received_quantity')::numeric;
    if v_received < 0 then
      raise exception 'A quantidade recebida nao pode ser negativa.';
    end if;

    select coalesce(sum(received_quantity), 0)
      into v_previous_received
    from public.cleaning_delivery_items
    where order_item_id = v_order_item.id;

    v_expected := greatest(v_order_item.quantity - v_previous_received, 0);
    if v_expected <= 0 then
      raise exception 'O item % ja foi recebido por completo.', v_order_item.product_name;
    end if;
    if v_received <> v_expected then
      v_has_divergence := true;
    end if;

    select sci.quantity
      into v_pre_stock
    from public.stock_check_items sci
    where sci.stock_check_id = p_stock_check_id
      and public.cleaning_delivery_normalize_name(sci.product_name) = public.cleaning_delivery_normalize_name(v_product.name)
    limit 1;
    if not found then
      raise exception 'O produto % nao apareceu na Conferencia de Estoque. Produto ausente nao pode virar zero automaticamente.', v_product.name;
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
    raise exception 'A conferencia deve incluir todos os itens ainda pendentes do pedido.';
  end if;

  if v_has_divergence then
    if p_approval_id is null then
      raise exception 'A entrega divergente precisa da liberacao do supervisor.';
    end if;

    select a.items
      into v_approval_items
    from public.cleaning_delivery_approvals a
    where a.id = p_approval_id
      and a.order_id = p_order_id
      and a.stock_check_id = p_stock_check_id
      and a.status = 'approved'
    for update;
    if not found then
      raise exception 'A liberacao do supervisor nao esta valida.';
    end if;

    if jsonb_array_length(v_approval_items) <> v_item_count then
      raise exception 'As quantidades foram alteradas depois da liberacao. Solicite novamente.';
    end if;

    for v_item in select value from jsonb_array_elements(v_normalized_items)
    loop
      if not exists (
        select 1
        from jsonb_array_elements(v_approval_items) a
        where (a->>'order_item_id')::uuid = (v_item->>'order_item_id')::uuid
          and a->>'product_slug' = v_item->>'product_slug'
          and (a->>'expected_quantity')::numeric = (v_item->>'expected_quantity')::numeric
          and (a->>'received_quantity')::numeric = (v_item->>'received_quantity')::numeric
      ) then
        raise exception 'As quantidades foram alteradas depois da liberacao. Solicite novamente.';
      end if;
    end loop;
  elsif p_approval_id is not null then
    raise exception 'Esta entrega nao possui divergencia e nao precisa de liberacao.';
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
    select *
      into v_product_locked
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
        format('Ajuste conforme Conferencia de Estoque %s antes da entrega %s.', p_stock_check_id, p_delivery_id),
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
        concat_ws(' - ', 'Entrada por pedido recebido', nullif(v_item->>'observation', '')),
        'cleaning-delivery'
      );
    end if;
  end loop;

  if v_has_divergence then
    update public.cleaning_delivery_approvals
    set status = 'used', updated_at = now()
    where id = p_approval_id
      and status = 'approved'
    returning id into v_existing_id;
    if v_existing_id is null then
      raise exception 'A liberacao ja foi usada ou deixou de estar valida.';
    end if;
  end if;

  return p_delivery_id;
end;
$$;

revoke all on function public.register_cleaning_delivery_v2(uuid, uuid, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.register_cleaning_delivery_v2(uuid, uuid, uuid, uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;

-- Impede que a funcao antiga seja usada para contornar a aprovacao.
revoke execute on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  from anon, authenticated;
grant execute on function public.register_cleaning_delivery(uuid, uuid, text, text, text, jsonb)
  to service_role;

-- Atualiza a documentacao funcional do quadro no Mapa Mestre.
update public.hub_map_nodes
set description = 'Tela para confirmar a conferencia previa do estoque, selecionar o pedido recebido, conferir as quantidades e solicitar liberacao quando houver divergencia.',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{actions}',
      jsonb_build_array(
        jsonb_build_object('id','validar-estoque','label','Validar conferencia do estoque','actionType','VALIDATE','description','Antes de abrir a entrega, confirma se o estoque foi contado sem incluir a mercadoria nova.'),
        jsonb_build_object('id','selecionar-pedido','label','Selecionar pedido recebido','actionType','OPEN_SCREEN','description','Carrega todos os produtos e preenche as quantidades conforme o pedido.'),
        jsonb_build_object('id','registrar-divergencia','label','Pedido com divergencia','actionType','REQUEST_APPROVAL','description','Envia uma solicitacao interna ao supervisor e bloqueia a confirmacao.'),
        jsonb_build_object('id','liberar-divergencia','label','Liberar entrega divergente','actionType','APPROVE','description','O supervisor confere as diferencas e libera ou recusa a conclusao.'),
        jsonb_build_object('id','confirmar-entrega','label','Confirmar entrega','actionType','UPDATE_DATA','description','Atualiza o estoque usando a conferencia anterior e grava o historico de pedidos recebidos.')
      ),
      true
    ),
    updated_at = now()
where module_key = 'limpeza-conferencia-entrega'
  and is_active;
