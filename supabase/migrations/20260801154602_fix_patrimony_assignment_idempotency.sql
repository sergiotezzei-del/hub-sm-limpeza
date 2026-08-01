create or replace function public.register_patrimony_assignment(
  p_assignment_id uuid,
  p_item_id uuid,
  p_person_id uuid,
  p_quantity numeric,
  p_destination_space_id uuid default null,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(assignment_id uuid, item_status text, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.patrimony_items%rowtype;
  v_existing public.patrimony_assignments%rowtype;
  v_person_active boolean;
  v_space_active boolean;
  v_new_available numeric;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para movimentar patrimonio'; end if;
  if p_assignment_id is null or p_item_id is null or p_person_id is null then raise exception 'Dados obrigatorios ausentes'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if btrim(coalesce(p_actor_name,'')) = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_existing from public.patrimony_assignments where id = p_assignment_id;
  if found then
    if v_existing.item_id <> p_item_id
       or v_existing.person_id <> p_person_id
       or v_existing.quantity <> p_quantity
       or v_existing.destination_space_id is distinct from p_destination_space_id then
      raise exception 'Identificador de operacao reutilizado com dados diferentes';
    end if;
    select i.status, i.available_quantity
      into item_status, available_quantity
      from public.patrimony_items as i
     where i.id = v_existing.item_id;
    assignment_id := v_existing.id;
    return next;
    return;
  end if;

  select * into v_item from public.patrimony_items where id = p_item_id for update;
  if not found or not v_item.active then raise exception 'Item nao encontrado ou inativo'; end if;
  if v_item.status in ('baixado','extraviado','manutencao','indisponivel') then raise exception 'Item indisponivel para entrega'; end if;
  if v_item.tracking_mode = 'individual' and p_quantity <> 1 then raise exception 'Item individual exige quantidade 1'; end if;
  if p_quantity > v_item.available_quantity then raise exception 'Quantidade indisponivel. Disponivel: % %', v_item.available_quantity, v_item.unit; end if;

  select active into v_person_active from public.organization_people where id = p_person_id;
  if coalesce(v_person_active,false) = false then raise exception 'Pessoa nao encontrada ou inativa'; end if;

  if p_destination_space_id is not null then
    select active and status <> 'inativo' into v_space_active from public.patrimony_spaces where id = p_destination_space_id;
    if coalesce(v_space_active,false) = false then raise exception 'Espaco nao encontrado ou inativo'; end if;
  end if;

  insert into public.patrimony_assignments(id,item_id,person_id,destination_space_id,quantity,assigned_by_name,notes)
  values (p_assignment_id,p_item_id,p_person_id,p_destination_space_id,p_quantity,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  v_new_available := v_item.available_quantity - p_quantity;
  update public.patrimony_items as i
     set available_quantity = v_new_available,
         status = case when v_new_available = 0 then 'em_uso' else 'parcialmente_em_uso' end
   where i.id = p_item_id
   returning i.status, i.available_quantity into item_status, available_quantity;

  insert into public.patrimony_movements(movement_type,item_id,assignment_id,space_id,person_id,quantity,actor_name,notes)
  values ('entrega',p_item_id,p_assignment_id,p_destination_space_id,p_person_id,p_quantity,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  assignment_id := p_assignment_id;
  return next;
end;
$$;

revoke all on function public.register_patrimony_assignment(uuid,uuid,uuid,numeric,uuid,text,text) from public, anon;
grant execute on function public.register_patrimony_assignment(uuid,uuid,uuid,numeric,uuid,text,text) to authenticated;
