-- Organiza os perfis e telas da Limpeza e remove o quadro Fila offline.
-- Somente cards e telas visíveis viram quadros; rotinas internas ficam nas ações.

create temporary table tmp_master_map_nodes on commit drop as
select
  ('11111111-1111-4111-8111-' || lpad(item->>0, 12, '0'))::uuid id,
  item->>1 title, item->>2 description, item->>3 node_type, item->>4 icon_key,
  item->>5 module_key, item->>6 status, nullif(item->>7, '') target_screen,
  case when nullif(item->>7, '') is null then 'NONE' else 'EXISTING_SCREEN' end destination_type,
  (item->>8)::numeric position_x, (item->>9)::numeric position_y,
  case when item->>10 is null then null else
    ('11111111-1111-4111-8111-' || lpad(item->>10, 12, '0'))::uuid end parent_id,
  (item->>11)::integer outline_order,
  jsonb_strip_nulls(jsonb_build_object(
    'parentId', case when item->>10 is null then null else
      '11111111-1111-4111-8111-' || lpad(item->>10, 12, '0') end,
    'outlineOrder', (item->>11)::integer, 'cardKind', item->>12,
    'screenKey', nullif(item->>13, ''), 'actions', item->14
  )) metadata
from jsonb_array_elements($nodes$[[64,"Néia","Card visível em Perfis da equipe que abre a tela operacional da Néia.","submodule","users","limpeza-neia","COMPLETED",null,-1700,390,19,1,"SCREEN","employee:neia",[{"id":"fazer-pedido","label":"Fazer Pedido Sinval","actionType":"OPEN_SCREEN","description":"Abre a tela de novo pedido.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000012"]},{"id":"conferir-estoque","label":"Conferência de Estoque","actionType":"OPEN_SCREEN","description":"Abre a conferência física do estoque.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000060"]},{"id":"saida-produto","label":"Saída de Produto do Estoque","actionType":"OPEN_SCREEN","description":"Abre o registro de saída de produto.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000013"]},{"id":"historico-pedidos","label":"Histórico de Pedidos","actionType":"OPEN_SCREEN","description":"Abre o histórico de pedidos da Néia.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000017"]}]],[65,"Selma","Card visível em Perfis da equipe que abre a tela operacional da Selma.","submodule","users","limpeza-selma","COMPLETED",null,-1700,530,19,2,"SCREEN","employee:selma",[{"id":"saida-produto","label":"Saída de Produto do Estoque","actionType":"OPEN_SCREEN","description":"Abre o registro de saída de produto.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000013"]}]],[66,"Helena","Card visível em Perfis da equipe que abre a tela operacional da Helena.","submodule","users","limpeza-helena","COMPLETED",null,-1700,670,19,3,"SCREEN","employee:helena",[{"id":"saida-produto","label":"Saída de Produto do Estoque","actionType":"OPEN_SCREEN","description":"Abre o registro de saída de produto.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000013"]}]],[12,"Fazer Pedido Sinval","Tela acessada pela Néia para selecionar produtos e enviar o pedido.","submodule","edit","limpeza-novo-pedido","COMPLETED",null,-2050,390,64,1,"SCREEN","order-form",[{"id":"adicionar-manual","label":"Adicionar pedido que não tem na lista","actionType":"CREATE_RECORD","description":"Adiciona um item manual ao pedido."},{"id":"enviar-pedido","label":"Enviar Pedido","actionType":"CREATE_RECORD","description":"Cria o pedido e seus itens.","targetNodeIds":["11111111-1111-4111-8111-000000000011","11111111-1111-4111-8111-000000000017"],"offlineBehavior":"Sem conexão, o pedido fica guardado internamente até a sincronização."}]],[60,"Conferência de Estoque","Tela acessada pela Néia para registrar a conferência física dos produtos.","submodule","stock","limpeza-conferencia-estoque","COMPLETED",null,-2050,530,64,2,"SCREEN","stock-check",[{"id":"enviar-conferencia","label":"Enviar Conferência","actionType":"CREATE_RECORD","description":"Salva a conferência e seus itens.","offlineBehavior":"Sem conexão, a conferência fica guardada internamente até a sincronização."}]]]$nodes$::jsonb) item;

insert into public.hub_map_nodes (
  id, map_id, title, description, node_type, icon_key, module_key, status,
  target_screen, destination_type, dynamic_page_id, external_url, planned_module_key,
  position_x, position_y, is_collapsed, is_active, metadata
)
select id, '11111111-1111-4111-8111-111111111111'::uuid, title, description, node_type, icon_key, module_key, status,
       target_screen, destination_type, null, null, null,
       position_x, position_y, false, true, metadata
from tmp_master_map_nodes
on conflict (id) do update set
  title=excluded.title, description=excluded.description, node_type=excluded.node_type,
  icon_key=excluded.icon_key, module_key=excluded.module_key, status=excluded.status,
  target_screen=excluded.target_screen, destination_type=excluded.destination_type,
  dynamic_page_id=null, external_url=null, planned_module_key=null,
  position_x=excluded.position_x, position_y=excluded.position_y, is_active=true,
  metadata=(coalesce(public.hub_map_nodes.metadata, '{}'::jsonb)
    - 'parentId' - 'outlineOrder' - 'cardKind' - 'screenKey' - 'actions') || excluded.metadata,
  updated_at=now();

create temporary table tmp_obsolete_nodes on commit drop as
select ('11111111-1111-4111-8111-' || lpad(value, 12, '0'))::uuid id
from jsonb_array_elements_text($obsolete$[61]$obsolete$::jsonb);

update public.hub_map_nodes set is_active=false, updated_at=now()
where map_id='11111111-1111-4111-8111-111111111111'::uuid and id in (select id from tmp_obsolete_nodes);

delete from public.hub_map_edges
where map_id='11111111-1111-4111-8111-111111111111'::uuid
  and (source_node_id in (select id from tmp_obsolete_nodes)
       or target_node_id in (select id from tmp_obsolete_nodes));

delete from public.hub_map_edges
where map_id='11111111-1111-4111-8111-111111111111'::uuid and relation_type='BELONGS_TO'
  and target_node_id in (select id from tmp_master_map_nodes);

insert into public.hub_map_edges
  (id, map_id, source_node_id, target_node_id, relation_type, label, is_active, metadata)
select gen_random_uuid(), '11111111-1111-4111-8111-111111111111'::uuid, parent_id, id, 'BELONGS_TO', null, true, '{}'::jsonb
from tmp_master_map_nodes where parent_id is not null;

create temporary table tmp_master_map_relations on commit drop as
select
  ('11111111-1111-4111-8111-' || lpad(item->>0, 12, '0'))::uuid source_node_id,
  ('11111111-1111-4111-8111-' || lpad(item->>1, 12, '0'))::uuid target_node_id,
  item->>2 relation_type,
  item->>3 label
from jsonb_array_elements($relations$[[12,11,"TRIGGERS","enviar cria pedido"],[12,17,"TRIGGERS","enviar atualiza histórico da Néia"],[64,13,"CONNECTS_WITH","usuária pode registrar saída"],[65,13,"CONNECTS_WITH","usuária pode registrar saída"],[66,13,"CONNECTS_WITH","usuária pode registrar saída"],[64,17,"CONNECTS_WITH","usuária acessa histórico"]]$relations$::jsonb) item;

delete from public.hub_map_edges
where map_id = '11111111-1111-4111-8111-111111111111'::uuid
  and relation_type <> 'BELONGS_TO'
  and (source_node_id in (select id from tmp_master_map_nodes)
       or source_node_id in (select id from tmp_obsolete_nodes));

insert into public.hub_map_edges
  (id, map_id, source_node_id, target_node_id, relation_type, label, is_active, metadata)
select gen_random_uuid(), '11111111-1111-4111-8111-111111111111'::uuid,
       source_node_id, target_node_id, relation_type, label, true, '{}'::jsonb
from tmp_master_map_relations;
