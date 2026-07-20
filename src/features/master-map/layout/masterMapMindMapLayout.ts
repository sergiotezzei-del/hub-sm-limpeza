import { buildMasterMapHierarchy } from "../graph/masterMapGraphUtils";
import type { MasterMapNode } from "../masterMapTypes";
import { getDimension } from "./masterMapElkLayout";
import {
  masterMapSpacingPresets,
  type MasterMapLayoutInput,
  type MasterMapLayoutResult,
  type MasterMapPositionPatch,
} from "./masterMapLayoutTypes";

export function calculateMasterMapMindMapLayout(input: MasterMapLayoutInput): MasterMapLayoutResult {
  const affectedNodes = input.nodes.filter((node) => node.isActive && input.affectedNodeIds.has(node.id));
  if (affectedNodes.length === 0) return { positions: [], affectedNodeIds: new Set() };

  const spacing = masterMapSpacingPresets[input.preferences.spacing];
  const hierarchy = buildMasterMapHierarchy(affectedNodes, input.edges);
  const nodeById = new Map(affectedNodes.map((node) => [node.id, node]));
  const roots = getMindMapRoots(affectedNodes, hierarchy.rootIds, input.anchorNodeId);
  const positions: MasterMapPositionPatch[] = [];
  let nextRootY = Math.min(...affectedNodes.map((node) => node.positionY));

  roots.forEach((root, rootIndex) => {
    const rootDimension = getDimension(root.id, input.dimensions, input.preferences.nodeDensity);
    const rootX = rootIndex === 0 ? root.positionX : Math.min(...affectedNodes.map((node) => node.positionX));
    const rootY = rootIndex === 0 ? root.positionY : nextRootY;
    positions.push({ id: root.id, positionX: Math.round(rootX), positionY: Math.round(rootY) });

    const children = (hierarchy.childrenByParent.get(root.id) ?? [])
      .map((childId) => nodeById.get(childId))
      .filter((node): node is MasterMapNode => Boolean(node));
    const leftChildren = children.filter((_, index) => index % 2 === 1);
    const rightChildren = children.filter((_, index) => index % 2 === 0);

    placeChildrenGroup({
      children: rightChildren,
      side: 1,
      parentCenterX: rootX + rootDimension.width / 2,
      parentCenterY: rootY + rootDimension.height / 2,
      nodeById,
      childrenByParent: hierarchy.childrenByParent,
      input,
      positions,
    });

    placeChildrenGroup({
      children: leftChildren,
      side: -1,
      parentCenterX: rootX + rootDimension.width / 2,
      parentCenterY: rootY + rootDimension.height / 2,
      nodeById,
      childrenByParent: hierarchy.childrenByParent,
      input,
      positions,
    });

    const rootSubtreeHeight = Math.max(
      rootDimension.height,
      getGroupHeight(children, nodeById, hierarchy.childrenByParent, input),
    );
    nextRootY = rootY + rootSubtreeHeight + spacing.branchMargin;
  });

  return {
    positions,
    affectedNodeIds: new Set(positions.map((position) => position.id)),
  };
}

function getMindMapRoots(nodes: MasterMapNode[], rootIds: string[], anchorNodeId?: string) {
  if (anchorNodeId) {
    const anchor = nodes.find((node) => node.id === anchorNodeId);
    if (anchor) return [anchor];
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const roots = rootIds.map((rootId) => nodeById.get(rootId)).filter((node): node is MasterMapNode => Boolean(node));
  return roots.length ? roots : [nodes[0]];
}

function placeChildrenGroup({
  children,
  side,
  parentCenterX,
  parentCenterY,
  nodeById,
  childrenByParent,
  input,
  positions,
}: {
  children: MasterMapNode[];
  side: 1 | -1;
  parentCenterX: number;
  parentCenterY: number;
  nodeById: Map<string, MasterMapNode>;
  childrenByParent: Map<string, string[]>;
  input: MasterMapLayoutInput;
  positions: MasterMapPositionPatch[];
}) {
  if (children.length === 0) return;
  const spacing = masterMapSpacingPresets[input.preferences.spacing];
  const totalHeight = getGroupHeight(children, nodeById, childrenByParent, input);
  let cursorY = parentCenterY - totalHeight / 2;

  children.forEach((child) => {
    const dimension = getDimension(child.id, input.dimensions, input.preferences.nodeDensity);
    const subtreeHeight = getSubtreeHeight(child.id, nodeById, childrenByParent, input);
    const childY = cursorY + subtreeHeight / 2 - dimension.height / 2;
    const childX = side === 1
      ? parentCenterX + spacing.layerGap
      : parentCenterX - spacing.layerGap - dimension.width;

    positions.push({
      id: child.id,
      positionX: Math.round(childX),
      positionY: Math.round(childY),
    });

    const grandChildren = (childrenByParent.get(child.id) ?? [])
      .map((childId) => nodeById.get(childId))
      .filter((node): node is MasterMapNode => Boolean(node));

    placeChildrenGroup({
      children: grandChildren,
      side,
      parentCenterX: childX + dimension.width / 2,
      parentCenterY: childY + dimension.height / 2,
      nodeById,
      childrenByParent,
      input,
      positions,
    });

    cursorY += subtreeHeight + spacing.nodeGap;
  });
}

function getGroupHeight(
  nodes: MasterMapNode[],
  nodeById: Map<string, MasterMapNode>,
  childrenByParent: Map<string, string[]>,
  input: MasterMapLayoutInput,
) {
  const spacing = masterMapSpacingPresets[input.preferences.spacing];
  if (nodes.length === 0) return 0;
  return nodes.reduce((total, node, index) => {
    const gap = index === 0 ? 0 : spacing.nodeGap;
    return total + gap + getSubtreeHeight(node.id, nodeById, childrenByParent, input);
  }, 0);
}

function getSubtreeHeight(
  nodeId: string,
  nodeById: Map<string, MasterMapNode>,
  childrenByParent: Map<string, string[]>,
  input: MasterMapLayoutInput,
): number {
  const node = nodeById.get(nodeId);
  if (!node) return 0;
  const dimension = getDimension(nodeId, input.dimensions, input.preferences.nodeDensity);
  const children = (childrenByParent.get(nodeId) ?? [])
    .map((childId) => nodeById.get(childId))
    .filter((child): child is MasterMapNode => Boolean(child));
  const childrenHeight = getGroupHeight(children, nodeById, childrenByParent, input);
  return Math.max(dimension.height, childrenHeight);
}
