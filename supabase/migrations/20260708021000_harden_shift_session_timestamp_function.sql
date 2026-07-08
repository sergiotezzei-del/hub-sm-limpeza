create or replace function public.set_shift_session_server_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active'
    and (tg_op = 'INSERT' or old.status <> 'active')
    and new.started_at is null then
    new.started_at = now();
  end if;

  if new.status in ('ended', 'auto_ended')
    and (tg_op = 'INSERT' or old.status not in ('ended', 'auto_ended'))
    and new.ended_at is null then
    new.ended_at = now();
  end if;

  return new;
end;
$$;
