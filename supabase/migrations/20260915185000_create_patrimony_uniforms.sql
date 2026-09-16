alter table public.patrimony_items
  add column if not exists uniform_size text,
  add column if not exists uniform_fabric text,
  add column if not exists uniform_color text,
  add column if not exists uniform_proposal_number text,
  add column if not exists uniform_supplier text,
  add column if not exists uniform_description text;

create index if not exists patrimony_items_uniform_category_idx
  on public.patrimony_items(code, uniform_proposal_number, uniform_size)
  where lower(category) = 'uniforme' and active;

create table if not exists public.uniform_term_template_versions (
  version text primary key check (btrim(version) <> ''),
  name text not null check (btrim(name) <> ''),
  source_file_name text not null check (btrim(source_file_name) <> ''),
  source_sha256 text not null check (btrim(source_sha256) <> ''),
  source_docx_path text not null check (btrim(source_docx_path) <> ''),
  print_template_path text not null check (btrim(print_template_path) <> ''),
  logo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uniform_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.organization_people(id) on delete restrict,
  delivered_at timestamptz not null default now(),
  delivered_by_auth_user uuid default auth.uid(),
  delivered_by_name text not null check (btrim(delivered_by_name) <> ''),
  notes text,
  status text not null default 'aguardando_assinatura'
    check (status in ('aguardando_assinatura','assinado','cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uniform_delivery_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.uniform_delivery_batches(id) on delete restrict,
  patrimony_assignment_id uuid not null references public.patrimony_assignments(id) on delete restrict,
  item_id uuid not null references public.patrimony_items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  observation text,
  created_at timestamptz not null default now()
);

create unique index if not exists uniform_delivery_batch_items_assignment_unique
  on public.uniform_delivery_batch_items(patrimony_assignment_id);
create index if not exists uniform_delivery_batch_items_batch_idx
  on public.uniform_delivery_batch_items(batch_id);
create index if not exists uniform_delivery_batches_person_idx
  on public.uniform_delivery_batches(person_id, delivered_at desc);

create table if not exists public.uniform_delivery_terms (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.uniform_delivery_batches(id) on delete restrict,
  template_version text not null references public.uniform_term_template_versions(version) on update cascade,
  generated_at timestamptz not null default now(),
  printed_at timestamptz,
  status text not null default 'aguardando_assinatura'
    check (status in ('aguardando_assinatura','assinado')),
  signed_document_path text,
  signed_uploaded_at timestamptz,
  signed_uploaded_by uuid,
  signed_uploaded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uniform_delivery_terms_status_idx
  on public.uniform_delivery_terms(status, generated_at desc);

create table if not exists public.uniform_term_attachments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.uniform_delivery_terms(id) on delete restrict,
  storage_path text not null check (btrim(storage_path) <> ''),
  file_name text not null check (btrim(file_name) <> ''),
  content_type text not null check (btrim(content_type) <> ''),
  file_size bigint not null check (file_size > 0),
  version integer not null check (version > 0),
  active boolean not null default true,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid default auth.uid(),
  uploaded_by_name text not null check (btrim(uploaded_by_name) <> ''),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists uniform_term_attachments_term_version_unique
  on public.uniform_term_attachments(term_id, version);
create unique index if not exists uniform_term_attachments_one_active
  on public.uniform_term_attachments(term_id)
  where active;

drop trigger if exists uniform_term_template_versions_updated_at on public.uniform_term_template_versions;
create trigger uniform_term_template_versions_updated_at
  before update on public.uniform_term_template_versions
  for each row execute function public.set_patrimony_updated_at();
drop trigger if exists uniform_delivery_batches_updated_at on public.uniform_delivery_batches;
create trigger uniform_delivery_batches_updated_at
  before update on public.uniform_delivery_batches
  for each row execute function public.set_patrimony_updated_at();
drop trigger if exists uniform_delivery_terms_updated_at on public.uniform_delivery_terms;
create trigger uniform_delivery_terms_updated_at
  before update on public.uniform_delivery_terms
  for each row execute function public.set_patrimony_updated_at();

alter table public.uniform_term_template_versions enable row level security;
alter table public.uniform_delivery_batches enable row level security;
alter table public.uniform_delivery_batch_items enable row level security;
alter table public.uniform_delivery_terms enable row level security;
alter table public.uniform_term_attachments enable row level security;

grant select on public.uniform_term_template_versions to authenticated;
grant select, insert, update on public.uniform_delivery_batches to authenticated;
grant select, insert on public.uniform_delivery_batch_items to authenticated;
grant select, insert, update on public.uniform_delivery_terms to authenticated;
grant select, insert, update on public.uniform_term_attachments to authenticated;

revoke all on public.uniform_term_template_versions from anon;
revoke all on public.uniform_delivery_batches from anon;
revoke all on public.uniform_delivery_batch_items from anon;
revoke all on public.uniform_delivery_terms from anon;
revoke all on public.uniform_term_attachments from anon;

drop policy if exists uniform_term_template_versions_admin_select on public.uniform_term_template_versions;
create policy uniform_term_template_versions_admin_select
  on public.uniform_term_template_versions for select to authenticated
  using ((select public.is_hub_admin()));

drop policy if exists uniform_delivery_batches_admin_select on public.uniform_delivery_batches;
create policy uniform_delivery_batches_admin_select
  on public.uniform_delivery_batches for select to authenticated
  using ((select public.is_hub_admin()));
drop policy if exists uniform_delivery_batches_admin_insert on public.uniform_delivery_batches;
create policy uniform_delivery_batches_admin_insert
  on public.uniform_delivery_batches for insert to authenticated
  with check ((select public.is_hub_admin()));
drop policy if exists uniform_delivery_batches_admin_update on public.uniform_delivery_batches;
create policy uniform_delivery_batches_admin_update
  on public.uniform_delivery_batches for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));

drop policy if exists uniform_delivery_batch_items_admin_select on public.uniform_delivery_batch_items;
create policy uniform_delivery_batch_items_admin_select
  on public.uniform_delivery_batch_items for select to authenticated
  using ((select public.is_hub_admin()));
drop policy if exists uniform_delivery_batch_items_admin_insert on public.uniform_delivery_batch_items;
create policy uniform_delivery_batch_items_admin_insert
  on public.uniform_delivery_batch_items for insert to authenticated
  with check ((select public.is_hub_admin()));

drop policy if exists uniform_delivery_terms_admin_select on public.uniform_delivery_terms;
create policy uniform_delivery_terms_admin_select
  on public.uniform_delivery_terms for select to authenticated
  using ((select public.is_hub_admin()));
drop policy if exists uniform_delivery_terms_admin_insert on public.uniform_delivery_terms;
create policy uniform_delivery_terms_admin_insert
  on public.uniform_delivery_terms for insert to authenticated
  with check ((select public.is_hub_admin()));
drop policy if exists uniform_delivery_terms_admin_update on public.uniform_delivery_terms;
create policy uniform_delivery_terms_admin_update
  on public.uniform_delivery_terms for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));

drop policy if exists uniform_term_attachments_admin_select on public.uniform_term_attachments;
create policy uniform_term_attachments_admin_select
  on public.uniform_term_attachments for select to authenticated
  using ((select public.is_hub_admin()));
drop policy if exists uniform_term_attachments_admin_insert on public.uniform_term_attachments;
create policy uniform_term_attachments_admin_insert
  on public.uniform_term_attachments for insert to authenticated
  with check ((select public.is_hub_admin()));
drop policy if exists uniform_term_attachments_admin_update on public.uniform_term_attachments;
create policy uniform_term_attachments_admin_update
  on public.uniform_term_attachments for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uniform-signed-terms',
  'uniform-signed-terms',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists uniform_signed_terms_admin_select on storage.objects;
create policy uniform_signed_terms_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'uniform-signed-terms' and (select public.is_hub_admin()));

drop policy if exists uniform_signed_terms_admin_insert on storage.objects;
create policy uniform_signed_terms_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'uniform-signed-terms' and (select public.is_hub_admin()));

drop policy if exists uniform_signed_terms_admin_update on storage.objects;
create policy uniform_signed_terms_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'uniform-signed-terms' and (select public.is_hub_admin()))
  with check (bucket_id = 'uniform-signed-terms' and (select public.is_hub_admin()));

insert into public.uniform_term_template_versions(
  version,
  name,
  source_file_name,
  source_sha256,
  source_docx_path,
  print_template_path,
  logo_path,
  active
) values (
  'V5',
  'RECIBO DE ENTREGA DE UNIFORMES - MINUTA V5',
  'RECIBO_DE_ENTREGA_DE_UNIFORMES_MINUTA_V5.docx',
  '86727ACC5F19DC9ED7E962DEF1B418D15EE243B22CAB889A163D30E3C779B1A6',
  '/templates/uniforms/RECIBO_DE_ENTREGA_DE_UNIFORMES_MINUTA_V5.docx',
  '/templates/uniforms/uniform-term-v5.html',
  '/templates/uniforms/uniform-term-v5-logo.jpg',
  true
)
on conflict (version) do update
set name = excluded.name,
    source_file_name = excluded.source_file_name,
    source_sha256 = excluded.source_sha256,
    source_docx_path = excluded.source_docx_path,
    print_template_path = excluded.print_template_path,
    logo_path = excluded.logo_path,
    active = excluded.active,
    updated_at = now();

insert into public.patrimony_spaces(code,name,space_type,department,location_detail,map_group,notes)
values (
  'ESTOQUE-UNIFORMES',
  'Estoque de Uniformes',
  'estoque',
  'Administração',
  'Estoque físico exclusivo de uniformes',
  'uniformes',
  'Local padrão para uniformes disponíveis'
)
on conflict (code) do update
set name = excluded.name,
    space_type = excluded.space_type,
    department = excluded.department,
    location_detail = excluded.location_detail,
    map_group = excluded.map_group,
    notes = excluded.notes,
    active = true,
    status = case when public.patrimony_spaces.status = 'inativo' then 'disponivel' else public.patrimony_spaces.status end,
    updated_at = now();

with uniform_seed(code,name,uniform_description,uniform_size,uniform_fabric,uniform_color,uniform_proposal_number,uniform_supplier,quantity,proposal_date,sort_order) as (
  values
    ('UNI-001','Camisete M.L Tradicional Botão Dulo','CAMISETE M.L TRADICIONAL BOTÃO DULO TEC IBIZA COR LUNAR','1','IBIZA','LUNAR','752','Patrícia Maria Montanari Uniformes',6::numeric,'2026-05-29'::date,1),
    ('UNI-002','Camisete M.L Tradicional Botão Dulo','CAMISETE M.L TRADICIONAL BOTÃO DULO TEC IBIZA COR LUNAR','2','IBIZA','LUNAR','752','Patrícia Maria Montanari Uniformes',21::numeric,'2026-05-29'::date,2),
    ('UNI-003','Camisete M.L Tradicional Botão Dulo','CAMISETE M.L TRADICIONAL BOTÃO DULO TEC IBIZA COR LUNAR','3','IBIZA','LUNAR','752','Patrícia Maria Montanari Uniformes',11::numeric,'2026-05-29'::date,3),
    ('UNI-004','Camisete M.L Tradicional Botão Dulo','CAMISETE M.L TRADICIONAL BOTÃO DULO TEC IBIZA COR LUNAR','4','IBIZA','LUNAR','752','Patrícia Maria Montanari Uniformes',2::numeric,'2026-05-29'::date,4),
    ('UNI-005','Camisete M.L Tradicional Botão Dulo','CAMISETE M.L TRADICIONAL BOTÃO DULO TEC IBIZA COR LUNAR','8','IBIZA','LUNAR','752','Patrícia Maria Montanari Uniformes',3::numeric,'2026-05-29'::date,5),
    ('UNI-006','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','34','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',4::numeric,'2026-05-29'::date,6),
    ('UNI-007','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','38','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',2::numeric,'2026-05-29'::date,7),
    ('UNI-008','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','40','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',6::numeric,'2026-05-29'::date,8),
    ('UNI-009','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','42','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',8::numeric,'2026-05-29'::date,9),
    ('UNI-010','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','44','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',2::numeric,'2026-05-29'::date,10),
    ('UNI-011','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','46','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',4::numeric,'2026-05-29'::date,11),
    ('UNI-012','Calça Perna Larga com Bolso Frente e Trás','CALÇA PERNA LARGA COM BOLSO FRENTE E TRÁS TEC TWO WAY COR NOITE','52','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',2::numeric,'2026-05-29'::date,12),
    ('UNI-013','Blazer Gola Partida Mais Comprido','BLAZER GOLA PARTIDA MAIS COMPRIDO TEC TWO WAY COR NOITE','38','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',2::numeric,'2026-05-29'::date,13),
    ('UNI-014','Blazer Gola Partida Mais Comprido','BLAZER GOLA PARTIDA MAIS COMPRIDO TEC TWO WAY COR NOITE','40','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',7::numeric,'2026-05-29'::date,14),
    ('UNI-015','Blazer Gola Partida Mais Comprido','BLAZER GOLA PARTIDA MAIS COMPRIDO TEC TWO WAY COR NOITE','42','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',4::numeric,'2026-05-29'::date,15),
    ('UNI-016','Blazer Gola Partida Mais Comprido','BLAZER GOLA PARTIDA MAIS COMPRIDO TEC TWO WAY COR NOITE','52','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',1::numeric,'2026-05-29'::date,16),
    ('UNI-017','Colete','COLETE TEC TWO WAY COR NOITE','1','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',2::numeric,'2026-05-29'::date,17),
    ('UNI-018','Colete','COLETE TEC TWO WAY COR NOITE','2','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',7::numeric,'2026-05-29'::date,18),
    ('UNI-019','Colete','COLETE TEC TWO WAY COR NOITE','3','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',4::numeric,'2026-05-29'::date,19),
    ('UNI-020','Colete','COLETE TEC TWO WAY COR NOITE','8','TWO WAY','NOITE','752','Patrícia Maria Montanari Uniformes',1::numeric,'2026-05-29'::date,20),
    ('UNI-021','Camisete M.L Tradicional','CAMISETE M.L TRADICIONAL TEC CANNES TAM ATÉ 5','até 5','CANNES',null,'688','Patrícia Maria Montanari Uniformes',1::numeric,'2026-03-17'::date,21),
    ('UNI-022','Blazer Forrado','BLAZER FORRADO TEC TWO WAY TAM ATÉ 5','até 5','TWO WAY',null,'688','Patrícia Maria Montanari Uniformes',1::numeric,'2026-03-17'::date,22),
    ('UNI-023','Calça Reta','CALÇA RETA TEC TWO WAY TAM 48','48','TWO WAY',null,'688','Patrícia Maria Montanari Uniformes',1::numeric,'2026-03-17'::date,23),
    ('UNI-024','Colete','COLETE TEC TWO WAY TAM ATÉ 5','até 5','TWO WAY',null,'688','Patrícia Maria Montanari Uniformes',1::numeric,'2026-03-17'::date,24)
),
upserted as (
  insert into public.patrimony_items(
    code,
    name,
    category,
    tracking_mode,
    brand,
    model,
    unit,
    total_quantity,
    available_quantity,
    maintenance_quantity,
    lost_quantity,
    status,
    storage_space_id,
    acquisition_date,
    active,
    notes,
    uniform_size,
    uniform_fabric,
    uniform_color,
    uniform_proposal_number,
    uniform_supplier,
    uniform_description
  )
  select
    s.code,
    s.name,
    'Uniforme',
    'quantidade',
    s.uniform_fabric,
    s.uniform_color,
    'peça',
    s.quantity,
    s.quantity,
    0,
    0,
    'disponivel',
    ps.id,
    s.proposal_date,
    true,
    'Entrada inicial Proposta Nº ' || s.uniform_proposal_number || ' de ' || to_char(s.proposal_date, 'DD/MM/YYYY'),
    s.uniform_size,
    s.uniform_fabric,
    s.uniform_color,
    s.uniform_proposal_number,
    s.uniform_supplier,
    s.uniform_description
  from uniform_seed s
  cross join public.patrimony_spaces ps
  where ps.code = 'ESTOQUE-UNIFORMES'
  on conflict (code) do update
  set name = excluded.name,
      category = excluded.category,
      tracking_mode = excluded.tracking_mode,
      brand = excluded.brand,
      model = excluded.model,
      unit = excluded.unit,
      total_quantity = excluded.total_quantity,
      available_quantity = excluded.available_quantity,
      maintenance_quantity = 0,
      lost_quantity = 0,
      status = 'disponivel',
      storage_space_id = excluded.storage_space_id,
      acquisition_date = excluded.acquisition_date,
      active = true,
      notes = excluded.notes,
      uniform_size = excluded.uniform_size,
      uniform_fabric = excluded.uniform_fabric,
      uniform_color = excluded.uniform_color,
      uniform_proposal_number = excluded.uniform_proposal_number,
      uniform_supplier = excluded.uniform_supplier,
      uniform_description = excluded.uniform_description,
      updated_at = now()
  returning id, code
)
insert into public.patrimony_movements(movement_type,item_id,space_id,quantity,actor_name,notes,created_at)
select
  'entrada_estoque',
  i.id,
  ps.id,
  s.quantity,
  'Importação inicial',
  'Entrada inicial de uniformes conforme Proposta Nº ' || s.uniform_proposal_number || ' de ' || to_char(s.proposal_date, 'DD/MM/YYYY'),
  now()
from uniform_seed s
join public.patrimony_items i on i.code = s.code
join public.patrimony_spaces ps on ps.code = 'ESTOQUE-UNIFORMES'
where not exists (
  select 1
  from public.patrimony_movements pm
  where pm.item_id = i.id
    and pm.movement_type = 'entrada_estoque'
    and pm.notes = 'Entrada inicial de uniformes conforme Proposta Nº ' || s.uniform_proposal_number || ' de ' || to_char(s.proposal_date, 'DD/MM/YYYY')
);

alter table public.patrimony_audit_log
  drop constraint if exists patrimony_audit_log_action_check;

alter table public.patrimony_audit_log
  add constraint patrimony_audit_log_action_check
  check (action in (
    'person_notebook_update',
    'notebook_item_update',
    'person_inactivation',
    'notebook_transfer',
    'uniform_delivery',
    'uniform_return',
    'uniform_stock_receipt',
    'uniform_term_attachment',
    'uniform_term_print'
  ));

create or replace function public.register_uniform_delivery_batch(
  p_batch_id uuid,
  p_term_id uuid,
  p_person_id uuid,
  p_items jsonb,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null,
  p_template_version text default 'V5'
)
returns table(batch_id uuid, term_id uuid, total_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_person public.organization_people%rowtype;
  v_item public.patrimony_items%rowtype;
  v_line record;
  v_assignment_id uuid;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_template_version text := btrim(coalesce(p_template_version, 'V5'));
  v_total numeric := 0;
  v_existing public.uniform_delivery_batches%rowtype;
  v_existing_term_id uuid;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para entregar uniformes'; end if;
  if p_batch_id is null or p_term_id is null then raise exception 'Identificadores do lote e termo obrigatorios'; end if;
  if p_person_id is null then raise exception 'Pessoa obrigatoria'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos uma peca para entrega';
  end if;

  select * into v_existing
  from public.uniform_delivery_batches
  where id = p_batch_id;
  if found then
    if v_existing.person_id <> p_person_id then
      raise exception 'Identificador de lote reutilizado com pessoa diferente';
    end if;
    select coalesce(sum(quantity),0) into v_total
    from public.uniform_delivery_batch_items
    where batch_id = p_batch_id;
    select id into v_existing_term_id
    from public.uniform_delivery_terms
    where batch_id = p_batch_id;
    if v_existing_term_id is null then
      raise exception 'Lote de uniforme existente sem termo vinculado';
    end if;
    if v_existing_term_id is distinct from p_term_id then
      raise exception 'Identificador de lote reutilizado com termo diferente';
    end if;
    batch_id := p_batch_id;
    term_id := v_existing_term_id;
    total_quantity := v_total;
    return next;
    return;
  end if;

  if exists(select 1 from public.uniform_delivery_terms where id = p_term_id) then
    raise exception 'Identificador de termo ja utilizado';
  end if;

  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found or v_person.active = false then
    raise exception 'Pessoa nao encontrada ou inativa';
  end if;

  if not exists(select 1 from public.uniform_term_template_versions where version = v_template_version and active) then
    raise exception 'Versao de template de termo invalida';
  end if;

  for v_line in
    select
      x.item_id,
      sum(x.quantity)::numeric as quantity,
      nullif(string_agg(nullif(btrim(coalesce(x.observation, '')), ''), ' · '), '') as observation
    from jsonb_to_recordset(p_items) as x(item_id uuid, quantity numeric, observation text)
    group by x.item_id
    order by x.item_id
  loop
    if v_line.item_id is null or v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Linha de uniforme invalida';
    end if;
    select * into v_item
    from public.patrimony_items
    where id = v_line.item_id
    for update;
    if not found or not v_item.active or lower(v_item.category) <> 'uniforme' or v_item.tracking_mode <> 'quantidade' then
      raise exception 'Uniforme nao encontrado ou inativo';
    end if;
    if v_line.quantity > v_item.available_quantity then
      raise exception 'Estoque insuficiente para %. Disponivel: %', v_item.code, v_item.available_quantity;
    end if;
    v_total := v_total + v_line.quantity;
  end loop;

  insert into public.uniform_delivery_batches(
    id,
    person_id,
    delivered_by_auth_user,
    delivered_by_name,
    notes,
    status
  ) values (
    p_batch_id,
    p_person_id,
    auth.uid(),
    v_actor,
    v_notes,
    'aguardando_assinatura'
  );

  insert into public.uniform_delivery_terms(
    id,
    batch_id,
    template_version,
    status
  ) values (
    p_term_id,
    p_batch_id,
    v_template_version,
    'aguardando_assinatura'
  );

  for v_line in
    select
      x.item_id,
      sum(x.quantity)::numeric as quantity,
      nullif(string_agg(nullif(btrim(coalesce(x.observation, '')), ''), ' · '), '') as observation
    from jsonb_to_recordset(p_items) as x(item_id uuid, quantity numeric, observation text)
    group by x.item_id
    order by x.item_id
  loop
    select * into v_item
    from public.patrimony_items
    where id = v_line.item_id
    for update;

    v_assignment_id := gen_random_uuid();
    insert into public.patrimony_assignments(
      id,
      item_id,
      person_id,
      quantity,
      assigned_by_auth_user,
      assigned_by_name,
      notes
    ) values (
      v_assignment_id,
      v_item.id,
      p_person_id,
      v_line.quantity,
      auth.uid(),
      v_actor,
      concat_ws(' · ', 'Entrega agrupada de uniformes', 'Lote ' || p_batch_id::text, v_notes, v_line.observation)
    );

    update public.patrimony_items
       set available_quantity = available_quantity - v_line.quantity,
           status = case when available_quantity - v_line.quantity > 0 then 'parcialmente_em_uso' else 'em_uso' end,
           updated_at = now()
     where id = v_item.id;

    insert into public.patrimony_movements(
      movement_type,
      item_id,
      assignment_id,
      person_id,
      quantity,
      actor_name,
      notes
    ) values (
      'entrega',
      v_item.id,
      v_assignment_id,
      p_person_id,
      v_line.quantity,
      v_actor,
      concat_ws(' · ', 'Entrega agrupada de uniformes', 'Lote ' || p_batch_id::text, v_notes, v_line.observation)
    );

    insert into public.uniform_delivery_batch_items(
      batch_id,
      patrimony_assignment_id,
      item_id,
      quantity,
      observation
    ) values (
      p_batch_id,
      v_assignment_id,
      v_item.id,
      v_line.quantity,
      v_line.observation
    );
  end loop;

  insert into public.patrimony_audit_log(
    action,
    person_id,
    actor_name,
    reason,
    change_summary,
    after_data
  ) values (
    'uniform_delivery',
    p_person_id,
    v_actor,
    coalesce(v_notes, 'Entrega agrupada de uniformes'),
    'Entrega agrupada de ' || v_total::text || ' peça(s) de uniforme para ' || v_person.name,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'term_id', p_term_id,
      'person_id', p_person_id,
      'total_quantity', v_total,
      'template_version', v_template_version
    )
  );

  batch_id := p_batch_id;
  term_id := p_term_id;
  total_quantity := v_total;
  return next;
end;
$$;

create or replace function public.return_uniform_assignment(
  p_return_movement_id uuid,
  p_assignment_id uuid,
  p_quantity numeric,
  p_condition text default 'bom',
  p_actor_name text default 'Admin Tezzei',
  p_reason text default null
)
returns table(assignment_id uuid, item_status text, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assignment public.patrimony_assignments%rowtype;
  v_item public.patrimony_items%rowtype;
  v_existing_movement public.patrimony_movements%rowtype;
  v_open_quantity numeric;
  v_remaining_assigned numeric;
  v_available numeric;
  v_maintenance numeric;
  v_lost numeric;
  v_status text;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para devolver uniformes'; end if;
  if p_return_movement_id is null then raise exception 'Identificador da devolucao obrigatorio'; end if;
  if p_assignment_id is null then raise exception 'Entrega obrigatoria'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if p_condition not in ('bom','danificado','perdido') then raise exception 'Estado de devolucao invalido'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da devolucao'; end if;

  select * into v_existing_movement
  from public.patrimony_movements
  where id = p_return_movement_id;
  if found then
    if v_existing_movement.movement_type <> 'devolucao'
       or v_existing_movement.assignment_id is distinct from p_assignment_id
       or v_existing_movement.quantity <> p_quantity
       or v_existing_movement.condition is distinct from p_condition
       or v_existing_movement.actor_name <> v_actor
       or v_existing_movement.notes is distinct from v_reason then
      raise exception 'Identificador de devolucao reutilizado com dados diferentes';
    end if;
    select a.id, i.status, i.available_quantity
      into assignment_id, item_status, available_quantity
    from public.patrimony_assignments a
    join public.patrimony_items i on i.id = a.item_id
    where a.id = p_assignment_id;
    return next;
    return;
  end if;

  select * into v_assignment
  from public.patrimony_assignments
  where id = p_assignment_id
  for update;
  if not found then raise exception 'Entrega nao encontrada'; end if;

  v_open_quantity := v_assignment.quantity - v_assignment.returned_quantity;
  if p_quantity > v_open_quantity then raise exception 'Quantidade de devolucao maior que a quantidade pendente'; end if;

  select * into v_item
  from public.patrimony_items
  where id = v_assignment.item_id
  for update;
  if not found or lower(v_item.category) <> 'uniforme' then raise exception 'Uniforme nao encontrado'; end if;

  update public.patrimony_assignments
     set returned_quantity = returned_quantity + p_quantity,
         returned_at = case when returned_quantity + p_quantity = quantity then now() else null end,
         last_return_condition = p_condition,
         returned_by_auth_user = auth.uid(),
         returned_by_name = v_actor,
         return_notes = concat_ws(' · ', nullif(return_notes, ''), v_reason),
         updated_at = now()
   where id = p_assignment_id;

  v_available := v_item.available_quantity + case when p_condition = 'bom' then p_quantity else 0 end;
  v_maintenance := v_item.maintenance_quantity + case when p_condition = 'danificado' then p_quantity else 0 end;
  v_lost := v_item.lost_quantity + case when p_condition = 'perdido' then p_quantity else 0 end;

  select coalesce(sum(quantity - returned_quantity),0)
    into v_remaining_assigned
  from public.patrimony_assignments
  where item_id = v_item.id
    and returned_at is null;

  v_status := case
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
         status = v_status,
         updated_at = now()
   where id = v_item.id
   returning status, public.patrimony_items.available_quantity
        into item_status, available_quantity;

  insert into public.patrimony_movements(
    id,
    movement_type,
    item_id,
    assignment_id,
    person_id,
    quantity,
    condition,
    actor_name,
    notes
  ) values (
    p_return_movement_id,
    'devolucao',
    v_item.id,
    p_assignment_id,
    v_assignment.person_id,
    p_quantity,
    p_condition,
    v_actor,
    v_reason
  );

  insert into public.patrimony_audit_log(
    action,
    person_id,
    item_id,
    assignment_id,
    actor_name,
    reason,
    change_summary,
    before_data,
    after_data
  ) values (
    'uniform_return',
    v_assignment.person_id,
    v_item.id,
    p_assignment_id,
    v_actor,
    v_reason,
    'Devolucao de uniforme ' || v_item.code || ' em estado ' || p_condition,
    jsonb_build_object('open_quantity_before', v_open_quantity),
    jsonb_build_object('returned_quantity', p_quantity, 'condition', p_condition)
  );

  assignment_id := p_assignment_id;
  return next;
end;
$$;

create or replace function public.register_uniform_stock_receipt(
  p_receipt_movement_id uuid,
  p_item_id uuid default null,
  p_item_code text default null,
  p_name text default null,
  p_description text default null,
  p_size text default null,
  p_fabric text default null,
  p_color text default null,
  p_quantity numeric default null,
  p_received_at date default null,
  p_supplier text default null,
  p_proposal_number text default null,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(item_id uuid, item_code text, total_quantity numeric, available_quantity numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing_movement public.patrimony_movements%rowtype;
  v_item public.patrimony_items%rowtype;
  v_space_id uuid;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_code text := upper(btrim(coalesce(p_item_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_size text := nullif(btrim(coalesce(p_size, '')), '');
  v_fabric text := nullif(btrim(coalesce(p_fabric, '')), '');
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_supplier text := nullif(btrim(coalesce(p_supplier, '')), '');
  v_proposal text := nullif(btrim(coalesce(p_proposal_number, '')), '');
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para registrar entrada de uniformes'; end if;
  if p_receipt_movement_id is null then raise exception 'Identificador da entrada obrigatorio'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;

  select * into v_existing_movement
  from public.patrimony_movements
  where id = p_receipt_movement_id;
  if found then
    select pi.id, pi.code, pi.total_quantity, pi.available_quantity
      into item_id, item_code, total_quantity, available_quantity
    from public.patrimony_items pi
    where pi.id = v_existing_movement.item_id;
    return next;
    return;
  end if;

  select id into v_space_id
  from public.patrimony_spaces
  where code = 'ESTOQUE-UNIFORMES';
  if v_space_id is null then raise exception 'Estoque de uniformes nao encontrado'; end if;

  if p_item_id is not null then
    select * into v_item
    from public.patrimony_items
    where id = p_item_id
    for update;
    if not found or lower(v_item.category) <> 'uniforme' or v_item.tracking_mode <> 'quantidade' then
      raise exception 'Uniforme nao encontrado';
    end if;
    update public.patrimony_items
       set total_quantity = total_quantity + p_quantity,
           available_quantity = available_quantity + p_quantity,
           status = 'disponivel',
           storage_space_id = coalesce(storage_space_id, v_space_id),
           uniform_supplier = coalesce(v_supplier, uniform_supplier),
           uniform_proposal_number = coalesce(v_proposal, uniform_proposal_number),
           notes = concat_ws(' · ', nullif(notes, ''), v_notes),
           updated_at = now()
     where id = v_item.id
     returning id, code, total_quantity, available_quantity
        into item_id, item_code, total_quantity, available_quantity;
  else
    if v_code = '' then raise exception 'Codigo do uniforme obrigatorio'; end if;
    if v_name = '' then raise exception 'Nome do uniforme obrigatorio'; end if;
    if exists(select 1 from public.patrimony_items where code = v_code) then
      raise exception 'Ja existe item com este codigo';
    end if;
    insert into public.patrimony_items(
      code,
      name,
      category,
      tracking_mode,
      brand,
      model,
      unit,
      total_quantity,
      available_quantity,
      maintenance_quantity,
      lost_quantity,
      status,
      storage_space_id,
      acquisition_date,
      active,
      notes,
      uniform_size,
      uniform_fabric,
      uniform_color,
      uniform_proposal_number,
      uniform_supplier,
      uniform_description
    ) values (
      v_code,
      v_name,
      'Uniforme',
      'quantidade',
      v_fabric,
      v_color,
      'peça',
      p_quantity,
      p_quantity,
      0,
      0,
      'disponivel',
      v_space_id,
      coalesce(p_received_at, current_date),
      true,
      v_notes,
      v_size,
      v_fabric,
      v_color,
      v_proposal,
      v_supplier,
      v_description
    ) returning id, code, total_quantity, available_quantity
      into item_id, item_code, total_quantity, available_quantity;
  end if;

  insert into public.patrimony_movements(
    id,
    movement_type,
    item_id,
    space_id,
    quantity,
    actor_name,
    notes,
    created_at
  ) values (
    p_receipt_movement_id,
    'entrada_estoque',
    item_id,
    v_space_id,
    p_quantity,
    v_actor,
    concat_ws(' · ', 'Entrada de uniformes', case when v_proposal is not null then 'Proposta/Pedido ' || v_proposal else null end, v_notes),
    coalesce(p_received_at, current_date)::timestamptz
  );

  insert into public.patrimony_audit_log(
    action,
    item_id,
    actor_name,
    reason,
    change_summary,
    after_data
  ) values (
    'uniform_stock_receipt',
    item_id,
    v_actor,
    coalesce(v_notes, 'Entrada de uniformes'),
    'Entrada de ' || p_quantity::text || ' peça(s) em ' || item_code,
    jsonb_build_object('item_id', item_id, 'code', item_code, 'quantity', p_quantity, 'proposal_number', v_proposal)
  );

  return next;
end;
$$;

create or replace function public.mark_uniform_term_printed(
  p_term_id uuid,
  p_actor_name text default 'Admin Tezzei'
)
returns table(term_id uuid, printed_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_term public.uniform_delivery_terms%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para registrar impressao do termo'; end if;
  if p_term_id is null then raise exception 'Termo obrigatorio'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;
  select * into v_term
  from public.uniform_delivery_terms
  where id = p_term_id
  for update;
  if not found then raise exception 'Termo nao encontrado'; end if;

  update public.uniform_delivery_terms
     set printed_at = coalesce(printed_at, now()),
         updated_at = now()
   where id = p_term_id
   returning id, public.uniform_delivery_terms.printed_at into term_id, printed_at;

  insert into public.patrimony_audit_log(action,actor_name,reason,change_summary,after_data)
  values (
    'uniform_term_print',
    v_actor,
    'Impressao do termo',
    'Termo de entrega de uniformes marcado como impresso',
    jsonb_build_object('term_id', p_term_id)
  );

  return next;
end;
$$;

create or replace function public.record_uniform_signed_term_attachment(
  p_attachment_id uuid,
  p_term_id uuid,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(attachment_id uuid, term_status text, version integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_term public.uniform_delivery_terms%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_file_name text := btrim(coalesce(p_file_name, ''));
  v_content_type text := btrim(coalesce(p_content_type, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_version integer;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para registrar termo assinado'; end if;
  if p_attachment_id is null then raise exception 'Identificador do anexo obrigatorio'; end if;
  if p_term_id is null then raise exception 'Termo obrigatorio'; end if;
  if v_path = '' then raise exception 'Caminho do arquivo obrigatorio'; end if;
  if v_file_name = '' then raise exception 'Nome do arquivo obrigatorio'; end if;
  if v_content_type not in ('image/jpeg','image/png','image/webp','application/pdf') then
    raise exception 'Tipo de arquivo nao permitido';
  end if;
  if v_path !~ '^uniforms/[0-9a-fA-F-]+/[0-9a-fA-F-]+/[^/]+$' then
    raise exception 'Caminho do arquivo assinado invalido';
  end if;
  if p_file_size is null or p_file_size <= 0 then raise exception 'Tamanho do arquivo invalido'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;

  if exists(select 1 from public.uniform_term_attachments where id = p_attachment_id) then
    select a.id, t.status, a.version
      into attachment_id, term_status, version
    from public.uniform_term_attachments a
    join public.uniform_delivery_terms t on t.id = a.term_id
    where a.id = p_attachment_id;
    return next;
    return;
  end if;

  select * into v_term
  from public.uniform_delivery_terms
  where id = p_term_id
  for update;
  if not found then raise exception 'Termo nao encontrado'; end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'uniform-signed-terms'
      and name = v_path
  ) then
    raise exception 'Arquivo assinado nao encontrado no Storage';
  end if;

  select coalesce(max(a.version),0) + 1
    into v_version
  from public.uniform_term_attachments a
  where a.term_id = p_term_id;

  update public.uniform_term_attachments
     set active = false
   where term_id = p_term_id
     and active;

  insert into public.uniform_term_attachments(
    id,
    term_id,
    storage_path,
    file_name,
    content_type,
    file_size,
    version,
    active,
    uploaded_by,
    uploaded_by_name,
    notes
  ) values (
    p_attachment_id,
    p_term_id,
    v_path,
    v_file_name,
    v_content_type,
    p_file_size,
    v_version,
    true,
    auth.uid(),
    v_actor,
    v_notes
  );

  update public.uniform_delivery_terms
     set status = 'assinado',
         signed_document_path = v_path,
         signed_uploaded_at = now(),
         signed_uploaded_by = auth.uid(),
         signed_uploaded_by_name = v_actor,
         updated_at = now()
   where id = p_term_id;

  update public.uniform_delivery_batches b
     set status = 'assinado',
         updated_at = now()
    from public.uniform_delivery_terms t
   where t.id = p_term_id
     and b.id = t.batch_id;

  insert into public.patrimony_audit_log(
    action,
    actor_name,
    reason,
    change_summary,
    after_data
  ) values (
    'uniform_term_attachment',
    v_actor,
    coalesce(v_notes, 'Registro de termo assinado'),
    'Termo assinado de uniformes registrado ou substituido',
    jsonb_build_object('term_id', p_term_id, 'storage_path', v_path, 'version', v_version)
  );

  attachment_id := p_attachment_id;
  term_status := 'assinado';
  version := v_version;
  return next;
end;
$$;

revoke all on function public.register_uniform_delivery_batch(uuid,uuid,uuid,jsonb,text,text,text) from public, anon;
revoke all on function public.return_uniform_assignment(uuid,uuid,numeric,text,text,text) from public, anon;
revoke all on function public.register_uniform_stock_receipt(uuid,uuid,text,text,text,text,text,text,numeric,date,text,text,text,text) from public, anon;
revoke all on function public.mark_uniform_term_printed(uuid,text) from public, anon;
revoke all on function public.record_uniform_signed_term_attachment(uuid,uuid,text,text,text,bigint,text,text) from public, anon;

grant execute on function public.register_uniform_delivery_batch(uuid,uuid,uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.return_uniform_assignment(uuid,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.register_uniform_stock_receipt(uuid,uuid,text,text,text,text,text,text,numeric,date,text,text,text,text) to authenticated;
grant execute on function public.mark_uniform_term_printed(uuid,text) to authenticated;
grant execute on function public.record_uniform_signed_term_attachment(uuid,uuid,text,text,text,bigint,text,text) to authenticated;
