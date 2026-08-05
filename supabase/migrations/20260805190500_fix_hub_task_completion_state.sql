create or replace function public.prepare_hub_task_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by_auth_user := auth.uid();

  if tg_op = 'INSERT' then
    if new.status = 'concluido' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
    return new;
  end if;

  if new.status = 'concluido' then
    new.completed_at := coalesce(old.completed_at, new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists hub_tasks_prepare_state on public.hub_tasks;
create trigger hub_tasks_prepare_state
before insert or update on public.hub_tasks
for each row execute function public.prepare_hub_task_state();
