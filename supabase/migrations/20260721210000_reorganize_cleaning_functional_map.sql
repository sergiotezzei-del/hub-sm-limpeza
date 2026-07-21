do $$
begin
  if not exists (
    select 1
    from public.hub_maps
    where id = '11111111-1111-4111-8111-111111111111'::uuid
  ) then
    raise exception 'Mapa Geral do HUB SM nao encontrado';
  end if;
end $$;

with seed(
  id,
  title,
  description,
  node_type,
  icon_key,
  module_key,
  status,
  target_screen,
  destination_type,
  position_x,
  position_y,
  parent_id,
  outline_order,
  extra_metadata
) as (
  values
    (
      '11111111-1111-4111-8111-000000000010'::uuid,
      'Limpeza',
      'Mapa funcional das telas, acoes, historicos e componentes da Limpeza.',
      'module', 'cleaning', 'limpeza', 'COMPLETED', 'cleaning-dashboard', 'EXISTING_SCREEN',
      -620, -260,
      '11111111-1111-4111-8111-000000000001'::uuid,
      1,
      '{"cardKind":"MODULE","screenKey":"cleaning-dashboard"}'::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000011'::uuid,
      'Pedidos Sinval',
      'Tela que lista e administra os pedidos de produtos enviados pela Neia ao Sinval.',
      'submodule', 'cleaning', 'limpeza-pedidos-sinval', 'COMPLETED', null, 'NONE',
      -1080, -650,
      '11111111-1111-4111-8111-000000000010'::uuid,
      1,
      $json${
        "cardKind":"SCREEN",
        "screenKey":"orders",
        "actions":[
          {"id":"novo-pedido","label":"Novo pedido","actionType":"OPEN_SCREEN","description":"Abre a tela de preenchimento de um novo pedido.","targetNodeIds":["11111111-1111-4111-8111-000000000012"],"opensScreen":true,"permission":"Permissao Limpeza"},
          {"id":"marcar-pedido-feito","label":"Marcar como pedido feito","actionType":"UPDATE_STATUS","description":"Altera o status do pedido para Pedido feito e grava a data de conclusao.","targetNodeIds":["11111111-1111-4111-8111-000000000018","11111111-1111-4111-8111-000000000017"],"opensScreen":false,"offlineBehavior":"Se nao sincronizar, a alteracao permanece no aparelho aguardando envio."},
          {"id":"editar-pedido","label":"Editar pedido","actionType":"UPDATE_DATA","description":"Atualiza os itens e observacoes do pedido selecionado.","opensScreen":false,"offlineBehavior":"Se nao sincronizar, a edicao permanece no aparelho aguardando envio."},
          {"id":"excluir-pedido","label":"Excluir pedido","actionType":"DELETE_OR_INACTIVATE","description":"Inativa o pedido na operacao e o mantem disponivel para auditoria.","targetNodeIds":["11111111-1111-4111-8111-000000000018","11111111-1111-4111-8111-000000000017"],"opensScreen":false,"offlineBehavior":"Se nao sincronizar, a exclusao permanece no aparelho aguardando envio."}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000012'::uuid,
      'Novo pedido',
      'Tela para selecionar produtos, informar quantidades e enviar um pedido ao Sinval.',
      'submodule', 'edit', 'limpeza-novo-pedido', 'COMPLETED', null, 'NONE',
      -1450, -540,
      '11111111-1111-4111-8111-000000000011'::uuid,
      1,
      $json${
        "cardKind":"SCREEN",
        "screenKey":"order-form",
        "actions":[
          {"id":"enviar-pedido","label":"Enviar pedido","actionType":"CREATE_RECORD","description":"Cria um pedido e seus itens.","targetNodeIds":["11111111-1111-4111-8111-000000000011","11111111-1111-4111-8111-000000000017"],"opensScreen":false,"offlineBehavior":"Sem conexao, o pedido e enviado para a Fila offline.","permission":"Permissao Limpeza"},
          {"id":"pedido-offline","label":"Salvar pendencia offline","actionType":"QUEUE_OFFLINE","description":"Guarda o pedido no aparelho quando o Supabase nao esta disponivel.","targetNodeIds":["11111111-1111-4111-8111-000000000061"],"opensScreen":false,"condition":"Falha de conexao ou sincronizacao"}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000013'::uuid,
      'Saida de produtos',
      'Tela para registrar a retirada de produtos da Limpeza.',
      'submodule', 'stock', 'limpeza-saida-produtos', 'COMPLETED', null, 'NONE',
      -1080, -405,
      '11111111-1111-4111-8111-000000000010'::uuid,
      2,
      $json${
        "cardKind":"SCREEN",
        "screenKey":"stock-exit",
        "actions":[
          {"id":"confirmar-saida","label":"Confirmar saida","actionType":"UPDATE_DATA","description":"Reduz o saldo do produto e cria uma movimentacao de saida.","targetNodeIds":["11111111-1111-4111-8111-000000000015","11111111-1111-4111-8111-000000000016"],"opensScreen":false,"permission":"Permissao Saida de estoque","offlineBehavior":"Sem conexao, a operacao vai para a Fila offline."},
          {"id":"saida-offline","label":"Salvar saida offline","actionType":"QUEUE_OFFLINE","description":"Guarda a saida no aparelho ate a conexao voltar.","targetNodeIds":["11111111-1111-4111-8111-000000000061"],"opensScreen":false,"condition":"Falha de conexao ou sincronizacao"}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000014'::uuid,
      'Cadastro de produtos',
      'Cadastro e edicao de nome, unidade, foto, codigo de barras, saldo e estoque minimo.',
      'submodule', 'edit', 'limpeza-cadastro-produtos', 'COMPLETED', 'product-register', 'EXISTING_SCREEN',
      -1080, -270,
      '11111111-1111-4111-8111-000000000010'::uuid,
      3,
      $json${
        "cardKind":"SCREEN",
        "screenKey":"product-register",
        "actions":[
          {"id":"salvar-produto","label":"Salvar produto","actionType":"UPDATE_DATA","description":"Cria ou atualiza o produto disponivel para as rotinas da Limpeza.","targetNodeIds":["11111111-1111-4111-8111-000000000015","11111111-1111-4111-8111-000000000012","11111111-1111-4111-8111-000000000013"],"opensScreen":false,"permission":"Permissao administrativa"}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000015'::uuid,
      'Estoque atual',
      'Tela que mostra o saldo atual e o estoque minimo dos produtos.',
      'submodule', 'stock', 'limpeza-estoque-atual', 'COMPLETED', 'current-stock', 'EXISTING_SCREEN',
      -1080, -135,
      '11111111-1111-4111-8111-000000000010'::uuid,
      4,
      '{"cardKind":"SCREEN","screenKey":"current-stock"}'::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000016'::uuid,
      'Historico de saidas',
      'Tela de consulta das movimentacoes de saida, entrada e ajuste do estoque.',
      'submodule', 'reports', 'limpeza-historico-saidas', 'COMPLETED', 'stock-exit-history', 'EXISTING_SCREEN',
      -1080, 0,
      '11111111-1111-4111-8111-000000000010'::uuid,
      5,
      '{"cardKind":"SCREEN","screenKey":"stock-exit-history"}'::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000017'::uuid,
      'Historico Neia',
      'Tela com todos os pedidos realizados pela Neia.',
      'submodule', 'reports', 'limpeza-historico-neia', 'COMPLETED', null, 'NONE',
      -1080, 135,
      '11111111-1111-4111-8111-000000000010'::uuid,
      6,
      '{"cardKind":"SCREEN","screenKey":"neia-history"}'::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000018'::uuid,
      'Historico / Auditoria',
      'Tela de auditoria dos pedidos concluidos e excluidos.',
      'submodule', 'reports', 'limpeza-historico-auditoria', 'COMPLETED', null, 'NONE',
      -1080, 270,
      '11111111-1111-4111-8111-000000000010'::uuid,
      7,
      '{"cardKind":"SCREEN","screenKey":"order-history"}'::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000019'::uuid,
      'Perfis da equipe',
      'Tela de perfis da Neia, Selma e Helena.',
      'submodule', 'users', 'limpeza-perfis-equipe', 'COMPLETED', null, 'NONE',
      -1080, 405,
      '11111111-1111-4111-8111-000000000010'::uuid,
      8,
      $json${
        "cardKind":"SCREEN",
        "screenKey":"profiles",
        "actions":[
          {"id":"salvar-foto","label":"Salvar foto do perfil","actionType":"UPDATE_DATA","description":"Atualiza a foto vinculada ao perfil da funcionaria.","opensScreen":false,"permission":"Painel admin"}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000060'::uuid,
      'Conferencia de estoque',
      'Tela usada pela Neia para registrar a conferencia fisica dos produtos.',
      'submodule', 'stock', 'limpeza-conferencia-estoque', 'COMPLETED', null, 'NONE',
      -1080, 540,
      '11111111-1111-4111-8111-000000000010'::uuid,
      9,
      $json${
        "cardKind":"SCREEN",
        "screenKey":"stock-check",
        "actions":[
          {"id":"salvar-conferencia","label":"Salvar conferencia","actionType":"CREATE_RECORD","description":"Grava a conferencia e seus itens para consulta operacional.","opensScreen":false,"offlineBehavior":"Sem conexao, a conferencia vai para a Fila offline."},
          {"id":"conferencia-offline","label":"Salvar conferencia offline","actionType":"QUEUE_OFFLINE","description":"Guarda a conferencia no aparelho ate a conexao voltar.","targetNodeIds":["11111111-1111-4111-8111-000000000061"],"opensScreen":false,"condition":"Falha de conexao ou sincronizacao"}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000061'::uuid,
      'Fila offline',
      'Componente interno que guarda pedidos, conferencias e saidas ate a internet voltar.',
      'integration', 'warning', 'limpeza-fila-offline', 'COMPLETED', null, 'NONE',
      -1080, 675,
      '11111111-1111-4111-8111-000000000010'::uuid,
      10,
      $json${
        "cardKind":"SYSTEM_COMPONENT",
        "actions":[
          {"id":"sincronizar-pendencias","label":"Sincronizar pendencias","actionType":"SYNC","description":"Reprocessa as operacoes pendentes e atualiza os dados do aplicativo.","targetNodeIds":["11111111-1111-4111-8111-000000000011","11111111-1111-4111-8111-000000000060","11111111-1111-4111-8111-000000000015","11111111-1111-4111-8111-000000000016"],"opensScreen":false,"condition":"Supabase disponivel"}
        ]
      }$json$::jsonb
    ),
    (
      '11111111-1111-4111-8111-000000000062'::uuid,
      'Preparar a Limpeza para uso real',
      'Acao administrativa critica que remove dados operacionais de teste antes do inicio oficial.',
      'task', 'warning', 'limpeza-preparar-uso-real', 'COMPLETED', null, 'NONE',
      -1080, 810,
      '11111111-1111-4111-8111-000000000010'::uuid,
      11,
      $json${
        "cardKind":"ADMIN_ACTION",
        "actions":[
          {"id":"limpar-dados-teste","label":"Confirmar preparacao para uso real","actionType":"DESTRUCTIVE","description":"Remove pedidos, conferencias, movimentacoes e historicos de teste. Nao remove cadastro de produtos, estoque atual ou perfis.","targetNodeIds":["11111111-1111-4111-8111-000000000011","11111111-1111-4111-8111-000000000017","11111111-1111-4111-8111-000000000018","11111111-1111-4111-8111-000000000060","11111111-1111-4111-8111-000000000016"],"opensScreen":false,"permission":"Somente Admin Tezzei","condition":"Confirmacao explicita do administrador"}
        ]
      }$json$::jsonb
    )
)
insert into public.hub_map_nodes (
  id,
  map_id,
  title,
  description,
  node_type,
  icon_key,
  module_key,
  status,
  target_screen,
  destination_type,
  position_x,
  position_y,
  is_collapsed,
  is_active,
  metadata
)
select
  seed.id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  seed.title,
  seed.description,
  seed.node_type,
  seed.icon_key,
  seed.module_key,
  seed.status,
  seed.target_screen,
  seed.destination_type,
  seed.position_x,
  seed.position_y,
  false,
  true,
  jsonb_strip_nulls(
    jsonb_build_object(
      'parentId', seed.parent_id::text,
      'outlineOrder', seed.outline_order
    ) || seed.extra_metadata
  )
from seed
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  node_type = excluded.node_type,
  icon_key = excluded.icon_key,
  module_key = excluded.module_key,
  status = excluded.status,
  target_screen = excluded.target_screen,
  destination_type = excluded.destination_type,
  position_x = excluded.position_x,
  position_y = excluded.position_y,
  is_active = true,
  metadata = coalesce(public.hub_map_nodes.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- Recria somente a hierarquia dos quadros funcionais conhecidos da Limpeza.
delete from public.hub_map_edges
where map_id = '11111111-1111-4111-8111-111111111111'::uuid
  and relation_type = 'BELONGS_TO'
  and target_node_id in (
    '11111111-1111-4111-8111-000000000011'::uuid,
    '11111111-1111-4111-8111-000000000012'::uuid,
    '11111111-1111-4111-8111-000000000013'::uuid,
    '11111111-1111-4111-8111-000000000014'::uuid,
    '11111111-1111-4111-8111-000000000015'::uuid,
    '11111111-1111-4111-8111-000000000016'::uuid,
    '11111111-1111-4111-8111-000000000017'::uuid,
    '11111111-1111-4111-8111-000000000018'::uuid,
    '11111111-1111-4111-8111-000000000019'::uuid,
    '11111111-1111-4111-8111-000000000060'::uuid,
    '11111111-1111-4111-8111-000000000061'::uuid,
    '11111111-1111-4111-8111-000000000062'::uuid
  );

insert into public.hub_map_edges (id, map_id, source_node_id, target_node_id, relation_type, label, is_active, metadata)
values
  ('11111111-1111-4111-8111-310000000001', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000011', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000002', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-000000000012', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000003', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000013', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000004', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000014', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000005', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000015', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000006', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000016', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000007', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000017', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000008', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000018', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000009', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000019', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000010', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000060', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000011', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000061', 'BELONGS_TO', null, true, '{}'::jsonb),
  ('11111111-1111-4111-8111-310000000012', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-000000000062', 'BELONGS_TO', null, true, '{}'::jsonb)
on conflict (id) do update
set
  source_node_id = excluded.source_node_id,
  target_node_id = excluded.target_node_id,
  relation_type = excluded.relation_type,
  label = excluded.label,
  is_active = true,
  metadata = excluded.metadata,
  updated_at = now();

-- Remove conexoes funcionais antigas entre os quadros conhecidos antes de inserir o fluxo oficial.
delete from public.hub_map_edges
where map_id = '11111111-1111-4111-8111-111111111111'::uuid
  and relation_type in ('CONNECTS_WITH', 'TRIGGERS', 'INTEGRATES_WITH')
  and source_node_id in (
    '11111111-1111-4111-8111-000000000011'::uuid,
    '11111111-1111-4111-8111-000000000012'::uuid,
    '11111111-1111-4111-8111-000000000013'::uuid,
    '11111111-1111-4111-8111-000000000060'::uuid,
    '11111111-1111-4111-8111-000000000061'::uuid,
    '11111111-1111-4111-8111-000000000062'::uuid
  );

insert into public.hub_map_edges (id, map_id, source_node_id, target_node_id, relation_type, label, is_active, metadata)
values
  ('11111111-1111-4111-8111-320000000001', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-000000000012', 'CONNECTS_WITH', 'Novo pedido abre esta tela', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000002', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-000000000018', 'TRIGGERS', 'feito ou excluido gera auditoria', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000003', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-000000000017', 'TRIGGERS', 'pedido aparece no Historico Neia', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000004', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000012', '11111111-1111-4111-8111-000000000011', 'TRIGGERS', 'enviar cria pedido', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000005', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000012', '11111111-1111-4111-8111-000000000061', 'TRIGGERS', 'falha envia para fila', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000006', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000013', '11111111-1111-4111-8111-000000000015', 'TRIGGERS', 'confirmar saida atualiza saldo', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000007', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000013', '11111111-1111-4111-8111-000000000016', 'TRIGGERS', 'confirmar saida registra historico', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000008', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000013', '11111111-1111-4111-8111-000000000061', 'TRIGGERS', 'falha envia para fila', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000009', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000060', '11111111-1111-4111-8111-000000000061', 'TRIGGERS', 'falha envia para fila', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000010', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000061', '11111111-1111-4111-8111-000000000011', 'INTEGRATES_WITH', 'sincroniza pedidos', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000011', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000061', '11111111-1111-4111-8111-000000000060', 'INTEGRATES_WITH', 'sincroniza conferencias', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000012', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000061', '11111111-1111-4111-8111-000000000015', 'INTEGRATES_WITH', 'recarrega estoque', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000013', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000061', '11111111-1111-4111-8111-000000000016', 'INTEGRATES_WITH', 'recarrega movimentacoes', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000014', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000062', '11111111-1111-4111-8111-000000000011', 'TRIGGERS', 'limpa pedidos de teste', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000015', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000062', '11111111-1111-4111-8111-000000000060', 'TRIGGERS', 'limpa conferencias de teste', true, '{}'::jsonb),
  ('11111111-1111-4111-8111-320000000016', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000062', '11111111-1111-4111-8111-000000000016', 'TRIGGERS', 'limpa movimentacoes de teste', true, '{}'::jsonb)
on conflict (id) do update
set
  source_node_id = excluded.source_node_id,
  target_node_id = excluded.target_node_id,
  relation_type = excluded.relation_type,
  label = excluded.label,
  is_active = true,
  metadata = excluded.metadata,
  updated_at = now();
