-- Alinha Copa & Café e Segurança aos cards visíveis.
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
from jsonb_array_elements($nodes$[[21,"Máquina de Café","Operação, doses e acompanhamento da máquina.","submodule","coffee","copa-coffee-machine","NOT_STARTED",null,-680,-350,20,1,"SCREEN","coffee-machine",null],[22,"Leituras da máquina","Conferência das leituras e consumo registrado.","submodule","reports","copa-coffee-readings","NOT_STARTED",null,-560,-350,20,2,"SCREEN","coffee-readings",null],[23,"Estoque de insumos da máquina","Grãos, leite, chocolate, açúcar e reposição.","submodule","stock","copa-coffee-stock","NOT_STARTED",null,-440,-350,20,3,"SCREEN","coffee-stock",null],[24,"Pedido Nestlé","Solicitações e reposições com fornecedor.","submodule","coffee","copa-nestle-order","NOT_STARTED",null,-320,-350,20,4,"SCREEN","nestle-order",null],[25,"Água","Controle de fardos, galões e consumo.","submodule","water","copa-water","NOT_STARTED",null,-200,-350,20,5,"SCREEN","water",null],[26,"Estoque de água","Saldo de água separado do estoque geral.","submodule","stock","copa-water-stock","NOT_STARTED",null,-80,-350,20,6,"SCREEN","water-stock",null],[27,"Compras de água","Pedidos, compras e reposições de água.","submodule","water","copa-water-purchases","NOT_STARTED",null,40,-350,20,7,"SCREEN","water-purchases",null],[28,"Copos e descartáveis","Copos, mexedores, guardanapos e descartáveis.","submodule","coffee","copa-cups-disposables","NOT_STARTED",null,160,-350,20,8,"SCREEN","cups-disposables",null],[29,"Bebidas da geladeira","Bebidas e itens refrigerados da copa.","submodule","water","copa-fridge-drinks","NOT_STARTED",null,280,-350,20,9,"SCREEN","fridge-drinks",null],[63,"Itens da área gourmet","Itens de apoio da área gourmet dentro da copa.","submodule","settings","copa-gourmet-items","NOT_STARTED",null,400,-350,20,10,"SCREEN","gourmet-items",null],[31,"Guardas","Card da Segurança que abre o controle dos guardas.","submodule","guards","guardas","COMPLETED","security-guards",-150,-500,30,1,"SCREEN","security-guards",[{"id":"abrir-carlos","label":"Carlos Clemente","actionType":"OPEN_SCREEN","description":"Abre o perfil e a escala de Carlos Clemente.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000038"]},{"id":"abrir-salomao","label":"Salomão","actionType":"OPEN_SCREEN","description":"Abre o perfil e a escala de Salomão.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000039"]},{"id":"abrir-pagamento","label":"Fechamento / Pagamento","actionType":"OPEN_SCREEN","description":"Abre a conferência de plantões e pagamentos.","opensScreen":true,"targetNodeIds":["11111111-1111-4111-8111-000000000036"],"permission":"Somente Admin Tezzei"}]],[32,"Monitoramento","Card da Segurança para acompanhar entradas, saídas, rondas e QR Codes.","submodule","reports","seguranca-monitoramento","COMPLETED","security-monitoring",0,-500,30,2,"SCREEN","security-monitoring",[{"id":"aba-entradas","label":"Entradas e saídas","actionType":"UPDATE_DATA","description":"Mostra os registros de ativação e encerramento dos serviços."},{"id":"aba-rondas","label":"Rondas","actionType":"UPDATE_DATA","description":"Mostra o relatório de rondas por horário."},{"id":"aba-qr","label":"QR Codes","actionType":"UPDATE_DATA","description":"Mostra e permite imprimir os QR Codes dos pontos de ronda."}]],[34,"Estacionamento","Card da Segurança para consulta e cadastro de veículos.","submodule","parking","seguranca-estacionamento","COMPLETED","security-parking",150,-500,30,3,"SCREEN","security-parking",[{"id":"pesquisar-veiculo","label":"Pesquisar veículo","actionType":"UPDATE_DATA","description":"Pesquisa por placa, nome, setor, marca, modelo ou cor."},{"id":"fotografar-placa","label":"Abrir câmera / fotografar placa","actionType":"UPDATE_DATA","description":"Usa OCR auxiliar e permite confirmar ou corrigir a placa."},{"id":"salvar-veiculo","label":"Salvar veículo","actionType":"CREATE_RECORD","description":"Cria ou atualiza o cadastro do veículo.","permission":"Admin ou Cadastro de estacionamento"},{"id":"inativar-veiculo","label":"Inativar veículo","actionType":"UPDATE_STATUS","description":"Desativa o cadastro do veículo.","permission":"Admin ou Cadastro de estacionamento"}]],[38,"Carlos Clemente","Card visível em Guardas que abre o perfil e a escala de Carlos Clemente.","submodule","guards","guarda-carlos","COMPLETED",null,-300,-300,31,1,"SCREEN","guard:carlos-clemente",[{"id":"ativar-servico","label":"Ativar serviço","actionType":"CREATE_RECORD","description":"Registra o início do plantão do guarda."},{"id":"encerrar-servico","label":"Encerrar serviço","actionType":"UPDATE_STATUS","description":"Registra o encerramento do plantão."},{"id":"registrar-ronda","label":"Rondas / QR Code","actionType":"CREATE_RECORD","description":"Registra os pontos de ronda durante o serviço ativo."}]],[39,"Salomão","Card visível em Guardas que abre o perfil e a escala de Salomão.","submodule","guards","guarda-salomao","COMPLETED",null,-150,-300,31,2,"SCREEN","guard:salomao",[{"id":"ativar-servico","label":"Ativar serviço","actionType":"CREATE_RECORD","description":"Registra o início do plantão do guarda."},{"id":"encerrar-servico","label":"Encerrar serviço","actionType":"UPDATE_STATUS","description":"Registra o encerramento do plantão."},{"id":"registrar-ronda","label":"Rondas / QR Code","actionType":"CREATE_RECORD","description":"Registra os pontos de ronda durante o serviço ativo."}]],[36,"Fechamento / Pagamento","Card visível em Guardas para conferência dos plantões e pagamentos.","submodule","payment","pagamentos-guardas","COMPLETED","security-guards-payment",0,-300,31,3,"SCREEN","security-guards-payment",[{"id":"salvar-fechamento","label":"Salvar fechamento","actionType":"CREATE_RECORD","description":"Salva o fechamento do período no aplicativo.","permission":"Somente Admin Tezzei"},{"id":"alterar-status","label":"Alterar status","actionType":"UPDATE_STATUS","description":"Atualiza o fechamento para PENDENTE, ENVIADO AO FINANCEIRO ou PAGO.","permission":"Somente Admin Tezzei"}]]]$nodes$::jsonb) item;

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
from jsonb_array_elements_text($obsolete$[33,35,37]$obsolete$::jsonb);

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
from jsonb_array_elements($relations$[[32,31,"CONNECTS_WITH","acompanha serviços e rondas dos guardas"],[36,31,"DEPENDS_ON","usa plantões e rondas conferidos"]]$relations$::jsonb) item;

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
