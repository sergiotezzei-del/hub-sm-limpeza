alter table public.hub_map_nodes
  add column if not exists destination_type text not null default 'NONE',
  add column if not exists dynamic_page_id uuid,
  add column if not exists external_url text,
  add column if not exists planned_module_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hub_map_nodes_destination_type_check'
  ) then
    alter table public.hub_map_nodes
      add constraint hub_map_nodes_destination_type_check
      check (destination_type in ('NONE', 'DYNAMIC_PAGE', 'EXISTING_SCREEN', 'EXTERNAL_URL', 'PLANNED_MODULE'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hub_map_nodes_external_url_safe_check'
  ) then
    alter table public.hub_map_nodes
      add constraint hub_map_nodes_external_url_safe_check
      check (external_url is null or external_url ~* '^https?://[^[:space:]]+$');
  end if;
end $$;

update public.hub_map_nodes
set destination_type = 'EXISTING_SCREEN'
where target_screen is not null
  and destination_type = 'NONE';

create table if not exists public.hub_dynamic_pages (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.hub_maps (id) on delete cascade,
  node_id uuid not null references public.hub_map_nodes (id) on delete cascade,
  page_type text not null,
  title text not null,
  summary text,
  objective text,
  status text not null default 'NOT_STARTED',
  responsible text,
  priority text not null default 'MEDIUM',
  start_date date,
  due_date date,
  next_action text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_dynamic_pages_page_type_check check (page_type in ('PROJECT', 'PROCESS', 'DECISION', 'RISK', 'TEST', 'EQUIPMENT', 'INTEGRATION', 'MEETING', 'MODULE', 'DOCUMENTATION')),
  constraint hub_dynamic_pages_status_check check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  constraint hub_dynamic_pages_priority_check check (priority in ('LOW', 'MEDIUM', 'HIGH'))
);

create table if not exists public.hub_dynamic_page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.hub_dynamic_pages (id) on delete cascade,
  block_type text not null,
  position integer not null default 0,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_dynamic_page_blocks_type_check check (block_type in ('TEXT', 'CHECKLIST', 'DECISION', 'RISK', 'QUESTION', 'TEST', 'EVIDENCE', 'LINK', 'NOTE', 'WARNING', 'METRIC', 'NEXT_ACTION')),
  constraint hub_dynamic_page_blocks_position_check check (position >= 0)
);

create table if not exists public.hub_dynamic_page_templates (
  id uuid primary key default gen_random_uuid(),
  page_type text not null,
  name text not null,
  description text,
  initial_blocks jsonb not null default '[]'::jsonb,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_dynamic_page_templates_page_type_check check (page_type in ('PROJECT', 'PROCESS', 'DECISION', 'RISK', 'TEST', 'EQUIPMENT', 'INTEGRATION', 'MEETING', 'MODULE', 'DOCUMENTATION')),
  constraint hub_dynamic_page_templates_blocks_array_check check (jsonb_typeof(initial_blocks) = 'array')
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hub_map_nodes_dynamic_page_fk'
  ) then
    alter table public.hub_map_nodes
      add constraint hub_map_nodes_dynamic_page_fk
      foreign key (dynamic_page_id) references public.hub_dynamic_pages (id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

create unique index if not exists hub_dynamic_pages_active_node_unique_idx
  on public.hub_dynamic_pages (node_id)
  where is_active;

create unique index if not exists hub_dynamic_page_templates_system_unique_idx
  on public.hub_dynamic_page_templates (page_type, name)
  where is_active;

create index if not exists hub_map_nodes_destination_type_idx on public.hub_map_nodes (destination_type);
create index if not exists hub_map_nodes_dynamic_page_idx on public.hub_map_nodes (dynamic_page_id);
create index if not exists hub_dynamic_pages_map_idx on public.hub_dynamic_pages (map_id);
create index if not exists hub_dynamic_pages_node_idx on public.hub_dynamic_pages (node_id);
create index if not exists hub_dynamic_pages_type_idx on public.hub_dynamic_pages (page_type);
create index if not exists hub_dynamic_pages_status_idx on public.hub_dynamic_pages (status);
create index if not exists hub_dynamic_pages_active_idx on public.hub_dynamic_pages (is_active);
create index if not exists hub_dynamic_page_blocks_page_idx on public.hub_dynamic_page_blocks (page_id, position);
create index if not exists hub_dynamic_page_blocks_type_idx on public.hub_dynamic_page_blocks (block_type);
create index if not exists hub_dynamic_page_blocks_active_idx on public.hub_dynamic_page_blocks (is_active);
create index if not exists hub_dynamic_page_templates_type_idx on public.hub_dynamic_page_templates (page_type);

drop trigger if exists hub_dynamic_pages_updated_at on public.hub_dynamic_pages;
create trigger hub_dynamic_pages_updated_at
before update on public.hub_dynamic_pages
for each row
execute function public.set_hub_master_map_updated_at();

drop trigger if exists hub_dynamic_page_blocks_updated_at on public.hub_dynamic_page_blocks;
create trigger hub_dynamic_page_blocks_updated_at
before update on public.hub_dynamic_page_blocks
for each row
execute function public.set_hub_master_map_updated_at();

drop trigger if exists hub_dynamic_page_templates_updated_at on public.hub_dynamic_page_templates;
create trigger hub_dynamic_page_templates_updated_at
before update on public.hub_dynamic_page_templates
for each row
execute function public.set_hub_master_map_updated_at();

alter table public.hub_dynamic_pages enable row level security;
alter table public.hub_dynamic_page_blocks enable row level security;
alter table public.hub_dynamic_page_templates enable row level security;

revoke all on table public.hub_dynamic_pages from public;
revoke all on table public.hub_dynamic_page_blocks from public;
revoke all on table public.hub_dynamic_page_templates from public;
revoke all on table public.hub_dynamic_pages from anon;
revoke all on table public.hub_dynamic_page_blocks from anon;
revoke all on table public.hub_dynamic_page_templates from anon;

grant select, insert, update, delete on table public.hub_dynamic_pages to authenticated;
grant select, insert, update, delete on table public.hub_dynamic_page_blocks to authenticated;
grant select, insert, update, delete on table public.hub_dynamic_page_templates to authenticated;
grant select, insert, update, delete on table public.hub_dynamic_pages to service_role;
grant select, insert, update, delete on table public.hub_dynamic_page_blocks to service_role;
grant select, insert, update, delete on table public.hub_dynamic_page_templates to service_role;

drop policy if exists "hub_dynamic_pages_admin_select" on public.hub_dynamic_pages;
create policy "hub_dynamic_pages_admin_select" on public.hub_dynamic_pages for select to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_pages_admin_insert" on public.hub_dynamic_pages;
create policy "hub_dynamic_pages_admin_insert" on public.hub_dynamic_pages for insert to authenticated
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_pages_admin_update" on public.hub_dynamic_pages;
create policy "hub_dynamic_pages_admin_update" on public.hub_dynamic_pages for update to authenticated
using (public.is_hub_master_map_admin())
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_pages_admin_delete" on public.hub_dynamic_pages;
create policy "hub_dynamic_pages_admin_delete" on public.hub_dynamic_pages for delete to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_blocks_admin_select" on public.hub_dynamic_page_blocks;
create policy "hub_dynamic_page_blocks_admin_select" on public.hub_dynamic_page_blocks for select to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_blocks_admin_insert" on public.hub_dynamic_page_blocks;
create policy "hub_dynamic_page_blocks_admin_insert" on public.hub_dynamic_page_blocks for insert to authenticated
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_blocks_admin_update" on public.hub_dynamic_page_blocks;
create policy "hub_dynamic_page_blocks_admin_update" on public.hub_dynamic_page_blocks for update to authenticated
using (public.is_hub_master_map_admin())
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_blocks_admin_delete" on public.hub_dynamic_page_blocks;
create policy "hub_dynamic_page_blocks_admin_delete" on public.hub_dynamic_page_blocks for delete to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_templates_admin_select" on public.hub_dynamic_page_templates;
create policy "hub_dynamic_page_templates_admin_select" on public.hub_dynamic_page_templates for select to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_templates_admin_insert" on public.hub_dynamic_page_templates;
create policy "hub_dynamic_page_templates_admin_insert" on public.hub_dynamic_page_templates for insert to authenticated
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_templates_admin_update" on public.hub_dynamic_page_templates;
create policy "hub_dynamic_page_templates_admin_update" on public.hub_dynamic_page_templates for update to authenticated
using (public.is_hub_master_map_admin())
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_dynamic_page_templates_admin_delete" on public.hub_dynamic_page_templates;
create policy "hub_dynamic_page_templates_admin_delete" on public.hub_dynamic_page_templates for delete to authenticated
using (public.is_hub_master_map_admin());

insert into public.hub_dynamic_page_templates (id, page_type, name, description, initial_blocks, is_system, is_active)
values
  ('80000000-0000-4000-8000-000000000001', 'PROJECT', 'Projeto operacional', 'Template para projeto com objetivo, checklist, riscos e evidencias.', '[
    {"block_type":"TEXT","title":"Resumo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Objetivo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"NEXT_ACTION","title":"Proxima acao","content":{"action":"","responsible":"","dueDate":"","status":"Pendente"}},
    {"block_type":"CHECKLIST","title":"Checklist","content":{"items":[]}},
    {"block_type":"RISK","title":"Riscos","content":{"description":"","probability":"","impact":"","mitigation":"","responsible":"","status":"Aberto"}},
    {"block_type":"EVIDENCE","title":"Evidencias","content":{"description":"","url":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000002', 'PROCESS', 'Processo operacional', 'Template para mapear entrada, etapas, saida e excecoes.', '[
    {"block_type":"TEXT","title":"Objetivo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Entrada","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"CHECKLIST","title":"Etapas","content":{"items":[]}},
    {"block_type":"TEXT","title":"Saida","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"WARNING","title":"Excecoes","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"EVIDENCE","title":"Evidencias","content":{"description":"","url":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000003', 'DECISION', 'Decisao documentada', 'Template para registrar contexto, opcoes, decisao e impacto.', '[
    {"block_type":"TEXT","title":"Contexto","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"DECISION","title":"Opcoes","content":{"context":"","options":"","decision":"","reason":"","impacts":"","evidence":""}},
    {"block_type":"DECISION","title":"Decisao tomada","content":{"context":"","options":"","decision":"","reason":"","impacts":"","evidence":""}},
    {"block_type":"TEXT","title":"Motivo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Impactos","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"EVIDENCE","title":"Evidencia","content":{"description":"","url":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000004', 'RISK', 'Risco operacional', 'Template para risco, mitigacao e responsavel.', '[
    {"block_type":"RISK","title":"Descricao","content":{"description":"","probability":"","impact":"","mitigation":"","responsible":"","status":"Aberto"}},
    {"block_type":"METRIC","title":"Probabilidade","content":{"label":"Probabilidade","value":"","unit":"","target":""}},
    {"block_type":"METRIC","title":"Impacto","content":{"label":"Impacto","value":"","unit":"","target":""}},
    {"block_type":"TEXT","title":"Mitigacao","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"NEXT_ACTION","title":"Responsavel","content":{"action":"","responsible":"","dueDate":"","status":"Pendente"}},
    {"block_type":"NOTE","title":"Status","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000005', 'TEST', 'Teste operacional', 'Template para hipotese, procedimento, resultados e aprovacao.', '[
    {"block_type":"TEST","title":"Objetivo","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}},
    {"block_type":"TEST","title":"Hipotese","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}},
    {"block_type":"TEXT","title":"Materiais","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Procedimento","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEST","title":"Resultado esperado","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}},
    {"block_type":"TEST","title":"Resultado real","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}},
    {"block_type":"EVIDENCE","title":"Evidencia","content":{"description":"","url":""}},
    {"block_type":"TEST","title":"Aprovado/Reprovado","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000006', 'EQUIPMENT', 'Equipamento', 'Template para equipamento, fornecedor, integracoes e riscos.', '[
    {"block_type":"TEXT","title":"Identificacao","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Modelo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Fornecedor","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Funcao","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Integracoes","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"RISK","title":"Riscos","content":{"description":"","probability":"","impact":"","mitigation":"","responsible":"","status":"Aberto"}},
    {"block_type":"TEST","title":"Testes","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}},
    {"block_type":"LINK","title":"Documentos","content":{"label":"","url":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000007', 'INTEGRATION', 'Integracao', 'Template para sistemas, autenticacao, eventos e testes.', '[
    {"block_type":"TEXT","title":"Sistemas envolvidos","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Objetivo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Metodo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"WARNING","title":"Autenticacao","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"CHECKLIST","title":"Eventos","content":{"items":[]}},
    {"block_type":"TEXT","title":"Fila","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"WARNING","title":"Erros","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEST","title":"Testes","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000008', 'MEETING', 'Reuniao', 'Template para pauta, decisoes e proximas acoes.', '[
    {"block_type":"NOTE","title":"Data","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Participantes","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Pauta","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"DECISION","title":"Decisoes","content":{"context":"","options":"","decision":"","reason":"","impacts":"","evidence":""}},
    {"block_type":"CHECKLIST","title":"Pendencias","content":{"items":[]}},
    {"block_type":"NEXT_ACTION","title":"Proximas acoes","content":{"action":"","responsible":"","dueDate":"","status":"Pendente"}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000009', 'MODULE', 'Modulo do HUB', 'Template para tela, dados, regras, testes e deploy.', '[
    {"block_type":"TEXT","title":"Objetivo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Usuarios","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Permissoes","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Regras","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"CHECKLIST","title":"Telas","content":{"items":[]}},
    {"block_type":"TEXT","title":"Dados","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEST","title":"Testes","content":{"objective":"","hypothesis":"","materials":"","procedure":"","expectedResult":"","actualResult":"","approved":false,"evidence":""}},
    {"block_type":"LINK","title":"PR/Commit/Deploy","content":{"label":"","url":""}}
  ]'::jsonb, true, true),
  ('80000000-0000-4000-8000-000000000010', 'DOCUMENTATION', 'Documentacao', 'Template para conteudo, links, evidencias e observacoes.', '[
    {"block_type":"TEXT","title":"Resumo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"TEXT","title":"Conteudo","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}},
    {"block_type":"LINK","title":"Links","content":{"label":"","url":""}},
    {"block_type":"EVIDENCE","title":"Evidencias","content":{"description":"","url":""}},
    {"block_type":"NOTE","title":"Observacoes","content":{"text":"","doc":{"type":"doc","content":[{"type":"paragraph"}]}}}
  ]'::jsonb, true, true)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  initial_blocks = excluded.initial_blocks,
  is_system = excluded.is_system,
  is_active = excluded.is_active;

create or replace function public.create_hub_dynamic_page_for_node(
  p_node_id uuid,
  p_map_id uuid,
  p_title text,
  p_description text,
  p_node_type text,
  p_icon_key text,
  p_page_type text,
  p_template_id uuid,
  p_position_x numeric,
  p_position_y numeric,
  p_parent_node_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_template public.hub_dynamic_page_templates%rowtype;
  v_page_id uuid := gen_random_uuid();
  v_block jsonb;
  v_position integer := 0;
  v_edge_id uuid := null;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Acesso restrito ao Mapa Mestre.' using errcode = '42501';
  end if;

  select *
  into v_template
  from public.hub_dynamic_page_templates
  where id = p_template_id
    and page_type = p_page_type
    and is_active
  limit 1;

  if v_template.id is null then
    select *
    into v_template
    from public.hub_dynamic_page_templates
    where page_type = p_page_type
      and is_active
    order by is_system desc, name asc
    limit 1;
  end if;

  if v_template.id is null then
    raise exception 'Template de pagina dinamica nao encontrado.' using errcode = '22023';
  end if;

  insert into public.hub_map_nodes (
    id,
    map_id,
    title,
    description,
    node_type,
    icon_key,
    status,
    destination_type,
    position_x,
    position_y,
    is_collapsed,
    is_active,
    metadata
  )
  values (
    p_node_id,
    p_map_id,
    coalesce(nullif(btrim(p_title), ''), 'Nova pagina dinamica'),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_node_type,
    p_icon_key,
    'NOT_STARTED',
    'DYNAMIC_PAGE',
    p_position_x,
    p_position_y,
    false,
    true,
    case
      when p_parent_node_id is null then '{}'::jsonb
      else jsonb_build_object('parentId', p_parent_node_id)
    end
  );

  insert into public.hub_dynamic_pages (
    id,
    map_id,
    node_id,
    page_type,
    title,
    summary,
    objective,
    status,
    responsible,
    priority,
    next_action,
    is_active,
    created_by,
    updated_by
  )
  values (
    v_page_id,
    p_map_id,
    p_node_id,
    p_page_type,
    coalesce(nullif(btrim(p_title), ''), 'Nova pagina dinamica'),
    nullif(btrim(coalesce(p_description, '')), ''),
    '',
    'NOT_STARTED',
    '',
    'MEDIUM',
    '',
    true,
    auth.uid(),
    auth.uid()
  );

  for v_block in select value from jsonb_array_elements(v_template.initial_blocks)
  loop
    insert into public.hub_dynamic_page_blocks (
      page_id,
      block_type,
      position,
      title,
      content,
      is_active,
      created_by,
      updated_by
    )
    values (
      v_page_id,
      coalesce(v_block ->> 'block_type', 'TEXT'),
      v_position,
      coalesce(nullif(v_block ->> 'title', ''), 'Bloco'),
      coalesce(v_block -> 'content', '{}'::jsonb),
      true,
      auth.uid(),
      auth.uid()
    );
    v_position := v_position + 1;
  end loop;

  update public.hub_map_nodes
  set dynamic_page_id = v_page_id
  where id = p_node_id;

  if p_parent_node_id is not null then
    v_edge_id := gen_random_uuid();
    insert into public.hub_map_edges (
      id,
      map_id,
      source_node_id,
      target_node_id,
      relation_type,
      label,
      metadata
    )
    values (
      v_edge_id,
      p_map_id,
      p_parent_node_id,
      p_node_id,
      'BELONGS_TO',
      null,
      '{}'::jsonb
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'node', (select to_jsonb(node_row) from public.hub_map_nodes node_row where node_row.id = p_node_id),
    'page', (select to_jsonb(page_row) from public.hub_dynamic_pages page_row where page_row.id = v_page_id),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(block_row) order by block_row.position), '[]'::jsonb) from public.hub_dynamic_page_blocks block_row where block_row.page_id = v_page_id),
    'edge', (select to_jsonb(edge_row) from public.hub_map_edges edge_row where edge_row.id = v_edge_id)
  );
end;
$$;

create or replace function public.save_hub_dynamic_page(
  p_page_id uuid,
  p_title text,
  p_summary text,
  p_objective text,
  p_status text,
  p_responsible text,
  p_priority text,
  p_start_date date,
  p_due_date date,
  p_next_action text,
  p_expected_updated_at timestamptz,
  p_blocks jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_page public.hub_dynamic_pages%rowtype;
  v_block jsonb;
  v_block_id uuid;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Acesso restrito ao Mapa Mestre.' using errcode = '42501';
  end if;

  select *
  into v_page
  from public.hub_dynamic_pages
  where id = p_page_id
    and is_active
  for update;

  if v_page.id is null then
    raise exception 'Pagina dinamica nao encontrada.' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is not null and v_page.updated_at <> p_expected_updated_at then
    raise exception 'DYNAMIC_PAGE_CONFLICT' using errcode = '40001';
  end if;

  update public.hub_dynamic_pages
  set
    title = coalesce(nullif(btrim(p_title), ''), title),
    summary = nullif(btrim(coalesce(p_summary, '')), ''),
    objective = nullif(btrim(coalesce(p_objective, '')), ''),
    status = p_status,
    responsible = nullif(btrim(coalesce(p_responsible, '')), ''),
    priority = p_priority,
    start_date = p_start_date,
    due_date = p_due_date,
    next_action = nullif(btrim(coalesce(p_next_action, '')), ''),
    updated_by = auth.uid()
  where id = p_page_id
  returning * into v_page;

  for v_block in select value from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb))
  loop
    v_block_id := coalesce(nullif(v_block ->> 'id', '')::uuid, gen_random_uuid());

    if exists (
      select 1
      from public.hub_dynamic_page_blocks
      where id = v_block_id
        and page_id = p_page_id
    ) then
      update public.hub_dynamic_page_blocks
      set
        block_type = coalesce(v_block ->> 'block_type', block_type),
        position = coalesce((v_block ->> 'position')::integer, position),
        title = coalesce(nullif(v_block ->> 'title', ''), title),
        content = coalesce(v_block -> 'content', content),
        is_active = coalesce((v_block ->> 'is_active')::boolean, is_active),
        updated_by = auth.uid()
      where id = v_block_id
        and page_id = p_page_id;
    else
      insert into public.hub_dynamic_page_blocks (
        id,
        page_id,
        block_type,
        position,
        title,
        content,
        is_active,
        created_by,
        updated_by
      )
      values (
        v_block_id,
        p_page_id,
        coalesce(v_block ->> 'block_type', 'TEXT'),
        coalesce((v_block ->> 'position')::integer, 0),
        coalesce(nullif(v_block ->> 'title', ''), 'Bloco'),
        coalesce(v_block -> 'content', '{}'::jsonb),
        coalesce((v_block ->> 'is_active')::boolean, true),
        auth.uid(),
        auth.uid()
      );
    end if;
  end loop;

  update public.hub_map_nodes
  set
    title = v_page.title,
    status = v_page.status,
    responsible = v_page.responsible,
    next_action = v_page.next_action,
    destination_type = 'DYNAMIC_PAGE',
    dynamic_page_id = v_page.id
  where id = v_page.node_id;

  return jsonb_build_object(
    'page', (select to_jsonb(page_row) from public.hub_dynamic_pages page_row where page_row.id = p_page_id),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(block_row) order by block_row.position), '[]'::jsonb) from public.hub_dynamic_page_blocks block_row where block_row.page_id = p_page_id),
    'node', (select to_jsonb(node_row) from public.hub_map_nodes node_row where node_row.id = v_page.node_id)
  );
end;
$$;

revoke all on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) from public;
revoke all on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) from anon;
grant execute on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) to authenticated;
grant execute on function public.create_hub_dynamic_page_for_node(uuid, uuid, text, text, text, text, text, uuid, numeric, numeric, uuid) to service_role;

revoke all on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) from public;
revoke all on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) from anon;
grant execute on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) to authenticated;
grant execute on function public.save_hub_dynamic_page(uuid, text, text, text, text, text, text, date, date, text, timestamptz, jsonb) to service_role;

with seed_pages(page_id, node_id, page_type, priority) as (
  values
    ('81000000-0000-4000-8000-000000000011'::uuid, '22222222-2222-4222-8222-000000000011'::uuid, 'PROCESS', 'HIGH'),
    ('81000000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-000000000012', 'MODULE', 'HIGH'),
    ('81000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-000000000013', 'EQUIPMENT', 'HIGH'),
    ('81000000-0000-4000-8000-000000000014', '22222222-2222-4222-8222-000000000014', 'DECISION', 'MEDIUM'),
    ('81000000-0000-4000-8000-000000000015', '22222222-2222-4222-8222-000000000015', 'PROCESS', 'HIGH'),
    ('81000000-0000-4000-8000-000000000016', '22222222-2222-4222-8222-000000000016', 'INTEGRATION', 'MEDIUM'),
    ('81000000-0000-4000-8000-000000000018', '22222222-2222-4222-8222-000000000018', 'DOCUMENTATION', 'MEDIUM'),
    ('81000000-0000-4000-8000-000000000020', '22222222-2222-4222-8222-000000000020', 'TEST', 'HIGH'),
    ('81000000-0000-4000-8000-000000000021', '22222222-2222-4222-8222-000000000021', 'PROJECT', 'HIGH')
),
source_nodes as (
  select
    seed_pages.page_id,
    seed_pages.page_type,
    seed_pages.priority,
    node.id as node_id,
    node.map_id,
    node.title,
    node.description,
    node.status,
    node.responsible,
    node.next_action
  from seed_pages
  join public.hub_map_nodes node on node.id = seed_pages.node_id
)
insert into public.hub_dynamic_pages (
  id,
  map_id,
  node_id,
  page_type,
  title,
  summary,
  objective,
  status,
  responsible,
  priority,
  next_action,
  is_active
)
select
  page_id,
  map_id,
  node_id,
  page_type,
  title,
  description,
  case
    when page_type = 'PROCESS' then 'Organizar o fluxo antes de criar operacao automatizada.'
    when page_type = 'MODULE' then 'Documentar o modulo futuro sem implementar a retirada ou devolucao de chaves neste PR.'
    when page_type = 'EQUIPMENT' then 'Registrar alternativas fisicas e pendencias de validacao.'
    when page_type = 'INTEGRATION' then 'Mapear integracao futura sem criar iHome agora.'
    else 'Registrar informacoes confirmadas, pendencias e proximas acoes.'
  end,
  status,
  responsible,
  priority,
  next_action,
  true
from source_nodes
where not exists (
  select 1
  from public.hub_dynamic_pages existing
  where existing.node_id = source_nodes.node_id
    and existing.is_active
);

with seeded_pages as (
  select page.id, page.page_type
  from public.hub_dynamic_pages page
  where page.id in (
    '81000000-0000-4000-8000-000000000011',
    '81000000-0000-4000-8000-000000000012',
    '81000000-0000-4000-8000-000000000013',
    '81000000-0000-4000-8000-000000000014',
    '81000000-0000-4000-8000-000000000015',
    '81000000-0000-4000-8000-000000000016',
    '81000000-0000-4000-8000-000000000018',
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000021'
  )
),
template_blocks as (
  select
    seeded_pages.id as page_id,
    block.value as block_value,
    block.ordinality - 1 as position
  from seeded_pages
  join public.hub_dynamic_page_templates template on template.page_type = seeded_pages.page_type and template.is_active
  cross join lateral jsonb_array_elements(template.initial_blocks) with ordinality as block(value, ordinality)
  where template.is_system
)
insert into public.hub_dynamic_page_blocks (
  page_id,
  block_type,
  position,
  title,
  content,
  is_active
)
select
  page_id,
  coalesce(block_value ->> 'block_type', 'TEXT'),
  position,
  coalesce(nullif(block_value ->> 'title', ''), 'Bloco'),
  coalesce(block_value -> 'content', '{}'::jsonb),
  true
from template_blocks
where not exists (
  select 1
  from public.hub_dynamic_page_blocks existing
  where existing.page_id = template_blocks.page_id
    and existing.title = coalesce(nullif(template_blocks.block_value ->> 'title', ''), 'Bloco')
    and existing.is_active
);

update public.hub_map_nodes node
set
  destination_type = 'DYNAMIC_PAGE',
  dynamic_page_id = page.id
from public.hub_dynamic_pages page
where node.id = page.node_id
  and page.is_active
  and page.id in (
    '81000000-0000-4000-8000-000000000011',
    '81000000-0000-4000-8000-000000000012',
    '81000000-0000-4000-8000-000000000013',
    '81000000-0000-4000-8000-000000000014',
    '81000000-0000-4000-8000-000000000015',
    '81000000-0000-4000-8000-000000000016',
    '81000000-0000-4000-8000-000000000018',
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000021'
  );
