import type { MasterMapEdge, MasterMapNode } from "./masterMapTypes";

export function getVisibleMasterMapGraph(nodes: MasterMapNode[], edges: MasterMapEdge[]) {
  const activeNodes = nodes.filter((node) => node.isActive);
  const activeEdges = edges.filter((edge) => edge.isActive);
  const childrenByParent = new Map<string, string[]>();

  activeEdges
    .filter((edge) => edge.relationType === "BELONGS_TO")
    .forEach((edge) => {
      childrenByParent.set(edge.sourceNodeId, [...(childrenByParent.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    });

  const hiddenNodeIds = new Set<string>();

  activeNodes.forEach((node) => {
    if (!node.isCollapsed) return;
    collectDescendants(node.id, childrenByParent, hiddenNodeIds);
  });

  const visibleNodes = activeNodes.filter((node) => !hiddenNodeIds.has(node.id));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = activeEdges.filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId));

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    childrenByParent,
  };
}

export function getMasterMapChildrenCount(nodeId: string, edges: MasterMapEdge[]) {
  return edges.filter((edge) => edge.isActive && edge.relationType === "BELONGS_TO" && edge.sourceNodeId === nodeId).length;
}

export function getMasterMapNodeDependencies(node: MasterMapNode, nodes: MasterMapNode[], edges: MasterMapEdge[]) {
  const dependencyIds = new Set([
    ...(node.metadata.dependencies ?? []),
    ...edges
      .filter((edge) => edge.isActive && edge.relationType === "DEPENDS_ON" && edge.targetNodeId === node.id)
      .map((edge) => edge.sourceNodeId),
  ]);

  return [...dependencyIds]
    .map((dependencyId) => nodes.find((current) => current.id === dependencyId))
    .filter((current): current is MasterMapNode => Boolean(current));
}

function collectDescendants(nodeId: string, childrenByParent: Map<string, string[]>, hiddenNodeIds: Set<string>) {
  const children = childrenByParent.get(nodeId) ?? [];
  children.forEach((childId) => {
    hiddenNodeIds.add(childId);
    collectDescendants(childId, childrenByParent, hiddenNodeIds);
  });
}
