import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  ConnectionLineType,
  MarkerType,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { MasterMapNodeCard, type MasterMapFlowNode } from "./MasterMapNode";
import type { MasterMapConnectionMode, MasterMapHandleVariant, MasterMapLayoutMode, MasterMapNodeDensity } from "./layout/masterMapLayoutTypes";
import { getMasterMapChildrenCount, getVisibleMasterMapGraph } from "./masterMapLayout";
import type { MasterMapEdge, MasterMapNode, MasterMapRelationType, MasterMapTargetScreen } from "./masterMapTypes";

const nodeTypes = {
  masterMapNode: MasterMapNodeCard,
};

const emptyNodeIdSet = new Set<string>();

const relationLabels: Record<MasterMapRelationType, string> = {
  BELONGS_TO: "Pertence a",
  DEPENDS_ON: "Depende de",
  CONNECTS_WITH: "Conecta com",
  TRIGGERS: "Aciona",
  INTEGRATES_WITH: "Integra com",
};

export function MasterMapCanvas({
  nodes,
  edges,
  editMode,
  nodeDensity,
  connectionMode,
  layoutMode,
  selectedNodeId,
  selectedEdgeId,
  highlightedNodeIds = emptyNodeIdSet,
  dimmedNodeIds = emptyNodeIdSet,
  layoutPreviewNodeIds = emptyNodeIdSet,
  forceVisibleNodeIds = emptyNodeIdSet,
  onInit,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onCreateConnection,
  onOpenNodeDetails,
  onOpenModule,
  onOpenDynamicPage,
  onOpenExternalUrl,
  onToggleCollapse,
}: {
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  editMode: boolean;
  nodeDensity: MasterMapNodeDensity;
  connectionMode: MasterMapConnectionMode;
  layoutMode: MasterMapLayoutMode;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  highlightedNodeIds?: Set<string>;
  dimmedNodeIds?: Set<string>;
  layoutPreviewNodeIds?: Set<string>;
  forceVisibleNodeIds?: Set<string>;
  onInit: (instance: ReactFlowInstance) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onMoveNode: (nodeId: string, positionX: number, positionY: number) => void;
  onCreateConnection: (sourceNodeId: string, targetNodeId: string) => void;
  onOpenNodeDetails: (nodeId: string) => void;
  onOpenModule: (targetScreen: MasterMapTargetScreen) => void;
  onOpenDynamicPage: (pageId: string) => void;
  onOpenExternalUrl: (url: string) => void;
  onToggleCollapse: (nodeId: string) => void;
}) {
  const visibleGraph = useMemo(() => getVisibleMasterMapGraph(nodes, edges, forceVisibleNodeIds), [edges, forceVisibleNodeIds, nodes]);
  const visibleEdges = useMemo(() => filterEdgesByConnectionMode(visibleGraph.edges, connectionMode), [connectionMode, visibleGraph.edges]);
  const [isCompactViewport, setIsCompactViewport] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  ));
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const fitViewOptions = useMemo(() => ({
    padding: isCompactViewport ? 0.08 : 0.24,
    minZoom: isCompactViewport ? 0.5 : 0.25,
    maxZoom: isCompactViewport ? 0.9 : 1,
    duration: 220,
  }), [isCompactViewport]);
  const flowNodes = useMemo<Node[]>(() => visibleGraph.nodes.map((node) => ({
    id: node.id,
    type: "masterMapNode",
    position: { x: node.positionX, y: node.positionY },
    selected: node.id === selectedNodeId,
    data: {
      node,
      childrenCount: getMasterMapChildrenCount(node.id, edges),
      editMode,
      density: nodeDensity,
      handleVariant: getHandleVariantForNode(node, visibleGraph.nodes, layoutMode),
      dimmed: dimmedNodeIds.has(node.id),
      highlighted: highlightedNodeIds.has(node.id) || layoutPreviewNodeIds.has(node.id),
      onOpenDetails: onOpenNodeDetails,
      onOpenModule,
      onOpenDynamicPage,
      onOpenExternalUrl,
      onToggleCollapse,
    },
  } satisfies MasterMapFlowNode)), [dimmedNodeIds, edges, editMode, highlightedNodeIds, layoutMode, layoutPreviewNodeIds, nodeDensity, onOpenDynamicPage, onOpenExternalUrl, onOpenModule, onOpenNodeDetails, onToggleCollapse, selectedNodeId, visibleGraph.nodes]);
  const flowEdges = useMemo<Edge[]>(() => visibleEdges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: getEdgeLabel(edge, selectedEdgeId, connectionMode),
    type: "smoothstep",
    selected: edge.id === selectedEdgeId,
    animated: edge.relationType === "TRIGGERS" || edge.relationType === "INTEGRATES_WITH",
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `master-map-edge master-map-edge-${edge.relationType.toLowerCase().replace(/_/g, "-")}`,
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 6,
  })), [connectionMode, selectedEdgeId, visibleEdges]);
  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState(flowNodes);
  const [reactFlowEdges, setReactFlowEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => setReactFlowNodes(flowNodes), [flowNodes, setReactFlowNodes]);
  useEffect(() => setReactFlowEdges(flowEdges), [flowEdges, setReactFlowEdges]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateViewportMode = () => setIsCompactViewport(mediaQuery.matches);
    updateViewportMode();
    mediaQuery.addEventListener("change", updateViewportMode);
    return () => mediaQuery.removeEventListener("change", updateViewportMode);
  }, []);
  useEffect(() => {
    if (!flowInstance || !visibleGraph.nodes.length) return;
    window.setTimeout(() => {
      void flowInstance.fitView(fitViewOptions);
    }, 80);
  }, [fitViewOptions, flowInstance, visibleGraph.nodes.length]);

  function handleConnect(connection: Connection) {
    if (!editMode || !connection.source || !connection.target || connection.source === connection.target) return;
    onCreateConnection(connection.source, connection.target);
  }

  function handleNodeClick(flowNode: Node) {
    const mapNode = (flowNode as MasterMapFlowNode).data.node;
    if (nodeDensity !== "compact" && !editMode && mapNode.destinationType === "DYNAMIC_PAGE" && mapNode.dynamicPageId) {
      onOpenDynamicPage(mapNode.dynamicPageId);
      return;
    }
    onSelectNode(mapNode.id);
  }

  function handleNodeDoubleClick(flowNode: Node) {
    const mapNode = (flowNode as MasterMapFlowNode).data.node;
    if (mapNode.destinationType === "DYNAMIC_PAGE" && mapNode.dynamicPageId) {
      onOpenDynamicPage(mapNode.dynamicPageId);
      return;
    }
    onOpenNodeDetails(mapNode.id);
  }

  function handleInit(instance: ReactFlowInstance) {
    setFlowInstance(instance);
    onInit(instance);
  }

  return (
    <section className="master-map-canvas" aria-label="Diagrama do Mapa Mestre">
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        nodeTypes={nodeTypes}
        onInit={handleInit}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => handleNodeClick(node)}
        onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node)}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onNodeDragStop={(_, node) => onMoveNode(node.id, node.position.x, node.position.y)}
        onConnect={handleConnect}
        nodesDraggable={editMode}
        nodesConnectable={editMode}
        elementsSelectable
        panOnDrag
        zoomOnPinch
        zoomOnScroll
        minZoom={isCompactViewport ? 0.5 : 0.25}
        maxZoom={1.7}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={fitViewOptions}
      >
        <Background color="#d8dee8" gap={24} size={1} />
      </ReactFlow>
    </section>
  );
}

function filterEdgesByConnectionMode(edges: MasterMapEdge[], connectionMode: MasterMapConnectionMode) {
  if (connectionMode === "hierarchy") return edges.filter((edge) => edge.relationType === "BELONGS_TO");
  if (connectionMode === "operational") return edges.filter((edge) => edge.relationType !== "BELONGS_TO");
  return edges;
}

function getEdgeLabel(edge: MasterMapEdge, selectedEdgeId: string | undefined, connectionMode: MasterMapConnectionMode) {
  if (edge.label?.trim()) return edge.label;
  if (edge.relationType === "BELONGS_TO" && edge.id !== selectedEdgeId) return undefined;
  if (connectionMode === "hierarchy" && edge.id !== selectedEdgeId) return undefined;
  return relationLabels[edge.relationType];
}

function getHandleVariantForNode(
  node: MasterMapNode,
  nodes: MasterMapNode[],
  layoutMode: MasterMapLayoutMode,
): MasterMapHandleVariant {
  if (layoutMode === "vertical") return "vertical";
  if (layoutMode !== "mind") return "horizontal";
  const root = nodes.find((current) => current.nodeType === "root") ?? nodes[0];
  if (!root) return "horizontal";
  return node.positionX < root.positionX ? "mind-left" : "mind-right";
}
