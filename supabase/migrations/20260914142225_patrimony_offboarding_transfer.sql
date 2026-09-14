alter table public.organization_people
  add column if not exists inactive_at timestamptz,
  add column if not exists inactive_by_auth_user uuid,
  add column if not exists inactive_by_name text,
  add column if not exists inactive_reason text;

create index if not exists organization_people_inactive_at_idx
  on public.organization_people(inactive_at desc)
  where active = false;

comment on column public.organization_people.inactive_at is
  'Data e hora em que a pessoa foi marcada como inativa/desligada.';
comment on column public.organization_people.inactive_by_auth_user is
  'Usuario autenticado que marcou a pessoa como inativa, quando disponivel.';
comment on column public.organization_people.inactive_by_name is
  'Nome operacional informado para quem marcou a pessoa como inativa.';
comment on column public.organization_people.inactive_reason is
  'Motivo operacional do desligamento/inativacao.';

alter table public.patrimony_audit_log
  drop constraint if exists patrimony_audit_log_action_check;

alter table public.patrimony_audit_log
  add constraint patrimony_audit_log_action_check
  check (action in (
    'person_notebook_update',
    'notebook_item_update',
    'person_inactivation',
    'notebook_transfer'
  ));

create or replace function public.inactivate_organization_person_with_audit(
  p_person_id uuid,
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
  v_active_notebooks integer := 0;
  v_audit_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para inativar pessoa';
  end if;
  if p_person_id is null then raise exception 'Pessoa obrigatoria'; end if;
  if v_actor = '' then raise exception 'Responsavel pelo desligamento invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo do desligamento'; end if;

  select * into v_person
    from public.organization_people
   where id = p_person_id
   for update;

  if not found then raise exception 'Pessoa nao encontrada'; end if;

  select count(*) into v_active_notebooks
    from public.patrimony_assignments a
    join public.patrimony_items i on i.id = a.item_id
   where a.person_id = p_person_id
     and a.returned_at is null
     and a.returned_quantity < a.quantity
     and i.active
     and i.tracking_mode = 'individual'
     and (lower(i.category) like '%notebook%' or lower(i.name) like '%notebook%' or lower(i.name) like '%laptop%');

  if v_active_notebooks > 0 then
    raise exception 'Esta pessoa possui notebook vinculado. Transfira ou devolva antes de inativar';
  end if;

  if v_person.active = false then
    person_id := v_person.id;
    audit_id := null;
    return next;
    return;
  end if;

  update public.organization_people
     set active = false,
         inactive_at = now(),
         inactive_by_auth_user = auth.uid(),
         inactive_by_name = v_actor,
         inactive_reason = v_reason,
         updated_at = now()
   where id = v_person.id;

  insert into public.patrimony_audit_log(
    action,
    person_id,
    actor_name,
    reason,
    change_summary,
    before_data,
    after_data
  ) values (
    'person_inactivation',
    v_person.id,
    v_actor,
    v_reason,
    'Pessoa marcada como inativa/desligada',
    jsonb_build_object(
      'person_id', v_person.id,
      'name', v_person.name,
      'active', v_person.active,
      'department', v_person.department,
      'team_name', v_person.team_name,
      'job_title', v_person.job_title
    ),
    jsonb_build_object(
      'person_id', v_person.id,
      'name', v_person.name,
      'active', false,
      'inactive_at', now(),
      'inactive_by_name', v_actor,
      'inactive_reason', v_reason,
      'department', v_person.department,
      'team_name', v_person.team_name,
      'job_title', v_person.job_title
    )
  ) returning id into v_audit_id;

  person_id := v_person.id;
  audit_id := v_audit_id;
  return next;
end;
$$;

create or replace function public.transfer_notebook_assignment(
  p_transfer_movement_id uuid,
  p_delivery_movement_id uuid,
  p_new_assignment_id uuid,
  p_item_id uuid,
  p_from_person_id uuid,
  p_to_person_id uuid,
  p_actor_name text default 'Admin Tezzei',
  p_reason text default null
)
returns table(
  item_id uuid,
  from_assignment_id uuid,
  to_assignment_id uuid,
  item_status text,
  available_quantity numeric,
  audit_id uuid
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.patrimony_items%rowtype;
  v_from_person public.organization_people%rowtype;
  v_to_person public.organization_people%rowtype;
  v_assignment public.patrimony_assignments%rowtype;
  v_existing_transfer public.patrimony_movements%rowtype;
  v_existing_delivery public.patrimony_movements%rowtype;
  v_open_count integer := 0;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_transfer_notes text;
  v_delivery_notes text;
  v_audit_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para transferir notebook';
  end if;
  if p_transfer_movement_id is null or p_delivery_movement_id is null or p_new_assignment_id is null then
    raise exception 'Identificadores da transferencia obrigatorios';
  end if;
  if p_item_id is null or p_from_person_id is null or p_to_person_id is null then
    raise exception 'Notebook, origem e destino sao obrigatorios';
  end if;
  if p_from_person_id = p_to_person_id then
    raise exception 'Pessoa destino deve ser diferente da pessoa origem';
  end if;
  if v_actor = '' then raise exception 'Responsavel pela transferencia invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da transferencia'; end if;

  select * into v_existing_transfer
    from public.patrimony_movements
   where id = p_transfer_movement_id;

  if found then
    select * into v_existing_delivery
      from public.patrimony_movements
     where id = p_delivery_movement_id;

    if v_existing_transfer.movement_type <> 'transferencia'
       or v_existing_transfer.item_id is distinct from p_item_id
       or v_existing_transfer.person_id is distinct from p_from_person_id
       or v_existing_transfer.actor_name <> v_actor
       or v_existing_delivery.id is null
       or v_existing_delivery.movement_type <> 'entrega'
       or v_existing_delivery.item_id is distinct from p_item_id
       or v_existing_delivery.assignment_id is distinct from p_new_assignment_id
       or v_existing_delivery.person_id is distinct from p_to_person_id
       or v_existing_delivery.actor_name <> v_actor then
      raise exception 'Identificador de transferencia reutilizado com dados diferentes';
    end if;

    select status, available_quantity
      into item_status, available_quantity
      from public.patrimony_items
     where id = p_item_id;

    item_id := p_item_id;
    from_assignment_id := v_existing_transfer.assignment_id;
    to_assignment_id := p_new_assignment_id;
    audit_id := null;
    return next;
    return;
  end if;

  if exists(select 1 from public.patrimony_assignments where id = p_new_assignment_id) then
    raise exception 'Identificador de novo vinculo ja utilizado';
  end if;
  if exists(select 1 from public.patrimony_movements where id = p_delivery_movement_id) then
    raise exception 'Identificador de entrega ja utilizado';
  end if;

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
  if v_item.status in ('baixado','extraviado','manutencao','indisponivel') then
    raise exception 'Notebook indisponivel para transferencia';
  end if;

  select * into v_from_person
    from public.organization_people
   where id = p_from_person_id;
  if not found then raise exception 'Pessoa origem nao encontrada'; end if;

  select * into v_to_person
    from public.organization_people
   where id = p_to_person_id
   for update;
  if not found or v_to_person.active = false then
    raise exception 'Pessoa destino nao encontrada ou inativa';
  end if;

  select count(*) into v_open_count
    from public.patrimony_assignments
   where item_id = p_item_id
     and returned_at is null
     and returned_quantity < quantity;

  if v_open_count <> 1 then
    raise exception 'Notebook precisa ter exatamente um vinculo ativo para transferencia';
  end if;

  select * into v_assignment
    from public.patrimony_assignments
   where item_id = p_item_id
     and person_id = p_from_person_id
     and returned_at is null
     and returned_quantity < quantity
   order by assigned_at desc
   limit 1
   for update;

  if not found then
    raise exception 'Vinculo ativo da pessoa origem nao encontrado';
  end if;

  v_transfer_notes := 'Transferencia de notebook para ' || v_to_person.name || '. Motivo: ' || v_reason;
  v_delivery_notes := 'Recebimento por transferencia de ' || v_from_person.name || '. Motivo: ' || v_reason;

  update public.patrimony_assignments
     set returned_quantity = quantity,
         returned_at = now(),
         last_return_condition = 'bom',
         returned_by_auth_user = auth.uid(),
         returned_by_name = v_actor,
         return_notes = v_transfer_notes,
         updated_at = now()
   where id = v_assignment.id;

  insert into public.patrimony_assignments(
    id,
    item_id,
    person_id,
    quantity,
    assigned_by_auth_user,
    assigned_by_name,
    notes
  ) values (
    p_new_assignment_id,
    v_item.id,
    v_to_person.id,
    1,
    auth.uid(),
    v_actor,
    v_delivery_notes
  );

  update public.patrimony_items
     set available_quantity = 0,
         status = 'em_uso',
         updated_at = now()
   where id = v_item.id
   returning status, public.patrimony_items.available_quantity
        into item_status, available_quantity;

  insert into public.patrimony_movements(
    id,
    movement_type,
    item_id,
    assignment_id,
    person_id,
    quantity,
    condition,
    actor_name,
    notes
  ) values (
    p_transfer_movement_id,
    'transferencia',
    v_item.id,
    v_assignment.id,
    v_from_person.id,
    1,
    'bom',
    v_actor,
    v_transfer_notes
  );

  insert into public.patrimony_movements(
    id,
    movement_type,
    item_id,
    assignment_id,
    person_id,
    quantity,
    actor_name,
    notes
  ) values (
    p_delivery_movement_id,
    'entrega',
    v_item.id,
    p_new_assignment_id,
    v_to_person.id,
    1,
    v_actor,
    v_delivery_notes
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
    'notebook_transfer',
    v_from_person.id,
    v_item.id,
    p_new_assignment_id,
    v_actor,
    v_reason,
    'Notebook ' || v_item.code || ' transferido de ' || v_from_person.name || ' para ' || v_to_person.name,
    jsonb_build_object(
      'item_id', v_item.id,
      'code', v_item.code,
      'from_person_id', v_from_person.id,
      'from_person_name', v_from_person.name,
      'assignment_id', v_assignment.id,
      'assigned_at', v_assignment.assigned_at
    ),
    jsonb_build_object(
      'item_id', v_item.id,
      'code', v_item.code,
      'to_person_id', v_to_person.id,
      'to_person_name', v_to_person.name,
      'assignment_id', p_new_assignment_id,
      'assigned_at', now()
    )
  ) returning id into v_audit_id;

  item_id := v_item.id;
  from_assignment_id := v_assignment.id;
  to_assignment_id := p_new_assignment_id;
  audit_id := v_audit_id;
  return next;
end;
$$;

revoke all on function public.inactivate_organization_person_with_audit(uuid,text,text) from public, anon;
revoke all on function public.transfer_notebook_assignment(uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.inactivate_organization_person_with_audit(uuid,text,text) to authenticated;
grant execute on function public.transfer_notebook_assignment(uuid,uuid,uuid,uuid,uuid,uuid,text,text) to authenticated;
