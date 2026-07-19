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

create or replace function public.is_hub_master_map_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false);
$$;

revoke all on function public.is_hub_master_map_admin() from public;
revoke all on function public.is_hub_master_map_admin() from anon;
grant execute on function public.is_hub_master_map_admin() to authenticated;
grant execute on function public.is_hub_master_map_admin() to service_role;

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

revoke all on table public.hub_maps from public;
revoke all on table public.hub_map_nodes from public;
revoke all on table public.hub_map_edges from public;
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
create policy "hub_maps_admin_select" on public.hub_maps for select to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_maps_admin_insert" on public.hub_maps;
create policy "hub_maps_admin_insert" on public.hub_maps for insert to authenticated
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_maps_admin_update" on public.hub_maps;
create policy "hub_maps_admin_update" on public.hub_maps for update to authenticated
using (public.is_hub_master_map_admin())
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_maps_admin_delete" on public.hub_maps;
create policy "hub_maps_admin_delete" on public.hub_maps for delete to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_map_nodes_admin_select" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_select" on public.hub_map_nodes for select to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_map_nodes_admin_insert" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_insert" on public.hub_map_nodes for insert to authenticated
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_map_nodes_admin_update" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_update" on public.hub_map_nodes for update to authenticated
using (public.is_hub_master_map_admin())
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_map_nodes_admin_delete" on public.hub_map_nodes;
create policy "hub_map_nodes_admin_delete" on public.hub_map_nodes for delete to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_map_edges_admin_select" on public.hub_map_edges;
create policy "hub_map_edges_admin_select" on public.hub_map_edges for select to authenticated
using (public.is_hub_master_map_admin());

drop policy if exists "hub_map_edges_admin_insert" on public.hub_map_edges;
create policy "hub_map_edges_admin_insert" on public.hub_map_edges for insert to authenticated
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_map_edges_admin_update" on public.hub_map_edges;
create policy "hub_map_edges_admin_update" on public.hub_map_edges for update to authenticated
using (public.is_hub_master_map_admin())
with check (public.is_hub_master_map_admin());

drop policy if exists "hub_map_edges_admin_delete" on public.hub_map_edges;
create policy "hub_map_edges_admin_delete" on public.hub_map_edges for delete to authenticated
using (public.is_hub_master_map_admin());

insert into public.hub_maps (id, name, slug, description, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'Mapa Geral do HUB SM', 'hub-sm-geral', 'Visão geral dos módulos, projetos, dependências e andamento do HUB SM.', true),
  ('22222222-2222-4222-8222-222222222222', 'Projeto SM Key Control', 'sm-key-control', 'Mapa de arquitetura e preparação do futuro Controle de Chaves da Imobiliária.', true)
on conflict (slug) do nothing;

with seed(id, map_id, title, description, node_type, icon_key, module_key, status, target_screen, position_x, position_y, parent_id, responsible, next_action, extra_metadata) as (
  values
  ('11111111-1111-4111-8111-000000000001'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'Aplicativo HUB SM Tezzei', 'HUB SM em produção, com módulos operacionais em evolução.', 'root', 'map', 'hub-sm', 'COMPLETED', null, 0, 0, null::uuid, 'Tezzei', null, '{"realTest":"HUB SM em produção."}'::jsonb),
  ('11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-111111111111', 'Limpeza', 'Rotinas, pedidos, estoque e histórico da equipe.', 'module', 'cleaning', 'limpeza', 'COMPLETED', 'cleaning-dashboard', -620, -260, '11111111-1111-4111-8111-000000000001', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-111111111111', 'Estoque', 'Produtos e saldo atual da limpeza.', 'submodule', 'stock', 'limpeza-estoque', 'COMPLETED', 'current-stock', -980, -360, '11111111-1111-4111-8111-000000000010', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000012', '11111111-1111-4111-8111-111111111111', 'Movimentações', 'Saídas e ajustes de estoque.', 'submodule', 'stock', 'limpeza-movimentacoes', 'COMPLETED', 'stock-exit-history', -980, -265, '11111111-1111-4111-8111-000000000010', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000013', '11111111-1111-4111-8111-111111111111', 'Pedidos', 'Pedidos de produtos da equipe.', 'submodule', 'cleaning', 'limpeza-pedidos', 'COMPLETED', 'cleaning-dashboard', -980, -170, '11111111-1111-4111-8111-000000000010', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000014', '11111111-1111-4111-8111-111111111111', 'Produtos', 'Cadastro, foto, unidade e código de barras.', 'submodule', 'edit', 'limpeza-produtos', 'COMPLETED', 'product-register', -980, -75, '11111111-1111-4111-8111-000000000010', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000015', '11111111-1111-4111-8111-111111111111', 'Funcionárias', 'Neia, Selma e Helena.', 'submodule', 'users', 'limpeza-funcionarias', 'COMPLETED', 'cleaning-dashboard', -980, 20, '11111111-1111-4111-8111-000000000010', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000016', '11111111-1111-4111-8111-111111111111', 'Fila offline', 'Pendências salvas no aparelho até voltar internet.', 'submodule', 'warning', 'limpeza-offline', 'COMPLETED', 'cleaning-dashboard', -980, 115, '11111111-1111-4111-8111-000000000010', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000020', '11111111-1111-4111-8111-111111111111', 'Copa e Café', 'Café, água, copos, bebidas e insumos da copa.', 'module', 'coffee', 'copa-cafe', 'IN_PROGRESS', 'copa-cafe-menu', -620, 60, '11111111-1111-4111-8111-000000000001', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000021', '11111111-1111-4111-8111-111111111111', 'Café', 'Máquina de café e insumos.', 'submodule', 'coffee', 'cafe', 'IN_PROGRESS', 'copa-cafe-menu', -980, 250, '11111111-1111-4111-8111-000000000020', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000022', '11111111-1111-4111-8111-111111111111', 'Água', 'Compras e estoque de água.', 'submodule', 'water', 'agua', 'IN_PROGRESS', 'copa-cafe-menu', -980, 345, '11111111-1111-4111-8111-000000000020', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000023', '11111111-1111-4111-8111-111111111111', 'Estoque', 'Insumos da copa sem misturar com limpeza.', 'submodule', 'stock', 'copa-estoque', 'IN_PROGRESS', 'copa-cafe-menu', -980, 440, '11111111-1111-4111-8111-000000000020', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000024', '11111111-1111-4111-8111-111111111111', 'Pedidos', 'Solicitações da copa.', 'submodule', 'reports', 'copa-pedidos', 'IN_PROGRESS', 'copa-cafe-menu', -980, 535, '11111111-1111-4111-8111-000000000020', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000025', '11111111-1111-4111-8111-111111111111', 'Leituras', 'Leituras da máquina de café.', 'submodule', 'reports', 'copa-leituras', 'IN_PROGRESS', 'copa-cafe-menu', -980, 630, '11111111-1111-4111-8111-000000000020', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000026', '11111111-1111-4111-8111-111111111111', 'Divergências', 'Pontos para conferência operacional.', 'submodule', 'warning', 'copa-divergencias', 'IN_PROGRESS', 'copa-cafe-menu', -980, 725, '11111111-1111-4111-8111-000000000020', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000030', '11111111-1111-4111-8111-111111111111', 'Segurança', 'Guardas, rondas, QR Code, estacionamento e fechamento.', 'module', 'security', 'seguranca', 'COMPLETED', 'security-menu', 460, -260, '11111111-1111-4111-8111-000000000001', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000031', '11111111-1111-4111-8111-111111111111', 'Guardas', 'Carlos Clemente e Salomão.', 'submodule', 'guards', 'guardas', 'COMPLETED', 'security-guards', 840, -460, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000032', '11111111-1111-4111-8111-111111111111', 'Rondas', 'Relatório real de rondas.', 'submodule', 'guards', 'rondas', 'COMPLETED', 'security-monitoring', 840, -365, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000033', '11111111-1111-4111-8111-111111111111', 'QR Code', 'Leitura de pontos de ronda.', 'submodule', 'qr', 'qr-code', 'COMPLETED', 'security-monitoring', 840, -270, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000034', '11111111-1111-4111-8111-111111111111', 'Estacionamento', 'Consulta rápida de veículos.', 'submodule', 'parking', 'estacionamento', 'COMPLETED', 'security-parking', 840, -175, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000035', '11111111-1111-4111-8111-111111111111', 'Cadastro de Veículos', 'Cadastro restrito a Admin.', 'submodule', 'vehicle', 'cadastro-veiculos', 'COMPLETED', 'security-parking', 840, -80, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000036', '11111111-1111-4111-8111-111111111111', 'Pagamentos', 'Fechamento dos guardas.', 'submodule', 'payment', 'pagamentos-guardas', 'COMPLETED', 'security-guards-payment', 840, 15, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000037', '11111111-1111-4111-8111-111111111111', 'Controle de Acesso', 'Base para acessos futuros.', 'submodule', 'security', 'controle-acesso', 'IN_PROGRESS', 'security-menu', 840, 110, '11111111-1111-4111-8111-000000000030', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000040', '11111111-1111-4111-8111-111111111111', 'SM Key Control', 'Projeto do futuro controle de chaves da imobiliária.', 'project', 'settings', 'sm-key-control', 'IN_PROGRESS', null, 480, 70, '11111111-1111-4111-8111-000000000001', 'Tezzei', 'Levantar fluxo real por cinco dias.', '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000050', '11111111-1111-4111-8111-111111111111', 'Administração', 'Usuários, permissões, status e mapa mestre.', 'module', 'users', 'administracao', 'COMPLETED', null, -70, 310, '11111111-1111-4111-8111-000000000001', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000051', '11111111-1111-4111-8111-111111111111', 'Usuários', 'Cadastro sincronizado de usuários.', 'submodule', 'users', 'usuarios', 'COMPLETED', 'users-permissions', -100, 560, '11111111-1111-4111-8111-000000000050', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000052', '11111111-1111-4111-8111-111111111111', 'Permissões', 'Perfis por uso real.', 'submodule', 'settings', 'permissoes', 'COMPLETED', 'users-permissions', 135, 560, '11111111-1111-4111-8111-000000000050', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000053', '11111111-1111-4111-8111-111111111111', 'Status do Sistema', 'Visão rápida dos módulos principais.', 'submodule', 'reports', 'status-sistema', 'COMPLETED', 'system-status', 370, 560, '11111111-1111-4111-8111-000000000050', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000054', '11111111-1111-4111-8111-111111111111', 'Mapa Mestre', 'Mapa mental interativo do HUB SM.', 'submodule', 'map', 'mapa-mestre', 'IN_PROGRESS', 'master-map', 605, 560, '11111111-1111-4111-8111-000000000050', 'Tezzei', null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000055', '11111111-1111-4111-8111-111111111111', 'Padronização de ícones', 'Biblioteca interna AppIcon.', 'milestone', 'success', 'padronizacao-icones', 'COMPLETED', null, 840, 560, '11111111-1111-4111-8111-000000000050', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000056', '11111111-1111-4111-8111-111111111111', 'Revisão mobile', 'Ajustes de usabilidade em celular.', 'milestone', 'success', 'revisao-mobile', 'COMPLETED', null, 1075, 560, '11111111-1111-4111-8111-000000000050', null, null, '{}'::jsonb),
  ('11111111-1111-4111-8111-000000000057', '11111111-1111-4111-8111-111111111111', 'Fechamento de estabilidade antes de Chaves', 'PR #78 concluído.', 'milestone', 'success', 'fechamento-estabilidade-chaves', 'COMPLETED', null, 1310, 560, '11111111-1111-4111-8111-000000000050', null, null, '{"pr":"#78"}'::jsonb),
  ('22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-222222222222', 'SM Key Control', 'Arquitetura do futuro controle de chaves. Este mapa não cria a operação de retirada/devolução.', 'root', 'map', 'sm-key-control', 'IN_PROGRESS', null, 0, 0, null, 'Tezzei', 'Levantar operação real antes do piloto.', '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000010', '22222222-2222-4222-8222-222222222222', 'Operação atual', 'Entender como as chaves circulam hoje.', 'project', 'reports', 'operacao-atual', 'IN_PROGRESS', null, -900, -360, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000011', '22222222-2222-4222-8222-222222222222', 'Levantamento do fluxo', 'Cinco dias de observação operacional.', 'project', 'reports', 'levantamento-fluxo', 'IN_PROGRESS', null, -900, -190, '22222222-2222-4222-8222-000000000001', null, 'Registrar saídas reais por cinco dias.', '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000012', '22222222-2222-4222-8222-222222222222', 'Software', 'Módulos futuros de imóveis, chaves, solicitações e movimentações.', 'project', 'settings', 'software', 'IN_PROGRESS', null, -900, 30, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000013', '22222222-2222-4222-8222-222222222222', 'Painel físico', 'Painel MDF atual, sensores, trava e possibilidades de retrofit.', 'physical', 'stock', 'painel-fisico', 'IN_PROGRESS', null, -900, 270, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000014', '22222222-2222-4222-8222-222222222222', 'Identificação das chaves', 'Comparação entre QR, NFC, RFID, contato elétrico e visão.', 'project', 'qr', 'identificacao', 'IN_PROGRESS', null, 680, -420, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000015', '22222222-2222-4222-8222-222222222222', 'Controle de acesso', 'Porta blindada, facial, crachá, PIN e registros de entrada.', 'project', 'security', 'controle-acesso', 'IN_PROGRESS', null, 680, -160, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000016', '22222222-2222-4222-8222-222222222222', 'Integração IHome', 'API, webhooks, filas e sincronização futura.', 'integration', 'settings', 'ihome', 'NOT_STARTED', null, 680, 120, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000017', '22222222-2222-4222-8222-222222222222', 'Etiquetas e impressão', 'Etiqueta 60 x 40 mm e impressão real.', 'project', 'qr', 'etiquetas-impressao', 'IN_PROGRESS', null, 680, 350, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000018', '22222222-2222-4222-8222-222222222222', 'Auditoria', 'Histórico e trilha futura das chaves.', 'project', 'reports', 'auditoria', 'NOT_STARTED', null, 80, 520, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000019', '22222222-2222-4222-8222-222222222222', 'Alertas', 'Alertas operacionais futuros.', 'project', 'warning', 'alertas', 'NOT_STARTED', null, 310, 520, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000020', '22222222-2222-4222-8222-222222222222', 'Piloto', 'Piloto operacional após definição técnica.', 'milestone', 'success', 'piloto', 'NOT_STARTED', null, 540, 520, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb),
  ('22222222-2222-4222-8222-000000000021', '22222222-2222-4222-8222-222222222222', 'Produtização', 'Transformar piloto em operação oficial.', 'milestone', 'settings', 'produtizacao', 'NOT_STARTED', null, 770, 520, '22222222-2222-4222-8222-000000000001', null, null, '{}'::jsonb)
)
insert into public.hub_map_nodes (id, map_id, title, description, node_type, icon_key, module_key, status, responsible, next_action, target_screen, position_x, position_y, is_collapsed, is_active, metadata)
select id, map_id, title, description, node_type, icon_key, module_key, status, responsible, next_action, target_screen, position_x, position_y, false, true,
  jsonb_strip_nulls(jsonb_build_object('parentId', parent_id)) || extra_metadata
from seed
on conflict (id) do nothing;

with seed(id, map_id, title, parent_id, status, icon_key, position_x, position_y) as (
  values
  ('22222222-2222-4222-8222-000000000030'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Cadastro de imóveis', '22222222-2222-4222-8222-000000000012'::uuid, 'NOT_STARTED', 'edit', -1260, -40),
  ('22222222-2222-4222-8222-000000000031', '22222222-2222-4222-8222-222222222222', 'Cadastro de chaves', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'edit', -1260, 46),
  ('22222222-2222-4222-8222-000000000032', '22222222-2222-4222-8222-222222222222', 'Solicitações', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 132),
  ('22222222-2222-4222-8222-000000000033', '22222222-2222-4222-8222-222222222222', 'Autorizações', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 218),
  ('22222222-2222-4222-8222-000000000034', '22222222-2222-4222-8222-222222222222', 'Retiradas', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 304),
  ('22222222-2222-4222-8222-000000000035', '22222222-2222-4222-8222-222222222222', 'Devoluções', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 390),
  ('22222222-2222-4222-8222-000000000036', '22222222-2222-4222-8222-222222222222', 'Transferência de custódia', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 476),
  ('22222222-2222-4222-8222-000000000037', '22222222-2222-4222-8222-222222222222', 'Status', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 562),
  ('22222222-2222-4222-8222-000000000038', '22222222-2222-4222-8222-222222222222', 'Relatórios', '22222222-2222-4222-8222-000000000012', 'NOT_STARTED', 'reports', -1260, 648),
  ('22222222-2222-4222-8222-000000000050', '22222222-2222-4222-8222-222222222222', 'Painel MDF atual', '22222222-2222-4222-8222-000000000013', 'IN_PROGRESS', 'stock', -1260, 760),
  ('22222222-2222-4222-8222-000000000051', '22222222-2222-4222-8222-222222222222', 'Aproximadamente 532 posições', '22222222-2222-4222-8222-000000000013', 'IN_PROGRESS', 'stock', -1260, 846),
  ('22222222-2222-4222-8222-000000000052', '22222222-2222-4222-8222-222222222222', 'Duas portas de correr', '22222222-2222-4222-8222-000000000013', 'IN_PROGRESS', 'stock', -1260, 932),
  ('22222222-2222-4222-8222-000000000053', '22222222-2222-4222-8222-222222222222', 'Fechadura tambor', '22222222-2222-4222-8222-000000000013', 'IN_PROGRESS', 'stock', -1260, 1018),
  ('22222222-2222-4222-8222-000000000054', '22222222-2222-4222-8222-222222222222', 'Trava eletrônica', '22222222-2222-4222-8222-000000000013', 'NOT_STARTED', 'stock', -1260, 1104),
  ('22222222-2222-4222-8222-000000000055', '22222222-2222-4222-8222-222222222222', 'Sensores', '22222222-2222-4222-8222-000000000013', 'NOT_STARTED', 'stock', -1260, 1190),
  ('22222222-2222-4222-8222-000000000056', '22222222-2222-4222-8222-222222222222', 'Controlador local', '22222222-2222-4222-8222-000000000013', 'NOT_STARTED', 'settings', -1260, 1276),
  ('22222222-2222-4222-8222-000000000057', '22222222-2222-4222-8222-222222222222', 'Painel novo', '22222222-2222-4222-8222-000000000013', 'NOT_STARTED', 'stock', -1260, 1362),
  ('22222222-2222-4222-8222-000000000058', '22222222-2222-4222-8222-222222222222', 'Locker de trânsito', '22222222-2222-4222-8222-000000000013', 'NOT_STARTED', 'stock', -1260, 1448),
  ('22222222-2222-4222-8222-000000000059', '22222222-2222-4222-8222-222222222222', 'Compartimentos individuais', '22222222-2222-4222-8222-000000000013', 'NOT_STARTED', 'stock', -1260, 1534),
  ('22222222-2222-4222-8222-000000000070', '22222222-2222-4222-8222-222222222222', 'QR Code', '22222222-2222-4222-8222-000000000014', 'NOT_STARTED', 'qr', 1030, -540),
  ('22222222-2222-4222-8222-000000000071', '22222222-2222-4222-8222-222222222222', 'NFC', '22222222-2222-4222-8222-000000000014', 'NOT_STARTED', 'settings', 1030, -454),
  ('22222222-2222-4222-8222-000000000072', '22222222-2222-4222-8222-222222222222', 'RFID UHF', '22222222-2222-4222-8222-000000000014', 'IN_PROGRESS', 'settings', 1030, -368),
  ('22222222-2222-4222-8222-000000000073', '22222222-2222-4222-8222-222222222222', 'Contato elétrico', '22222222-2222-4222-8222-000000000014', 'NOT_STARTED', 'settings', 1030, -282),
  ('22222222-2222-4222-8222-000000000074', '22222222-2222-4222-8222-222222222222', 'iButton', '22222222-2222-4222-8222-000000000014', 'NOT_STARTED', 'settings', 1030, -196),
  ('22222222-2222-4222-8222-000000000075', '22222222-2222-4222-8222-222222222222', 'Sensor por posição', '22222222-2222-4222-8222-000000000014', 'NOT_STARTED', 'settings', 1030, -110),
  ('22222222-2222-4222-8222-000000000076', '22222222-2222-4222-8222-222222222222', 'Visão computacional', '22222222-2222-4222-8222-000000000014', 'NOT_STARTED', 'settings', 1030, -24),
  ('22222222-2222-4222-8222-000000000077', '22222222-2222-4222-8222-222222222222', 'Solução híbrida', '22222222-2222-4222-8222-000000000014', 'IN_PROGRESS', 'settings', 1030, 62),
  ('22222222-2222-4222-8222-000000000090', '22222222-2222-4222-8222-222222222222', 'Porta blindada', '22222222-2222-4222-8222-000000000015', 'IN_PROGRESS', 'security', 1030, 180),
  ('22222222-2222-4222-8222-000000000091', '22222222-2222-4222-8222-222222222222', 'Facial', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 266),
  ('22222222-2222-4222-8222-000000000092', '22222222-2222-4222-8222-222222222222', 'Crachá', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 352),
  ('22222222-2222-4222-8222-000000000093', '22222222-2222-4222-8222-222222222222', 'PIN', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 438),
  ('22222222-2222-4222-8222-000000000094', '22222222-2222-4222-8222-222222222222', 'Vídeo porteiro', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 524),
  ('22222222-2222-4222-8222-000000000095', '22222222-2222-4222-8222-222222222222', 'Visitantes', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 610),
  ('22222222-2222-4222-8222-000000000096', '22222222-2222-4222-8222-222222222222', 'Entregadores', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 696),
  ('22222222-2222-4222-8222-000000000097', '22222222-2222-4222-8222-222222222222', 'Acesso temporário', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 782),
  ('22222222-2222-4222-8222-000000000098', '22222222-2222-4222-8222-222222222222', 'Registro de entrada', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 868),
  ('22222222-2222-4222-8222-000000000099', '22222222-2222-4222-8222-222222222222', 'Registro de saída', '22222222-2222-4222-8222-000000000015', 'NOT_STARTED', 'security', 1030, 954),
  ('22222222-2222-4222-8222-000000000110', '22222222-2222-4222-8222-222222222222', 'API', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 70),
  ('22222222-2222-4222-8222-000000000111', '22222222-2222-4222-8222-222222222222', 'Webhook', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 156),
  ('22222222-2222-4222-8222-000000000112', '22222222-2222-4222-8222-222222222222', 'Fila', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 242),
  ('22222222-2222-4222-8222-000000000113', '22222222-2222-4222-8222-222222222222', 'Sincronização', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 328),
  ('22222222-2222-4222-8222-000000000114', '22222222-2222-4222-8222-222222222222', 'Reprocessamento', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 414),
  ('22222222-2222-4222-8222-000000000115', '22222222-2222-4222-8222-222222222222', 'ID do imóvel', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 500),
  ('22222222-2222-4222-8222-000000000116', '22222222-2222-4222-8222-222222222222', 'ID da chave', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 586),
  ('22222222-2222-4222-8222-000000000117', '22222222-2222-4222-8222-222222222222', 'Eventos', '22222222-2222-4222-8222-000000000016', 'NOT_STARTED', 'settings', 1370, 672)
)
insert into public.hub_map_nodes (id, map_id, title, node_type, icon_key, module_key, status, position_x, position_y, is_collapsed, is_active, metadata)
select id, map_id, title, 'submodule', icon_key, lower(regexp_replace(title, '[^[:alnum:]]+', '-', 'g')), status, position_x, position_y, false, true,
  jsonb_build_object('parentId', parent_id)
from seed
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
