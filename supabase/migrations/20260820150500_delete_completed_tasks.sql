alter table public.hub_task_events
  drop constraint if exists hub_task_events_task_id_fkey;

alter table public.hub_task_events
  add constraint hub_task_events_task_id_fkey
  foreign key (task_id)
  references public.hub_tasks(id)
  on delete cascade;

drop policy if exists hub_tasks_admin_delete on public.hub_tasks;
create policy hub_tasks_admin_delete
  on public.hub_tasks
  for delete
  to authenticated
  using ((select public.is_hub_admin()));

-- A partir desta versão, tarefa concluída não fica armazenada no quadro.
-- Remove também as tarefas que já estavam na coluna Concluído.
delete from public.hub_tasks
where status = 'concluido';
