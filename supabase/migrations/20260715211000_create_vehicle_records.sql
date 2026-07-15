create table if not exists public.vehicle_records (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  normalized_plate text not null,
  owner_name text,
  owner_type text not null default 'Funcionário',
  department text,
  brand text,
  model text,
  color text,
  car_photo_data text,
  plate_photo_data text,
  parking_authorized boolean not null default true,
  parking_priority boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_records_normalized_plate_unique unique (normalized_plate),
  constraint vehicle_records_owner_type_check check (owner_type in ('Funcionário', 'Corretor', 'Cliente', 'Prestador', 'Diretoria', 'Visitante', 'Outro'))
);

create unique index if not exists vehicle_records_normalized_plate_idx on public.vehicle_records (normalized_plate);
create index if not exists vehicle_records_active_idx on public.vehicle_records (active);
create index if not exists vehicle_records_owner_type_idx on public.vehicle_records (owner_type);
create index if not exists vehicle_records_department_idx on public.vehicle_records (department);

create or replace function public.set_vehicle_records_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_records_updated_at on public.vehicle_records;
create trigger vehicle_records_updated_at
before update on public.vehicle_records
for each row
execute function public.set_vehicle_records_updated_at();

alter table public.vehicle_records enable row level security;

revoke all on table public.vehicle_records from anon;

grant select, insert, update on table public.vehicle_records to authenticated;
grant select, insert, update, delete on table public.vehicle_records to service_role;

drop policy if exists "vehicle_records_authorized_select" on public.vehicle_records;
create policy "vehicle_records_authorized_select"
on public.vehicle_records
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'estacionamento-consulta', false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'estacionamento-cadastro', false)
);

drop policy if exists "vehicle_records_authorized_insert" on public.vehicle_records;
create policy "vehicle_records_authorized_insert"
on public.vehicle_records
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'estacionamento-cadastro', false)
);

drop policy if exists "vehicle_records_authorized_update" on public.vehicle_records;
create policy "vehicle_records_authorized_update"
on public.vehicle_records
for update
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'estacionamento-cadastro', false)
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'estacionamento-cadastro', false)
);

insert into public.vehicle_records (
  plate,
  normalized_plate,
  owner_name,
  owner_type,
  department,
  brand,
  model,
  color,
  parking_authorized,
  parking_priority,
  notes,
  active
) values
  ('GJU-6539', 'GJU6539', 'Aline', 'Funcionário', 'Vendas', 'Chevrolet', 'Prisma', 'Chumbo', true, false, null, true),
  ('SWS7H49', 'SWS7H49', 'Andreia', 'Funcionário', 'Vendas', 'Chevrolet', 'Onix', 'Branco', true, false, null, true),
  ('DDE-4270', 'DDE4270', 'Eduardo', 'Funcionário', 'Vendas', 'Volkswagen', 'Polo', 'Chumbo', true, false, null, true),
  ('CUB7I86', 'CUB7I86', 'Carla', 'Funcionário', 'Adm', 'Nissan', 'Kiks', 'Chumbo', true, false, 'tudo q for adm é complicado', true),
  ('GHN-1755', 'GHN1755', 'Mariana', 'Funcionário', 'Vendas', 'Renault', 'Logan', 'Preto', true, false, 'foco do patio é cliente e corretores', true),
  ('TIS9I16', 'TIS9I16', 'Patrícia', 'Funcionário', 'Locação', 'Caoachery', 'Tiggo7', 'Branco', true, false, null, true),
  ('BWC-3030', 'BWC3030', 'Maurício', 'Funcionário', 'Adm', 'Chevrolet', 'Onix', 'Preto', true, false, 'adm chega 7h e fica o dia todo tomando 1 vaga', true),
  ('EIX7B67', 'EIX7B67', 'Julio', 'Funcionário', 'Adm', 'Volkswagen', 'Gol', 'Preto', true, false, 'isso é pessimo', true),
  ('FLL-0450', 'FLL0450', 'Peres', 'Funcionário', 'Vendas', 'Ford', 'EcoSport', 'Prata', true, false, null, true),
  ('FPC1D02', 'FPC1D02', 'Regina', 'Funcionário', 'Vendas', 'Honda', 'WR-V', 'Chumbo', true, false, null, true),
  ('STN3G03', 'STN3G03', 'Adriana', 'Funcionário', 'Locação', 'Hyundai', 'Hb20', 'Branco', true, false, null, true),
  ('FKV-2498', 'FKV2498', 'Adilson', 'Funcionário', 'Adm', 'Volkswagen', 'Fox', 'Prata', true, false, null, true),
  ('UGS8J50', 'UGS8J50', 'Fabiana', 'Funcionário', 'Vendas', 'Fiat', 'Fastback', 'Prata', true, false, 'Fernandão', true),
  ('CCC3G98', 'CCC3G98', 'Eliane', 'Funcionário', 'Financeiro', 'Chevrolet', 'Spin', 'Preto', true, false, null, true),
  ('FHK8F70', 'FHK8F70', 'Priscila', 'Funcionário', 'Adm', 'Chevrolet', 'Onix', 'Prata', true, false, null, true),
  ('FMQ2G74', 'FMQ2G74', 'Guimarães', 'Funcionário', 'Vendas', 'Chevrolet', 'Onix', 'Prata', true, false, null, true),
  ('FMF7J36', 'FMF7J36', 'Leonardo', 'Funcionário', 'Vendas', 'Honda', 'Acord', 'Prata', true, false, null, true),
  ('BXK-1021', 'BXK1021', 'Estela', 'Funcionário', 'Adm', 'Volkswagen', 'Gol Quadrado', 'Prata', true, false, null, true),
  ('KRG-6169', 'KRG6169', 'Zilda', 'Funcionário', 'Vendas', 'Hyundai', 'HB20', 'Branco', true, false, 'Cacilda', true),
  ('CVJ-1590', 'CVJ1590', 'Deyse', 'Funcionário', 'Locação', 'Fiat', 'Palio', 'Cinza', true, false, null, true),
  ('NWJ-4928', 'NWJ4928', 'Brenno Bardela', 'Funcionário', 'Adm', 'KIA', 'Cerato', 'Vinho', true, false, null, true),
  ('EWQ-9317', 'EWQ9317', 'Roger', 'Funcionário', 'Adm', 'Chevrolet', 'Astras', 'Preto', true, false, null, true),
  ('QNN7C28', 'QNN7C28', 'Ramyz', 'Funcionário', 'Locação', 'Volkswagen', 'Gol', 'Prata', true, false, null, true),
  ('ENG9F53', 'ENG9F53', 'Marcelo', 'Funcionário', 'Vendas', 'Toyota', 'Yaris', 'Prata', true, false, 'Registro duplicado na planilha: Toyota Yaras sem observação; Toyota Yaris com observação Peres.', true),
  ('FRS6H14', 'FRS6H14', 'Leia', 'Funcionário', 'Vendas', 'Honda', 'Fit', 'Chumbo', true, false, null, true),
  ('EMA9A05', 'EMA9A05', 'Celia', 'Funcionário', 'Vendas', 'Honda', 'HR-V', 'Branco', true, false, 'Cacilda', true),
  ('GJB-5458', 'GJB5458', 'Maria', 'Funcionário', 'Marketing', 'Chevrolet', 'Montana', 'Chumbo', true, false, null, true),
  ('EMF5C77', 'EMF5C77', 'Pedro', 'Funcionário', 'Adm', 'Mercedes', 'B 180', 'Prata', true, false, null, true),
  ('QQB7J26', 'QQB7J26', 'Natália', 'Funcionário', 'Vendas', 'Chevrolet', 'Onix', 'Branco', true, false, null, true),
  ('FTH-4129', 'FTH4129', 'Petombeira', 'Funcionário', 'Adm', 'Fiat', 'Uno', 'Branco', true, false, null, true),
  ('DMT2B99', 'DMT2B99', 'Vava', 'Funcionário', 'Vendas', 'Corolla', 'Yaras', 'Preto', true, false, null, true),
  ('FGA4H11', 'FGA4H11', 'Valéria', 'Funcionário', 'Vendas', 'Volkswagen', 'T-Cross', 'Azul Marinho', true, false, 'Cacilda', true),
  ('FWI6G05', 'FWI6G05', 'Maria Cláudia', 'Funcionário', 'Vendas', 'Hyundai', 'Hb20', 'Prata', true, false, null, true),
  ('TIP0H62', 'TIP0H62', 'Cacilda', 'Funcionário', 'Vendas', 'BYD', 'Song', 'Chumbo', true, false, null, true),
  ('FMQ0G44', 'FMQ0G44', 'Marcelo', 'Funcionário', 'Vendas', 'Volkswagen', 'Nivus', 'Cinza', true, false, null, true),
  ('GYN-5544', 'GYN5544', 'Raquel', 'Funcionário', 'Vendas', 'Ford', 'Fiesta', 'Prata', true, false, null, true),
  ('AVG3C38', 'AVG3C38', 'Thais', 'Funcionário', 'Locação', 'Citroen', 'C3', 'Prata', true, false, null, true),
  ('BRN-8727', 'BRN8727', 'Arthur', 'Funcionário', 'Marketing', 'Nissan', 'Marcha Sv', 'Preto', true, false, null, true),
  ('FKV2C06', 'FKV2C06', 'Cleo', 'Funcionário', 'IHome', 'Hyundai', 'Hb20', 'Branco', true, false, null, true),
  ('ENT7965', 'ENT7965', 'Aline Cristina', 'Funcionário', 'Vendas', 'Fiat', 'Siena', 'Preto', true, false, 'Angela', true),
  ('FQE9799', 'FQE9799', 'Daniel Tadeu', 'Funcionário', 'Vendas', 'Honda', 'Fit', 'Preto', true, false, 'Angela', true),
  ('UGS 1G99', 'UGS1G99', 'FABIO TRINOVA', 'Funcionário', null, 'FIAT', 'Titano', 'AZUL', true, false, 'Departamento não informado na planilha.', true),
  ('DXY4B15', 'DXY4B15', 'Rose', 'Funcionário', 'Vendas', 'Volkswagen', 'Fox', 'Preto', true, false, 'Fabio', true),
  ('FBW 4218', 'FBW4218', 'Carla', 'Funcionário', 'Adm', 'Ford', 'Eco Sport', 'Prata', true, false, null, true),
  ('DDS4H52', 'DDS4H52', 'Canella', 'Funcionário', 'Vendas', 'Honda', 'Fit', 'Prata', true, false, 'Fabio', true),
  ('FVO3G84', 'FVO3G84', 'Marina', 'Funcionário', 'Administrativo', 'Fiat', 'Cronos', 'Chumbo', true, false, null, true),
  ('UEB3D18', 'UEB3D18', 'Igor', 'Funcionário', 'Vendas', 'Volksvagen', 'Traker', 'Preto', true, false, 'Fabio', true)
on conflict (normalized_plate) do update set
  plate = excluded.plate,
  owner_name = excluded.owner_name,
  owner_type = excluded.owner_type,
  department = excluded.department,
  brand = excluded.brand,
  model = excluded.model,
  color = excluded.color,
  parking_authorized = excluded.parking_authorized,
  parking_priority = excluded.parking_priority,
  notes = excluded.notes,
  active = excluded.active;
