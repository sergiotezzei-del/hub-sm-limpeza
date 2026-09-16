create or replace function public.register_uniform_stock_receipt(
  p_receipt_movement_id uuid,
  p_item_id uuid default null,
  p_item_code text default null,
  p_name text default null,
  p_description text default null,
  p_size text default null,
  p_fabric text default null,
  p_color text default null,
  p_quantity numeric default null,
  p_received_at date default null,
  p_supplier text default null,
  p_proposal_number text default null,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(item_id uuid, item_code text, total_quantity numeric, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing_movement public.patrimony_movements%rowtype;
  v_item public.patrimony_items%rowtype;
  v_space_id uuid;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_code text := upper(btrim(coalesce(p_item_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_size text := nullif(btrim(coalesce(p_size, '')), '');
  v_fabric text := nullif(btrim(coalesce(p_fabric, '')), '');
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_supplier text := nullif(btrim(coalesce(p_supplier, '')), '');
  v_proposal text := nullif(btrim(coalesce(p_proposal_number, '')), '');
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para registrar entrada de uniformes'; end if;
  if p_receipt_movement_id is null then raise exception 'Identificador da entrada obrigatorio'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_existing_movement
  from public.patrimony_movements
  where id = p_receipt_movement_id;
  if found then
    select pi.id, pi.code, pi.total_quantity, pi.available_quantity
      into item_id, item_code, total_quantity, available_quantity
    from public.patrimony_items pi
    where pi.id = v_existing_movement.item_id;
    return next;
    return;
  end if;

  select id into v_space_id
  from public.patrimony_spaces
  where code = 'ESTOQUE-UNIFORMES';
  if v_space_id is null then raise exception 'Estoque de uniformes nao encontrado'; end if;

  if p_item_id is not null then
    select * into v_item
    from public.patrimony_items
    where id = p_item_id
    for update;
    if not found or lower(v_item.category) <> 'uniforme' or v_item.tracking_mode <> 'quantidade' then
      raise exception 'Uniforme nao encontrado';
    end if;
    update public.patrimony_items
       set total_quantity = public.patrimony_items.total_quantity + p_quantity,
           available_quantity = public.patrimony_items.available_quantity + p_quantity,
           status = 'disponivel',
           storage_space_id = coalesce(public.patrimony_items.storage_space_id, v_space_id),
           uniform_supplier = coalesce(v_supplier, public.patrimony_items.uniform_supplier),
           uniform_proposal_number = coalesce(v_proposal, public.patrimony_items.uniform_proposal_number),
           notes = concat_ws(' · ', nullif(public.patrimony_items.notes, ''), v_notes),
           updated_at = now()
     where id = v_item.id
     returning public.patrimony_items.id,
               public.patrimony_items.code,
               public.patrimony_items.total_quantity,
               public.patrimony_items.available_quantity
        into item_id, item_code, total_quantity, available_quantity;
  else
    if v_code = '' then raise exception 'Codigo do uniforme obrigatorio'; end if;
    if v_name = '' then raise exception 'Nome do uniforme obrigatorio'; end if;
    if exists(select 1 from public.patrimony_items where code = v_code) then
      raise exception 'Ja existe item com este codigo';
    end if;
    insert into public.patrimony_items(
      code,
      name,
      category,
      tracking_mode,
      brand,
      model,
      unit,
      total_quantity,
      available_quantity,
      maintenance_quantity,
      lost_quantity,
      status,
      storage_space_id,
      acquisition_date,
      active,
      notes,
      uniform_size,
      uniform_fabric,
      uniform_color,
      uniform_proposal_number,
      uniform_supplier,
      uniform_description
    ) values (
      v_code,
      v_name,
      'Uniforme',
      'quantidade',
      v_fabric,
      v_color,
      'peça',
      p_quantity,
      p_quantity,
      0,
      0,
      'disponivel',
      v_space_id,
      coalesce(p_received_at, current_date),
      true,
      v_notes,
      v_size,
      v_fabric,
      v_color,
      v_proposal,
      v_supplier,
      v_description
    ) returning public.patrimony_items.id,
                public.patrimony_items.code,
                public.patrimony_items.total_quantity,
                public.patrimony_items.available_quantity
      into item_id, item_code, total_quantity, available_quantity;
  end if;

  insert into public.patrimony_movements(
    id,
    movement_type,
    item_id,
    space_id,
    quantity,
    actor_name,
    notes,
    created_at
  ) values (
    p_receipt_movement_id,
    'entrada_estoque',
    item_id,
    v_space_id,
    p_quantity,
    v_actor,
    concat_ws(' · ', 'Entrada de uniformes', case when v_proposal is not null then 'Proposta/Pedido ' || v_proposal else null end, v_notes),
    coalesce(p_received_at, current_date)::timestamptz
  );

  insert into public.patrimony_audit_log(
    action,
    item_id,
    actor_name,
    reason,
    change_summary,
    after_data
  ) values (
    'uniform_stock_receipt',
    item_id,
    v_actor,
    coalesce(v_notes, 'Entrada de uniformes'),
    'Entrada de ' || p_quantity::text || ' peça(s) em ' || item_code,
    jsonb_build_object('item_id', item_id, 'code', item_code, 'quantity', p_quantity, 'proposal_number', v_proposal)
  );

  return next;
end;
$$;

revoke all on function public.register_uniform_stock_receipt(uuid,uuid,text,text,text,text,text,text,numeric,date,text,text,text,text) from public, anon;
grant execute on function public.register_uniform_stock_receipt(uuid,uuid,text,text,text,text,text,text,numeric,date,text,text,text,text) to authenticated;
