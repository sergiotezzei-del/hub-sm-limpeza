-- Alinha a Gestão de Limpeza aos cards visíveis da tela.
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
from jsonb_array_elements($nodes$[[11,"Pedidos Sinval","Card da Gestão de Limpeza que abre a lista de pedidos enviados pela Néia ao Sinval.","submodule","cleaning","limpeza-pedidos-sinval","COMPLETED",null,-1350,-500,10,1,"SCREEN","orders",[{"id":"copiar-pedido","label":"Copiar pedido","actionType":"UPDATE_DATA","description":"Copia o conteúdo do pedido para a área de transferência."},{"id":"editar-pedido","label":"Editar pedido","actionType":"UPDATE_DATA","description":"Permite alterar itens e quantidades do pedido."},{"id":"marcar-feito","label":"Marcar como pedido feito","actionType":"UPDATE_STATUS","description":"Conclui o pedido e o mantém nos históricos.","targetNodeIds":["11111111-1111-4111-8111-000000000018","11111111-1111-4111-8111-000000000017"]},{"id":"excluir-pedido","label":"Excluir pedido","actionType":"DELETE_OR_INACTIVATE","description":"Remove o pedido da lista ativa e o envia para auditoria.","targetNodeIds":["11111111-1111-4111-8111-000000000018"]}]],[13,"Saída de Produto","Card da Gestão de Limpeza que abre o registro de retirada de produtos.","submodule","stock","limpeza-saida-produtos","COMPLETED",null,-1350,-360,10,2,"SCREEN","stock-exit",[{"id":"abrir-camera","label":"Abrir câmera / bipar código","actionType":"UPDATE_DATA","description":"Lê ou recebe o código de barras do produto."},{"id":"confirmar-saida","label":"Confirmar saída","actionType":"UPDATE_DATA","description":"Reduz o estoque atual e registra a retirada no histórico.","targetNodeIds":["11111111-1111-4111-8111-000000000015","11111111-1111-4111-8111-000000000016"],"permission":"Permissão Saída de estoque","offlineBehavior":"Sem conexão, a operação fica guardada internamente até a sincronização."}]],[14,"Cadastro de Produtos","Card da Gestão de Limpeza para cadastrar e editar produtos, códigos e fotos.","submodule","edit","limpeza-cadastro-produtos","COMPLETED","product-register",-1350,-220,10,3,"SCREEN","product-register",[{"id":"cadastrar-produto","label":"Cadastrar novo produto","actionType":"CREATE_RECORD","description":"Inicia o cadastro de um novo produto."},{"id":"salvar-produto","label":"Salvar produto","actionType":"UPDATE_DATA","description":"Salva nome, unidade, estoque, mínimo, código e foto.","targetNodeIds":["11111111-1111-4111-8111-000000000015"],"permission":"Permissão Estoque"}]],[15,"Estoque Atual","Card da Gestão de Limpeza que mostra produtos, códigos e quantidades atuais.","submodule","stock","limpeza-estoque-atual","COMPLETED","current-stock",-1350,-80,10,4,"SCREEN","current-stock",[{"id":"editar-produto","label":"Editar produto","actionType":"OPEN_SCREEN","description":"Abre o cadastro do produto selecionado.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000014"]}]],[16,"Histórico de Saídas","Card da Gestão de Limpeza que mostra quem retirou, quando e quanto.","submodule","reports","limpeza-historico-saidas","COMPLETED","stock-exit-history",-1350,60,10,5,"SCREEN","stock-exit-history",null],[17,"Histórico Neia","Card da Gestão de Limpeza que mostra todos os pedidos feitos pela Néia.","submodule","reports","limpeza-historico-neia","COMPLETED",null,-1350,200,10,6,"SCREEN","neia-history",[{"id":"copiar-pedido","label":"Copiar pedido","actionType":"UPDATE_DATA","description":"Copia um pedido do histórico para reutilização ou envio."}]],[18,"Histórico / Auditoria","Card da Gestão de Limpeza com pedidos concluídos e excluídos.","submodule","reports","limpeza-historico-auditoria","COMPLETED",null,-1350,340,10,7,"SCREEN","order-history",[{"id":"copiar-pedido","label":"Copiar pedido","actionType":"UPDATE_DATA","description":"Copia um pedido concluído ou excluído."}]],[19,"Perfis da equipe","Card da Gestão de Limpeza para acessar as telas da Néia, Selma e Helena.","submodule","users","limpeza-perfis-equipe","COMPLETED",null,-1350,480,10,8,"SCREEN","profiles",[{"id":"alterar-foto","label":"Cadastrar / alterar foto","actionType":"UPDATE_DATA","description":"Atualiza a foto do perfil selecionado.","permission":"Painel admin"},{"id":"ver-tela-usuario","label":"Ver tela da usuária","actionType":"OPEN_SCREEN","description":"Abre a tela operacional da funcionária selecionada.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000064","11111111-1111-4111-8111-000000000065","11111111-1111-4111-8111-000000000066"],"permission":"Painel admin"}]],[62,"Preparar Limpeza para uso real","Card administrativo da Gestão de Limpeza que zera dados operacionais de teste.","submodule","settings","limpeza-preparar-uso-real","COMPLETED",null,-1350,620,10,9,"ADMIN_ACTION","prepare-real-use",[{"id":"preparar-limpeza","label":"Preparar Limpeza","actionType":"DESTRUCTIVE","description":"Limpa pedidos, conferências, saídas e solicitações de foto de teste, preservando cadastros e outros módulos.","targetNodeIds":["11111111-1111-4111-8111-000000000011","11111111-1111-4111-8111-000000000016","11111111-1111-4111-8111-000000000017","11111111-1111-4111-8111-000000000018","11111111-1111-4111-8111-000000000060"],"condition":"Confirmação explícita","permission":"Somente Admin Tezzei"}]]]$nodes$::jsonb) item;

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
from jsonb_array_elements_text($obsolete$[]$obsolete$::jsonb);

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
from jsonb_array_elements($relations$[[11,18,"TRIGGERS","concluir ou excluir alimenta auditoria"],[11,17,"CONNECTS_WITH","pedidos da Néia aparecem no histórico"],[13,15,"TRIGGERS","confirmar saída reduz saldo"],[13,16,"TRIGGERS","confirmar saída registra histórico"],[15,14,"CONNECTS_WITH","editar abre cadastro do produto"],[62,11,"TRIGGERS","limpa pedidos de teste"],[62,60,"TRIGGERS","limpa conferências de teste"],[62,16,"TRIGGERS","limpa saídas de teste"]]$relations$::jsonb) item;

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
