begin;

alter table public.hub_tasks
  add column if not exists source_service_request_id uuid;

do $$
begin
  alter table public.hub_tasks
    add constraint hub_tasks_source_service_request_id_fkey
    foreign key (source_service_request_id)
    references public.service_requests(id)
    on delete set null;
exception
  when duplicate_object then null;
end;
$$;

create index if not exists hub_tasks_source_service_request_id_idx
  on public.hub_tasks(source_service_request_id)
  where source_service_request_id is not null;

create unique index if not exists hub_tasks_one_active_task_per_service_request_idx
  on public.hub_tasks(source_service_request_id)
  where source_service_request_id is not null
    and archived_at is null;

create or replace function public.record_hub_task_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
  v_details jsonb;
  v_source_service_request_protocol text;
begin
  if tg_op = 'INSERT' then
    if new.source_service_request_id is not null then
      select format(
        'CH-%s-%s',
        to_char(sr.opened_at at time zone 'America/Sao_Paulo', 'YYYY'),
        lpad(sr.protocol_number::text, 6, '0')
      )
        into v_source_service_request_protocol
      from public.service_requests sr
      where sr.id = new.source_service_request_id;
    end if;

    insert into public.hub_task_events (
      task_id,
      event_type,
      from_status,
      to_status,
      actor_auth_user,
      actor_name,
      details
    ) values (
      new.id,
      'criada',
      null,
      new.status,
      auth.uid(),
      new.last_actor_name,
      jsonb_strip_nulls(jsonb_build_object(
        'priority', new.priority,
        'department', new.department,
        'assignee_user_id', new.assignee_user_id,
        'due_date', new.due_date,
        'source_module', new.source_module,
        'source_service_request_id', new.source_service_request_id,
        'source_service_request_protocol', v_source_service_request_protocol
      ))
    );
    return new;
  end if;

  if old.archived_at is null and new.archived_at is not null then
    v_event_type := 'arquivada';
  elsif old.status is distinct from new.status then
    if new.status = 'concluido' then
      v_event_type := 'concluida';
    elsif old.status = 'concluido' then
      v_event_type := 'reaberta';
    else
      v_event_type := 'status_alterado';
    end if;
  elsif old.title is distinct from new.title
     or old.description is distinct from new.description
     or old.priority is distinct from new.priority
     or old.department is distinct from new.department
     or old.assignee_user_id is distinct from new.assignee_user_id
     or old.due_date is distinct from new.due_date
     or old.source_module is distinct from new.source_module
     or old.source_service_request_id is distinct from new.source_service_request_id then
    v_event_type := 'editada';
  else
    return new;
  end if;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'title', case when old.title is distinct from new.title then new.title end,
    'priority', case when old.priority is distinct from new.priority then new.priority end,
    'department', case when old.department is distinct from new.department then new.department end,
    'assignee_user_id', case when old.assignee_user_id is distinct from new.assignee_user_id then new.assignee_user_id end,
    'due_date', case when old.due_date is distinct from new.due_date then new.due_date end,
    'source_module', case when old.source_module is distinct from new.source_module then new.source_module end,
    'source_service_request_id', case when old.source_service_request_id is distinct from new.source_service_request_id then new.source_service_request_id end,
    'archived_at', case when old.archived_at is distinct from new.archived_at then new.archived_at end
  ));

  insert into public.hub_task_events (
    task_id,
    event_type,
    from_status,
    to_status,
    actor_auth_user,
    actor_name,
    details
  ) values (
    new.id,
    v_event_type,
    old.status,
    new.status,
    auth.uid(),
    new.last_actor_name,
    v_details
  );

  return new;
end;
$$;

create or replace function public.create_hub_task_from_service_request(
  p_task_id uuid,
  p_service_request_id uuid,
  p_title text,
  p_description text,
  p_status text,
  p_priority text,
  p_department text,
  p_assignee_user_id text,
  p_due_date date,
  p_actor_user_id text,
  p_actor_name text,
  p_source_service_request_protocol text default null
)
returns setof public.hub_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.service_requests%rowtype;
  v_task public.hub_tasks%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_department text := btrim(coalesce(p_department, 'Geral'));
  v_actor_name text := btrim(coalesce(p_actor_name, ''));
  v_task_id uuid := coalesce(p_task_id, gen_random_uuid());
  v_service_protocol text;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para criar tarefa de chamado.' using errcode = '42501';
  end if;

  if p_service_request_id is null then
    raise exception 'Chamado de origem invalido.' using errcode = '22023';
  end if;

  if v_title = '' then
    raise exception 'Informe o titulo da tarefa.' using errcode = '22023';
  end if;

  if v_actor_name = '' then
    raise exception 'Responsavel pela acao nao informado.' using errcode = '22023';
  end if;

  if p_status is null or p_status <> all(array['a_fazer', 'em_andamento', 'aguardando', 'concluido']::text[]) then
    raise exception 'Status da tarefa invalido.' using errcode = '22023';
  end if;

  if p_priority is null or p_priority <> all(array['baixa', 'media', 'alta', 'urgente']::text[]) then
    raise exception 'Prioridade da tarefa invalida.' using errcode = '22023';
  end if;

  select *
    into v_request
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Chamado de origem nao encontrado.' using errcode = 'P0002';
  end if;

  select *
    into v_task
  from public.hub_tasks
  where source_service_request_id = p_service_request_id
    and archived_at is null
  for update;

  if found then
    return next v_task;
    return;
  end if;

  begin
    insert into public.hub_tasks (
      id,
      title,
      description,
      status,
      priority,
      department,
      assignee_user_id,
      due_date,
      sort_order,
      source_module,
      source_service_request_id,
      created_by_user_id,
      created_by_name,
      last_actor_name
    ) values (
      v_task_id,
      v_title,
      nullif(btrim(coalesce(p_description, '')), ''),
      p_status,
      p_priority,
      coalesce(nullif(v_department, ''), 'Geral'),
      nullif(p_assignee_user_id, ''),
      p_due_date,
      0,
      'chamados',
      p_service_request_id,
      nullif(p_actor_user_id, ''),
      v_actor_name,
      v_actor_name
    )
    returning * into v_task;
  exception
    when unique_violation then
      select *
        into v_task
      from public.hub_tasks
      where source_service_request_id = p_service_request_id
        and archived_at is null
      for update;

      if found then
        return next v_task;
        return;
      end if;

      raise;
  end;

  v_service_protocol := coalesce(
    nullif(btrim(coalesce(p_source_service_request_protocol, '')), ''),
    format(
      'CH-%s-%s',
      to_char(v_request.opened_at at time zone 'America/Sao_Paulo', 'YYYY'),
      lpad(v_request.protocol_number::text, 6, '0')
    )
  );

  update public.hub_task_events
  set details = jsonb_strip_nulls(details || jsonb_build_object(
    'source_service_request_id', p_service_request_id,
    'source_service_request_protocol', v_service_protocol
  ))
  where task_id = v_task.id
    and event_type = 'criada';

  insert into public.service_request_events (
    request_id,
    event_type,
    from_status,
    to_status,
    actor_name,
    note
  ) values (
    p_service_request_id,
    'anotacao',
    v_request.status,
    v_request.status,
    v_actor_name,
    format('Chamado adicionado aos Afazeres. Tarefa criada: %s. ID: %s.', v_task.title, v_task.id)
  );

  return next v_task;
end;
$$;

revoke all on function public.create_hub_task_from_service_request(uuid, uuid, text, text, text, text, text, text, date, text, text, text) from public;
revoke all on function public.create_hub_task_from_service_request(uuid, uuid, text, text, text, text, text, text, date, text, text, text) from anon;
grant execute on function public.create_hub_task_from_service_request(uuid, uuid, text, text, text, text, text, text, date, text, text, text) to authenticated;

revoke all on function public.record_hub_task_event() from public;
revoke all on function public.record_hub_task_event() from anon;
revoke all on function public.record_hub_task_event() from authenticated;
revoke all on function public.record_hub_task_event() from service_role;

commit;
