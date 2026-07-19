import { getSupabaseAccessToken, SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseConfigured } from "../../modules/security/services/supabaseClient";
import { defaultMasterMapEdges, defaultMasterMapNodes, defaultMasterMaps } from "./masterMapDefaults";
import type { MasterMap, MasterMapData, MasterMapEdge, MasterMapNode, MasterMapRelationType, MasterMapStatus } from "./masterMapTypes";

const MASTER_MAP_CACHE_KEY = "hub-sm-master-map-cache";
const MASTER_MAP_REQUEST_TIMEOUT_MS = 8000;

type MasterMapRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

type MasterMapNodeRow = {
  id: string;
  map_id: string;
  title: string;
  description: string | null;
  node_type: MasterMapNode["nodeType"] | null;
  icon_key: MasterMapNode["iconKey"] | null;
  module_key: string | null;
  status: MasterMapStatus | null;
  responsible: string | null;
  next_action: string | null;
  target_screen: MasterMapNode["targetScreen"] | null;
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

class MasterMapRemoteError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super(details || `MASTER_MAP_REMOTE_ERROR_${status}`);
    this.name = "MasterMapRemoteError";
  }
}

export async function loadMasterMapData(): Promise<MasterMapData> {
  if (!supabaseConfigured) {
    return getFallbackMasterMapData("Supabase não configurado. Exibindo mapa padrão somente para consulta.");
  }

  try {
    const [mapsResponse, nodesResponse, edgesResponse] = await Promise.all([
      masterMapRequest("hub_maps?select=*&is_active=eq.true&order=name.asc"),
      masterMapRequest("hub_map_nodes?select=*&is_active=eq.true"),
      masterMapRequest("hub_map_edges?select=*&is_active=eq.true"),
    ]);
    const maps = ((await mapsResponse.json()) as MasterMapRow[]).map(mapMasterMapRow);
    const nodes = ((await nodesResponse.json()) as MasterMapNodeRow[]).map(mapMasterMapNodeRow);
    const edges = ((await edgesResponse.json()) as MasterMapEdgeRow[]).map(mapMasterMapEdgeRow);
    const data = {
      maps: maps.length > 0 ? maps : clone(defaultMasterMaps),
      nodes: nodes.length > 0 ? nodes : clone(defaultMasterMapNodes),
      edges: edges.length > 0 ? edges : clone(defaultMasterMapEdges),
      remoteReadable: true,
      remoteEditable: Boolean(getSupabaseAccessToken()),
      message: maps.length > 0 ? "Mapa carregado do Supabase." : "Estrutura inicial do mapa carregada.",
    };
    saveLocalMasterMapCache(data);
    return data;
  } catch (error) {
    return getFallbackMasterMapData(isMasterMapRemoteProtectedError(error)
      ? "Mapa protegido por RLS. Entre como Admin/Tezzei para carregar do Supabase."
      : "Não foi possível carregar o mapa online agora. Exibindo mapa em cache.");
  }
}

export async function saveMasterMapNodeRemote(node: MasterMapNode) {
  ensureRemoteWriteReady();

  const response = await masterMapRequest(`hub_map_nodes?id=eq.${encodeURIComponent(node.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(masterMapNodeToRow(node)),
  });
  const rows = (await response.json()) as MasterMapNodeRow[];
  if (!rows[0]?.id) throw new Error("Não foi possível confirmar o nó salvo.");
  return mapMasterMapNodeRow(rows[0]);
}

export async function createMasterMapNodeRemote(node: MasterMapNode) {
  ensureRemoteWriteReady();

  const response = await masterMapRequest("hub_map_nodes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([masterMapNodeToRow(node)]),
  });
  const rows = (await response.json()) as MasterMapNodeRow[];
  if (!rows[0]?.id) throw new Error("Não foi possível confirmar o nó criado.");
  return mapMasterMapNodeRow(rows[0]);
}

export async function saveMasterMapEdgeRemote(edge: MasterMapEdge) {
  ensureRemoteWriteReady();

  const response = await masterMapRequest(`hub_map_edges?id=eq.${encodeURIComponent(edge.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(masterMapEdgeToRow(edge)),
  });
  const rows = (await response.json()) as MasterMapEdgeRow[];
  if (!rows[0]?.id) throw new Error("Não foi possível confirmar a conexão salva.");
  return mapMasterMapEdgeRow(rows[0]);
}

export async function createMasterMapEdgeRemote(edge: MasterMapEdge) {
  ensureRemoteWriteReady();

  const response = await masterMapRequest("hub_map_edges", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([masterMapEdgeToRow(edge)]),
  });
  const rows = (await response.json()) as MasterMapEdgeRow[];
  if (!rows[0]?.id) throw new Error("Não foi possível confirmar a conexão criada.");
  return mapMasterMapEdgeRow(rows[0]);
}

export function saveLocalMasterMapCache(data: Pick<MasterMapData, "maps" | "nodes" | "edges">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MASTER_MAP_CACHE_KEY, JSON.stringify({
    maps: data.maps,
    nodes: data.nodes,
    edges: data.edges,
  }));
}

export function createEmptyMasterMapNode(mapId: string, positionX: number, positionY: number, parentId?: string): MasterMapNode {
  return {
    id: createId(),
    mapId,
    title: parentId ? "Novo nó filho" : "Novo nó",
    description: "",
    nodeType: "task",
    iconKey: "settings",
    status: "NOT_STARTED",
    responsible: "",
    nextAction: "",
    targetScreen: undefined,
    positionX,
    positionY,
    isCollapsed: false,
    isActive: true,
    metadata: { parentId },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createMasterMapEdgeDraft(mapId: string, sourceNodeId: string, targetNodeId: string, relationType: MasterMapRelationType = "CONNECTS_WITH"): MasterMapEdge {
  return {
    id: createId(),
    mapId,
    sourceNodeId,
    targetNodeId,
    relationType,
    label: "",
    isActive: true,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function masterMapRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MASTER_MAP_REQUEST_TIMEOUT_MS);
  const accessToken = getSupabaseAccessToken();

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) throw new MasterMapRemoteError(response.status, await response.text());
    return response;
  }).catch((error: unknown) => {
    if (error instanceof MasterMapRemoteError) throw error;
    throw new MasterMapRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function ensureRemoteWriteReady() {
  if (!supabaseConfigured) throw new Error("Supabase não configurado para salvar o Mapa Mestre.");
  if (!getSupabaseAccessToken()) throw new Error("Sessão Supabase Auth de Admin não encontrada para salvar o Mapa Mestre.");
}

function getFallbackMasterMapData(message: string): MasterMapData {
  const cached = getLocalMasterMapCache();
  return {
    maps: cached?.maps ?? clone(defaultMasterMaps),
    nodes: cached?.nodes ?? clone(defaultMasterMapNodes),
    edges: cached?.edges ?? clone(defaultMasterMapEdges),
    remoteReadable: false,
    remoteEditable: false,
    message,
  };
}

function getLocalMasterMapCache(): Pick<MasterMapData, "maps" | "nodes" | "edges"> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(MASTER_MAP_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Pick<MasterMapData, "maps" | "nodes" | "edges">;
    if (!Array.isArray(parsed.maps) || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mapMasterMapRow(row: MasterMapRow): MasterMap {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
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
    relationType: row.relation_type ?? "CONNECTS_WITH",
    label: row.label ?? undefined,
    isActive: row.is_active ?? true,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function masterMapNodeToRow(node: MasterMapNode) {
  return {
    id: node.id,
    map_id: node.mapId,
    title: node.title.trim() || "Sem título",
    description: nullableText(node.description),
    node_type: node.nodeType,
    icon_key: node.iconKey,
    module_key: nullableText(node.moduleKey),
    status: node.status,
    responsible: nullableText(node.responsible),
    next_action: nullableText(node.nextAction),
    target_screen: nullableText(node.targetScreen),
    position_x: node.positionX,
    position_y: node.positionY,
    is_collapsed: node.isCollapsed,
    is_active: node.isActive,
    metadata: node.metadata ?? {},
  };
}

function masterMapEdgeToRow(edge: MasterMapEdge) {
  return {
    id: edge.id,
    map_id: edge.mapId,
    source_node_id: edge.sourceNodeId,
    target_node_id: edge.targetNodeId,
    relation_type: edge.relationType,
    label: nullableText(edge.label),
    is_active: edge.isActive,
    metadata: edge.metadata ?? {},
  };
}

function isMasterMapRemoteProtectedError(error: unknown) {
  if (!(error instanceof MasterMapRemoteError)) return false;
  const details = error.details.toLowerCase();
  return [401, 403].includes(error.status)
    || details.includes("42501")
    || details.includes("permission denied")
    || details.includes("row-level security")
    || details.includes("rls");
}

function nullableText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toNumber(value: number | string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
