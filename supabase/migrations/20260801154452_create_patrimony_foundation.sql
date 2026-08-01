create or replace function public.is_hub_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
    or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false);
$$;

revoke all on function public.is_hub_admin() from public;
grant execute on function public.is_hub_admin() to authenticated;

create table public.organization_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  person_type text not null default 'funcionario'
    check (person_type in ('funcionario','corretor_terceirizado','consultor_terceirizado','prestador','temporario','outro')),
  department text not null default 'Não informado',
  job_title text,
  email text,
  phone text,
  managed_user_id text references public.managed_users(id) on update cascade on delete set null,
  active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organization_people_managed_user_unique
  on public.organization_people(managed_user_id)
  where managed_user_id is not null;
create index organization_people_name_idx on public.organization_people(lower(name));
create index organization_people_department_idx on public.organization_people(department) where active;

create table public.patrimony_spaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  space_type text not null
    check (space_type in ('mesa','locker','gaveta','estoque','sala','outro')),
  department text not null default 'Não informado',
  location_detail text,
  parent_space_id uuid references public.patrimony_spaces(id) on delete set null,
  status text not null default 'disponivel'
    check (status in ('disponivel','ocupado','manutencao','inativo')),
  map_group text,
  layout_x numeric,
  layout_y numeric,
  layout_width numeric,
  layout_height numeric,
  layout_rotation numeric,
  active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (layout_x is null or (layout_x >= 0 and layout_x <= 100)),
  check (layout_y is null or (layout_y >= 0 and layout_y <= 100)),
  check (layout_width is null or (layout_width > 0 and layout_width <= 100)),
  check (layout_height is null or (layout_height > 0 and layout_height <= 100))
);

create index patrimony_spaces_type_idx on public.patrimony_spaces(space_type, department) where active;
create index patrimony_spaces_parent_idx on public.patrimony_spaces(parent_space_id);

create table public.patrimony_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  category text not null check (btrim(category) <> ''),
  tracking_mode text not null default 'individual'
    check (tracking_mode in ('individual','quantidade')),
  brand text,
  model text,
  serial_number text,
  unit text not null default 'Unidade',
  total_quantity numeric not null default 1 check (total_quantity >= 0),
  available_quantity numeric not null default 1 check (available_quantity >= 0),
  maintenance_quantity numeric not null default 0 check (maintenance_quantity >= 0),
  lost_quantity numeric not null default 0 check (lost_quantity >= 0),
  status text not null default 'disponivel'
    check (status in ('disponivel','em_uso','parcialmente_em_uso','manutencao','indisponivel','baixado','extraviado')),
  storage_space_id uuid references public.patrimony_spaces(id) on delete set null,
  linked_space_id uuid references public.patrimony_spaces(id) on delete set null,
  acquisition_date date,
  active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (tracking_mode = 'individual' and total_quantity = 1 and available_quantity <= 1 and maintenance_quantity <= 1 and lost_quantity <= 1)
    or tracking_mode = 'quantidade'
  ),
  check (available_quantity + maintenance_quantity + lost_quantity <= total_quantity)
);

create unique index patrimony_items_serial_unique
  on public.patrimony_items(lower(serial_number))
  where serial_number is not null and btrim(serial_number) <> '';
create index patrimony_items_status_idx on public.patrimony_items(status, category) where active;
create index patrimony_items_storage_space_idx on public.patrimony_items(storage_space_id);
create index patrimony_items_linked_space_idx on public.patrimony_items(linked_space_id);

create table public.patrimony_assignments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.patrimony_items(id) on delete restrict,
  person_id uuid not null references public.organization_people(id) on delete restrict,
  destination_space_id uuid references public.patrimony_spaces(id) on delete set null,
  quantity numeric not null check (quantity > 0),
  returned_quantity numeric not null default 0 check (returned_quantity >= 0 and returned_quantity <= quantity),
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  last_return_condition text
    check (last_return_condition is null or last_return_condition in ('bom','danificado','perdido')),
  assigned_by_auth_user uuid default auth.uid(),
  assigned_by_name text not null,
  returned_by_auth_user uuid,
  returned_by_name text,
  notes text,
  return_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((returned_at is null and returned_quantity < quantity) or (returned_at is not null and returned_quantity = quantity))
);

create index patrimony_assignments_open_item_idx
  on public.patrimony_assignments(item_id, assigned_at desc)
  where returned_at is null;
create index patrimony_assignments_open_person_idx
  on public.patrimony_assignments(person_id, assigned_at desc)
  where returned_at is null;

create table public.patrimony_space_assignments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.patrimony_spaces(id) on delete restrict,
  person_id uuid not null references public.organization_people(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  assigned_by_auth_user uuid default auth.uid(),
  assigned_by_name text not null,
  released_by_auth_user uuid,
  released_by_name text,
  notes text,
  release_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index patrimony_space_assignments_one_active_per_space
  on public.patrimony_space_assignments(space_id)
  where released_at is null;
create index patrimony_space_assignments_person_idx
  on public.patrimony_space_assignments(person_id, assigned_at desc)
  where released_at is null;

create table public.patrimony_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null
    check (movement_type in ('cadastro','entrada_estoque','entrega','devolucao','transferencia','ajuste','manutencao','baixa','alocacao_espaco','liberacao_espaco')),
  item_id uuid references public.patrimony_items(id) on delete restrict,
  assignment_id uuid references public.patrimony_assignments(id) on delete set null,
  space_id uuid references public.patrimony_spaces(id) on delete restrict,
  space_assignment_id uuid references public.patrimony_space_assignments(id) on delete set null,
  person_id uuid references public.organization_people(id) on delete restrict,
  quantity numeric not null default 1 check (quantity > 0),
  condition text check (condition is null or condition in ('bom','danificado','perdido')),
  actor_auth_user uuid default auth.uid(),
  actor_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  check (item_id is not null or space_id is not null)
);

create index patrimony_movements_item_idx on public.patrimony_movements(item_id, created_at desc);
create index patrimony_movements_person_idx on public.patrimony_movements(person_id, created_at desc);
create index patrimony_movements_space_idx on public.patrimony_movements(space_id, created_at desc);

create or replace function public.set_patrimony_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organization_people_updated_at before update on public.organization_people for each row execute function public.set_patrimony_updated_at();
create trigger patrimony_spaces_updated_at before update on public.patrimony_spaces for each row execute function public.set_patrimony_updated_at();
create trigger patrimony_items_updated_at before update on public.patrimony_items for each row execute function public.set_patrimony_updated_at();
create trigger patrimony_assignments_updated_at before update on public.patrimony_assignments for each row execute function public.set_patrimony_updated_at();
create trigger patrimony_space_assignments_updated_at before update on public.patrimony_space_assignments for each row execute function public.set_patrimony_updated_at();

alter table public.organization_people enable row level security;
alter table public.patrimony_spaces enable row level security;
alter table public.patrimony_items enable row level security;
alter table public.patrimony_assignments enable row level security;
alter table public.patrimony_space_assignments enable row level security;
alter table public.patrimony_movements enable row level security;

grant select, insert, update, delete on public.organization_people to authenticated;
grant select, insert, update, delete on public.patrimony_spaces to authenticated;
grant select, insert, update, delete on public.patrimony_items to authenticated;
grant select, insert, update, delete on public.patrimony_assignments to authenticated;
grant select, insert, update, delete on public.patrimony_space_assignments to authenticated;
grant select, insert on public.patrimony_movements to authenticated;

revoke all on public.organization_people from anon;
revoke all on public.patrimony_spaces from anon;
revoke all on public.patrimony_items from anon;
revoke all on public.patrimony_assignments from anon;
revoke all on public.patrimony_space_assignments from anon;
revoke all on public.patrimony_movements from anon;

create policy organization_people_admin_select on public.organization_people for select to authenticated using ((select public.is_hub_admin()));
create policy organization_people_admin_insert on public.organization_people for insert to authenticated with check ((select public.is_hub_admin()));
create policy organization_people_admin_update on public.organization_people for update to authenticated using ((select public.is_hub_admin())) with check ((select public.is_hub_admin()));
create policy organization_people_admin_delete on public.organization_people for delete to authenticated using ((select public.is_hub_admin()));

create policy patrimony_spaces_admin_select on public.patrimony_spaces for select to authenticated using ((select public.is_hub_admin()));
create policy patrimony_spaces_admin_insert on public.patrimony_spaces for insert to authenticated with check ((select public.is_hub_admin()));
create policy patrimony_spaces_admin_update on public.patrimony_spaces for update to authenticated using ((select public.is_hub_admin())) with check ((select public.is_hub_admin()));
create policy patrimony_spaces_admin_delete on public.patrimony_spaces for delete to authenticated using ((select public.is_hub_admin()));

create policy patrimony_items_admin_select on public.patrimony_items for select to authenticated using ((select public.is_hub_admin()));
create policy patrimony_items_admin_insert on public.patrimony_items for insert to authenticated with check ((select public.is_hub_admin()));
create policy patrimony_items_admin_update on public.patrimony_items for update to authenticated using ((select public.is_hub_admin())) with check ((select public.is_hub_admin()));
create policy patrimony_items_admin_delete on public.patrimony_items for delete to authenticated using ((select public.is_hub_admin()));

create policy patrimony_assignments_admin_select on public.patrimony_assignments for select to authenticated using ((select public.is_hub_admin()));
create policy patrimony_assignments_admin_insert on public.patrimony_assignments for insert to authenticated with check ((select public.is_hub_admin()));
create policy patrimony_assignments_admin_update on public.patrimony_assignments for update to authenticated using ((select public.is_hub_admin())) with check ((select public.is_hub_admin()));
create policy patrimony_assignments_admin_delete on public.patrimony_assignments for delete to authenticated using ((select public.is_hub_admin()));

create policy patrimony_space_assignments_admin_select on public.patrimony_space_assignments for select to authenticated using ((select public.is_hub_admin()));
create policy patrimony_space_assignments_admin_insert on public.patrimony_space_assignments for insert to authenticated with check ((select public.is_hub_admin()));
create policy patrimony_space_assignments_admin_update on public.patrimony_space_assignments for update to authenticated using ((select public.is_hub_admin())) with check ((select public.is_hub_admin()));
create policy patrimony_space_assignments_admin_delete on public.patrimony_space_assignments for delete to authenticated using ((select public.is_hub_admin()));

create policy patrimony_movements_admin_select on public.patrimony_movements for select to authenticated using ((select public.is_hub_admin()));
create policy patrimony_movements_admin_insert on public.patrimony_movements for insert to authenticated with check ((select public.is_hub_admin()));

create or replace function public.register_patrimony_assignment(
  p_assignment_id uuid,
  p_item_id uuid,
  p_person_id uuid,
  p_quantity numeric,
  p_destination_space_id uuid default null,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(assignment_id uuid, item_status text, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.patrimony_items%rowtype;
  v_existing public.patrimony_assignments%rowtype;
  v_person_active boolean;
  v_space_active boolean;
  v_new_available numeric;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para movimentar patrimonio'; end if;
  if p_assignment_id is null or p_item_id is null or p_person_id is null then raise exception 'Dados obrigatorios ausentes'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if btrim(coalesce(p_actor_name,'')) = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_existing from public.patrimony_assignments where id = p_assignment_id;
  if found then
    if v_existing.item_id <> p_item_id
       or v_existing.person_id <> p_person_id
       or v_existing.quantity <> p_quantity
       or v_existing.destination_space_id is distinct from p_destination_space_id then
      raise exception 'Identificador de operacao reutilizado com dados diferentes';
    end if;
    select status, available_quantity into item_status, available_quantity from public.patrimony_items where id = v_existing.item_id;
    assignment_id := v_existing.id;
    return next;
    return;
  end if;

  select * into v_item from public.patrimony_items where id = p_item_id for update;
  if not found or not v_item.active then raise exception 'Item nao encontrado ou inativo'; end if;
  if v_item.status in ('baixado','extraviado','manutencao','indisponivel') then raise exception 'Item indisponivel para entrega'; end if;
  if v_item.tracking_mode = 'individual' and p_quantity <> 1 then raise exception 'Item individual exige quantidade 1'; end if;
  if p_quantity > v_item.available_quantity then raise exception 'Quantidade indisponivel. Disponivel: % %', v_item.available_quantity, v_item.unit; end if;

  select active into v_person_active from public.organization_people where id = p_person_id;
  if coalesce(v_person_active,false) = false then raise exception 'Pessoa nao encontrada ou inativa'; end if;

  if p_destination_space_id is not null then
    select active and status <> 'inativo' into v_space_active from public.patrimony_spaces where id = p_destination_space_id;
    if coalesce(v_space_active,false) = false then raise exception 'Espaco nao encontrado ou inativo'; end if;
  end if;

  insert into public.patrimony_assignments(id,item_id,person_id,destination_space_id,quantity,assigned_by_name,notes)
  values (p_assignment_id,p_item_id,p_person_id,p_destination_space_id,p_quantity,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  v_new_available := v_item.available_quantity - p_quantity;
  update public.patrimony_items
     set available_quantity = v_new_available,
         status = case when v_new_available = 0 then 'em_uso' else 'parcialmente_em_uso' end
   where id = p_item_id
   returning status, public.patrimony_items.available_quantity into item_status, available_quantity;

  insert into public.patrimony_movements(movement_type,item_id,assignment_id,space_id,person_id,quantity,actor_name,notes)
  values ('entrega',p_item_id,p_assignment_id,p_destination_space_id,p_person_id,p_quantity,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  assignment_id := p_assignment_id;
  return next;
end;
$$;

create or replace function public.return_patrimony_assignment(
  p_assignment_id uuid,
  p_quantity numeric,
  p_condition text default 'bom',
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(assignment_id uuid, item_status text, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment public.patrimony_assignments%rowtype;
  v_item public.patrimony_items%rowtype;
  v_open_quantity numeric;
  v_remaining_assigned numeric;
  v_available numeric;
  v_maintenance numeric;
  v_lost numeric;
  v_status text;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para movimentar patrimonio'; end if;
  if p_assignment_id is null then raise exception 'Entrega obrigatoria'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if p_condition not in ('bom','danificado','perdido') then raise exception 'Estado de devolucao invalido'; end if;
  if btrim(coalesce(p_actor_name,'')) = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_assignment from public.patrimony_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Entrega nao encontrada'; end if;

  v_open_quantity := v_assignment.quantity - v_assignment.returned_quantity;
  if p_quantity > v_open_quantity then raise exception 'Quantidade de devolucao maior que a quantidade pendente'; end if;

  select * into v_item from public.patrimony_items where id = v_assignment.item_id for update;
  if not found then raise exception 'Item nao encontrado'; end if;

  update public.patrimony_assignments
     set returned_quantity = returned_quantity + p_quantity,
         returned_at = case when returned_quantity + p_quantity = quantity then now() else null end,
         last_return_condition = p_condition,
         returned_by_auth_user = auth.uid(),
         returned_by_name = btrim(p_actor_name),
         return_notes = nullif(btrim(coalesce(p_notes,'')),'')
   where id = p_assignment_id;

  v_available := v_item.available_quantity + case when p_condition = 'bom' then p_quantity else 0 end;
  v_maintenance := v_item.maintenance_quantity + case when p_condition = 'danificado' then p_quantity else 0 end;
  v_lost := v_item.lost_quantity + case when p_condition = 'perdido' then p_quantity else 0 end;

  select coalesce(sum(quantity - returned_quantity),0) into v_remaining_assigned
  from public.patrimony_assignments where item_id = v_item.id and returned_at is null;

  v_status := case
    when v_item.tracking_mode = 'individual' and v_lost > 0 then 'extraviado'
    when v_item.tracking_mode = 'individual' and v_maintenance > 0 then 'manutencao'
    when v_remaining_assigned > 0 and v_available > 0 then 'parcialmente_em_uso'
    when v_remaining_assigned > 0 then 'em_uso'
    when v_available > 0 then 'disponivel'
    when v_maintenance > 0 then 'manutencao'
    when v_lost >= v_item.total_quantity then 'extraviado'
    else 'indisponivel'
  end;

  update public.patrimony_items
     set available_quantity = v_available,
         maintenance_quantity = v_maintenance,
         lost_quantity = v_lost,
         status = v_status
   where id = v_item.id
   returning status, public.patrimony_items.available_quantity into item_status, available_quantity;

  insert into public.patrimony_movements(movement_type,item_id,assignment_id,space_id,person_id,quantity,condition,actor_name,notes)
  values ('devolucao',v_item.id,p_assignment_id,v_assignment.destination_space_id,v_assignment.person_id,p_quantity,p_condition,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  assignment_id := p_assignment_id;
  return next;
end;
$$;

create or replace function public.assign_patrimony_space(
  p_space_assignment_id uuid,
  p_space_id uuid,
  p_person_id uuid,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(space_assignment_id uuid, space_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.patrimony_space_assignments%rowtype;
  v_space public.patrimony_spaces%rowtype;
  v_person_active boolean;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para alocar espaco'; end if;
  if p_space_assignment_id is null or p_space_id is null or p_person_id is null then raise exception 'Dados obrigatorios ausentes'; end if;
  if btrim(coalesce(p_actor_name,'')) = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_existing from public.patrimony_space_assignments where id = p_space_assignment_id;
  if found then
    if v_existing.space_id <> p_space_id or v_existing.person_id <> p_person_id then raise exception 'Identificador de operacao reutilizado com dados diferentes'; end if;
    select status into space_status from public.patrimony_spaces where id = v_existing.space_id;
    space_assignment_id := v_existing.id;
    return next;
    return;
  end if;

  select * into v_space from public.patrimony_spaces where id = p_space_id for update;
  if not found or not v_space.active or v_space.status in ('manutencao','inativo') then raise exception 'Espaco nao disponivel'; end if;
  if exists(select 1 from public.patrimony_space_assignments where space_id=p_space_id and released_at is null) then raise exception 'Espaco ja ocupado'; end if;
  select active into v_person_active from public.organization_people where id=p_person_id;
  if coalesce(v_person_active,false)=false then raise exception 'Pessoa nao encontrada ou inativa'; end if;

  insert into public.patrimony_space_assignments(id,space_id,person_id,assigned_by_name,notes)
  values (p_space_assignment_id,p_space_id,p_person_id,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  update public.patrimony_spaces set status='ocupado' where id=p_space_id returning status into space_status;

  insert into public.patrimony_movements(movement_type,space_id,space_assignment_id,person_id,quantity,actor_name,notes)
  values ('alocacao_espaco',p_space_id,p_space_assignment_id,p_person_id,1,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  space_assignment_id := p_space_assignment_id;
  return next;
end;
$$;

create or replace function public.release_patrimony_space(
  p_space_assignment_id uuid,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(space_assignment_id uuid, space_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment public.patrimony_space_assignments%rowtype;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para liberar espaco'; end if;
  if p_space_assignment_id is null then raise exception 'Ocupacao obrigatoria'; end if;
  if btrim(coalesce(p_actor_name,'')) = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_assignment from public.patrimony_space_assignments where id=p_space_assignment_id for update;
  if not found then raise exception 'Ocupacao nao encontrada'; end if;
  if v_assignment.released_at is not null then
    select status into space_status from public.patrimony_spaces where id=v_assignment.space_id;
    space_assignment_id := v_assignment.id;
    return next;
    return;
  end if;

  update public.patrimony_space_assignments
     set released_at=now(),
         released_by_auth_user=auth.uid(),
         released_by_name=btrim(p_actor_name),
         release_notes=nullif(btrim(coalesce(p_notes,'')),'')
   where id=p_space_assignment_id;

  update public.patrimony_spaces set status='disponivel'
  where id=v_assignment.space_id and status <> 'inativo'
  returning status into space_status;

  insert into public.patrimony_movements(movement_type,space_id,space_assignment_id,person_id,quantity,actor_name,notes)
  values ('liberacao_espaco',v_assignment.space_id,p_space_assignment_id,v_assignment.person_id,1,btrim(p_actor_name),nullif(btrim(coalesce(p_notes,'')),''));

  space_assignment_id := p_space_assignment_id;
  return next;
end;
$$;

revoke all on function public.register_patrimony_assignment(uuid,uuid,uuid,numeric,uuid,text,text) from public, anon;
revoke all on function public.return_patrimony_assignment(uuid,numeric,text,text,text) from public, anon;
revoke all on function public.assign_patrimony_space(uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.release_patrimony_space(uuid,text,text) from public, anon;
grant execute on function public.register_patrimony_assignment(uuid,uuid,uuid,numeric,uuid,text,text) to authenticated;
grant execute on function public.return_patrimony_assignment(uuid,numeric,text,text,text) to authenticated;
grant execute on function public.assign_patrimony_space(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.release_patrimony_space(uuid,text,text) to authenticated;

insert into public.organization_people(name,person_type,department,job_title,managed_user_id,active,notes)
select name,'funcionario',coalesce(department,'Não informado'),job_title,id,active,'Importado automaticamente dos usuários existentes do HUB'
from public.managed_users
on conflict (managed_user_id) where managed_user_id is not null do nothing;

insert into public.patrimony_spaces(code,name,space_type,department,location_detail,map_group,notes)
values ('ESTOQUE-PATRIMONIO','Estoque Patrimonial','estoque','Administração','Estoque físico de equipamentos e periféricos','estoque','Local padrão para itens disponíveis')
on conflict (code) do nothing;

insert into public.patrimony_spaces(code,name,space_type,department,location_detail,map_group,notes)
select
  'LKR-' || lpad(number::text,3,'0'),
  'Locker ' || lpad(number::text,2,'0'),
  'locker',
  'Áreas comuns',
  'Conjunto de lockers',
  'lockers',
  'Cadastro inicial dos 72 lockers informado pela operação'
from generate_series(1,72) as number
on conflict (code) do nothing;
