begin;

create or replace function private.auditorio_prevent_early_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'concluido'
     and old.status is distinct from 'concluido'
     and new.fim_reserva > now() then
    raise exception 'AUDITORIO_RESERVA_AINDA_NAO_TERMINOU';
  end if;

  return new;
end;
$$;

revoke execute on function private.auditorio_prevent_early_completion() from public, anon, authenticated;

drop trigger if exists trg_auditorio_prevent_early_completion on public.auditorio_reservas;
create trigger trg_auditorio_prevent_early_completion
before update of status on public.auditorio_reservas
for each row execute function private.auditorio_prevent_early_completion();

commit;
