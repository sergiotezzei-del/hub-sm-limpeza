create table if not exists public.hub_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_maps_slug_unique unique (slug)
);

create table if not exists public.hub_map_nodes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.hub_maps (id) on delete cascade,
  title text not null,
  description text,
  node_type text not null default 'task',
  icon_key text not null default 'settings',
  module_key text,
  status text not null default 'NOT_STARTED',
  responsible text,
  next_action text,
  target_screen text,
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  is_collapsed boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_map_nodes_status_check check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  constraint hub_map_nodes_node_type_check check (node_type in ('root', 'module', 'submodule', 'project', 'task', 'physical', 'integration', 'milestone')),
  constraint hub_map_nodes_icon_key_check check (icon_key in ('cleaning', 'coffee', 'water', 'security', 'guards', 'parking', 'vehicle', 'search', 'camera', 'edit', 'save', 'back', 'warning', 'success', 'blocked', 'stock', 'users', 'reports', 'qr', 'payment', 'settings', 'map')),
  constraint hub_map_nodes_target_screen_check check (
    target_screen is null
    or target_screen in ('cleaning-dashboard', 'current-stock', 'stock-exit-history', 'product-register', 'copa-cafe-menu', 'security-menu', 'security-guards', 'security-monitoring', 'security-parking', 'security-guards-payment', 'users-permissions', 'system-status', 'master-map')
  )
);

create table if not exists public.hub_map_edges (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.hub_maps (id) on delete cascade,
  source_node_id uuid not null references public.hub_map_nodes (id) on delete cascade,
  target_node_id uuid not null references public.hub_map_nodes (id) on delete cascade,
  relation_type text not null default 'CONNECTS_WITH',
  label text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_map_edges_relation_type_check check (relation_type in ('BELONGS_TO', 'DEPENDS_ON', 'CONNECTS_WITH', 'TRIGGERS', 'INTEGRATES_WITH')),
  constraint hub_map_edges_not_self_check check (source_node_id <> target_node_id)
);

create index if not exists hub_maps_active_idx on public.hub_maps (is_active);
create index if not exists hub_map_nodes_map_idx on public.hub_map_nodes (map_id);
create index if not exists hub_map_nodes_status_idx on public.hub_map_nodes (status);
create index if not exists hub_map_nodes_active_idx on public.hub_map_nodes (is_active);
create index if not exists hub_map_nodes_target_screen_idx on public.hub_map_nodes (target_screen);
create index if not exists hub_map_edges_map_idx on public.hub_map_edges (map_id);
create index if not exists hub_map_edges_source_idx on public.hub_map_edges (source_node_id);
create index if not exists hub_map_edges_target_idx on public.hub_map_edges (target_node_id);
create index if not exists hub_map_edges_active_idx on public.hub_map_edges (is_active);
create unique index if not exists hub_map_edges_unique_relation_idx on public.hub_map_edges (map_id, source_node_id, target_node_id, relation_type, coalesce(label, ''));

create or replace function public.set_hub_master_map_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hub_maps_updated_at on public.hub_maps;
create trigger hub_maps_updated_at
before update on public.hub_maps
for each row
execute function public.set_hub_master_map_updated_at();

drop trigger if exists hub_map_nodes_updated_at on public.hub_map_nodes;
create trigger hub_map_nodes_updated_at
before update on public.hub_map_nodes
for each row
execute function public.set_hub_master_map_updated_at();

drop trigger if exists hub_map_edges_updated_at on public.hub_map_edges;
create trigger hub_map_edges_updated_at
before update on public.hub_map_edges
for each row
execute function public.set_hub_master_map_updated_at();

alter table public.hub_maps enable row level security;
alter table public.hub_map_nodes enable row level security;
alter table public.hub_map_edges enable row level security;

revoke all on table public.hub_maps from anon;
revoke all on table public.hub_map_nodes from anon;
revoke all on table public.hub_map_edges from anon;

grant select, insert, update, delete on table public.hub_maps to authenticated;
grant select, insert, update, delete on table public.hub_map_nodes to authenticated;
grant select, insert, update, delete on table public.hub_map_edges to authenticated;
grant select, insert, update, delete on table public.hub_maps to service_role;
grant select, insert, update, delete on table public.hub_map_nodes to service_role;
grant select, insert, update, delete on table public.hub_map_edges to service_role;

drop policy if exists "hub_maps_admin_select" on public.hub_maps;
create policy "hub_maps_admin_select"
on public.hub_maps
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_maps_admin_insert" on public.hub_maps;
create policy "hub_maps_admin_insert"
on public.hub_maps
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_maps_admin_update" on public.hub_maps;
create policy "hub_maps_admin_update"
on public.hub_maps
for update
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_maps_admin_delete" on public.hub_maps;
create policy "hub_maps_admin_delete"
on public.hub_maps
for delete
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_nodes_admin_select" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_select"
on public.hub_map_nodes
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_nodes_admin_insert" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_insert"
on public.hub_map_nodes
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_nodes_admin_update" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_update"
on public.hub_map_nodes
for update
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_nodes_admin_delete" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_delete"
on public.hub_map_nodes
for delete
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_edges_admin_select" on public.hub_map_edges;
create policy "hub_map_edges_admin_select"
on public.hub_map_edges
for select
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_edges_admin_insert" on public.hub_map_edges;
create policy "hub_map_edges_admin_insert"
on public.hub_map_edges
for insert
to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_edges_admin_update" on public.hub_map_edges;
create policy "hub_map_edges_admin_update"
on public.hub_map_edges
for update
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "hub_map_edges_admin_delete" on public.hub_map_edges;
create policy "hub_map_edges_admin_delete"
on public.hub_map_edges
for delete
to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

insert into public.hub_maps (id, name, slug, description, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'Mapa Geral do HUB SM', 'hub-sm-geral', 'Visão geral dos módulos, projetos, dependências e andamento do HUB SM.', true),
  ('22222222-2222-4222-8222-222222222222', 'Projeto SM Key Control', 'sm-key-control', 'Mapa de arquitetura e preparação do futuro Controle de Chaves da Imobiliária.', true)
on conflict (slug) do nothing;

insert into public.hub_map_nodes (
  id,
  map_id,
  title,
  description,
  node_type,
  icon_key,
  module_key,
  status,
  responsible,
  next_action,
  target_screen,
  position_x,
  position_y,
  is_collapsed,
  is_active,
  metadata
) values
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-111111111111', 'Aplicativo HUB SM Tezzei', 'HUB SM em produção, com módulos operacionais em evolução.', 'root', 'map', 'hub-sm', 'COMPLETED', 'Tezzei', null, null, 0, 0, false, true, '{"realTest":"HUB SM em produção."}'::jsonb),
  ('11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-111111111111', 'Limpeza', 'Rotinas, pedidos, estoque e histórico da equipe.', 'module', 'cleaning', 'limpeza', 'COMPLETED', null, null, 'cleaning-dashboard', -620, -260, false, true, '{"parentId":"11111111-1111-4111-8111-000000000001"}'::jsonb),
  ('11111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-111111111111', 'Estoque', 'Produtos e saldo atual da limpeza.', 'submodule', 'stock', 'limpeza-estoque', 'COMPLETED', null, null, 'current-stock', -980, -360, false, true, '{"parentId":"11111111-1111-4111-8111-000000000010"}'::jsonb),
  ('11111111-1111-4111-8111-000000000012', '11111111-1111-4111-8111-111111111111', 'Movimentações', 'Saídas e ajustes de estoque.', 'submodule', 'stock', 'limpeza-movimentacoes', 'COMPLETED', null, null, 'stock-exit-history', -980, -265, false, true, '{"parentId":"11111111-1111-4111-8111-000000000010"}'::jsonb),
  ('11111111-1111-4111-8111-000000000013', '11111111-1111-4111-8111-111111111111', 'Pedidos', 'Pedidos de produtos da equipe.', 'submodule', 'cleaning', 'limpeza-pedidos', 'COMPLETED', null, null, 'cleaning-dashboard', -980, -170, false, true, '{"parentId":"11111111-1111-4111-8111-000000000010"}'::jsonb),
  ('11111111-1111-4111-8111-000000000014', '11111111-1111-4111-8111-111111111111', 'Produtos', 'Cadastro, foto, unidade e código de barras.', 'submodule', 'edit', 'limpeza-produtos', 'COMPLETED', null, null, 'product-register', -980, -75, false, true, '{"parentId":"11111111-1111-4111-8111-000000000010"}'::jsonb),
  ('11111111-1111-4111-8111-000000000015', '11111111-1111-4111-8111-111111111111', 'Funcionárias', 'Neia, Selma e Helena.', 'submodule', 'users', 'limpeza-funcionarias', 'COMPLETED', null, null, 'cleaning-dashboard', -980, 20, false, true, '{"parentId":"11111111-1111-4111-8111-000000000010"}'::jsonb),
  ('11111111-1111-4111-8111-000000000016', '11111111-1111-4111-8111-111111111111', 'Fila offline', 'Pendências salvas no aparelho até voltar internet.', 'submodule', 'warning', 'limpeza-offline', 'COMPLETED', null, null, 'cleaning-dashboard', -980, 115, false, true, '{"parentId":"11111111-1111-4111-8111-000000000010"}'::jsonb),
  ('11111111-1111-4111-8111-000000000020', '11111111-1111-4111-8111-111111111111', 'Copa e Café', 'Café, água, copos, bebidas e insumos da copa.', 'module', 'coffee', 'copa-cafe', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -620, 60, false, true, '{"parentId":"11111111-1111-4111-8111-000000000001"}'::jsonb),
  ('11111111-1111-4111-8111-000000000021', '11111111-1111-4111-8111-111111111111', 'Café', 'Máquina de café e insumos.', 'submodule', 'coffee', 'cafe', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -980, 250, false, true, '{"parentId":"11111111-1111-4111-8111-000000000020"}'::jsonb),
  ('11111111-1111-4111-8111-000000000022', '11111111-1111-4111-8111-111111111111', 'Água', 'Compras e estoque de água.', 'submodule', 'water', 'agua', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -980, 345, false, true, '{"parentId":"11111111-1111-4111-8111-000000000020"}'::jsonb),
  ('11111111-1111-4111-8111-000000000023', '11111111-1111-4111-8111-111111111111', 'Estoque', 'Insumos da copa sem misturar com limpeza.', 'submodule', 'stock', 'copa-estoque', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -980, 440, false, true, '{"parentId":"11111111-1111-4111-8111-000000000020"}'::jsonb),
  ('11111111-1111-4111-8111-000000000024', '11111111-1111-4111-8111-111111111111', 'Pedidos', 'Solicitações da copa.', 'submodule', 'reports', 'copa-pedidos', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -980, 535, false, true, '{"parentId":"11111111-1111-4111-8111-000000000020"}'::jsonb),
  ('11111111-1111-4111-8111-000000000025', '11111111-1111-4111-8111-111111111111', 'Leituras', 'Leituras da máquina de café.', 'submodule', 'reports', 'copa-leituras', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -980, 630, false, true, '{"parentId":"11111111-1111-4111-8111-000000000020"}'::jsonb),
  ('11111111-1111-4111-8111-000000000026', '11111111-1111-4111-8111-111111111111', 'Divergências', 'Pontos para conferência operacional.', 'submodule', 'warning', 'copa-divergencias', 'IN_PROGRESS', null, null, 'copa-cafe-menu', -980, 725, false, true, '{"parentId":"11111111-1111-4111-8111-000000000020"}'::jsonb),
  ('11111111-1111-4111-8111-000000000030', '11111111-1111-4111-8111-111111111111', 'Segurança', 'Guardas, rondas, QR Code, estacionamento e fechamento.', 'module', 'security', 'seguranca', 'COMPLETED', null, null, 'security-menu', 460, -260, false, true, '{"parentId":"11111111-1111-4111-8111-000000000001"}'::jsonb),
  ('11111111-1111-4111-8111-000000000031', '11111111-1111-4111-8111-111111111111', 'Guardas', 'Carlos Clemente e Salomão.', 'submodule', 'guards', 'guardas', 'COMPLETED', null, null, 'security-guards', 840, -460, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000032', '11111111-1111-4111-8111-111111111111', 'Rondas', 'Relatório real de rondas.', 'submodule', 'guards', 'rondas', 'COMPLETED', null, null, 'security-monitoring', 840, -365, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000033', '11111111-1111-4111-8111-111111111111', 'QR Code', 'Leitura de pontos de ronda.', 'submodule', 'qr', 'qr-code', 'COMPLETED', null, null, 'security-monitoring', 840, -270, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000034', '11111111-1111-4111-8111-111111111111', 'Estacionamento', 'Consulta rápida de veículos.', 'submodule', 'parking', 'estacionamento', 'COMPLETED', null, null, 'security-parking', 840, -175, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000035', '11111111-1111-4111-8111-111111111111', 'Cadastro de Veículos', 'Cadastro restrito a Admin.', 'submodule', 'vehicle', 'cadastro-veiculos', 'COMPLETED', null, null, 'security-parking', 840, -80, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000036', '11111111-1111-4111-8111-111111111111', 'Pagamentos', 'Fechamento dos guardas.', 'submodule', 'payment', 'pagamentos-guardas', 'COMPLETED', null, null, 'security-guards-payment', 840, 15, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000037', '11111111-1111-4111-8111-111111111111', 'Controle de Acesso', 'Base para acessos futuros.', 'submodule', 'security', 'controle-acesso', 'IN_PROGRESS', null, null, 'security-menu', 840, 110, false, true, '{"parentId":"11111111-1111-4111-8111-000000000030"}'::jsonb),
  ('11111111-1111-4111-8111-000000000040', '11111111-1111-4111-8111-111111111111', 'SM Key Control', 'Projeto do futuro controle de chaves da imobiliária.', 'project', 'settings', 'sm-key-control', 'IN_PROGRESS', 'Tezzei', 'Levantar fluxo real por cinco dias.', null, 480, 70, false, true, '{"parentId":"11111111-1111-4111-8111-000000000001"}'::jsonb),
  ('11111111-1111-4111-8111-000000000050', '11111111-1111-4111-8111-111111111111', 'Administração', 'Usuários, permissões, status e mapa mestre.', 'module', 'users', 'administracao', 'COMPLETED', null, null, null, -70, 310, false, true, '{"parentId":"11111111-1111-4111-8111-000000000001"}'::jsonb),
  ('11111111-1111-4111-8111-000000000051', '11111111-1111-4111-8111-111111111111', 'Usuários', 'Cadastro sincronizado de usuários.', 'submodule', 'users', 'usuarios', 'COMPLETED', null, null, 'users-permissions', -100, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050"}'::jsonb),
  ('11111111-1111-4111-8111-000000000052', '11111111-1111-4111-8111-111111111111', 'Permissões', 'Perfis por uso real.', 'submodule', 'settings', 'permissoes', 'COMPLETED', null, null, 'users-permissions', 135, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050"}'::jsonb),
  ('11111111-1111-4111-8111-000000000053', '11111111-1111-4111-8111-111111111111', 'Status do Sistema', 'Visão rápida dos módulos principais.', 'submodule', 'reports', 'status-sistema', 'COMPLETED', null, null, 'system-status', 370, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050"}'::jsonb),
  ('11111111-1111-4111-8111-000000000054', '11111111-1111-4111-8111-111111111111', 'Mapa Mestre', 'Mapa mental interativo do HUB SM.', 'submodule', 'map', 'mapa-mestre', 'IN_PROGRESS', 'Tezzei', null, 'master-map', 605, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050"}'::jsonb),
  ('11111111-1111-4111-8111-000000000055', '11111111-1111-4111-8111-111111111111', 'Padronização de ícones', 'Biblioteca interna AppIcon.', 'milestone', 'success', 'padronizacao-icones', 'COMPLETED', null, null, null, 840, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050"}'::jsonb),
  ('11111111-1111-4111-8111-000000000056', '11111111-1111-4111-8111-111111111111', 'Revisão mobile', 'Ajustes de usabilidade em celular.', 'milestone', 'success', 'revisao-mobile', 'COMPLETED', null, null, null, 1075, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050"}'::jsonb),
  ('11111111-1111-4111-8111-000000000057', '11111111-1111-4111-8111-111111111111', 'Fechamento de estabilidade antes de Chaves', 'PR #78 concluído.', 'milestone', 'success', 'fechamento-estabilidade-chaves', 'COMPLETED', null, null, null, 1310, 560, false, true, '{"parentId":"11111111-1111-4111-8111-000000000050","pr":"#78"}'::jsonb),
  ('22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-222222222222', 'SM Key Control', 'Arquitetura do futuro controle de chaves. Este mapa não cria a operação de retirada/devolução.', 'root', 'map', 'sm-key-control', 'IN_PROGRESS', 'Tezzei', 'Levantar operação real antes do piloto.', null, 0, 0, false, true, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000010', '22222222-2222-4222-8222-222222222222', 'Operação atual', 'Entender como as chaves circulam hoje.', 'project', 'reports', 'operacao-atual', 'IN_PROGRESS', null, null, null, -900, -360, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000011', '22222222-2222-4222-8222-222222222222', 'Levantamento do fluxo', 'Cinco dias de observação operacional.', 'project', 'reports', 'levantamento-fluxo', 'IN_PROGRESS', null, 'Registrar saídas reais por cinco dias.', null, -900, -190, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000012', '22222222-2222-4222-8222-222222222222', 'Software', 'Módulos futuros de imóveis, chaves, solicitações e movimentações.', 'project', 'settings', 'software', 'IN_PROGRESS', null, null, null, -900, 30, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000013', '22222222-2222-4222-8222-222222222222', 'Painel físico', 'Painel MDF atual, sensores, trava e possibilidades de retrofit.', 'physical', 'stock', 'painel-fisico', 'IN_PROGRESS', null, null, null, -900, 270, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000014', '22222222-2222-4222-8222-222222222222', 'Identificação das chaves', 'Comparação entre QR, NFC, RFID, contato elétrico e visão.', 'project', 'qr', 'identificacao', 'IN_PROGRESS', null, null, null, 680, -420, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000015', '22222222-2222-4222-8222-222222222222', 'Controle de acesso', 'Porta blindada, facial, crachá, PIN e registros de entrada.', 'project', 'security', 'controle-acesso', 'IN_PROGRESS', null, null, null, 680, -160, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000016', '22222222-2222-4222-8222-222222222222', 'Integração IHome', 'API, webhooks, filas e sincronização futura.', 'integration', 'settings', 'ihome', 'NOT_STARTED', null, null, null, 680, 120, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000017', '22222222-2222-4222-8222-222222222222', 'Etiquetas e impressão', 'Etiqueta 60 x 40 mm e impressão real.', 'project', 'qr', 'etiquetas-impressao', 'IN_PROGRESS', null, null, null, 680, 350, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000018', '22222222-2222-4222-8222-222222222222', 'Auditoria', 'Histórico e trilha futura das chaves.', 'project', 'reports', 'auditoria', 'NOT_STARTED', null, null, null, 80, 520, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000019', '22222222-2222-4222-8222-222222222222', 'Alertas', 'Alertas operacionais futuros.', 'project', 'warning', 'alertas', 'NOT_STARTED', null, null, null, 310, 520, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000020', '22222222-2222-4222-8222-222222222222', 'Piloto', 'Piloto operacional após definição técnica.', 'milestone', 'success', 'piloto', 'NOT_STARTED', null, null, null, 540, 520, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000021', '22222222-2222-4222-8222-222222222222', 'Produtização', 'Transformar piloto em operação oficial.', 'milestone', 'settings', 'produtizacao', 'NOT_STARTED', null, null, null, 770, 520, false, true, '{"parentId":"22222222-2222-4222-8222-000000000001"}'::jsonb),
  ('22222222-2222-4222-8222-000000000030', '22222222-2222-4222-8222-222222222222', 'Cadastro de imóveis', null, 'submodule', 'edit', 'cadastro-imoveis', 'NOT_STARTED', null, null, null, -1260, -40, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000031', '22222222-2222-4222-8222-222222222222', 'Cadastro de chaves', null, 'submodule', 'edit', 'cadastro-chaves', 'NOT_STARTED', null, null, null, -1260, 46, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000032', '22222222-2222-4222-8222-222222222222', 'Solicitações', null, 'submodule', 'reports', 'solicitacoes', 'NOT_STARTED', null, null, null, -1260, 132, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000033', '22222222-2222-4222-8222-222222222222', 'Autorizações', null, 'submodule', 'reports', 'autorizacoes', 'NOT_STARTED', null, null, null, -1260, 218, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000034', '22222222-2222-4222-8222-222222222222', 'Retiradas', null, 'submodule', 'reports', 'retiradas', 'NOT_STARTED', null, null, null, -1260, 304, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000035', '22222222-2222-4222-8222-222222222222', 'Devoluções', null, 'submodule', 'reports', 'devolucoes', 'NOT_STARTED', null, null, null, -1260, 390, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000036', '22222222-2222-4222-8222-222222222222', 'Transferência de custódia', null, 'submodule', 'reports', 'transferencia-custodia', 'NOT_STARTED', null, null, null, -1260, 476, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000037', '22222222-2222-4222-8222-222222222222', 'Status', null, 'submodule', 'reports', 'status-chaves', 'NOT_STARTED', null, null, null, -1260, 562, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000038', '22222222-2222-4222-8222-222222222222', 'Relatórios', null, 'submodule', 'reports', 'relatorios-chaves', 'NOT_STARTED', null, null, null, -1260, 648, false, true, '{"parentId":"22222222-2222-4222-8222-000000000012"}'::jsonb),
  ('22222222-2222-4222-8222-000000000050', '22222222-2222-4222-8222-222222222222', 'Painel MDF atual', null, 'physical', 'stock', 'painel-mdf-atual', 'IN_PROGRESS', null, null, null, -1260, 760, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000051', '22222222-2222-4222-8222-222222222222', 'Aproximadamente 532 posições', null, 'physical', 'stock', '532-posicoes', 'IN_PROGRESS', null, null, null, -1260, 846, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000052', '22222222-2222-4222-8222-222222222222', 'Duas portas de correr', null, 'physical', 'stock', 'duas-portas-correr', 'IN_PROGRESS', null, null, null, -1260, 932, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000053', '22222222-2222-4222-8222-222222222222', 'Fechadura tambor', null, 'physical', 'stock', 'fechadura-tambor', 'IN_PROGRESS', null, null, null, -1260, 1018, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000054', '22222222-2222-4222-8222-222222222222', 'Trava eletrônica', null, 'physical', 'stock', 'trava-eletronica', 'NOT_STARTED', null, null, null, -1260, 1104, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000055', '22222222-2222-4222-8222-222222222222', 'Sensores', null, 'physical', 'stock', 'sensores', 'NOT_STARTED', null, null, null, -1260, 1190, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000056', '22222222-2222-4222-8222-222222222222', 'Controlador local', null, 'physical', 'settings', 'controlador-local', 'NOT_STARTED', null, null, null, -1260, 1276, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000057', '22222222-2222-4222-8222-222222222222', 'Painel novo', null, 'physical', 'stock', 'painel-novo', 'NOT_STARTED', null, null, null, -1260, 1362, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000058', '22222222-2222-4222-8222-222222222222', 'Locker de trânsito', null, 'physical', 'stock', 'locker-transito', 'NOT_STARTED', null, null, null, -1260, 1448, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000059', '22222222-2222-4222-8222-222222222222', 'Compartimentos individuais', null, 'physical', 'stock', 'compartimentos-individuais', 'NOT_STARTED', null, null, null, -1260, 1534, false, true, '{"parentId":"22222222-2222-4222-8222-000000000013"}'::jsonb),
  ('22222222-2222-4222-8222-000000000070', '22222222-2222-4222-8222-222222222222', 'QR Code', null, 'submodule', 'qr', 'qr-identificacao', 'NOT_STARTED', null, null, null, 1030, -540, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000071', '22222222-2222-4222-8222-222222222222', 'NFC', null, 'submodule', 'settings', 'nfc', 'NOT_STARTED', null, null, null, 1030, -454, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000072', '22222222-2222-4222-8222-222222222222', 'RFID UHF', null, 'submodule', 'settings', 'rfid-uhf', 'IN_PROGRESS', null, null, null, 1030, -368, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000073', '22222222-2222-4222-8222-222222222222', 'Contato elétrico', null, 'submodule', 'settings', 'contato-eletrico', 'NOT_STARTED', null, null, null, 1030, -282, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000074', '22222222-2222-4222-8222-222222222222', 'iButton', null, 'submodule', 'settings', 'ibutton', 'NOT_STARTED', null, null, null, 1030, -196, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000075', '22222222-2222-4222-8222-222222222222', 'Sensor por posição', null, 'submodule', 'settings', 'sensor-posicao', 'NOT_STARTED', null, null, null, 1030, -110, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000076', '22222222-2222-4222-8222-222222222222', 'Visão computacional', null, 'submodule', 'settings', 'visao-computacional', 'NOT_STARTED', null, null, null, 1030, -24, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000077', '22222222-2222-4222-8222-222222222222', 'Solução híbrida', null, 'submodule', 'settings', 'solucao-hibrida', 'IN_PROGRESS', null, null, null, 1030, 62, false, true, '{"parentId":"22222222-2222-4222-8222-000000000014"}'::jsonb),
  ('22222222-2222-4222-8222-000000000090', '22222222-2222-4222-8222-222222222222', 'Porta blindada', null, 'submodule', 'security', 'porta-blindada', 'IN_PROGRESS', null, null, null, 1030, 180, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000091', '22222222-2222-4222-8222-222222222222', 'Facial', null, 'submodule', 'security', 'facial', 'NOT_STARTED', null, null, null, 1030, 266, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000092', '22222222-2222-4222-8222-222222222222', 'Crachá', null, 'submodule', 'security', 'cracha', 'NOT_STARTED', null, null, null, 1030, 352, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000093', '22222222-2222-4222-8222-222222222222', 'PIN', null, 'submodule', 'security', 'pin', 'NOT_STARTED', null, null, null, 1030, 438, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000094', '22222222-2222-4222-8222-222222222222', 'Vídeo porteiro', null, 'submodule', 'security', 'video-porteiro', 'NOT_STARTED', null, null, null, 1030, 524, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000095', '22222222-2222-4222-8222-222222222222', 'Visitantes', null, 'submodule', 'security', 'visitantes', 'NOT_STARTED', null, null, null, 1030, 610, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000096', '22222222-2222-4222-8222-222222222222', 'Entregadores', null, 'submodule', 'security', 'entregadores', 'NOT_STARTED', null, null, null, 1030, 696, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000097', '22222222-2222-4222-8222-222222222222', 'Acesso temporário', null, 'submodule', 'security', 'acesso-temporario', 'NOT_STARTED', null, null, null, 1030, 782, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000098', '22222222-2222-4222-8222-222222222222', 'Registro de entrada', null, 'submodule', 'security', 'registro-entrada', 'NOT_STARTED', null, null, null, 1030, 868, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000099', '22222222-2222-4222-8222-222222222222', 'Registro de saída', null, 'submodule', 'security', 'registro-saida', 'NOT_STARTED', null, null, null, 1030, 954, false, true, '{"parentId":"22222222-2222-4222-8222-000000000015"}'::jsonb),
  ('22222222-2222-4222-8222-000000000110', '22222222-2222-4222-8222-222222222222', 'API', null, 'submodule', 'settings', 'ihome-api', 'NOT_STARTED', null, null, null, 1370, 70, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000111', '22222222-2222-4222-8222-222222222222', 'Webhook', null, 'submodule', 'settings', 'ihome-webhook', 'NOT_STARTED', null, null, null, 1370, 156, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000112', '22222222-2222-4222-8222-222222222222', 'Fila', null, 'submodule', 'settings', 'ihome-fila', 'NOT_STARTED', null, null, null, 1370, 242, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000113', '22222222-2222-4222-8222-222222222222', 'Sincronização', null, 'submodule', 'settings', 'ihome-sincronizacao', 'NOT_STARTED', null, null, null, 1370, 328, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000114', '22222222-2222-4222-8222-222222222222', 'Reprocessamento', null, 'submodule', 'settings', 'ihome-reprocessamento', 'NOT_STARTED', null, null, null, 1370, 414, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000115', '22222222-2222-4222-8222-222222222222', 'ID do imóvel', null, 'submodule', 'settings', 'ihome-id-imovel', 'NOT_STARTED', null, null, null, 1370, 500, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000116', '22222222-2222-4222-8222-222222222222', 'ID da chave', null, 'submodule', 'settings', 'ihome-id-chave', 'NOT_STARTED', null, null, null, 1370, 586, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb),
  ('22222222-2222-4222-8222-000000000117', '22222222-2222-4222-8222-222222222222', 'Eventos', null, 'submodule', 'settings', 'ihome-eventos', 'NOT_STARTED', null, null, null, 1370, 672, false, true, '{"parentId":"22222222-2222-4222-8222-000000000016"}'::jsonb)
on conflict (id) do nothing;

insert into public.hub_map_edges (map_id, source_node_id, target_node_id, relation_type, label, metadata)
select
  node.map_id,
  (node.metadata ->> 'parentId')::uuid,
  node.id,
  'BELONGS_TO',
  null,
  '{}'::jsonb
from public.hub_map_nodes node
where node.metadata ? 'parentId'
  and not exists (
    select 1
    from public.hub_map_edges existing
    where existing.map_id = node.map_id
      and existing.source_node_id = (node.metadata ->> 'parentId')::uuid
      and existing.target_node_id = node.id
      and existing.relation_type = 'BELONGS_TO'
  );

insert into public.hub_map_edges (map_id, source_node_id, target_node_id, relation_type, label, metadata)
values
  ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000040', '11111111-1111-4111-8111-000000000030', 'CONNECTS_WITH', 'usa controle de acesso', '{}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000040', '11111111-1111-4111-8111-000000000050', 'DEPENDS_ON', 'depende de permissões', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000033', '22222222-2222-4222-8222-000000000034', 'TRIGGERS', 'autorizado libera retirada', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000034', '22222222-2222-4222-8222-000000000037', 'TRIGGERS', 'chave retirada atualiza status', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000035', '22222222-2222-4222-8222-000000000037', 'TRIGGERS', 'devolução atualiza status', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000034', '22222222-2222-4222-8222-000000000016', 'INTEGRATES_WITH', 'movimentação sincroniza', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000091', '22222222-2222-4222-8222-000000000012', 'TRIGGERS', 'facial autorizado abre painel', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000015', '22222222-2222-4222-8222-000000000019', 'TRIGGERS', 'sem autorização gera alerta', '{}'::jsonb)
on conflict do nothing;
