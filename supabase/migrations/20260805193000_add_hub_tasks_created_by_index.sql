create index if not exists hub_tasks_created_by_user_idx
  on public.hub_tasks(created_by_user_id)
  where created_by_user_id is not null;
