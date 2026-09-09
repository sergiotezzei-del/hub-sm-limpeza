alter table public.organization_people
  add column if not exists notebook_offsite_use boolean not null default false;

comment on column public.organization_people.notebook_offsite_use is
  'Indica se a pessoa utiliza o notebook corporativo fora do prédio da empresa.';

create or replace function public.update_person_notebook_offsite_with_audit(
  p_person_id uuid,
  p_offsite_use boolean,
  p_actor_name text default 'Admin Tezzei',
  p_reason text default null
)
returns table(person_id uuid, audit_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_person public.organization_people%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_before boolean;
  v_after boolean := coalesce(p_offsite_use, false);
  v_summary text;
  v_audit_id uuid;
  v_assignment_id uuid;
  v_item_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para editar o inventario';
  end if;
  if p_person_id is null then raise exception 'Pessoa obrigatoria'; end if;
  if v_actor = '' then raise exception 'Responsavel pela alteracao invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da alteracao'; end if;

  select * into v_person
    from public.organization_people
   where id = p_person_id
     and active
   for update;

  if not found then raise exception 'Pessoa nao encontrada ou inativa'; end if;

  v_before := coalesce(v_person.notebook_offsite_use, false);
  if v_before is not distinct from v_after then
    raise exception 'Nenhuma alteracao foi identificada';
  end if;

  select a.id, a.item_id
    into v_assignment_id, v_item_id
    from public.patrimony_assignments a
   where a.person_id = v_person.id
     and a.quantity > a.returned_quantity
   order by a.assigned_at desc
   limit 1;

  update public.organization_people
     set notebook_offsite_use = v_after,
         updated_at = now()
   where id = v_person.id;

  v_summary := format(
    'Uso do notebook fora do predio: %s -> %s',
    case when v_before then 'Sim' else 'Nao' end,
    case when v_after then 'Sim' else 'Nao' end
  );

  insert into public.patrimony_audit_log(
    action,
    person_id,
    item_id,
    assignment_id,
    actor_name,
    reason,
    change_summary,
    before_data,
    after_data
  ) values (
    'person_notebook_update',
    v_person.id,
    v_item_id,
    v_assignment_id,
    v_actor,
    v_reason,
    v_summary,
    jsonb_build_object('person_id', v_person.id, 'notebook_offsite_use', v_before),
    jsonb_build_object('person_id', v_person.id, 'notebook_offsite_use', v_after)
  ) returning id into v_audit_id;

  person_id := v_person.id;
  audit_id := v_audit_id;
  return next;
end;
$$;

revoke all on function public.update_person_notebook_offsite_with_audit(uuid,boolean,text,text) from public, anon;
grant execute on function public.update_person_notebook_offsite_with_audit(uuid,boolean,text,text) to authenticated;

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
  v_person public.organization_people%rowtype;
  v_assignment public.patrimony_assignments%rowtype;
  v_has_person boolean := false;
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
   limit 1;

  if found then
    select * into v_person
      from public.organization_people
     where id = v_assignment.person_id
       and active
     for update;
    v_has_person := found;
  end if;

  if not v_has_person and v_offsite then
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
    'person_id', case when v_has_person then v_person.id else null end,
    'notebook_offsite_use', case when v_has_person then coalesce(v_person.notebook_offsite_use, false) else false end
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
  if v_has_person and coalesce(v_person.notebook_offsite_use, false) is distinct from v_offsite then
    v_summary_parts := array_append(
      v_summary_parts,
      format(
        'Uso fora do predio: %s -> %s',
        case when coalesce(v_person.notebook_offsite_use, false) then 'Sim' else 'Nao' end,
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

  if v_has_person then
    update public.organization_people
       set notebook_offsite_use = v_offsite,
           updated_at = now()
     where id = v_person.id;
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
    'person_id', case when v_has_person then v_person.id else null end,
    'notebook_offsite_use', case when v_has_person then v_offsite else false end
  );

  v_summary := array_to_string(v_summary_parts, ' · ');

  insert into public.patrimony_audit_log(
    action,
    person_id,
    item_id,
    assignment_id,
    actor_name,
    reason,
    change_summary,
    before_data,
    after_data
  ) values (
    'notebook_item_update',
    case when v_has_person then v_person.id else null end,
    v_item.id,
    case when v_has_person then v_assignment.id else null end,
    v_actor,
    v_reason,
    v_summary,
    v_before,
    v_after
  ) returning id into v_audit_id;

  insert into public.patrimony_movements(
    movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes
  ) values (
    'ajuste',
    v_item.id,
    case when v_has_person then v_assignment.id else null end,
    case when v_has_person then v_person.id else null end,
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