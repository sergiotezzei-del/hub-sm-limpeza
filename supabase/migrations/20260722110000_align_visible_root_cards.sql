-- Alinha a raiz do Mapa Geral aos cards do Painel Tezzei.
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
from jsonb_array_elements($nodes$[[1,"Aplicativo HUB SM Tezzei","Estrutura que reproduz os cards e telas visíveis do aplicativo HUB SM.","root","map","hub-sm","COMPLETED",null,0,0,null,0,"MODULE",null,null],[10,"Limpeza","Rotinas, produtos, pedidos e histórico da equipe de limpeza.","module","cleaning","limpeza","COMPLETED","cleaning-dashboard",-900,-700,1,1,"MODULE","cleaning-dashboard",[{"id":"sincronizar-pendencias","label":"Sincronizar pendências","actionType":"SYNC","description":"Sincroniza as operações mostradas no aviso offline da tela, sem criar um quadro separado.","condition":"Existirem pendências e a conexão estar disponível","permission":"Permissão Limpeza"}]],[20,"Copa & Café","Máquina de café, água, copos, bebidas e insumos da copa.","module","coffee","copa-cafe","IN_PROGRESS","copa-cafe-menu",-450,-700,1,2,"MODULE","copa-cafe-menu",null],[30,"Segurança","Guardas, monitoramento e estacionamento.","module","security","seguranca","COMPLETED","security-menu",0,-700,1,3,"MODULE","security-menu",null],[70,"Manutenção","Chamados, obras, fornecedores e pendências prediais.","module","settings","manutencao","IN_PROGRESS",null,450,-700,1,4,"MODULE","maintenance-menu",null],[80,"Estoque Geral","Materiais diversos, ferramentas, informática e itens de apoio.","module","stock","estoque-geral","IN_PROGRESS",null,900,-700,1,5,"MODULE","general-stock-menu",null],[90,"Patrimônio","Equipamentos, móveis, rede, câmeras, chaves e inventário.","module","stock","patrimonio","IN_PROGRESS",null,-675,650,1,6,"MODULE","patrimony-menu",null],[100,"Relatórios","Consultas e relatórios por área operacional.","module","reports","relatorios","IN_PROGRESS",null,-225,650,1,7,"MODULE","reports-menu",null],[51,"Usuários & Permissões","Cadastro de usuários, acessos e permissões do sistema.","module","users","usuarios-permissoes","COMPLETED","users-permissions",225,650,1,8,"SCREEN","users-permissions",[{"id":"cadastrar-usuario","label":"Cadastrar novo usuário","actionType":"CREATE_RECORD","description":"Cria um novo usuário do HUB SM.","permission":"Painel admin"},{"id":"sincronizar-usuarios","label":"Sincronizar usuários deste aparelho","actionType":"SYNC","description":"Envia e atualiza usuários entre o aparelho e o Supabase.","permission":"Painel admin"},{"id":"salvar-usuario","label":"Salvar usuário","actionType":"UPDATE_DATA","description":"Salva dados, setor, função, foto e permissões.","permission":"Painel admin"},{"id":"inativar-usuario","label":"Inativar usuário","actionType":"UPDATE_STATUS","description":"Desativa o acesso sem apagar o registro.","permission":"Painel admin"},{"id":"apagar-usuario","label":"Apagar usuário","actionType":"DELETE_OR_INACTIVATE","description":"Apaga usuários que não sejam protegidos pelo sistema.","permission":"Painel admin"}]],[53,"Status do Sistema","Visão rápida dos módulos principais, perfis e pendências conhecidas.","module","reports","status-sistema","COMPLETED","system-status",675,650,1,9,"SCREEN","system-status",null],[54,"Mapa Mestre","Visão geral dos módulos, telas visíveis, relações e andamento do HUB SM.","module","map","mapa-mestre","COMPLETED","master-map",1125,650,1,10,"SCREEN","master-map",[{"id":"editar-quadro","label":"Editar quadro","actionType":"UPDATE_DATA","description":"Atualiza título, descrição, status, responsável e estilo do quadro.","permission":"Painel admin"},{"id":"criar-quadro","label":"Criar quadro","actionType":"CREATE_RECORD","description":"Cria um quadro filho ou irmão no Outline.","permission":"Painel admin"},{"id":"reordenar-quadro","label":"Reordenar quadro","actionType":"UPDATE_DATA","description":"Move o quadro entre irmãos ou troca seu quadro pai.","permission":"Painel admin"},{"id":"criar-ramo-texto","label":"Criar ramo por texto","actionType":"CREATE_RECORD","description":"Transforma texto indentado em uma nova estrutura de quadros.","permission":"Painel admin"}]]]$nodes$::jsonb) item;

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
from jsonb_array_elements_text($obsolete$[40,50,52,55,56,57]$obsolete$::jsonb);

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
