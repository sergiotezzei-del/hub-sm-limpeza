create table if not exists public.patrimony_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('person_notebook_update')),
  person_id uuid references public.organization_people(id) on delete set null,
  item_id uuid references public.patrimony_items(id) on delete set null,
  assignment_id uuid references public.patrimony_assignments(id) on delete set null,
  actor_auth_user uuid default auth.uid(),
  actor_name text not null check (btrim(actor_name) <> ''),
  reason text not null check (btrim(reason) <> ''),
  change_summary text not null check (btrim(change_summary) <> ''),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists patrimony_audit_log_person_created_idx
  on public.patrimony_audit_log(person_id, created_at desc);
create index if not exists patrimony_audit_log_item_created_idx
  on public.patrimony_audit_log(item_id, created_at desc);

alter table public.patrimony_audit_log enable row level security;

drop policy if exists patrimony_audit_log_admin_select on public.patrimony_audit_log;
create policy patrimony_audit_log_admin_select
  on public.patrimony_audit_log
  for select
  to authenticated
  using ((select public.is_hub_admin()));

drop policy if exists patrimony_audit_log_admin_insert on public.patrimony_audit_log;
create policy patrimony_audit_log_admin_insert
  on public.patrimony_audit_log
  for insert
  to authenticated
  with check ((select public.is_hub_admin()));

grant select, insert on public.patrimony_audit_log to authenticated;

create or replace function public.update_inventory_person_with_audit(
  p_person_id uuid,
  p_name text,
  p_person_type text,
  p_department text,
  p_team_name text default null,
  p_job_title text default null,
  p_notebook_item_id uuid default null,
  p_actor_name text default 'Admin Tezzei',
  p_reason text default null
)
returns table(person_id uuid, notebook_item_id uuid, audit_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_person public.organization_people%rowtype;
  v_current_assignment public.patrimony_assignments%rowtype;
  v_current_item public.patrimony_items%rowtype;
  v_target_assignment public.patrimony_assignments%rowtype;
  v_target_item public.patrimony_items%rowtype;
  v_target_previous_person public.organization_people%rowtype;
  v_current_count integer := 0;
  v_target_count integer := 0;
  v_before jsonb;
  v_after jsonb;
  v_summary_parts text[] := array[]::text[];
  v_summary text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_new_assignment_id uuid;
  v_audit_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para editar o inventario';
  end if;
  if p_person_id is null then raise exception 'Pessoa obrigatoria'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Informe o nome da pessoa'; end if;
  if btrim(coalesce(p_department, '')) = '' then raise exception 'Informe o setor da pessoa'; end if;
  if p_person_type not in ('funcionario','corretor_terceirizado','consultor_terceirizado','prestador','temporario','outro') then
    raise exception 'Tipo de pessoa invalido';
  end if;
  if v_actor = '' then raise exception 'Responsavel pela alteracao invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da alteracao'; end if;

  select * into v_person
    from public.organization_people
   where id = p_person_id
   for update;
  if not found then raise exception 'Pessoa nao encontrada'; end if;

  select count(*) into v_current_count
    from public.patrimony_assignments a
    join public.patrimony_items i on i.id = a.item_id
   where a.person_id = p_person_id
     and a.returned_at is null
     and a.returned_quantity < a.quantity
     and i.active
     and i.tracking_mode = 'individual'
     and lower(i.category) like '%notebook%';
  if v_current_count > 1 then
    raise exception 'Esta pessoa possui mais de um notebook ativo. Regularize o cadastro antes de editar';
  end if;

  if v_current_count = 1 then
    select a.* into v_current_assignment
      from public.patrimony_assignments a
      join public.patrimony_items i on i.id = a.item_id
     where a.person_id = p_person_id
       and a.returned_at is null
       and a.returned_quantity < a.quantity
       and i.active
       and i.tracking_mode = 'individual'
       and lower(i.category) like '%notebook%'
     order by a.assigned_at desc
     limit 1
     for update of a;
    select * into v_current_item from public.patrimony_items where id = v_current_assignment.item_id for update;
  end if;

  if p_notebook_item_id is not null then
    select * into v_target_item
      from public.patrimony_items
     where id = p_notebook_item_id
     for update;
    if not found or not v_target_item.active or v_target_item.tracking_mode <> 'individual' or lower(v_target_item.category) not like '%notebook%' then
      raise exception 'Notebook selecionado nao foi encontrado ou esta inativo';
    end if;

    select count(*) into v_target_count
      from public.patrimony_assignments a
     where a.item_id = p_notebook_item_id
       and a.returned_at is null
       and a.returned_quantity < a.quantity;
    if v_target_count > 1 then
      raise exception 'Notebook possui mais de um vinculo ativo e precisa de regularizacao';
    end if;

    if v_target_count = 1 then
      select * into v_target_assignment
        from public.patrimony_assignments
       where item_id = p_notebook_item_id
         and returned_at is null
         and returned_quantity < quantity
       order by assigned_at desc
       limit 1
       for update;
      select * into v_target_previous_person
        from public.organization_people
       where id = v_target_assignment.person_id;
    end if;
  end if;

  v_before := jsonb_build_object(
    'person', jsonb_build_object(
      'name', v_person.name,
      'person_type', v_person.person_type,
      'department', v_person.department,
      'team_name', v_person.team_name,
      'job_title', v_person.job_title
    ),
    'notebook', case when v_current_count = 1 then jsonb_build_object(
      'item_id', v_current_item.id,
      'code', v_current_item.code,
      'name', v_current_item.name,
      'serial_number', v_current_item.serial_number,
      'assignment_id', v_current_assignment.id
    ) else null end
  );

  if v_person.name is distinct from btrim(p_name) then
    v_summary_parts := array_append(v_summary_parts, format('Nome: %s -> %s', v_person.name, btrim(p_name)));
  end if;
  if v_person.person_type is distinct from p_person_type then
    v_summary_parts := array_append(v_summary_parts, format('Tipo: %s -> %s', v_person.person_type, p_person_type));
  end if;
  if v_person.department is distinct from btrim(p_department) then
    v_summary_parts := array_append(v_summary_parts, format('Setor: %s -> %s', v_person.department, btrim(p_department)));
  end if;
  if coalesce(v_person.team_name, '') is distinct from coalesce(nullif(btrim(coalesce(p_team_name, '')), ''), '') then
    v_summary_parts := array_append(v_summary_parts, format('Equipe: %s -> %s', coalesce(v_person.team_name, 'Sem equipe'), coalesce(nullif(btrim(coalesce(p_team_name, '')), ''), 'Sem equipe')));
  end if;
  if coalesce(v_person.job_title, '') is distinct from coalesce(nullif(btrim(coalesce(p_job_title, '')), ''), '') then
    v_summary_parts := array_append(v_summary_parts, format('Funcao: %s -> %s', coalesce(v_person.job_title, 'Nao informada'), coalesce(nullif(btrim(coalesce(p_job_title, '')), ''), 'Nao informada')));
  end if;

  if (case when v_current_count = 1 then v_current_item.id else null end) is distinct from p_notebook_item_id then
    v_summary_parts := array_append(
      v_summary_parts,
      format('Notebook: %s -> %s',
        case when v_current_count = 1 then v_current_item.code else 'Sem notebook' end,
        case when p_notebook_item_id is not null then v_target_item.code else 'Sem notebook' end
      )
    );
    if v_target_count = 1 and v_target_assignment.person_id <> p_person_id then
      v_summary_parts := array_append(v_summary_parts, format('Transferido de %s', coalesce(v_target_previous_person.name, 'outra pessoa')));
    end if;
  end if;

  if coalesce(array_length(v_summary_parts, 1), 0) = 0 then
    raise exception 'Nenhuma alteracao foi identificada';
  end if;

  update public.organization_people
     set name = btrim(p_name),
         person_type = p_person_type,
         department = btrim(p_department),
         team_name = nullif(btrim(coalesce(p_team_name, '')), ''),
         job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
         updated_at = now()
   where id = p_person_id;

  if (case when v_current_count = 1 then v_current_item.id else null end) is distinct from p_notebook_item_id then
    if v_current_count = 1 then
      update public.patrimony_assignments
         set returned_quantity = quantity,
             returned_at = now(),
             last_return_condition = 'bom',
             returned_by_name = v_actor,
             return_notes = concat_ws(' · ', nullif(return_notes, ''), 'Correcao cadastral: ' || v_reason),
             updated_at = now()
       where id = v_current_assignment.id;

      update public.patrimony_items
         set available_quantity = total_quantity,
             status = 'disponivel',
             updated_at = now()
       where id = v_current_item.id;

      insert into public.patrimony_movements(movement_type,item_id,assignment_id,person_id,quantity,actor_name,notes)
      values ('ajuste',v_current_item.id,v_current_assignment.id,p_person_id,1,v_actor,'Correcao de vinculo: removido de ' || v_person.name || '. Motivo: ' || v_reason);
    end if;

    if p_notebook_item_id is not null then
      if v_target_count = 1 then
        update public.patrimony_assignments
           set person_id = p_person_id,
               notes = concat_ws(' · ', nullif(notes, ''), 'Correcao cadastral em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ': ' || v_reason),
               updated_at = now()
         where id = v_target_assignment.id;
        v_new_assignment_id := v_target_assignment.id;

        insert into public.patrimony_movements(movement_type,item_id,assignment_id,person_id,quantity,actor_name,notes)
        values ('transferencia',v_target_item.id,v_target_assignment.id,p_person_id,1,v_actor,
          'Correcao cadastral: de ' || coalesce(v_target_previous_person.name, 'outra pessoa') || ' para ' || btrim(p_name) || '. Motivo: ' || v_reason);
      else
        if v_target_item.available_quantity < 1 or v_target_item.status in ('baixado','extraviado','manutencao','indisponivel') then
          raise exception 'Notebook selecionado nao esta disponivel para vinculo';
        end if;
        v_new_assignment_id := gen_random_uuid();
        insert into public.patrimony_assignments(id,item_id,person_id,quantity,assigned_by_name,notes)
        values (v_new_assignment_id,v_target_item.id,p_person_id,1,v_actor,'Vinculo criado por correcao cadastral: ' || v_reason);

        update public.patrimony_items
           set available_quantity = greatest(available_quantity - 1, 0),
               status = 'em_uso',
               updated_at = now()
         where id = v_target_item.id;

        insert into public.patrimony_movements(movement_type,item_id,assignment_id,person_id,quantity,actor_name,notes)
        values ('ajuste',v_target_item.id,v_new_assignment_id,p_person_id,1,v_actor,'Vinculo criado por correcao cadastral. Motivo: ' || v_reason);
      end if;
    end if;
  else
    v_new_assignment_id := case when v_current_count = 1 then v_current_assignment.id else null end;
  end if;

  v_summary := array_to_string(v_summary_parts, ' · ');
  v_after := jsonb_build_object(
    'person', jsonb_build_object(
      'name', btrim(p_name),
      'person_type', p_person_type,
      'department', btrim(p_department),
      'team_name', nullif(btrim(coalesce(p_team_name, '')), ''),
      'job_title', nullif(btrim(coalesce(p_job_title, '')), '')
    ),
    'notebook', case when p_notebook_item_id is not null then jsonb_build_object(
      'item_id', v_target_item.id,
      'code', v_target_item.code,
      'name', v_target_item.name,
      'serial_number', v_target_item.serial_number,
      'assignment_id', v_new_assignment_id
    ) else null end
  );

  insert into public.patrimony_audit_log(action,person_id,item_id,assignment_id,actor_name,reason,change_summary,before_data,after_data)
  values ('person_notebook_update',p_person_id,p_notebook_item_id,v_new_assignment_id,v_actor,v_reason,v_summary,v_before,v_after)
  returning id into v_audit_id;

  person_id := p_person_id;
  notebook_item_id := p_notebook_item_id;
  audit_id := v_audit_id;
  return next;
end;
$$;

revoke all on function public.update_inventory_person_with_audit(uuid,text,text,text,text,text,uuid,text,text) from public, anon;
grant execute on function public.update_inventory_person_with_audit(uuid,text,text,text,text,text,uuid,text,text) to authenticated;
