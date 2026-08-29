alter table public.service_requests
  add column if not exists show_in_alerts boolean not null default true;

update public.service_requests
set show_in_alerts = (status = 'novo');

create index if not exists service_requests_show_in_alerts_opened_idx
  on public.service_requests (show_in_alerts, opened_at desc);

create table if not exists private.hub_attention_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('order', 'stock_check')),
  source_id uuid not null,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_name text,
  unique (source_type, source_id)
);

revoke all on table private.hub_attention_events from public, anon, authenticated;

create or replace function public.hub_attention_events_get()
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  title text,
  description text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  return query
  select e.id, e.source_type, e.source_id, e.title, e.description, e.created_at
  from private.hub_attention_events e
  where e.completed_at is null
  order by e.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.hub_attention_events_get() from public, anon;
grant execute on function public.hub_attention_events_get() to authenticated;

create or replace function public.hub_attention_event_ack(
  p_id uuid,
  p_actor_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update private.hub_attention_events
  set completed_at = clock_timestamp(),
      completed_by_name = nullif(btrim(coalesce(p_actor_name, '')), '')
  where id = p_id
    and completed_at is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.hub_attention_event_ack(uuid, text) from public, anon;
grant execute on function public.hub_attention_event_ack(uuid, text) to authenticated;

create or replace function private.hub_attention_order_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending boolean;
  v_title text;
  v_description text;
begin
  v_pending := new.deleted_at is null
    and new.completed_at is null
    and lower(btrim(coalesce(new.status, ''))) = 'novo';

  v_title := 'Novo pedido de ' || coalesce(nullif(btrim(new.solicitante), ''), 'insumos');
  v_description := 'Pedido recebido em ' || coalesce(nullif(btrim(new.data), ''), 'data não informada')
    || case when nullif(btrim(new.hora), '') is not null then ' às ' || btrim(new.hora) else '' end || '.';

  if v_pending then
    insert into private.hub_attention_events (
      source_type, source_id, title, description, completed_at, completed_by_name
    ) values (
      'order', new.id, v_title, v_description, null, null
    )
    on conflict (source_type, source_id) do update
    set title = excluded.title,
        description = excluded.description,
        completed_at = null,
        completed_by_name = null;
  else
    update private.hub_attention_events
    set completed_at = coalesce(completed_at, clock_timestamp())
    where source_type = 'order'
      and source_id = new.id
      and completed_at is null;
  end if;

  return new;
end;
$$;

revoke execute on function private.hub_attention_order_sync() from public, anon, authenticated;

drop trigger if exists trg_hub_attention_order_sync on public.orders;
create trigger trg_hub_attention_order_sync
after insert or update of status, deleted_at, completed_at, solicitante, data, hora
on public.orders
for each row execute function private.hub_attention_order_sync();

create or replace function private.hub_attention_stock_check_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.hub_attention_events (
    source_type, source_id, title, description
  ) values (
    'stock_check',
    new.id,
    'Conferência de estoque — ' || coalesce(nullif(btrim(new.conferente), ''), 'Equipe'),
    'Nova conferência registrada em ' || coalesce(nullif(btrim(new.data), ''), 'data não informada')
      || case when nullif(btrim(new.hora), '') is not null then ' às ' || btrim(new.hora) else '' end || '.'
  )
  on conflict (source_type, source_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.hub_attention_stock_check_insert() from public, anon, authenticated;

drop trigger if exists trg_hub_attention_stock_check_insert on public.stock_checks;
create trigger trg_hub_attention_stock_check_insert
after insert on public.stock_checks
for each row execute function private.hub_attention_stock_check_insert();

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
  p_source_service_request_protocol text default null::text
)
returns setof public.hub_tasks
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_request public.service_requests%rowtype;
  v_task public.hub_tasks%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_department text := btrim(coalesce(p_department, 'Geral'));
  v_actor_name text := btrim(coalesce(p_actor_name, ''));
  v_task_id uuid := coalesce(p_task_id, gen_random_uuid());
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

  select * into v_request
  from public.service_requests
  where id = p_service_request_id
  for update;

  if not found then
    raise exception 'Chamado de origem nao encontrado.' using errcode = 'P0002';
  end if;

  select * into v_task
  from public.hub_tasks
  where source_service_request_id = p_service_request_id
    and archived_at is null
  for update;

  if found then
    update public.service_requests
    set show_in_alerts = false,
        updated_at = clock_timestamp(),
        last_actor_name = v_actor_name
    where id = p_service_request_id;

    if not v_task.show_in_alerts then
      update public.hub_tasks
      set show_in_alerts = true,
          last_actor_name = v_actor_name,
          updated_at = clock_timestamp()
      where id = v_task.id
      returning * into v_task;
    end if;

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
      last_actor_name,
      show_in_alerts
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
      v_actor_name,
      true
    )
    returning * into v_task;
  exception
    when unique_violation then
      select * into v_task
      from public.hub_tasks
      where source_service_request_id = p_service_request_id
        and archived_at is null
      for update;

      if found then
        update public.service_requests
        set show_in_alerts = false,
            updated_at = clock_timestamp(),
            last_actor_name = v_actor_name
        where id = p_service_request_id;
        return next v_task;
        return;
      end if;

      raise;
  end;

  update public.service_requests
  set show_in_alerts = false,
      updated_at = clock_timestamp(),
      last_actor_name = v_actor_name
  where id = p_service_request_id;

  return next v_task;
end;
$$;

create or replace function public.complete_hub_task_and_source(
  p_task_id uuid,
  p_actor_name text
)
returns boolean
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_source_service_request_id uuid;
  v_found boolean := false;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para concluir tarefa.' using errcode = '42501';
  end if;

  select source_service_request_id
  into v_source_service_request_id
  from public.hub_tasks
  where id = p_task_id
    and archived_at is null
  for update;

  v_found := found;
  if not v_found then
    return false;
  end if;

  delete from public.hub_tasks where id = p_task_id;

  if v_source_service_request_id is not null then
    delete from public.service_requests
    where id = v_source_service_request_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.complete_hub_task_and_source(uuid, text) from public, anon;
grant execute on function public.complete_hub_task_and_source(uuid, text) to authenticated;

notify pgrst, 'reload schema';
