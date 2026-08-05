create table public.hub_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  description text,
  status text not null default 'a_fazer'
    check (status in ('a_fazer', 'em_andamento', 'aguardando', 'concluido')),
  priority text not null default 'media'
    check (priority in ('baixa', 'media', 'alta', 'urgente')),
  department text not null default 'Geral' check (btrim(department) <> ''),
  assignee_user_id text references public.managed_users(id) on update cascade on delete set null,
  due_date date,
  sort_order integer not null default 0 check (sort_order >= 0),
  source_module text,
  created_by_user_id text references public.managed_users(id) on update cascade on delete set null,
  created_by_name text not null check (btrim(created_by_name) <> ''),
  last_actor_name text not null check (btrim(last_actor_name) <> ''),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by_auth_user uuid default auth.uid(),
  updated_by_auth_user uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hub_tasks_status_order_idx
  on public.hub_tasks(status, sort_order, created_at)
  where archived_at is null;
create index hub_tasks_assignee_idx
  on public.hub_tasks(assignee_user_id, status, due_date)
  where archived_at is null;
create index hub_tasks_due_date_idx
  on public.hub_tasks(due_date, status)
  where archived_at is null and due_date is not null;
create index hub_tasks_department_idx
  on public.hub_tasks(department, status)
  where archived_at is null;

create table public.hub_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.hub_tasks(id) on delete restrict,
  event_type text not null
    check (event_type in ('criada', 'editada', 'status_alterado', 'concluida', 'reaberta', 'arquivada')),
  from_status text
    check (from_status is null or from_status in ('a_fazer', 'em_andamento', 'aguardando', 'concluido')),
  to_status text
    check (to_status is null or to_status in ('a_fazer', 'em_andamento', 'aguardando', 'concluido')),
  actor_auth_user uuid default auth.uid(),
  actor_name text not null check (btrim(actor_name) <> ''),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index hub_task_events_task_idx
  on public.hub_task_events(task_id, created_at desc);

create or replace function public.prepare_hub_task_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by_auth_user := auth.uid();

  if new.status = 'concluido' and old.status <> 'concluido' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'concluido' and old.status = 'concluido' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger hub_tasks_prepare_state
before update on public.hub_tasks
for each row execute function public.prepare_hub_task_state();

create or replace function public.record_hub_task_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
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
      jsonb_build_object(
        'priority', new.priority,
        'department', new.department,
        'assignee_user_id', new.assignee_user_id,
        'due_date', new.due_date
      )
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
     or old.source_module is distinct from new.source_module then
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

create trigger hub_tasks_record_insert
  after insert on public.hub_tasks
  for each row execute function public.record_hub_task_event();
create trigger hub_tasks_record_update
  after update on public.hub_tasks
  for each row execute function public.record_hub_task_event();

alter table public.hub_tasks enable row level security;
alter table public.hub_task_events enable row level security;

grant select, insert, update on public.hub_tasks to authenticated;
grant select on public.hub_task_events to authenticated;
revoke all on public.hub_tasks from anon;
revoke all on public.hub_task_events from anon;

create policy hub_tasks_admin_select
  on public.hub_tasks for select to authenticated
  using ((select public.is_hub_admin()));
create policy hub_tasks_admin_insert
  on public.hub_tasks for insert to authenticated
  with check ((select public.is_hub_admin()));
create policy hub_tasks_admin_update
  on public.hub_tasks for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));
create policy hub_task_events_admin_select
  on public.hub_task_events for select to authenticated
  using ((select public.is_hub_admin()));

revoke all on function public.prepare_hub_task_state() from public;
revoke all on function public.record_hub_task_event() from public;

update public.managed_users
set permissions = array_append(permissions, 'afazeres'),
    updated_at = now()
where id = 'tezzei'
  and not ('afazeres' = any(permissions));
