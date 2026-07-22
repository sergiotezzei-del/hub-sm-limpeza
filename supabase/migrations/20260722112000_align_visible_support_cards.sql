-- Cria os cards visíveis de Manutenção, Estoque Geral, Patrimônio e Relatórios.
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
from jsonb_array_elements($nodes$[[71,"Chamados","Solicitações e ocorrências prediais.","submodule","settings","manutencao-tickets","NOT_STARTED",null,430,-350,70,1,"SCREEN","tickets",null],[72,"Obras / Reformas","Acompanhamento de obras e reformas.","submodule","settings","manutencao-works","NOT_STARTED",null,560,-350,70,2,"SCREEN","works",null],[73,"Fornecedores","Contatos e prestadores de manutenção.","submodule","users","manutencao-suppliers","NOT_STARTED",null,690,-350,70,3,"SCREEN","suppliers",null],[74,"Orçamentos","Cotações e valores em análise.","submodule","payment","manutencao-quotes","NOT_STARTED",null,820,-350,70,4,"SCREEN","quotes",null],[75,"Pendências","Itens abertos e próximas ações.","submodule","warning","manutencao-pending","NOT_STARTED",null,950,-350,70,5,"SCREEN","pending",null],[76,"Histórico de manutenção","Registro de serviços já acompanhados.","submodule","reports","manutencao-history","NOT_STARTED",null,1080,-350,70,6,"SCREEN","history",null],[81,"Materiais diversos","Itens de apoio que não pertencem a limpeza nem copa.","submodule","stock","estoque-geral-misc","NOT_STARTED",null,930,-350,80,1,"SCREEN","misc",null],[82,"Ferramentas","Ferramentas e acessórios de uso geral.","submodule","settings","estoque-geral-tools","NOT_STARTED",null,1060,-350,80,2,"SCREEN","tools",null],[83,"Elétrica","Lâmpadas, tomadas, cabos e materiais elétricos.","submodule","settings","estoque-geral-electric","NOT_STARTED",null,1190,-350,80,3,"SCREEN","electric",null],[84,"Informática","Mouse, teclado, cabos, pendrive e itens de TI.","submodule","settings","estoque-geral-it","NOT_STARTED",null,1320,-350,80,4,"SCREEN","it",null],[85,"Material de obra","Materiais de obra e apoio a pequenos reparos.","submodule","stock","estoque-geral-construction","NOT_STARTED",null,1450,-350,80,5,"SCREEN","construction",null],[91,"Equipamentos","Equipamentos controlados pelo patrimônio.","submodule","stock","patrimonio-equipment","NOT_STARTED",null,-870,900,90,1,"SCREEN","equipment",null],[92,"Móveis","Móveis e itens físicos das áreas comuns.","submodule","stock","patrimonio-furniture","NOT_STARTED",null,-740,900,90,2,"SCREEN","furniture",null],[93,"Impressoras","Impressoras, suprimentos e controle patrimonial.","submodule","reports","patrimonio-printers","NOT_STARTED",null,-610,900,90,3,"SCREEN","printers",null],[94,"Câmeras","Câmeras e equipamentos de segurança patrimonial.","submodule","camera","patrimonio-cameras","NOT_STARTED",null,-480,900,90,4,"SCREEN","cameras",null],[95,"Rede / Wi-Fi","Rede, Wi-Fi e equipamentos de conectividade.","submodule","settings","patrimonio-network","NOT_STARTED",null,-350,900,90,5,"SCREEN","network",null],[96,"Chaves","Controle de chaves e acessos físicos.","submodule","security","patrimonio-keys","NOT_STARTED",null,-220,900,90,6,"SCREEN","keys",null],[97,"Inventário patrimonial","Inventário de bens, locais e responsáveis.","submodule","reports","patrimonio-inventory","NOT_STARTED",null,-90,900,90,7,"SCREEN","inventory",null],[101,"Limpeza","Relatórios de pedidos, estoque e histórico da limpeza.","submodule","cleaning","relatorios-cleaning","NOT_STARTED",null,-360,900,100,1,"SCREEN","cleaning",[{"id":"consultar-area","label":"Consultar área","actionType":"OPEN_SCREEN","description":"Relaciona este relatório ao módulo operacional correspondente.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000010"]}]],[102,"Copa & Café","Relatórios de café, água, bebidas e insumos.","submodule","coffee","relatorios-copa-cafe","NOT_STARTED",null,-220,900,100,2,"SCREEN","copa-cafe",[{"id":"consultar-area","label":"Consultar área","actionType":"OPEN_SCREEN","description":"Relaciona este relatório ao módulo operacional correspondente.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000020"]}]],[103,"Segurança","Relatórios de guardas, serviços, rondas e QR Codes.","submodule","security","relatorios-security","NOT_STARTED",null,-80,900,100,3,"SCREEN","security",[{"id":"consultar-area","label":"Consultar área","actionType":"OPEN_SCREEN","description":"Relaciona este relatório ao módulo operacional correspondente.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000030"]}]],[104,"Manutenção","Relatórios de chamados, obras e pendências.","submodule","settings","relatorios-maintenance","NOT_STARTED",null,60,900,100,4,"SCREEN","maintenance",[{"id":"consultar-area","label":"Consultar área","actionType":"OPEN_SCREEN","description":"Relaciona este relatório ao módulo operacional correspondente.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000070"]}]],[105,"Estoque","Relatórios de materiais diversos e itens de apoio.","submodule","stock","relatorios-stock","NOT_STARTED",null,200,900,100,5,"SCREEN","stock",[{"id":"consultar-area","label":"Consultar área","actionType":"OPEN_SCREEN","description":"Relaciona este relatório ao módulo operacional correspondente.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000080"]}]],[106,"Geral","Consultas consolidadas por área operacional.","submodule","reports","relatorios-general","NOT_STARTED",null,340,900,100,6,"SCREEN","general",null]]$nodes$::jsonb) item;

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
from jsonb_array_elements($relations$[[101,10,"CONNECTS_WITH","consulta dados deste módulo"],[102,20,"CONNECTS_WITH","consulta dados deste módulo"],[103,30,"CONNECTS_WITH","consulta dados deste módulo"],[104,70,"CONNECTS_WITH","consulta dados deste módulo"],[105,80,"CONNECTS_WITH","consulta dados deste módulo"]]$relations$::jsonb) item;

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
