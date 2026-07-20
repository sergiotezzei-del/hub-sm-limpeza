import type ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import type { MasterMapNode } from "../masterMapTypes";
import {
  masterMapSpacingPresets,
  type MasterMapLayoutInput,
  type MasterMapLayoutResult,
  type MasterMapNodeDimension,
} from "./masterMapLayoutTypes";

let elkInstancePromise: Promise<InstanceType<typeof ELK>> | null = null;

export async function calculateMasterMapElkLayout(input: MasterMapLayoutInput): Promise<MasterMapLayoutResult> {
  const affectedNodes = getAffectedNodes(input);
  if (affectedNodes.length === 0) {
    return { positions: [], affectedNodeIds: new Set() };
  }

  const spacing = masterMapSpacingPresets[input.preferences.spacing];
  const direction = input.preferences.layoutMode === "vertical" ? "DOWN" : "RIGHT";
  const graph: ElkNode = {
    id: "master-map-layout-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": String(spacing.nodeGap),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing.layerGap),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(spacing.edgeGap),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": `[top=${spacing.branchMargin},left=${spacing.branchMargin},bottom=${spacing.branchMargin},right=${spacing.branchMargin}]`,
    },
    children: affectedNodes.map((node) => {
      const dimension = getDimension(node.id, input.dimensions, input.preferences.nodeDensity);
      return {
        id: node.id,
        width: dimension.width,
        height: dimension.height,
      };
    }),
    edges: input.edges
      .filter((edge) => (
        edge.isActive
        && edge.relationType === "BELONGS_TO"
        && input.affectedNodeIds.has(edge.sourceNodeId)
        && input.affectedNodeIds.has(edge.targetNodeId)
      ))
      .map((edge): ElkExtendedEdge => ({
        id: edge.id,
        sources: [edge.sourceNodeId],
        targets: [edge.targetNodeId],
      })),
  };

  const elk = await getElkInstance();
  const layout = await elk.layout(graph);
  const rawPositions = (layout.children ?? []).map((child) => ({
    id: child.id,
    positionX: child.x ?? 0,
    positionY: child.y ?? 0,
  }));

  return {
    positions: offsetLayoutToCurrentLocation(rawPositions, affectedNodes, input.anchorNodeId),
    affectedNodeIds: new Set(affectedNodes.map((node) => node.id)),
  };
}

async function getElkInstance() {
  if (!elkInstancePromise) {
    elkInstancePromise = import("elkjs/lib/elk.bundled.js").then(({ default: ElkConstructor }) => new ElkConstructor());
  }
  return elkInstancePromise;
}

function getAffectedNodes(input: MasterMapLayoutInput) {
  return input.nodes.filter((node) => node.isActive && input.affectedNodeIds.has(node.id));
}

function offsetLayoutToCurrentLocation(
  positions: Array<{ id: string; positionX: number; positionY: number }>,
  currentNodes: MasterMapNode[],
  anchorNodeId?: string,
) {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const anchorPosition = anchorNodeId
    ? positions.find((position) => position.id === anchorNodeId)
    : null;
  const anchorNode = anchorNodeId ? currentById.get(anchorNodeId) : null;

  if (anchorPosition && anchorNode) {
    const deltaX = anchorNode.positionX - anchorPosition.positionX;
    const deltaY = anchorNode.positionY - anchorPosition.positionY;
    return positions.map((position) => ({
      id: position.id,
      positionX: Math.round(position.positionX + deltaX),
      positionY: Math.round(position.positionY + deltaY),
    }));
  }

  const minCurrentX = Math.min(...currentNodes.map((node) => node.positionX));
  const minCurrentY = Math.min(...currentNodes.map((node) => node.positionY));
  const minLayoutX = Math.min(...positions.map((position) => position.positionX));
  const minLayoutY = Math.min(...positions.map((position) => position.positionY));
  const deltaX = minCurrentX - minLayoutX;
  const deltaY = minCurrentY - minLayoutY;

  return positions.map((position) => ({
    id: position.id,
    positionX: Math.round(position.positionX + deltaX),
    positionY: Math.round(position.positionY + deltaY),
  }));
}

export function getDimension(
  nodeId: string,
  dimensions: Map<string, MasterMapNodeDimension>,
  density: "compact" | "detailed",
) {
  const measured = dimensions.get(nodeId);
  if (measured && measured.width > 0 && measured.height > 0) return measured;
  return density === "compact"
    ? { id: nodeId, width: 226, height: 104 }
    : { id: nodeId, width: 270, height: 178 };
}
