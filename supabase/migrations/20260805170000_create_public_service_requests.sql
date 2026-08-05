begin;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  protocol_number bigint generated always as identity,
  public_submission_id uuid not null unique,
  requester_name text not null,
  department text not null,
  request_text text not null,
  status text not null default 'novo',
  admin_notes text,
  last_actor_name text not null default 'Solicitante',
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint service_requests_protocol_number_key unique (protocol_number),
  constraint service_requests_requester_name_check check (char_length(btrim(requester_name)) between 2 and 120),
  constraint service_requests_department_check check (char_length(btrim(department)) between 2 and 80),
  constraint service_requests_request_text_check check (char_length(btrim(request_text)) between 5 and 3000),
  constraint service_requests_status_check check (status in ('novo', 'em_andamento', 'aguardando', 'concluido', 'cancelado'))
);

create table if not exists public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_name text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint service_request_events_type_check check (event_type in ('criado', 'status_alterado', 'anotacao')),
  constraint service_request_events_from_status_check check (from_status is null or from_status in ('novo', 'em_andamento', 'aguardando', 'concluido', 'cancelado')),
  constraint service_request_events_to_status_check check (to_status is null or to_status in ('novo', 'em_andamento', 'aguardando', 'concluido', 'cancelado'))
);

create index if not exists service_requests_status_opened_idx
  on public.service_requests(status, opened_at desc);
create index if not exists service_requests_department_idx
  on public.service_requests(department);
create index if not exists service_requests_opened_idx
  on public.service_requests(opened_at desc);
create index if not exists service_request_events_request_created_idx
  on public.service_request_events(request_id, created_at desc);

create or replace function public.set_service_request_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.requester_name := btrim(new.requester_name);
  new.department := btrim(new.department);
  new.request_text := btrim(new.request_text);
  new.admin_notes := nullif(btrim(coalesce(new.admin_notes, '')), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status in ('em_andamento', 'aguardando', 'concluido') then
      new.started_at := coalesce(new.started_at, now());
    end if;
    if new.status = 'concluido' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    if new.status = 'cancelado' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('em_andamento', 'aguardando', 'concluido') then
      new.started_at := coalesce(old.started_at, new.started_at, now());
    end if;

    if new.status = 'concluido' then
      new.completed_at := now();
      new.cancelled_at := null;
    elsif old.status = 'concluido' then
      new.completed_at := null;
    end if;

    if new.status = 'cancelado' then
      new.cancelled_at := now();
      new.completed_at := null;
    elsif old.status = 'cancelado' then
      new.cancelled_at := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.record_service_request_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_request_events (
      request_id,
      event_type,
      to_status,
      actor_name,
      note
    ) values (
      new.id,
      'criado',
      new.status,
      new.last_actor_name,
      'Chamado aberto'
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.service_request_events (
      request_id,
      event_type,
      from_status,
      to_status,
      actor_name,
      note
    ) values (
      new.id,
      'status_alterado',
      old.status,
      new.status,
      new.last_actor_name,
      new.admin_notes
    );
  end if;

  if new.admin_notes is distinct from old.admin_notes
     and new.status is not distinct from old.status then
    insert into public.service_request_events (
      request_id,
      event_type,
      from_status,
      to_status,
      actor_name,
      note
    ) values (
      new.id,
      'anotacao',
      new.status,
      new.status,
      new.last_actor_name,
      new.admin_notes
    );
  end if;

  return new;
end;
$$;

drop trigger if exists service_requests_set_state on public.service_requests;
create trigger service_requests_set_state
before insert or update on public.service_requests
for each row execute function public.set_service_request_state();

drop trigger if exists service_requests_record_event on public.service_requests;
create trigger service_requests_record_event
after insert or update on public.service_requests
for each row execute function public.record_service_request_event();

alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;

revoke all on table public.service_requests from anon;
revoke all on table public.service_request_events from anon;

revoke all on table public.service_requests from authenticated;
grant select, insert, update, delete on table public.service_requests to authenticated;

revoke all on table public.service_request_events from authenticated;
grant select on table public.service_request_events to authenticated;

revoke all on function public.set_service_request_state() from public, anon, authenticated, service_role;
revoke all on function public.record_service_request_event() from public, anon, authenticated, service_role;

revoke all on sequence public.service_requests_protocol_number_seq from anon, authenticated;

create policy service_requests_admin_all
on public.service_requests
for all
to authenticated
using (public.is_hub_admin())
with check (public.is_hub_admin());

create policy service_request_events_admin_select
on public.service_request_events
for select
to authenticated
using (public.is_hub_admin());

create or replace function public.create_public_service_request(
  p_submission_id uuid,
  p_requester_name text,
  p_department text,
  p_request_text text
)
returns table (
  request_id uuid,
  protocol_number bigint,
  opened_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_id uuid;
  v_protocol_number bigint;
  v_opened_at timestamptz;
  v_name text := btrim(coalesce(p_requester_name, ''));
  v_department text := btrim(coalesce(p_department, ''));
  v_request_text text := btrim(coalesce(p_request_text, ''));
begin
  if p_submission_id is null then
    raise exception 'Identificador de envio inválido.' using errcode = '22023';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe seu nome com 2 a 120 caracteres.' using errcode = '22023';
  end if;

  if v_department <> all(array[
    'Administração',
    'Diretoria',
    'Infraestrutura',
    'Manutenção',
    'Limpeza',
    'Copa / Café',
    'Segurança',
    'Recepção',
    'Financeiro',
    'Contratos',
    'Locação',
    'Vendas',
    'Marketing',
    'Jurídico',
    'Compras / Estoque',
    'Patrimônio',
    'Outro'
  ]::text[]) then
    raise exception 'Selecione um setor válido.' using errcode = '22023';
  end if;

  if char_length(v_request_text) < 5 or char_length(v_request_text) > 3000 then
    raise exception 'Descreva o que precisa com 5 a 3000 caracteres.' using errcode = '22023';
  end if;

  select sr.id, sr.protocol_number, sr.opened_at
    into v_request_id, v_protocol_number, v_opened_at
  from public.service_requests sr
  where sr.public_submission_id = p_submission_id;

  if v_request_id is not null then
    return query select v_request_id, v_protocol_number, v_opened_at;
    return;
  end if;

  insert into public.service_requests (
    public_submission_id,
    requester_name,
    department,
    request_text,
    status,
    last_actor_name
  ) values (
    p_submission_id,
    v_name,
    v_department,
    v_request_text,
    'novo',
    v_name
  )
  on conflict (public_submission_id) do nothing
  returning id, service_requests.protocol_number, service_requests.opened_at
    into v_request_id, v_protocol_number, v_opened_at;

  if v_request_id is null then
    select sr.id, sr.protocol_number, sr.opened_at
      into v_request_id, v_protocol_number, v_opened_at
    from public.service_requests sr
    where sr.public_submission_id = p_submission_id;
  end if;

  return query select v_request_id, v_protocol_number, v_opened_at;
end;
$$;

revoke all on function public.create_public_service_request(uuid, text, text, text) from public;
grant execute on function public.create_public_service_request(uuid, text, text, text) to anon, authenticated;

update public.managed_users
set permissions = array_append(permissions, 'chamados'),
    updated_at = now()
where id = 'tezzei'
  and not ('chamados' = any(permissions));

commit;
