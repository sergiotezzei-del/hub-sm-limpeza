import type {
  MasterMap,
  MasterMapAction,
  MasterMapCardKind,
  MasterMapEdge,
  MasterMapNode,
  MasterMapNodeType,
  MasterMapRelationType,
  MasterMapStatus,
  MasterMapTargetScreen,
} from "./masterMapTypes";
import type { AppIconName } from "../../components/AppIcon";

export const MASTER_MAP_GENERAL_ID = "11111111-1111-4111-8111-111111111111";
export const MASTER_MAP_KEY_CONTROL_ID = "22222222-2222-4222-8222-222222222222";

const DEFAULT_DATE = "2026-07-19T00:00:00.000Z";

export const defaultMasterMaps: MasterMap[] = [
  {
    id: MASTER_MAP_GENERAL_ID,
    name: "Mapa Geral do HUB SM",
    slug: "hub-sm-geral",
    description: "Visão geral dos módulos, projetos, dependências e andamento do HUB SM.",
    isActive: true,
    createdAt: DEFAULT_DATE,
    updatedAt: DEFAULT_DATE,
  },
  {
    id: MASTER_MAP_KEY_CONTROL_ID,
    name: "Projeto SM Key Control",
    slug: "sm-key-control",
    description: "Mapa de arquitetura e preparação do futuro Controle de Chaves da Imobiliária.",
    isActive: true,
    createdAt: DEFAULT_DATE,
    updatedAt: DEFAULT_DATE,
  },
];

type DefaultNodeInput = {
  id: string;
  mapId: string;
  title: string;
  description?: string;
  nodeType?: MasterMapNodeType;
  iconKey?: AppIconName;
  moduleKey?: string;
  status?: MasterMapStatus;
  responsible?: string;
  nextAction?: string;
  targetScreen?: MasterMapTargetScreen;
  x: number;
  y: number;
  parentId?: string;
  observations?: string;
  realTest?: string;
  pr?: string;
  cardKind?: MasterMapCardKind;
  screenKey?: string;
  actions?: MasterMapAction[];
};

type DefaultEdgeInput = {
  id: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType?: MasterMapRelationType;
  label?: string;
};

function node(input: DefaultNodeInput): MasterMapNode {
  return {
    id: input.id,
    mapId: input.mapId,
    title: input.title,
    description: input.description ?? "",
    nodeType: input.nodeType ?? "submodule",
    iconKey: input.iconKey ?? "settings",
    moduleKey: input.moduleKey,
    status: input.status ?? "NOT_STARTED",
    responsible: input.responsible,
    nextAction: input.nextAction,
    targetScreen: input.targetScreen,
    destinationType: input.targetScreen ? "EXISTING_SCREEN" : "NONE",
    positionX: input.x,
    positionY: input.y,
    isCollapsed: false,
    isActive: true,
    metadata: {
      parentId: input.parentId,
      observations: input.observations,
      realTest: input.realTest,
      pr: input.pr,
      cardKind: input.cardKind,
      screenKey: input.screenKey,
      actions: input.actions,
    },
    createdAt: DEFAULT_DATE,
    updatedAt: DEFAULT_DATE,
  };
}

function edge(input: DefaultEdgeInput): MasterMapEdge {
  return {
    id: input.id,
    mapId: input.mapId,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    relationType: input.relationType ?? "BELONGS_TO",
    label: input.label,
    isActive: true,
    metadata: {},
    createdAt: DEFAULT_DATE,
    updatedAt: DEFAULT_DATE,
  };
}

const generalRoot = "11111111-1111-4111-8111-000000000001";
const generalCleaning = "11111111-1111-4111-8111-000000000010";
const cleaningOrders = "11111111-1111-4111-8111-000000000011";
const cleaningNewOrder = "11111111-1111-4111-8111-000000000012";
const cleaningStockExit = "11111111-1111-4111-8111-000000000013";
const cleaningProductRegister = "11111111-1111-4111-8111-000000000014";
const cleaningCurrentStock = "11111111-1111-4111-8111-000000000015";
const cleaningStockExitHistory = "11111111-1111-4111-8111-000000000016";
const cleaningNeiaHistory = "11111111-1111-4111-8111-000000000017";
const cleaningOrderHistory = "11111111-1111-4111-8111-000000000018";
const cleaningProfiles = "11111111-1111-4111-8111-000000000019";
const cleaningStockCheck = "11111111-1111-4111-8111-000000000060";
const cleaningOfflineQueue = "11111111-1111-4111-8111-000000000061";
const cleaningPrepareRealUse = "11111111-1111-4111-8111-000000000062";
const generalCoffee = "11111111-1111-4111-8111-000000000020";
const generalSecurity = "11111111-1111-4111-8111-000000000030";
const generalKeyControl = "11111111-1111-4111-8111-000000000040";
const generalAdmin = "11111111-1111-4111-8111-000000000050";

const keyRoot = "22222222-2222-4222-8222-000000000001";
const keyCurrentOps = "22222222-2222-4222-8222-000000000010";
const keyFlowSurvey = "22222222-2222-4222-8222-000000000011";
const keySoftware = "22222222-2222-4222-8222-000000000012";
const keyPhysicalPanel = "22222222-2222-4222-8222-000000000013";
const keyIdentification = "22222222-2222-4222-8222-000000000014";
const keyAccessControl = "22222222-2222-4222-8222-000000000015";
const keyIhome = "22222222-2222-4222-8222-000000000016";
const keyLabels = "22222222-2222-4222-8222-000000000017";
const keyAudit = "22222222-2222-4222-8222-000000000018";
const keyAlerts = "22222222-2222-4222-8222-000000000019";
const keyPilot = "22222222-2222-4222-8222-000000000020";
const keyProduct = "22222222-2222-4222-8222-000000000021";

export const defaultMasterMapNodes: MasterMapNode[] = [
  node({ id: generalRoot, mapId: MASTER_MAP_GENERAL_ID, title: "Aplicativo HUB SM Tezzei", description: "HUB SM em produção, com módulos operacionais em evolução.", nodeType: "root", iconKey: "map", status: "COMPLETED", responsible: "Tezzei", x: 0, y: 0, realTest: "HUB SM em produção.", cardKind: "MODULE" }),
  node({ id: generalCleaning, mapId: MASTER_MAP_GENERAL_ID, title: "Limpeza", description: "Mapa funcional das telas, ações, históricos e componentes da Limpeza.", nodeType: "module", iconKey: "cleaning", status: "COMPLETED", targetScreen: "cleaning-dashboard", x: -620, y: -260, parentId: generalRoot, cardKind: "MODULE", screenKey: "cleaning-dashboard" }),
  node({ id: generalCoffee, mapId: MASTER_MAP_GENERAL_ID, title: "Copa e Café", description: "Café, água, copos, bebidas e insumos da copa.", nodeType: "module", iconKey: "coffee", status: "IN_PROGRESS", targetScreen: "copa-cafe-menu", x: -620, y: 60, parentId: generalRoot, cardKind: "MODULE" }),
  node({ id: generalSecurity, mapId: MASTER_MAP_GENERAL_ID, title: "Segurança", description: "Guardas, rondas, QR Code, estacionamento e fechamento.", nodeType: "module", iconKey: "security", status: "COMPLETED", targetScreen: "security-menu", x: 460, y: -260, parentId: generalRoot, cardKind: "MODULE" }),
  node({ id: generalKeyControl, mapId: MASTER_MAP_GENERAL_ID, title: "SM Key Control", description: "Projeto do futuro controle de chaves da imobiliária.", nodeType: "project", iconKey: "settings", status: "IN_PROGRESS", responsible: "Tezzei", nextAction: "Levantar fluxo real por cinco dias.", x: 480, y: 70, parentId: generalRoot, cardKind: "PROJECT" }),
  node({ id: generalAdmin, mapId: MASTER_MAP_GENERAL_ID, title: "Administração", description: "Usuários, permissões, status e mapa mestre.", nodeType: "module", iconKey: "users", status: "COMPLETED", x: -70, y: 310, parentId: generalRoot, cardKind: "MODULE" }),

  node({
    id: cleaningOrders,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Pedidos Sinval",
    description: "Tela que lista e administra os pedidos de produtos enviados pela Néia ao Sinval.",
    iconKey: "cleaning",
    status: "COMPLETED",
    x: -1080,
    y: -650,
    parentId: generalCleaning,
    cardKind: "SCREEN",
    screenKey: "orders",
    actions: [
      { id: "novo-pedido", label: "Novo pedido", actionType: "OPEN_SCREEN", description: "Abre a tela de preenchimento de um novo pedido.", targetNodeIds: [cleaningNewOrder], opensScreen: true, permission: "Permissão Limpeza" },
      { id: "marcar-pedido-feito", label: "Marcar como pedido feito", actionType: "UPDATE_STATUS", description: "Altera o status do pedido para Pedido feito e grava a data de conclusão.", targetNodeIds: [cleaningOrderHistory, cleaningNeiaHistory], opensScreen: false, offlineBehavior: "Se não sincronizar, a alteração permanece no aparelho aguardando envio." },
      { id: "editar-pedido", label: "Editar pedido", actionType: "UPDATE_DATA", description: "Atualiza os itens e observações do pedido selecionado.", opensScreen: false, offlineBehavior: "Se não sincronizar, a edição permanece no aparelho aguardando envio." },
      { id: "excluir-pedido", label: "Excluir pedido", actionType: "DELETE_OR_INACTIVATE", description: "Inativa o pedido na operação e o mantém disponível para auditoria.", targetNodeIds: [cleaningOrderHistory, cleaningNeiaHistory], opensScreen: false, offlineBehavior: "Se não sincronizar, a exclusão permanece no aparelho aguardando envio." },
    ],
  }),
  node({
    id: cleaningNewOrder,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Novo pedido",
    description: "Tela para selecionar produtos, informar quantidades e enviar um pedido ao Sinval.",
    iconKey: "edit",
    status: "COMPLETED",
    x: -1450,
    y: -540,
    parentId: cleaningOrders,
    cardKind: "SCREEN",
    screenKey: "order-form",
    actions: [
      { id: "enviar-pedido", label: "Enviar pedido", actionType: "CREATE_RECORD", description: "Cria um pedido e seus itens.", targetNodeIds: [cleaningOrders, cleaningNeiaHistory], opensScreen: false, offlineBehavior: "Sem conexão, o pedido é enviado para a Fila offline.", permission: "Permissão Limpeza" },
      { id: "pedido-offline", label: "Salvar pendência offline", actionType: "QUEUE_OFFLINE", description: "Guarda o pedido no aparelho quando o Supabase não está disponível.", targetNodeIds: [cleaningOfflineQueue], opensScreen: false, condition: "Falha de conexão ou sincronização" },
    ],
  }),
  node({
    id: cleaningStockExit,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Saída de produtos",
    description: "Tela para registrar a retirada de produtos da Limpeza.", iconKey: "stock", status: "COMPLETED", x: -1080, y: -405, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "stock-exit",
    actions: [
      { id: "confirmar-saida", label: "Confirmar saída", actionType: "UPDATE_DATA", description: "Reduz o saldo do produto e cria uma movimentação de saída.", targetNodeIds: [cleaningCurrentStock, cleaningStockExitHistory], opensScreen: false, permission: "Permissão Saída de estoque", offlineBehavior: "Sem conexão, a operação vai para a Fila offline." },
      { id: "saida-offline", label: "Salvar saída offline", actionType: "QUEUE_OFFLINE", description: "Guarda a saída no aparelho até a conexão voltar.", targetNodeIds: [cleaningOfflineQueue], opensScreen: false, condition: "Falha de conexão ou sincronização" },
    ],
  }),
  node({
    id: cleaningProductRegister,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Cadastro de produtos",
    description: "Cadastro e edição de nome, unidade, foto, código de barras, saldo e estoque mínimo.", iconKey: "edit", status: "COMPLETED", targetScreen: "product-register", x: -1080, y: -270, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "product-register",
    actions: [
      { id: "salvar-produto", label: "Salvar produto", actionType: "UPDATE_DATA", description: "Cria ou atualiza o produto disponível para as rotinas da Limpeza.", targetNodeIds: [cleaningCurrentStock, cleaningNewOrder, cleaningStockExit], opensScreen: false, permission: "Permissão administrativa" },
    ],
  }),
  node({ id: cleaningCurrentStock, mapId: MASTER_MAP_GENERAL_ID, title: "Estoque atual", description: "Tela que mostra o saldo atual e o estoque mínimo dos produtos.", iconKey: "stock", status: "COMPLETED", targetScreen: "current-stock", x: -1080, y: -135, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "current-stock" }),
  node({ id: cleaningStockExitHistory, mapId: MASTER_MAP_GENERAL_ID, title: "Histórico de saídas", description: "Tela de consulta das movimentações de saída, entrada e ajuste do estoque.", iconKey: "reports", status: "COMPLETED", targetScreen: "stock-exit-history", x: -1080, y: 0, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "stock-exit-history" }),
  node({ id: cleaningNeiaHistory, mapId: MASTER_MAP_GENERAL_ID, title: "Histórico Néia", description: "Tela com todos os pedidos realizados pela Néia.", iconKey: "reports", status: "COMPLETED", x: -1080, y: 135, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "neia-history" }),
  node({ id: cleaningOrderHistory, mapId: MASTER_MAP_GENERAL_ID, title: "Histórico / Auditoria", description: "Tela de auditoria dos pedidos concluídos e excluídos.", iconKey: "reports", status: "COMPLETED", x: -1080, y: 270, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "order-history" }),
  node({ id: cleaningProfiles, mapId: MASTER_MAP_GENERAL_ID, title: "Perfis da equipe", description: "Tela de perfis da Néia, Selma e Helena.", iconKey: "users", status: "COMPLETED", x: -1080, y: 405, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "profiles", actions: [{ id: "salvar-foto", label: "Salvar foto do perfil", actionType: "UPDATE_DATA", description: "Atualiza a foto vinculada ao perfil da funcionária.", opensScreen: false, permission: "Painel admin" }] }),
  node({
    id: cleaningStockCheck,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Conferência de estoque",
    description: "Tela usada pela Néia para registrar a conferência física dos produtos.", iconKey: "stock", status: "COMPLETED", x: -1080, y: 540, parentId: generalCleaning, cardKind: "SCREEN", screenKey: "stock-check",
    actions: [
      { id: "salvar-conferencia", label: "Salvar conferência", actionType: "CREATE_RECORD", description: "Grava a conferência e seus itens para consulta operacional.", opensScreen: false, offlineBehavior: "Sem conexão, a conferência vai para a Fila offline." },
      { id: "conferencia-offline", label: "Salvar conferência offline", actionType: "QUEUE_OFFLINE", description: "Guarda a conferência no aparelho até a conexão voltar.", targetNodeIds: [cleaningOfflineQueue], opensScreen: false, condition: "Falha de conexão ou sincronização" },
    ],
  }),
  node({
    id: cleaningOfflineQueue,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Fila offline",
    description: "Componente interno que guarda pedidos, conferências e saídas até a internet voltar.", iconKey: "warning", status: "COMPLETED", x: -1080, y: 675, parentId: generalCleaning, cardKind: "SYSTEM_COMPONENT",
    actions: [
      { id: "sincronizar-pendencias", label: "Sincronizar pendências", actionType: "SYNC", description: "Reprocessa as operações pendentes e atualiza os dados do aplicativo.", targetNodeIds: [cleaningOrders, cleaningStockCheck, cleaningCurrentStock, cleaningStockExitHistory], opensScreen: false, condition: "Supabase disponível" },
    ],
  }),
  node({
    id: cleaningPrepareRealUse,
    mapId: MASTER_MAP_GENERAL_ID,
    title: "Preparar a Limpeza para uso real",
    description: "Ação administrativa crítica que remove dados operacionais de teste antes do início oficial.", iconKey: "warning", status: "COMPLETED", x: -1080, y: 810, parentId: generalCleaning, cardKind: "ADMIN_ACTION",
    actions: [
      { id: "limpar-dados-teste", label: "Confirmar preparação para uso real", actionType: "DESTRUCTIVE", description: "Remove pedidos, conferências, movimentações e históricos de teste. Não remove cadastro de produtos, estoque atual ou perfis.", targetNodeIds: [cleaningOrders, cleaningNeiaHistory, cleaningOrderHistory, cleaningStockCheck, cleaningStockExitHistory], opensScreen: false, permission: "Somente Admin Tezzei", condition: "Confirmação explícita do administrador" },
    ],
  }),

  ...[
    ["11111111-1111-4111-8111-000000000021", "Café", "Máquina de café e insumos.", "coffee"],
    ["11111111-1111-4111-8111-000000000022", "Água", "Compras e estoque de água.", "water"],
    ["11111111-1111-4111-8111-000000000023", "Estoque", "Insumos da copa sem misturar com limpeza.", "stock"],
    ["11111111-1111-4111-8111-000000000024", "Pedidos", "Solicitações da copa.", "reports"],
    ["11111111-1111-4111-8111-000000000025", "Leituras", "Leituras da máquina de café.", "reports"],
    ["11111111-1111-4111-8111-000000000026", "Divergências", "Pontos para conferência operacional.", "warning"],
  ].map(([id, title, description, iconKey], index) => node({ id, mapId: MASTER_MAP_GENERAL_ID, title, description, iconKey: iconKey as AppIconName, status: "IN_PROGRESS", targetScreen: "copa-cafe-menu", x: -980, y: 250 + index * 95, parentId: generalCoffee })),

  ...[
    ["11111111-1111-4111-8111-000000000031", "Guardas", "Carlos Clemente e Salomão.", "guards", "security-guards", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000032", "Rondas", "Relatório real de rondas.", "guards", "security-monitoring", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000033", "QR Code", "Leitura de pontos de ronda.", "qr", "security-monitoring", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000034", "Estacionamento", "Consulta rápida de veículos.", "parking", "security-parking", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000035", "Cadastro de Veículos", "Cadastro restrito a Admin.", "vehicle", "security-parking", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000036", "Pagamentos", "Fechamento dos guardas.", "payment", "security-guards-payment", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000037", "Controle de Acesso", "Base para acessos futuros.", "security", "security-menu", "IN_PROGRESS"],
  ].map(([id, title, description, iconKey, targetScreen, status], index) => node({ id, mapId: MASTER_MAP_GENERAL_ID, title, description, iconKey: iconKey as AppIconName, status: status as MasterMapStatus, targetScreen: targetScreen as MasterMapTargetScreen, x: 840, y: -460 + index * 95, parentId: generalSecurity })),

  ...[
    ["11111111-1111-4111-8111-000000000051", "Usuários", "Cadastro sincronizado de usuários.", "users", "users-permissions", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000052", "Permissões", "Perfis por uso real.", "settings", "users-permissions", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000053", "Status do Sistema", "Visão rápida dos módulos principais.", "reports", "system-status", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000054", "Mapa Mestre", "Mapa mental interativo do HUB SM.", "map", "master-map", "IN_PROGRESS"],
    ["11111111-1111-4111-8111-000000000055", "Padronização de ícones", "Biblioteca interna AppIcon.", "success", "", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000056", "Revisão mobile", "Ajustes de usabilidade em celular.", "success", "", "COMPLETED"],
    ["11111111-1111-4111-8111-000000000057", "Fechamento de estabilidade antes de Chaves", "PR #78 concluído.", "success", "", "COMPLETED"],
  ].map(([id, title, description, iconKey, targetScreen, status], index) => node({ id, mapId: MASTER_MAP_GENERAL_ID, title, description, iconKey: iconKey as AppIconName, status: status as MasterMapStatus, targetScreen: targetScreen ? targetScreen as MasterMapTargetScreen : undefined, x: -100 + index * 235, y: 560, parentId: generalAdmin, pr: title === "Fechamento de estabilidade antes de Chaves" ? "#78" : undefined })),

  node({ id: keyRoot, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "SM Key Control", description: "Arquitetura do futuro controle de chaves. Este mapa não cria a operação de retirada/devolução.", nodeType: "root", iconKey: "map", status: "IN_PROGRESS", responsible: "Tezzei", nextAction: "Levantar operação real antes do piloto.", x: 0, y: 0 }),
  node({ id: keyCurrentOps, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Operação atual", description: "Entender como as chaves circulam hoje.", nodeType: "project", status: "IN_PROGRESS", iconKey: "reports", x: -900, y: -360, parentId: keyRoot }),
  node({ id: keyFlowSurvey, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Levantamento do fluxo", description: "Cinco dias de observação operacional.", nodeType: "project", status: "IN_PROGRESS", iconKey: "reports", x: -900, y: -190, parentId: keyRoot, nextAction: "Registrar saídas reais por cinco dias." }),
  node({ id: keySoftware, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Software", description: "Módulos futuros de imóveis, chaves, solicitações e movimentações.", nodeType: "project", status: "IN_PROGRESS", iconKey: "settings", x: -900, y: 30, parentId: keyRoot }),
  node({ id: keyPhysicalPanel, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Painel físico", description: "Painel MDF atual, sensores, trava e possibilidades de retrofit.", nodeType: "physical", status: "IN_PROGRESS", iconKey: "stock", x: -900, y: 270, parentId: keyRoot }),
  node({ id: keyIdentification, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Identificação das chaves", description: "Comparação entre QR, NFC, RFID, contato elétrico e visão.", nodeType: "project", status: "IN_PROGRESS", iconKey: "qr", x: 680, y: -420, parentId: keyRoot }),
  node({ id: keyAccessControl, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Controle de acesso", description: "Porta blindada, facial, crachá, PIN e registros de entrada.", nodeType: "project", status: "IN_PROGRESS", iconKey: "security", x: 680, y: -160, parentId: keyRoot }),
  node({ id: keyIhome, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Integração IHome", description: "API, webhooks, filas e sincronização futura.", nodeType: "integration", status: "NOT_STARTED", iconKey: "settings", x: 680, y: 120, parentId: keyRoot }),
  node({ id: keyLabels, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Etiquetas e impressão", description: "Etiqueta 60 x 40 mm e impressão real.", nodeType: "project", status: "IN_PROGRESS", iconKey: "qr", x: 680, y: 350, parentId: keyRoot }),
  node({ id: keyAudit, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Auditoria", description: "Histórico e trilha futura das chaves.", nodeType: "project", status: "NOT_STARTED", iconKey: "reports", x: 80, y: 520, parentId: keyRoot }),
  node({ id: keyAlerts, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Alertas", description: "Alertas operacionais futuros.", nodeType: "project", status: "NOT_STARTED", iconKey: "warning", x: 310, y: 520, parentId: keyRoot }),
  node({ id: keyPilot, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Piloto", description: "Piloto operacional após definição técnica.", nodeType: "milestone", status: "NOT_STARTED", iconKey: "success", x: 540, y: 520, parentId: keyRoot }),
  node({ id: keyProduct, mapId: MASTER_MAP_KEY_CONTROL_ID, title: "Produtização", description: "Transformar piloto em operação oficial.", nodeType: "milestone", status: "NOT_STARTED", iconKey: "settings", x: 770, y: 520, parentId: keyRoot }),

  ...[
    ["22222222-2222-4222-8222-000000000030", "Cadastro de imóveis"],
    ["22222222-2222-4222-8222-000000000031", "Cadastro de chaves"],
    ["22222222-2222-4222-8222-000000000032", "Solicitações"],
    ["22222222-2222-4222-8222-000000000033", "Autorizações"],
    ["22222222-2222-4222-8222-000000000034", "Retiradas"],
    ["22222222-2222-4222-8222-000000000035", "Devoluções"],
    ["22222222-2222-4222-8222-000000000036", "Transferência de custódia"],
    ["22222222-2222-4222-8222-000000000037", "Status"],
    ["22222222-2222-4222-8222-000000000038", "Relatórios"],
  ].map(([id, title], index) => node({ id, mapId: MASTER_MAP_KEY_CONTROL_ID, title, status: "NOT_STARTED", iconKey: index < 2 ? "edit" : "reports", x: -1260, y: -40 + index * 86, parentId: keySoftware })),

  ...[
    ["22222222-2222-4222-8222-000000000050", "Painel MDF atual", "IN_PROGRESS"],
    ["22222222-2222-4222-8222-000000000051", "Aproximadamente 532 posições", "IN_PROGRESS"],
    ["22222222-2222-4222-8222-000000000052", "Duas portas de correr", "IN_PROGRESS"],
    ["22222222-2222-4222-8222-000000000053", "Fechadura tambor", "IN_PROGRESS"],
    ["22222222-2222-4222-8222-000000000054", "Trava eletrônica", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000055", "Sensores", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000056", "Controlador local", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000057", "Painel novo", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000058", "Locker de trânsito", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000059", "Compartimentos individuais", "NOT_STARTED"],
  ].map(([id, title, status], index) => node({ id, mapId: MASTER_MAP_KEY_CONTROL_ID, title, status: status as MasterMapStatus, iconKey: "stock", x: -1260, y: 760 + index * 86, parentId: keyPhysicalPanel })),

  ...[
    ["22222222-2222-4222-8222-000000000070", "QR Code", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000071", "NFC", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000072", "RFID UHF", "IN_PROGRESS"],
    ["22222222-2222-4222-8222-000000000073", "Contato elétrico", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000074", "iButton", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000075", "Sensor por posição", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000076", "Visão computacional", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000077", "Solução híbrida", "IN_PROGRESS"],
  ].map(([id, title, status], index) => node({ id, mapId: MASTER_MAP_KEY_CONTROL_ID, title, status: status as MasterMapStatus, iconKey: title === "QR Code" ? "qr" : "settings", x: 1030, y: -540 + index * 86, parentId: keyIdentification })),

  ...[
    ["22222222-2222-4222-8222-000000000090", "Porta blindada", "IN_PROGRESS"],
    ["22222222-2222-4222-8222-000000000091", "Facial", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000092", "Crachá", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000093", "PIN", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000094", "Vídeo porteiro", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000095", "Visitantes", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000096", "Entregadores", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000097", "Acesso temporário", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000098", "Registro de entrada", "NOT_STARTED"],
    ["22222222-2222-4222-8222-000000000099", "Registro de saída", "NOT_STARTED"],
  ].map(([id, title, status], index) => node({ id, mapId: MASTER_MAP_KEY_CONTROL_ID, title, status: status as MasterMapStatus, iconKey: "security", x: 1030, y: 180 + index * 86, parentId: keyAccessControl })),

  ...[
    ["22222222-2222-4222-8222-000000000110", "API"],
    ["22222222-2222-4222-8222-000000000111", "Webhook"],
    ["22222222-2222-4222-8222-000000000112", "Fila"],
    ["22222222-2222-4222-8222-000000000113", "Sincronização"],
    ["22222222-2222-4222-8222-000000000114", "Reprocessamento"],
    ["22222222-2222-4222-8222-000000000115", "ID do imóvel"],
    ["22222222-2222-4222-8222-000000000116", "ID da chave"],
    ["22222222-2222-4222-8222-000000000117", "Eventos"],
  ].map(([id, title], index) => node({ id, mapId: MASTER_MAP_KEY_CONTROL_ID, title, status: "NOT_STARTED", iconKey: "settings", x: 1370, y: 70 + index * 86, parentId: keyIhome })),
];

const generalBelongsToEdges: MasterMapEdge[] = [
  generalCleaning,
  generalCoffee,
  generalSecurity,
  generalKeyControl,
  generalAdmin,
  ...defaultMasterMapNodes.filter((current) => current.mapId === MASTER_MAP_GENERAL_ID && current.metadata.parentId && current.id !== generalCleaning && current.id !== generalCoffee && current.id !== generalSecurity && current.id !== generalKeyControl && current.id !== generalAdmin).map((current) => current.id),
].map((targetId, index) => edge({
  id: `11111111-1111-4111-8111-100000000${String(index + 1).padStart(3, "0")}`,
  mapId: MASTER_MAP_GENERAL_ID,
  sourceNodeId: defaultMasterMapNodes.find((current) => current.id === targetId)?.metadata.parentId ?? generalRoot,
  targetNodeId: targetId,
}));

const keyBelongsToEdges: MasterMapEdge[] = defaultMasterMapNodes
  .filter((current) => current.mapId === MASTER_MAP_KEY_CONTROL_ID && current.metadata.parentId)
  .map((current, index) => edge({
    id: `22222222-2222-4222-8222-100000000${String(index + 1).padStart(3, "0")}`,
    mapId: MASTER_MAP_KEY_CONTROL_ID,
    sourceNodeId: current.metadata.parentId as string,
    targetNodeId: current.id,
  }));

export const defaultMasterMapEdges: MasterMapEdge[] = [
  ...generalBelongsToEdges,
  edge({ id: "11111111-1111-4111-8111-200000000001", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: generalKeyControl, targetNodeId: generalSecurity, relationType: "CONNECTS_WITH", label: "usa controle de acesso" }),
  edge({ id: "11111111-1111-4111-8111-200000000002", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: generalKeyControl, targetNodeId: generalAdmin, relationType: "DEPENDS_ON", label: "depende de permissões" }),
  edge({ id: "11111111-1111-4111-8111-200000000010", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOrders, targetNodeId: cleaningNewOrder, relationType: "CONNECTS_WITH", label: "Novo pedido abre esta tela" }),
  edge({ id: "11111111-1111-4111-8111-200000000011", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOrders, targetNodeId: cleaningOrderHistory, relationType: "TRIGGERS", label: "feito ou excluído gera auditoria" }),
  edge({ id: "11111111-1111-4111-8111-200000000012", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOrders, targetNodeId: cleaningNeiaHistory, relationType: "TRIGGERS", label: "pedido aparece no histórico Néia" }),
  edge({ id: "11111111-1111-4111-8111-200000000013", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningNewOrder, targetNodeId: cleaningOrders, relationType: "TRIGGERS", label: "enviar cria pedido" }),
  edge({ id: "11111111-1111-4111-8111-200000000014", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningNewOrder, targetNodeId: cleaningOfflineQueue, relationType: "TRIGGERS", label: "falha envia para fila" }),
  edge({ id: "11111111-1111-4111-8111-200000000015", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningStockExit, targetNodeId: cleaningCurrentStock, relationType: "TRIGGERS", label: "confirmar saída atualiza saldo" }),
  edge({ id: "11111111-1111-4111-8111-200000000016", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningStockExit, targetNodeId: cleaningStockExitHistory, relationType: "TRIGGERS", label: "confirmar saída registra histórico" }),
  edge({ id: "11111111-1111-4111-8111-200000000017", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningStockExit, targetNodeId: cleaningOfflineQueue, relationType: "TRIGGERS", label: "falha envia para fila" }),
  edge({ id: "11111111-1111-4111-8111-200000000018", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningStockCheck, targetNodeId: cleaningOfflineQueue, relationType: "TRIGGERS", label: "falha envia para fila" }),
  edge({ id: "11111111-1111-4111-8111-200000000019", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOfflineQueue, targetNodeId: cleaningOrders, relationType: "INTEGRATES_WITH", label: "sincroniza pedidos" }),
  edge({ id: "11111111-1111-4111-8111-200000000020", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOfflineQueue, targetNodeId: cleaningStockCheck, relationType: "INTEGRATES_WITH", label: "sincroniza conferências" }),
  edge({ id: "11111111-1111-4111-8111-200000000021", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOfflineQueue, targetNodeId: cleaningCurrentStock, relationType: "INTEGRATES_WITH", label: "recarrega estoque" }),
  edge({ id: "11111111-1111-4111-8111-200000000022", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningOfflineQueue, targetNodeId: cleaningStockExitHistory, relationType: "INTEGRATES_WITH", label: "recarrega movimentações" }),
  edge({ id: "11111111-1111-4111-8111-200000000023", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningPrepareRealUse, targetNodeId: cleaningOrders, relationType: "TRIGGERS", label: "limpa pedidos de teste" }),
  edge({ id: "11111111-1111-4111-8111-200000000024", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningPrepareRealUse, targetNodeId: cleaningStockCheck, relationType: "TRIGGERS", label: "limpa conferências de teste" }),
  edge({ id: "11111111-1111-4111-8111-200000000025", mapId: MASTER_MAP_GENERAL_ID, sourceNodeId: cleaningPrepareRealUse, targetNodeId: cleaningStockExitHistory, relationType: "TRIGGERS", label: "limpa movimentações de teste" }),
  ...keyBelongsToEdges,
  edge({ id: "22222222-2222-4222-8222-200000000001", mapId: MASTER_MAP_KEY_CONTROL_ID, sourceNodeId: "22222222-2222-4222-8222-000000000033", targetNodeId: "22222222-2222-4222-8222-000000000034", relationType: "TRIGGERS", label: "autorizado libera retirada" }),
  edge({ id: "22222222-2222-4222-8222-200000000002", mapId: MASTER_MAP_KEY_CONTROL_ID, sourceNodeId: "22222222-2222-4222-8222-000000000034", targetNodeId: "22222222-2222-4222-8222-000000000037", relationType: "TRIGGERS", label: "chave retirada atualiza status" }),
  edge({ id: "22222222-2222-4222-8222-200000000003", mapId: MASTER_MAP_KEY_CONTROL_ID, sourceNodeId: "22222222-2222-4222-8222-000000000035", targetNodeId: "22222222-2222-4222-8222-000000000037", relationType: "TRIGGERS", label: "devolução atualiza status" }),
  edge({ id: "22222222-2222-4222-8222-200000000004", mapId: MASTER_MAP_KEY_CONTROL_ID, sourceNodeId: "22222222-2222-4222-8222-000000000034", targetNodeId: keyIhome, relationType: "INTEGRATES_WITH", label: "movimentação sincroniza" }),
  edge({ id: "22222222-2222-4222-8222-200000000005", mapId: MASTER_MAP_KEY_CONTROL_ID, sourceNodeId: "22222222-2222-4222-8222-000000000091", targetNodeId: keySoftware, relationType: "TRIGGERS", label: "facial autorizado abre painel" }),
  edge({ id: "22222222-2222-4222-8222-200000000006", mapId: MASTER_MAP_KEY_CONTROL_ID, sourceNodeId: keyAccessControl, targetNodeId: keyAlerts, relationType: "TRIGGERS", label: "sem autorização gera alerta" }),
];
