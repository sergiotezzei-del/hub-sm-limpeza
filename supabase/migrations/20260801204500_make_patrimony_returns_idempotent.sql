drop function if exists public.return_patrimony_assignment(uuid,numeric,text,text,text);
drop function if exists public.return_patrimony_assignment(uuid,uuid,numeric,text,text,text);

create or replace function public.return_patrimony_assignment(
  p_return_movement_id uuid,
  p_assignment_id uuid,
  p_quantity numeric,
  p_condition text default 'bom',
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(assignment_id uuid, item_status text, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment public.patrimony_assignments%rowtype;
  v_item public.patrimony_items%rowtype;
  v_existing_movement public.patrimony_movements%rowtype;
  v_open_quantity numeric;
  v_remaining_assigned numeric;
  v_available numeric;
  v_maintenance numeric;
  v_lost numeric;
  v_status text;
  v_clean_notes text;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para movimentar patrimonio'; end if;
  if p_return_movement_id is null then raise exception 'Identificador da devolucao obrigatorio'; end if;
  if p_assignment_id is null then raise exception 'Entrega obrigatoria'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if p_condition not in ('bom','danificado','perdido') then raise exception 'Estado de devolucao invalido'; end if;
  if btrim(coalesce(p_actor_name,'')) = '' then raise exception 'Responsavel invalido'; end if;

  v_clean_notes := nullif(btrim(coalesce(p_notes,'')),'');

  select * into v_existing_movement
  from public.patrimony_movements
  where id = p_return_movement_id;

  if found then
    if v_existing_movement.movement_type <> 'devolucao'
       or v_existing_movement.assignment_id is distinct from p_assignment_id
       or v_existing_movement.quantity <> p_quantity
       or v_existing_movement.condition is distinct from p_condition
       or v_existing_movement.actor_name <> btrim(p_actor_name)
       or v_existing_movement.notes is distinct from v_clean_notes then
      raise exception 'Identificador de devolucao reutilizado com dados diferentes';
    end if;

    select a.id, i.status, i.available_quantity
      into assignment_id, item_status, available_quantity
    from public.patrimony_assignments a
    join public.patrimony_items i on i.id = a.item_id
    where a.id = p_assignment_id;

    if assignment_id is null then raise exception 'Entrega nao encontrada'; end if;
    return next;
    return;
  end if;

  select * into v_assignment
  from public.patrimony_assignments
  where id = p_assignment_id
  for update;

  if not found then raise exception 'Entrega nao encontrada'; end if;

  v_open_quantity := v_assignment.quantity - v_assignment.returned_quantity;
  if p_quantity > v_open_quantity then raise exception 'Quantidade de devolucao maior que a quantidade pendente'; end if;

  select * into v_item
  from public.patrimony_items
  where id = v_assignment.item_id
  for update;

  if not found then raise exception 'Item nao encontrado'; end if;

  update public.patrimony_assignments
     set returned_quantity = returned_quantity + p_quantity,
         returned_at = case when returned_quantity + p_quantity = quantity then now() else null end,
         last_return_condition = p_condition,
         returned_by_auth_user = auth.uid(),
         returned_by_name = btrim(p_actor_name),
         return_notes = v_clean_notes
   where id = p_assignment_id;

  v_available := v_item.available_quantity + case when p_condition = 'bom' then p_quantity else 0 end;
  v_maintenance := v_item.maintenance_quantity + case when p_condition = 'danificado' then p_quantity else 0 end;
  v_lost := v_item.lost_quantity + case when p_condition = 'perdido' then p_quantity else 0 end;

  select coalesce(sum(quantity - returned_quantity),0)
    into v_remaining_assigned
  from public.patrimony_assignments
  where item_id = v_item.id
    and returned_at is null;

  v_status := case
    when v_item.tracking_mode = 'individual' and v_lost > 0 then 'extraviado'
    when v_item.tracking_mode = 'individual' and v_maintenance > 0 then 'manutencao'
    when v_remaining_assigned > 0 and v_available > 0 then 'parcialmente_em_uso'
    when v_remaining_assigned > 0 then 'em_uso'
    when v_available > 0 then 'disponivel'
    when v_maintenance > 0 then 'manutencao'
    when v_lost >= v_item.total_quantity then 'extraviado'
    else 'indisponivel'
  end;

  update public.patrimony_items
     set available_quantity = v_available,
         maintenance_quantity = v_maintenance,
         lost_quantity = v_lost,
         status = v_status
   where id = v_item.id
   returning status, public.patrimony_items.available_quantity
        into item_status, available_quantity;

  insert into public.patrimony_movements(
    id,
    movement_type,
    item_id,
    assignment_id,
    space_id,
    person_id,
    quantity,
    condition,
    actor_name,
    notes
  ) values (
    p_return_movement_id,
    'devolucao',
    v_item.id,
    p_assignment_id,
    v_assignment.destination_space_id,
    v_assignment.person_id,
    p_quantity,
    p_condition,
    btrim(p_actor_name),
    v_clean_notes
  );

  assignment_id := p_assignment_id;
  return next;
end;
$$;

revoke all on function public.return_patrimony_assignment(uuid,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.return_patrimony_assignment(uuid,uuid,numeric,text,text,text) to authenticated;
