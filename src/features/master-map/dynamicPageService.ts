import type { AppIconName } from "../../components/AppIcon";
import { ensureRemoteWriteReady, MasterMapRemoteError, masterMapRequest } from "./masterMapService";
import type {
  DynamicPage,
  DynamicPageBlock,
  DynamicPageBlockContent,
  DynamicPageBlockType,
  DynamicPageCreatePayload,
  DynamicPagePayload,
  DynamicPagePriority,
  DynamicPageSummary,
  DynamicPageTemplate,
  DynamicPageType,
} from "./dynamicPageTypes";
import type { MasterMapDestinationType, MasterMapEdge, MasterMapNode, MasterMapNodeType, MasterMapRelationType, MasterMapStatus } from "./masterMapTypes";

type DynamicPageRow = {
  id: string;
  map_id: string;
  node_id: string;
  page_type: DynamicPageType;
  title: string;
  summary: string | null;
  objective: string | null;
  status: MasterMapStatus;
  responsible: string | null;
  priority: DynamicPagePriority | null;
  start_date: string | null;
  due_date: string | null;
  next_action: string | null;
  is_active: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type DynamicPageBlockRow = {
  id: string;
  page_id: string;
  block_type: DynamicPageBlockType;
  position: number | string | null;
  title: string;
  content: DynamicPageBlockContent | null;
  is_active: boolean | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type DynamicPageTemplateRow = {
  id: string;
  page_type: DynamicPageType;
  name: string;
  description: string | null;
  initial_blocks: DynamicPageTemplate["initialBlocks"] | null;
  is_system: boolean | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

type DynamicPageSummaryRow = {
  id: string;
  map_id: string;
  node_id: string;
  priority: DynamicPagePriority | null;
  due_date: string | null;
  status: MasterMapStatus;
  responsible: string | null;
  next_action: string | null;
  updated_at: string;
};

type MasterMapNodeRow = {
  id: string;
  map_id: string;
  title: string;
  description: string | null;
  node_type: MasterMapNodeType | null;
  icon_key: AppIconName | null;
  module_key: string | null;
  status: MasterMapStatus | null;
  responsible: string | null;
  next_action: string | null;
  target_screen: MasterMapNode["targetScreen"] | null;
  destination_type: MasterMapDestinationType | null;
  dynamic_page_id: string | null;
  external_url: string | null;
  planned_module_key: string | null;
  position_x: number | string | null;
  position_y: number | string | null;
  is_collapsed: boolean | null;
  is_active: boolean | null;
  metadata: MasterMapNode["metadata"] | null;
  created_at: string;
  updated_at: string;
};

type MasterMapEdgeRow = {
  id: string;
  map_id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: MasterMapRelationType | null;
  label: string | null;
  is_active: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type DynamicPageRpcPayload = {
  page?: DynamicPageRow;
  blocks?: DynamicPageBlockRow[];
  node?: MasterMapNodeRow;
  edge?: MasterMapEdgeRow | null;
};

export class DynamicPageConflictError extends Error {
  constructor() {
    super("Esta pagina foi alterada em outra sessao.");
    this.name = "DynamicPageConflictError";
  }
}

export type CreateDynamicPageForNodeInput = {
  nodeId: string;
  mapId: string;
  title: string;
  description: string;
  nodeType: MasterMapNodeType;
  iconKey: AppIconName;
  pageType: DynamicPageType;
  templateId: string;
  positionX: number;
  positionY: number;
  parentNodeId?: string;
};

export async function loadDynamicPageTemplates(): Promise<DynamicPageTemplate[]> {
  ensureRemoteWriteReady();

  const response = await masterMapRequest("hub_dynamic_page_templates?select=*&is_active=eq.true&order=page_type.asc,name.asc");
  const rows = (await response.json()) as DynamicPageTemplateRow[];
  return rows.map(mapDynamicPageTemplateRow);
}

export async function loadDynamicPage(pageId: string): Promise<DynamicPagePayload> {
  ensureRemoteWriteReady();

  const [pageResponse, blocksResponse] = await Promise.all([
    masterMapRequest(`hub_dynamic_pages?select=*&id=eq.${encodeURIComponent(pageId)}&is_active=eq.true&limit=1`),
    masterMapRequest(`hub_dynamic_page_blocks?select=*&page_id=eq.${encodeURIComponent(pageId)}&is_active=eq.true&order=position.asc`),
  ]);
  const pages = (await pageResponse.json()) as DynamicPageRow[];
  const blocks = (await blocksResponse.json()) as DynamicPageBlockRow[];
  if (!pages[0]?.id) throw new Error("Pagina dinamica nao encontrada.");

  return {
    page: mapDynamicPageRow(pages[0]),
    blocks: blocks.map(mapDynamicPageBlockRow),
  };
}

export async function loadDynamicPageSummaries(mapId?: string): Promise<DynamicPageSummary[]> {
  ensureRemoteWriteReady();

  const mapFilter = mapId ? `&map_id=eq.${encodeURIComponent(mapId)}` : "";
  const response = await masterMapRequest(`hub_dynamic_pages?select=id,map_id,node_id,priority,due_date,status,responsible,next_action,updated_at&is_active=eq.true${mapFilter}`);
  const rows = (await response.json()) as DynamicPageSummaryRow[];
  return rows.map(mapDynamicPageSummaryRow);
}

export async function createDynamicPageForNode(input: CreateDynamicPageForNodeInput): Promise<DynamicPageCreatePayload> {
  ensureRemoteWriteReady();

  const response = await masterMapRequest("rpc/create_hub_dynamic_page_for_node", {
    method: "POST",
    body: JSON.stringify({
      p_node_id: input.nodeId,
      p_map_id: input.mapId,
      p_title: input.title,
      p_description: input.description,
      p_node_type: input.nodeType,
      p_icon_key: input.iconKey,
      p_page_type: input.pageType,
      p_template_id: input.templateId,
      p_position_x: input.positionX,
      p_position_y: input.positionY,
      p_parent_node_id: input.parentNodeId ?? null,
    }),
  });
  return mapRpcPayload((await response.json()) as DynamicPageRpcPayload, true);
}

export async function saveDynamicPage(page: DynamicPage, blocks: DynamicPageBlock[]): Promise<DynamicPagePayload> {
  ensureRemoteWriteReady();

  try {
    const response = await masterMapRequest("rpc/save_hub_dynamic_page", {
      method: "POST",
      body: JSON.stringify({
        p_page_id: page.id,
        p_title: page.title,
        p_summary: page.summary,
        p_objective: page.objective,
        p_status: page.status,
        p_responsible: page.responsible,
        p_priority: page.priority,
        p_start_date: page.startDate || null,
        p_due_date: page.dueDate || null,
        p_next_action: page.nextAction,
        p_expected_updated_at: page.updatedAt,
        p_blocks: blocks.map(dynamicPageBlockToRpc),
      }),
    });
    return mapRpcPayload((await response.json()) as DynamicPageRpcPayload);
  } catch (error) {
    if (error instanceof MasterMapRemoteError && error.details.includes("DYNAMIC_PAGE_CONFLICT")) {
      throw new DynamicPageConflictError();
    }
    throw error;
  }
}

export async function syncDynamicPageProjectionFromNode(node: MasterMapNode) {
  if (!node.dynamicPageId) return;
  ensureRemoteWriteReady();

  await masterMapRequest(`hub_dynamic_pages?id=eq.${encodeURIComponent(node.dynamicPageId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      title: node.title,
      status: node.status,
      responsible: node.responsible?.trim() || null,
      next_action: node.nextAction?.trim() || null,
    }),
  });
}

export function createDynamicPageBlockDraft(pageId: string, blockType: DynamicPageBlockType, position: number): DynamicPageBlock {
  return {
    id: createId(),
    pageId,
    blockType,
    position,
    title: defaultBlockTitle(blockType),
    content: defaultBlockContent(blockType),
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function cloneDynamicPageBlock(block: DynamicPageBlock, position: number): DynamicPageBlock {
  return {
    ...block,
    id: createId(),
    title: `${block.title} - copia`,
    position,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapRpcPayload(payload: DynamicPageRpcPayload, includeEdge = false): DynamicPageCreatePayload {
  if (!payload.page) throw new Error("Pagina dinamica nao retornada pelo Supabase.");
  return {
    page: mapDynamicPageRow(payload.page),
    blocks: (payload.blocks ?? []).map(mapDynamicPageBlockRow),
    node: payload.node ? mapMasterMapNodeRow(payload.node) : undefined,
    edge: includeEdge && payload.edge ? mapMasterMapEdgeRow(payload.edge) : null,
  };
}

function mapDynamicPageRow(row: DynamicPageRow): DynamicPage {
  return {
    id: row.id,
    mapId: row.map_id,
    nodeId: row.node_id,
    pageType: row.page_type,
    title: row.title,
    summary: row.summary ?? "",
    objective: row.objective ?? "",
    status: row.status,
    responsible: row.responsible ?? "",
    priority: row.priority ?? "MEDIUM",
    startDate: row.start_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    nextAction: row.next_action ?? "",
    isActive: row.is_active ?? true,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDynamicPageSummaryRow(row: DynamicPageSummaryRow): DynamicPageSummary {
  return {
    id: row.id,
    mapId: row.map_id,
    nodeId: row.node_id,
    priority: row.priority ?? "MEDIUM",
    dueDate: row.due_date ?? undefined,
    status: row.status,
    responsible: row.responsible ?? "",
    nextAction: row.next_action ?? "",
    updatedAt: row.updated_at,
  };
}

function mapDynamicPageBlockRow(row: DynamicPageBlockRow): DynamicPageBlock {
  return {
    id: row.id,
    pageId: row.page_id,
    blockType: row.block_type,
    position: toNumber(row.position),
    title: row.title,
    content: row.content ?? {},
    isActive: row.is_active ?? true,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDynamicPageTemplateRow(row: DynamicPageTemplateRow): DynamicPageTemplate {
  return {
    id: row.id,
    pageType: row.page_type,
    name: row.name,
    description: row.description ?? "",
    initialBlocks: row.initial_blocks ?? [],
    isSystem: row.is_system ?? true,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMasterMapNodeRow(row: MasterMapNodeRow): MasterMapNode {
  return {
    id: row.id,
    mapId: row.map_id,
    title: row.title,
    description: row.description ?? "",
    nodeType: row.node_type ?? "task",
    iconKey: row.icon_key ?? "settings",
    moduleKey: row.module_key ?? undefined,
    status: row.status ?? "NOT_STARTED",
    responsible: row.responsible ?? undefined,
    nextAction: row.next_action ?? undefined,
    targetScreen: row.target_screen ?? undefined,
    destinationType: getNodeDestinationType(row),
    dynamicPageId: row.dynamic_page_id ?? undefined,
    externalUrl: row.external_url ?? undefined,
    plannedModuleKey: row.planned_module_key ?? undefined,
    positionX: toNumber(row.position_x),
    positionY: toNumber(row.position_y),
    isCollapsed: row.is_collapsed ?? false,
    isActive: row.is_active ?? true,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMasterMapEdgeRow(row: MasterMapEdgeRow): MasterMapEdge {
  return {
    id: row.id,
    mapId: row.map_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    relationType: row.relation_type ?? "BELONGS_TO",
    label: row.label ?? undefined,
    isActive: row.is_active ?? true,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dynamicPageBlockToRpc(block: DynamicPageBlock) {
  return {
    id: block.id,
    block_type: block.blockType,
    position: block.position,
    title: block.title,
    content: block.content ?? {},
    is_active: block.isActive,
  };
}

function getNodeDestinationType(row: MasterMapNodeRow): MasterMapDestinationType {
  if (row.destination_type) return row.destination_type;
  if (row.dynamic_page_id) return "DYNAMIC_PAGE";
  if (row.target_screen) return "EXISTING_SCREEN";
  if (row.external_url) return "EXTERNAL_URL";
  if (row.planned_module_key) return "PLANNED_MODULE";
  return "NONE";
}

function defaultBlockTitle(blockType: DynamicPageBlockType) {
  const titles: Record<DynamicPageBlockType, string> = {
    TEXT: "Texto",
    CHECKLIST: "Checklist",
    DECISION: "Decisao",
    RISK: "Risco",
    QUESTION: "Pergunta",
    TEST: "Teste",
    EVIDENCE: "Evidencia",
    LINK: "Link",
    NOTE: "Nota",
    WARNING: "Aviso",
    METRIC: "Metrica",
    NEXT_ACTION: "Proxima acao",
  };
  return titles[blockType];
}

function defaultBlockContent(blockType: DynamicPageBlockType): DynamicPageBlockContent {
  if (blockType === "CHECKLIST") return { items: [] };
  if (blockType === "DECISION") return { context: "", options: "", decision: "", reason: "", impacts: "", evidence: "" };
  if (blockType === "RISK") return { description: "", probability: "", impact: "", mitigation: "", responsible: "", status: "Aberto" };
  if (blockType === "QUESTION") return { question: "", answer: "" };
  if (blockType === "TEST") return { objective: "", hypothesis: "", materials: "", procedure: "", expectedResult: "", actualResult: "", approved: false, evidence: "" };
  if (blockType === "EVIDENCE") return { description: "", url: "" };
  if (blockType === "LINK") return { label: "", url: "" };
  if (blockType === "METRIC") return { label: "", value: "", unit: "", target: "" };
  if (blockType === "NEXT_ACTION") return { action: "", responsible: "", dueDate: "", status: "Pendente" };
  return { text: "", doc: { type: "doc", content: [{ type: "paragraph" }] } };
}

function toNumber(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
