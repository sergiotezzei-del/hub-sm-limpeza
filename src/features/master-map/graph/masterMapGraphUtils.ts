import type { DynamicPagePriority } from "../dynamicPageTypes";
import type { MasterMapDestinationType, MasterMapEdge, MasterMapNode, MasterMapNodeType, MasterMapRelationType, MasterMapStatus } from "../masterMapTypes";
import type { DynamicPageSummary, MasterMapFilterState } from "../types/masterMapNavigationTypes";

export const masterMapStatusLabels: Record<MasterMapStatus, string> = {
  NOT_STARTED: "Nao iniciado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluido",
};

export const masterMapNodeTypeLabels: Record<MasterMapNodeType, string> = {
  root: "Raiz",
  module: "Modulo",
  submodule: "Submodulo",
  project: "Projeto",
  task: "Tarefa",
  physical: "Fisico",
  integration: "Integracao",
  milestone: "Marco",
};

export const masterMapDestinationLabels: Record<MasterMapDestinationType, string> = {
  NONE: "Apenas detalhes",
  DYNAMIC_PAGE: "Pagina dinamica",
  EXISTING_SCREEN: "Tela existente",
  EXTERNAL_URL: "Link externo",
  PLANNED_MODULE: "Modulo planejado",
};

export const masterMapRelationLabels: Record<MasterMapRelationType, string> = {
  BELONGS_TO: "Pertence a",
  DEPENDS_ON: "Depende de",
  CONNECTS_WITH: "Conecta com",
  TRIGGERS: "Aciona",
  INTEGRATES_WITH: "Integra com",
};

export const dynamicPagePriorityLabelsShort: Record<DynamicPagePriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export type MasterMapHierarchy = {
  rootIds: string[];
  orphanIds: string[];
  childrenByParent: Map<string, string[]>;
  parentByChild: Map<string, string>;
};

export type MasterMapImpactGraph = {
  upstream: Array<{ node: MasterMapNode; edge: MasterMapEdge }>;
  downstream: Array<{ node: MasterMapNode; edge: MasterMapEdge }>;
};

export type MasterMapDirectorStats = {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  overdue: number;
  withoutResponsible: number;
  withoutNextAction: number;
};

const operationalRelations: MasterMapRelationType[] = ["DEPENDS_ON", "TRIGGERS", "INTEGRATES_WITH", "CONNECTS_WITH"];

export function normalizeMasterMapText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function createPageSummaryMap(pageSummaries: DynamicPageSummary[]) {
  return new Map(pageSummaries.map((summary) => [summary.nodeId, summary]));
}

export function nodeMatchesMasterMapSearch(node: MasterMapNode, query: string, pageSummary?: DynamicPageSummary) {
  const normalizedQuery = normalizeMasterMapText(query);
  if (!normalizedQuery) return true;
  const haystack = [
    node.title,
    node.description,
    node.responsible ?? "",
    node.nextAction ?? "",
    masterMapNodeTypeLabels[node.nodeType],
    masterMapDestinationLabels[node.destinationType],
    masterMapStatusLabels[node.status],
    pageSummary?.responsible ?? "",
    pageSummary?.nextAction ?? "",
    pageSummary ? dynamicPagePriorityLabelsShort[pageSummary.priority] : "",
  ].map(normalizeMasterMapText).join(" ");

  return haystack.includes(normalizedQuery);
}

export function nodeMatchesMasterMapFilters(node: MasterMapNode, filters: MasterMapFilterState, pageSummary?: DynamicPageSummary) {
  if (filters.onlyActive && !node.isActive) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(node.status)) return false;
  if (filters.nodeTypes.length > 0 && !filters.nodeTypes.includes(node.nodeType)) return false;
  if (filters.destinationTypes.length > 0 && !filters.destinationTypes.includes(node.destinationType)) return false;

  if (filters.withDynamicPage && node.destinationType !== "DYNAMIC_PAGE") return false;
  if (filters.withoutDynamicPage && node.destinationType === "DYNAMIC_PAGE") return false;
  if (filters.highPriority && pageSummary?.priority !== "HIGH") return false;
  if (filters.overdue && !isMasterMapPageOverdue(pageSummary)) return false;
  if (filters.withoutResponsible && Boolean(getMasterMapResponsible(node, pageSummary))) return false;
  if (filters.withoutNextAction && Boolean(getMasterMapNextAction(node, pageSummary))) return false;

  const responsibleFilter = normalizeMasterMapText(filters.responsible);
  if (responsibleFilter && !normalizeMasterMapText(getMasterMapResponsible(node, pageSummary)).includes(responsibleFilter)) return false;

  return true;
}

export function getFilteredMasterMapNodes(nodes: MasterMapNode[], filters: MasterMapFilterState, query: string, pageSummaries: DynamicPageSummary[]) {
  const pageSummaryByNode = createPageSummaryMap(pageSummaries);
  return nodes.filter((node) => (
    nodeMatchesMasterMapFilters(node, filters, pageSummaryByNode.get(node.id))
    && nodeMatchesMasterMapSearch(node, query, pageSummaryByNode.get(node.id))
  ));
}

export function buildMasterMapHierarchy(nodes: MasterMapNode[], edges: MasterMapEdge[]): MasterMapHierarchy {
  const activeNodeIds = new Set(nodes.filter((node) => node.isActive).map((node) => node.id));
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const getNodeSortValue = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    const outlineOrder = Number(node?.metadata.outlineOrder);
    return Number.isFinite(outlineOrder) ? outlineOrder : nodeOrder.get(nodeId) ?? 0;
  };
  const childrenByParent = new Map<string, string[]>();
  const parentByChild = new Map<string, string>();

  edges
    .filter((edge) => edge.isActive && edge.relationType === "BELONGS_TO" && activeNodeIds.has(edge.sourceNodeId) && activeNodeIds.has(edge.targetNodeId))
    .forEach((edge) => {
      if (!parentByChild.has(edge.targetNodeId)) parentByChild.set(edge.targetNodeId, edge.sourceNodeId);
      childrenByParent.set(edge.sourceNodeId, [...(childrenByParent.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    });

  childrenByParent.forEach((childIds, parentId) => {
    childrenByParent.set(parentId, childIds.sort((a, b) => getNodeSortValue(a) - getNodeSortValue(b)));
  });

  const rootIds = nodes
    .filter((node) => node.isActive && !parentByChild.has(node.id))
    .filter((node) => node.nodeType === "root" || (childrenByParent.get(node.id)?.length ?? 0) > 0)
    .sort((a, b) => getNodeSortValue(a.id) - getNodeSortValue(b.id))
    .map((node) => node.id);

  const rootIdSet = new Set(rootIds);
  const orphanIds = nodes
    .filter((node) => node.isActive && !parentByChild.has(node.id) && !rootIdSet.has(node.id))
    .sort((a, b) => getNodeSortValue(a.id) - getNodeSortValue(b.id))
    .map((node) => node.id);

  return { rootIds, orphanIds, childrenByParent, parentByChild };
}

export function getMasterMapAncestors(nodeId: string, nodes: MasterMapNode[], edges: MasterMapEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const { parentByChild } = buildMasterMapHierarchy(nodes, edges);
  const ancestors: MasterMapNode[] = [];
  const seen = new Set<string>();
  let currentId = parentByChild.get(nodeId);

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const node = nodeById.get(currentId);
    if (node) ancestors.unshift(node);
    currentId = parentByChild.get(currentId);
  }

  return ancestors;
}

export function getMasterMapDescendants(nodeId: string, nodes: MasterMapNode[], edges: MasterMapEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const { childrenByParent } = buildMasterMapHierarchy(nodes, edges);
  const descendants: MasterMapNode[] = [];
  const seen = new Set<string>();

  function visit(currentId: string) {
    (childrenByParent.get(currentId) ?? []).forEach((childId) => {
      if (seen.has(childId)) return;
      seen.add(childId);
      const child = nodeById.get(childId);
      if (child) descendants.push(child);
      visit(childId);
    });
  }

  visit(nodeId);
  return descendants;
}

export function getMasterMapFocusNodeIds(nodeId: string, nodes: MasterMapNode[], edges: MasterMapEdge[]) {
  const focusIds = new Set<string>([nodeId]);
  getMasterMapAncestors(nodeId, nodes, edges).forEach((node) => focusIds.add(node.id));
  getMasterMapDescendants(nodeId, nodes, edges).forEach((node) => focusIds.add(node.id));
  edges
    .filter((edge) => edge.isActive && (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId))
    .forEach((edge) => {
      focusIds.add(edge.sourceNodeId);
      focusIds.add(edge.targetNodeId);
    });
  return focusIds;
}

export function getMasterMapImpactGraph(nodeId: string, nodes: MasterMapNode[], edges: MasterMapEdge[]): MasterMapImpactGraph {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const operationalEdges = edges.filter((edge) => edge.isActive && operationalRelations.includes(edge.relationType));

  return {
    upstream: collectOperationalImpact(nodeId, nodeById, operationalEdges, "upstream"),
    downstream: collectOperationalImpact(nodeId, nodeById, operationalEdges, "downstream"),
  };
}

function collectOperationalImpact(
  startNodeId: string,
  nodeById: Map<string, MasterMapNode>,
  edges: MasterMapEdge[],
  direction: "upstream" | "downstream",
): Array<{ node: MasterMapNode; edge: MasterMapEdge }> {
  const result: Array<{ node: MasterMapNode; edge: MasterMapEdge }> = [];
  const seen = new Set<string>([startNodeId]);
  const queue = [startNodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift() as string;
    edges.forEach((edge) => {
      const matches = direction === "upstream" ? edge.targetNodeId === currentNodeId : edge.sourceNodeId === currentNodeId;
      if (!matches) return;
      const nextNodeId = direction === "upstream" ? edge.sourceNodeId : edge.targetNodeId;
      if (seen.has(nextNodeId)) return;
      const node = nodeById.get(nextNodeId);
      if (!node) return;
      seen.add(nextNodeId);
      result.push({ node, edge });
      queue.push(nextNodeId);
    });
  }

  return result;
}

export function getMasterMapResponsible(node: MasterMapNode, pageSummary?: DynamicPageSummary) {
  return (pageSummary?.responsible || node.responsible || "").trim();
}

export function getMasterMapNextAction(node: MasterMapNode, pageSummary?: DynamicPageSummary) {
  return (pageSummary?.nextAction || node.nextAction || "").trim();
}

export function isMasterMapPageOverdue(pageSummary?: DynamicPageSummary, today = new Date()) {
  if (!pageSummary?.dueDate || pageSummary.status === "COMPLETED") return false;
  const dueDate = new Date(`${pageSummary.dueDate}T23:59:59`);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < today.getTime();
}

export function getMasterMapDirectorStats(nodes: MasterMapNode[], pageSummaries: DynamicPageSummary[]): MasterMapDirectorStats {
  const pageSummaryByNode = createPageSummaryMap(pageSummaries);
  return nodes.reduce<MasterMapDirectorStats>((stats, node) => {
    const pageSummary = pageSummaryByNode.get(node.id);
    stats.total += 1;
    if (node.status === "NOT_STARTED") stats.notStarted += 1;
    if (node.status === "IN_PROGRESS") stats.inProgress += 1;
    if (node.status === "COMPLETED") stats.completed += 1;
    if (isMasterMapPageOverdue(pageSummary)) stats.overdue += 1;
    if (!getMasterMapResponsible(node, pageSummary)) stats.withoutResponsible += 1;
    if (!getMasterMapNextAction(node, pageSummary)) stats.withoutNextAction += 1;
    return stats;
  }, { total: 0, notStarted: 0, inProgress: 0, completed: 0, overdue: 0, withoutResponsible: 0, withoutNextAction: 0 });
}

export function getMasterMapDirectorNodes(nodes: MasterMapNode[], pageSummaries: DynamicPageSummary[], attentionNodeIds: Set<string>) {
  const pageSummaryByNode = createPageSummaryMap(pageSummaries);
  return nodes.filter((node) => {
    const pageSummary = pageSummaryByNode.get(node.id);
    return ["root", "module", "project", "milestone"].includes(node.nodeType)
      || pageSummary?.priority === "HIGH"
      || attentionNodeIds.has(node.id);
  });
}
