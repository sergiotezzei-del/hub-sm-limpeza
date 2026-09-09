alter table public.patrimony_assignments
  add column if not exists offsite_use boolean not null default false;

comment on column public.patrimony_assignments.offsite_use is
  'Indica se a pessoa responsável utiliza o equipamento fora do prédio da empresa.';

create or replace function public.register_notebook_assignment(
  p_assignment_id uuid,
  p_item_id uuid,
  p_person_id uuid,
  p_quantity numeric,
  p_destination_space_id uuid default null,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null,
  p_offsite_use boolean default false
)
returns table(assignment_id uuid, item_status text, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment_id uuid;
  v_item_status text;
  v_available_quantity numeric;
begin
  select r.assignment_id, r.item_status, r.available_quantity
    into v_assignment_id, v_item_status, v_available_quantity
    from public.register_patrimony_assignment(
      p_assignment_id,
      p_item_id,
      p_person_id,
      p_quantity,
      p_destination_space_id,
      p_actor_name,
      p_notes
    ) as r;

  update public.patrimony_assignments
     set offsite_use = coalesce(p_offsite_use, false),
         updated_at = now()
   where id = v_assignment_id;

  assignment_id := v_assignment_id;
  item_status := v_item_status;
  available_quantity := v_available_quantity;
  return next;
end;
$$;

revoke all on function public.register_notebook_assignment(uuid,uuid,uuid,numeric,uuid,text,text,boolean) from public, anon;
grant execute on function public.register_notebook_assignment(uuid,uuid,uuid,numeric,uuid,text,text,boolean) to authenticated;

create or replace function public.update_inventory_notebook_with_audit_v2(
  p_item_id uuid,
  p_equipment_model_id uuid,
  p_serial_number text default null,
  p_observation text default null,
  p_offsite_use boolean default false,
  p_actor_name text default 'Admin Tezzei',
  p_reason text default null
)
returns table(item_id uuid, audit_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.patrimony_items%rowtype;
  v_model public.patrimony_equipment_models%rowtype;
  v_assignment public.patrimony_assignments%rowtype;
  v_has_assignment boolean := false;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_serial text := nullif(btrim(coalesce(p_serial_number, '')), '');
  v_observation text := nullif(btrim(coalesce(p_observation, '')), '');
  v_offsite boolean := coalesce(p_offsite_use, false);
  v_notes text;
  v_before jsonb;
  v_after jsonb;
  v_summary_parts text[] := array[]::text[];
  v_summary text;
  v_audit_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para editar o inventario';
  end if;
  if p_item_id is null then raise exception 'Notebook obrigatorio'; end if;
  if p_equipment_model_id is null then raise exception 'Selecione o modelo do notebook'; end if;
  if v_actor = '' then raise exception 'Responsavel pela alteracao invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da alteracao'; end if;

  select * into v_item
    from public.patrimony_items
   where id = p_item_id
   for update;

  if not found
     or not v_item.active
     or v_item.tracking_mode <> 'individual'
     or (lower(v_item.category) not like '%notebook%' and lower(v_item.name) not like '%notebook%' and lower(v_item.name) not like '%laptop%') then
    raise exception 'Notebook nao encontrado ou inativo';
  end if;

  select * into v_model
    from public.patrimony_equipment_models
   where id = p_equipment_model_id
     and active
     and lower(category) = 'notebook';

  if not found then raise exception 'Modelo de notebook nao encontrado ou inativo'; end if;

  select * into v_assignment
    from public.patrimony_assignments
   where item_id = v_item.id
     and quantity > returned_quantity
   order by assigned_at desc
   limit 1
   for update;
  v_has_assignment := found;

  if not v_has_assignment and v_offsite then
    raise exception 'Notebook sem pessoa vinculada nao pode ser marcado para uso fora do predio';
  end if;

  v_notes := concat_ws(' · ', nullif(btrim(v_model.description), ''), case when v_observation is not null then 'Observação: ' || v_observation else null end);

  v_before := jsonb_build_object(
    'item_id', v_item.id,
    'code', v_item.code,
    'equipment_model_id', v_item.equipment_model_id,
    'name', v_item.name,
    'brand', v_item.brand,
    'model', v_item.model,
    'serial_number', v_item.serial_number,
    'notes', v_item.notes,
    'assignment_id', case when v_has_assignment then v_assignment.id else null end,
    'offsite_use', case when v_has_assignment then coalesce(v_assignment.offsite_use, false) else false end
  );

  if v_item.equipment_model_id is distinct from p_equipment_model_id then
    v_summary_parts := array_append(v_summary_parts, format('Modelo: %s -> %s', coalesce(v_item.name, 'Nao informado'), v_model.name));
  end if;
  if coalesce(v_item.serial_number, '') is distinct from coalesce(v_serial, '') then
    v_summary_parts := array_append(v_summary_parts, format('Serie: %s -> %s', coalesce(v_item.serial_number, 'Nao informada'), coalesce(v_serial, 'Nao informada')));
  end if;
  if coalesce(v_item.notes, '') is distinct from coalesce(v_notes, '') then
    v_summary_parts := array_append(v_summary_parts, 'Observacao/descricao atualizada');
  end if;
  if v_has_assignment and coalesce(v_assignment.offsite_use, false) is distinct from v_offsite then
    v_summary_parts := array_append(
      v_summary_parts,
      format(
        'Uso fora do predio: %s -> %s',
        case when coalesce(v_assignment.offsite_use, false) then 'Sim' else 'Nao' end,
        case when v_offsite then 'Sim' else 'Nao' end
      )
    );
  end if;

  if coalesce(array_length(v_summary_parts, 1), 0) = 0 then
    raise exception 'Nenhuma alteracao foi identificada';
  end if;

  update public.patrimony_items
     set equipment_model_id = v_model.id,
         name = v_model.name,
         brand = v_model.brand,
         model = coalesce(v_model.model, v_model.name),
         serial_number = v_serial,
         notes = nullif(v_notes, ''),
         updated_at = now()
   where id = v_item.id;

  if v_has_assignment then
    update public.patrimony_assignments
       set offsite_use = v_offsite,
           updated_at = now()
     where id = v_assignment.id;
  end if;

  v_after := jsonb_build_object(
    'item_id', v_item.id,
    'code', v_item.code,
    'equipment_model_id', v_model.id,
    'name', v_model.name,
    'brand', v_model.brand,
    'model', coalesce(v_model.model, v_model.name),
    'serial_number', v_serial,
    'notes', nullif(v_notes, ''),
    'assignment_id', case when v_has_assignment then v_assignment.id else null end,
    'offsite_use', case when v_has_assignment then v_offsite else false end
  );

  v_summary := array_to_string(v_summary_parts, ' · ');

  insert into public.patrimony_audit_log(
    action, item_id, actor_name, reason, change_summary, before_data, after_data
  ) values (
    'notebook_item_update', v_item.id, v_actor, v_reason, v_summary, v_before, v_after
  ) returning id into v_audit_id;

  insert into public.patrimony_movements(
    movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes
  ) values (
    'ajuste',
    v_item.id,
    case when v_has_assignment then v_assignment.id else null end,
    case when v_has_assignment then v_assignment.person_id else null end,
    1,
    v_actor,
    'Edicao do notebook ' || v_item.code || '. ' || v_summary || '. Motivo: ' || v_reason
  );

  item_id := v_item.id;
  audit_id := v_audit_id;
  return next;
end;
$$;

revoke all on function public.update_inventory_notebook_with_audit_v2(uuid,uuid,text,text,boolean,text,text) from public, anon;
grant execute on function public.update_inventory_notebook_with_audit_v2(uuid,uuid,text,text,boolean,text,text) to authenticated;

update public.organization_people
   set department = 'iHome Seguros',
       team_name = 'Equipe iHome Seguros',
       updated_at = now()
 where name in ('Anderson Caram', 'Jessica Simões', 'Cleonice Jesus');