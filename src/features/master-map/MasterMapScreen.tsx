import { useEffect, useMemo, useRef, useState } from "react";
import { type ReactFlowInstance } from "@xyflow/react";
import { AppIcon } from "../../components/AppIcon";
import { DynamicPageScreen } from "./DynamicPageScreen";
import { MasterMapCreateNodeDialog, type MasterMapCreateNodeDraft } from "./MasterMapCreateNodeDialog";
import { MasterMapCanvas } from "./MasterMapCanvas";
import { MasterMapDetails } from "./MasterMapDetails";
import { MasterMapLegend } from "./MasterMapLegend";
import { MasterMapAttentionPanel } from "./attention/MasterMapAttentionPanel";
import { getMasterMapAttentionItems } from "./attention/masterMapAttention";
import { buildMasterMapHierarchy, getFilteredMasterMapNodes, getMasterMapDescendants, masterMapStatusLabels } from "./graph/masterMapGraphUtils";
import { MasterMapLayoutPanel } from "./layout/MasterMapLayoutPanel";
import { calculateMasterMapLayout } from "./layout/masterMapLayoutWorker";
import { detectMasterMapLayoutCollisions, mergeMasterMapPositions } from "./layout/masterMapLayoutValidation";
import {
  masterMapSpacingPresets,
  defaultMasterMapLayoutPreferences,
  defaultMobileMasterMapLayoutPreferences,
  type MasterMapAlignmentAction,
  type MasterMapLayoutPreferences,
  type MasterMapNodeDimension,
  type MasterMapPositionPatch,
} from "./layout/masterMapLayoutTypes";
import {
  defaultMasterMapVisualStyle,
  getMasterMapNodeWidth,
  mergeMasterMapVisualStylePatch,
  normalizeMasterMapVisualStyle,
} from "./layout/masterMapVisualStyle";
import { MasterMapFilters } from "./navigation/MasterMapFilters";
import { MasterMapNavigationBar } from "./navigation/MasterMapNavigationBar";
import { MasterMapBranchTextDialog } from "./outline/MasterMapBranchTextDialog";
import { MasterMapQuickTitleDialog, type MasterMapQuickCreateKind } from "./outline/MasterMapQuickTitleDialog";
import { MasterMapReparentDialog } from "./outline/MasterMapReparentDialog";
import { MasterMapShortcutHelp } from "./outline/MasterMapShortcutHelp";
import { parseMasterMapOutlineText, type MasterMapOutlineTextItem } from "./outline/masterMapOutlineText";
import { MasterMapDirectorView } from "./views/MasterMapDirectorView";
import { MasterMapFocusView } from "./views/MasterMapFocusView";
import { MasterMapImpactView } from "./views/MasterMapImpactView";
import { MasterMapListView } from "./views/MasterMapListView";
import { createDynamicPageForNode, loadDynamicPageSummaries, loadDynamicPageTemplates } from "./dynamicPageService";
import type { DynamicPage, DynamicPageSummary, DynamicPageTemplate } from "./dynamicPageTypes";
import {
  createEmptyMasterMapNode,
  createMasterMapEdgeDraft,
  createMasterMapEdgeRemote,
  createMasterMapNodeRemote,
  inactivateMasterMapOutlineBatchRemote,
  insertMasterMapOutlineBatchAtPositionRemote,
  loadMasterMapData,
  reparentMasterMapNodeAtPositionRemote,
  saveLocalMasterMapCache,
  saveMasterMapEdgeRemote,
  saveMasterMapNodeLayoutUpdatesRemote,
  saveMasterMapNodeRemote,
  saveMasterMapNodeWithProjectionRemote,
  saveMasterMapOutlineOrderRemote,
  type MasterMapNodeLayoutUpdate,
  type MasterMapOutlineMutationResult,
} from "./masterMapService";
import { getVisibleMasterMapGraph } from "./masterMapLayout";
import type { MasterMap, MasterMapData, MasterMapEdge, MasterMapNode, MasterMapNodeVisualStyle, MasterMapNodeVisualStyleField, MasterMapSaveStatus, MasterMapTargetScreen } from "./masterMapTypes";
import { defaultMasterMapFilters, getMasterMapActiveFilterCount, type MasterMapFilterState, type MasterMapViewMode } from "./types/masterMapNavigationTypes";

const MASTER_MAP_VIEW_MODE_KEY = "hub-sm-master-map-view-mode";
const MASTER_MAP_FILTERS_KEY = "hub-sm-master-map-filters";
const MASTER_MAP_LAYOUT_KEY = "hub-sm-master-map-layout";

type MasterMapNodeSnapshot = Pick<MasterMapNode, "id" | "positionX" | "positionY" | "metadata" | "updatedAt">;

type MasterMapLayoutPreviewState = {
  mapId: string;
  originalNodes: MasterMapNodeSnapshot[];
  previewNodes: MasterMapNode[];
  previewPositions: MasterMapPositionPatch[];
  affectedNodeIds: Set<string>;
  collisionCount: number;
  originalPreferences: MasterMapLayoutPreferences;
  previewPreferences: MasterMapLayoutPreferences;
  originalVisualStyle: Required<MasterMapNodeVisualStyle>;
};

type MasterMapQuickCreateRequest = {
  kind: MasterMapQuickCreateKind;
  referenceNodeId: string;
};

type MasterMapOutlineUndoAction =
  | { kind: "create-batch"; mapId: string; nodeIds: string[]; edgeIds: string[] }
  | { kind: "edit-title"; mapId: string; nodeId: string; previousTitle: string; nextTitle: string }
  | { kind: "reorder"; mapId: string; parentId: string | null; previousOrder: string[]; nextOrder: string[] }
  | {
      kind: "reparent";
      mapId: string;
      nodeId: string;
      previousParentId: string | null;
      nextParentId: string | null;
      previousParentOrder: string[];
      nextParentOrder: string[];
    };

export function MasterMapScreen({
  canEdit,
  onBack,
  onLogout,
  onOpenModule,
}: {
  canEdit: boolean;
  onBack: () => void;
  onLogout: () => void;
  onOpenModule: (targetScreen: MasterMapTargetScreen) => void;
}) {
  const canvasShellRef = useRef<HTMLElement | null>(null);
  const [maps, setMaps] = useState<MasterMap[]>([]);
  const [nodes, setNodes] = useState<MasterMapNode[]>([]);
  const [edges, setEdges] = useState<MasterMapEdge[]>([]);
  const [activeMapId, setActiveMapId] = useState("");
  const [remoteEditable, setRemoteEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const selectedNodeIdRef = useRef<string | undefined>(undefined);
  const selectedNodeIdsRef = useRef<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const selectedEdgeIdRef = useRef<string | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<MasterMapSaveStatus>("idle");
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [templates, setTemplates] = useState<DynamicPageTemplate[]>([]);
  const [createDialogMode, setCreateDialogMode] = useState<"node" | "child" | null>(null);
  const [activeDynamicPageId, setActiveDynamicPageId] = useState<string | null>(() => getDynamicPageIdFromUrl());
  const [viewMode, setViewMode] = useState<MasterMapViewMode>(() => getInitialMasterMapViewMode());
  const [filters, setFilters] = useState<MasterMapFilterState>(() => getInitialMasterMapFilters());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [pageSummaries, setPageSummaries] = useState<DynamicPageSummary[]>([]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [layoutPanelOpen, setLayoutPanelOpen] = useState(false);
  const ignoreCanvasSelectionUntilRef = useRef(0);
  const [layoutPreferences, setLayoutPreferences] = useState<MasterMapLayoutPreferences>(() => getInitialMasterMapLayoutPreferences(""));
  const [layoutCalculating, setLayoutCalculating] = useState(false);
  const [layoutPreview, setLayoutPreview] = useState<MasterMapLayoutPreviewState | null>(null);
  const [layoutUndoSnapshot, setLayoutUndoSnapshot] = useState<{
    mapId: string;
    nodes: MasterMapNodeSnapshot[];
    preferences: MasterMapLayoutPreferences;
    visualStyle: Required<MasterMapNodeVisualStyle>;
  } | null>(null);
  const [layoutSessionSnapshot, setLayoutSessionSnapshot] = useState<{
    preferences: MasterMapLayoutPreferences;
    visualStyle: Required<MasterMapNodeVisualStyle>;
  } | null>(null);
  const [layoutReferenceNodeId, setLayoutReferenceNodeId] = useState("");
  const [visualStyleDraft, setVisualStyleDraft] = useState<Required<MasterMapNodeVisualStyle>>(defaultMasterMapVisualStyle);
  const [visualStyleDirtyFields, setVisualStyleDirtyFields] = useState<Set<MasterMapNodeVisualStyleField>>(new Set());
  const [inlineEditingNodeId, setInlineEditingNodeId] = useState<string | null>(null);
  const [inlineTitleDraft, setInlineTitleDraft] = useState("");
  const [quickCreateRequest, setQuickCreateRequest] = useState<MasterMapQuickCreateRequest | null>(null);
  const [branchTextOpen, setBranchTextOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [reparentNodeId, setReparentNodeId] = useState<string | null>(null);
  const [outlineUndoAction, setOutlineUndoAction] = useState<MasterMapOutlineUndoAction | null>(null);

  useEffect(() => {
    let active = true;

    loadMasterMapData().then((data) => {
      if (!active) return;
      applyData(data);
    }).catch(() => {
      if (!active) return;
      setMessage("Não foi possível abrir o Mapa Mestre agora.");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    loadDynamicPageTemplates().then((nextTemplates) => {
      if (active) setTemplates(nextTemplates);
    }).catch(() => {
      if (active) setMessage("Templates de pagina dinamica indisponiveis agora.");
    });
    return () => {
      active = false;
    };
  }, [canEdit]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  useEffect(() => {
    if (!canEdit) {
      setPageSummaries([]);
      return undefined;
    }
    let active = true;
    loadDynamicPageSummaries().then((summaries) => {
      if (active) setPageSummaries(summaries);
    }).catch(() => {
      if (active) setPageSummaries([]);
    });
    return () => {
      active = false;
    };
  }, [canEdit]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 180);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    saveMasterMapViewModePreference(viewMode);
  }, [viewMode]);

  useEffect(() => {
    saveMasterMapFiltersPreference(filters);
  }, [filters]);

  useEffect(() => {
    setLayoutPreferences(getInitialMasterMapLayoutPreferences(activeMapId));
    setLayoutPreview(null);
    setLayoutSessionSnapshot(null);
    selectedNodeIdsRef.current = new Set();
    selectedNodeIdRef.current = undefined;
    selectedEdgeIdRef.current = undefined;
    setSelectedNodeIds(new Set());
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setLayoutReferenceNodeId("");
    setVisualStyleDirtyFields(new Set());
    setInlineEditingNodeId(null);
    setQuickCreateRequest(null);
    setBranchTextOpen(false);
    setReparentNodeId(null);
  }, [activeMapId]);

  useEffect(() => {
    const handlePopState = () => setActiveDynamicPageId(getDynamicPageIdFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-master-map-search]")?.focus();
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }

      if (event.key === "Escape") {
        if (inlineEditingNodeId) {
          cancelInlineTitleEdit();
          return;
        }
        setQuickCreateRequest(null);
        setBranchTextOpen(false);
        setReparentNodeId(null);
        setShortcutHelpOpen(false);
        setFiltersOpen(false);
        setAttentionOpen(false);
        return;
      }

      if (!editMode || !(canEdit && remoteEditable) || activeDynamicPageId || layoutPreview) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (outlineUndoAction) {
          event.preventDefault();
          void undoLastOutlineAction();
        }
        return;
      }

      if (!selectedNodeId) return;

      if (event.key === "F2") {
        event.preventDefault();
        startInlineTitleEdit(selectedNodeId);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        requestQuickCreate("child", selectedNodeId);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        requestQuickCreate(event.shiftKey ? "sibling-before" : "sibling-after", selectedNodeId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDynamicPageId, canEdit, editMode, inlineEditingNodeId, layoutPreview, remoteEditable, selectedNodeId, outlineUndoAction, nodes, edges]);

  const activeMap = maps.find((map) => map.id === activeMapId) ?? maps[0];
  const activeNodes = useMemo(() => nodes.filter((node) => node.mapId === activeMap?.id), [activeMap?.id, nodes]);
  const activeEdges = useMemo(() => edges.filter((edge) => edge.mapId === activeMap?.id), [activeMap?.id, edges]);
  const selectedNode = activeNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = activeEdges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedLayoutNodes = useMemo(() => {
    const ids = selectedNodeIds.size ? selectedNodeIds : selectedNodeId ? new Set([selectedNodeId]) : new Set<string>();
    return activeNodes.filter((node) => ids.has(node.id));
  }, [activeNodes, selectedNodeId, selectedNodeIds]);

  useEffect(() => {
    if (!selectedNode) {
      setVisualStyleDraft(defaultMasterMapVisualStyle);
      return;
    }
    setVisualStyleDraft(normalizeMasterMapVisualStyle(selectedNode.metadata.visualStyle));
    setVisualStyleDirtyFields(new Set());
    setLayoutReferenceNodeId((current) => selectedNodeIds.has(current) ? current : selectedNode.id);
  }, [selectedNode, selectedNodeIds]);

  const editable = canEdit && remoteEditable;
  const activePageSummaries = useMemo(() => pageSummaries.filter((summary) => summary.mapId === activeMap?.id), [activeMap?.id, pageSummaries]);
  const activeFilterCount = getMasterMapActiveFilterCount(filters);
  const filteredActiveNodes = useMemo(
    () => getFilteredMasterMapNodes(activeNodes, filters, debouncedSearchQuery, activePageSummaries),
    [activeNodes, activePageSummaries, debouncedSearchQuery, filters],
  );
  const filteredActiveNodeIds = useMemo(() => new Set(filteredActiveNodes.map((node) => node.id)), [filteredActiveNodes]);
  const hasNavigationFilter = Boolean(debouncedSearchQuery.trim()) || activeFilterCount > 0;
  const dimmedNodeIds = useMemo(() => {
    if (!hasNavigationFilter) return new Set<string>();
    return new Set(activeNodes.filter((node) => !filteredActiveNodeIds.has(node.id)).map((node) => node.id));
  }, [activeNodes, filteredActiveNodeIds, hasNavigationFilter]);
  const highlightedNodeIds = useMemo(() => {
    const nextIds = new Set<string>();
    if (highlightedNodeId) nextIds.add(highlightedNodeId);
    if (debouncedSearchQuery.trim()) filteredActiveNodes.forEach((node) => nextIds.add(node.id));
    return nextIds;
  }, [debouncedSearchQuery, filteredActiveNodes, highlightedNodeId]);
  const forceVisibleNodeIds = useMemo(() => {
    const nextIds = new Set<string>();
    if (selectedNodeId) nextIds.add(selectedNodeId);
    highlightedNodeIds.forEach((nodeId) => nextIds.add(nodeId));
    return nextIds;
  }, [highlightedNodeIds, selectedNodeId]);
  const activeLayoutPreviewNodeIds = layoutPreview && activeMap && layoutPreview.mapId === activeMap.id ? layoutPreview.affectedNodeIds : undefined;
  const attentionItems = useMemo(() => getMasterMapAttentionItems(filteredActiveNodes, activePageSummaries), [activePageSummaries, filteredActiveNodes]);
  const searchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];
    return getFilteredMasterMapNodes(nodes, filters, debouncedSearchQuery, pageSummaries).slice(0, 10);
  }, [debouncedSearchQuery, filters, nodes, pageSummaries]);
  const responsibleOptions = useMemo(() => {
    const options = new Set<string>();
    nodes.forEach((node) => {
      if (node.responsible?.trim()) options.add(node.responsible.trim());
    });
    pageSummaries.forEach((summary) => {
      if (summary.responsible?.trim()) options.add(summary.responsible.trim());
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [nodes, pageSummaries]);

  function applyData(data: MasterMapData) {
    setMaps(data.maps);
    setNodes(data.nodes);
    setEdges(data.edges);
    setActiveMapId((current) => current && data.maps.some((map) => map.id === current) ? current : data.maps[0]?.id ?? "");
    setRemoteEditable(data.remoteEditable);
    setMessage(data.message ?? "");
    setLoading(false);
  }

  function cacheCurrentData(nextNodes = nodes, nextEdges = edges) {
    saveLocalMasterMapCache({ maps, nodes: nextNodes, edges: nextEdges });
  }

  function updateNodeLocal(nextNode: MasterMapNode) {
    setNodes((current) => {
      const nextNodes = current.map((node) => (node.id === nextNode.id ? nextNode : node));
      saveLocalMasterMapCache({ maps, nodes: nextNodes, edges });
      return nextNodes;
    });
  }

  function updateEdgeLocal(nextEdge: MasterMapEdge) {
    setEdges((current) => {
      const nextEdges = current.map((edge) => (edge.id === nextEdge.id ? nextEdge : edge));
      saveLocalMasterMapCache({ maps, nodes, edges: nextEdges });
      return nextEdges;
    });
  }

  function replaceActiveMapState(mapId: string, result: MasterMapOutlineMutationResult) {
    const nextNodes = [...nodes.filter((node) => node.mapId !== mapId), ...result.nodes];
    const nextEdges = [...edges.filter((edge) => edge.mapId !== mapId), ...result.edges];
    setNodes(nextNodes);
    setEdges(nextEdges);
    saveLocalMasterMapCache({ maps, nodes: nextNodes, edges: nextEdges });
  }

  function upsertPageSummaryFromPage(page: DynamicPage) {
    const nextSummary: DynamicPageSummary = {
      id: page.id,
      mapId: page.mapId,
      nodeId: page.nodeId,
      priority: page.priority,
      dueDate: page.dueDate,
      status: page.status,
      responsible: page.responsible,
      nextAction: page.nextAction,
      updatedAt: page.updatedAt,
    };
    setPageSummaries((current) => {
      const exists = current.some((summary) => summary.id === nextSummary.id);
      return exists
        ? current.map((summary) => (summary.id === nextSummary.id ? nextSummary : summary))
        : [...current, nextSummary];
    });
  }

  function upsertPageSummary(nextSummary: DynamicPageSummary) {
    setPageSummaries((current) => {
      const exists = current.some((summary) => summary.id === nextSummary.id);
      return exists
        ? current.map((summary) => (summary.id === nextSummary.id ? nextSummary : summary))
        : [...current, nextSummary];
    });
  }

  function guardEditAction() {
    if (!canEdit) {
      setMessage("Você não tem acesso para editar o Mapa Mestre.");
      return false;
    }

    if (!remoteEditable) {
      setMessage("Edição do Mapa Mestre exige sessão Supabase Auth do Admin. O mapa atual está somente para consulta.");
      setSaveStatus("error");
      return false;
    }

    return true;
  }

  function toggleEditMode() {
    if (!editMode && !guardEditAction()) return;
    setEditMode((current) => !current);
  }

  function handleMapChange(mapId: string) {
    if (layoutPreview) {
      setMessage("Aplique ou cancele a pre-visualizacao atual antes de criar outra.");
      return;
    }
    setActiveMapId(mapId);
    selectedNodeIdRef.current = undefined;
    selectedNodeIdsRef.current = new Set();
    selectedEdgeIdRef.current = undefined;
    setSelectedNodeId(undefined);
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(undefined);
    window.setTimeout(() => flowInstance?.fitView(getFitViewOptions()), 80);
  }

  function handleViewModeChange(nextMode: MasterMapViewMode) {
    setViewMode(nextMode);
    if (nextMode !== "map") setSelectedEdgeId(undefined);
  }

  function clearNavigationState() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setFilters(defaultMasterMapFilters);
    setHighlightedNodeId(null);
  }

  function submitSearchResult() {
    const firstResult = searchResults[0];
    if (firstResult) centerNodeInMap(firstResult.id, true);
  }

  function getFitViewOptions() {
    const compactViewport = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    return {
      padding: compactViewport ? 0.08 : 0.24,
      minZoom: compactViewport ? 0.5 : 0.25,
      maxZoom: compactViewport ? 0.9 : 1,
      duration: 260,
    };
  }

  function centerNodeInMap(nodeId: string, switchToMapMode = true) {
    const node = nodes.find((current) => current.id === nodeId);
    if (!node) return;
    setActiveMapId(node.mapId);
    if (switchToMapMode) setViewMode("map");
    setSelectedNodeId(node.id);
    setSelectedEdgeId(undefined);
    setHighlightedNodeId(node.id);
    window.setTimeout(() => {
      flowInstance?.setCenter(node.positionX + 140, node.positionY + 90, { zoom: 0.95, duration: 320 });
    }, node.mapId === activeMapId ? 80 : 180);
    window.setTimeout(() => setHighlightedNodeId(null), 2200);
  }

  function openNodeDetails(nodeId: string) {
    centerNodeInMap(nodeId, true);
  }

  function openNodePage(node: MasterMapNode) {
    if (node.destinationType === "DYNAMIC_PAGE" && node.dynamicPageId) {
      openDynamicPage(node.dynamicPageId);
      return;
    }
    openNodeDetails(node.id);
  }

  function handleSelectNode(nodeId: string, additive = false) {
    if (additive) {
      ignoreCanvasSelectionUntilRef.current = Date.now() + 1500;
      const currentNodeIds = selectedNodeIdsRef.current;
      const currentNodeId = selectedNodeIdRef.current;
      const nextNodeIds = currentNodeIds.size
        ? new Set(currentNodeIds)
        : currentNodeId
          ? new Set([currentNodeId])
          : new Set<string>();

      if (nextNodeIds.has(nodeId) && nextNodeIds.size > 1) {
        nextNodeIds.delete(nodeId);
      } else {
        nextNodeIds.add(nodeId);
      }

      const nextSelectedNodeId = nextNodeIds.has(nodeId) ? nodeId : Array.from(nextNodeIds)[0];
      selectedNodeIdsRef.current = nextNodeIds;
      selectedNodeIdRef.current = nextSelectedNodeId;
      selectedEdgeIdRef.current = undefined;
      setSelectedNodeIds(nextNodeIds);
      setSelectedNodeId(nextSelectedNodeId);
      setSelectedEdgeId(undefined);
      return;
    }

    selectedNodeIdsRef.current = new Set([nodeId]);
    selectedNodeIdRef.current = nodeId;
    selectedEdgeIdRef.current = undefined;
    setSelectedNodeId(nodeId);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedEdgeId(undefined);
  }

  function handleSelectEdge(edgeId: string) {
    selectedEdgeIdRef.current = edgeId;
    selectedNodeIdRef.current = undefined;
    selectedNodeIdsRef.current = new Set();
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
    setSelectedNodeIds(new Set());
  }

  function handleCanvasSelectionChange(nodeIds: string[], edgeIds: string[]) {
    if (Date.now() < ignoreCanvasSelectionUntilRef.current) return;

    const nextNodeIds = new Set(nodeIds);

    if (nodeIds.length > 0) {
      const nextNodeId = selectedNodeIdRef.current && nextNodeIds.has(selectedNodeIdRef.current) ? selectedNodeIdRef.current : nodeIds[0];
      if (
        areSameStringSets(selectedNodeIdsRef.current, nextNodeIds)
        && selectedNodeIdRef.current === nextNodeId
        && selectedEdgeIdRef.current === undefined
      ) {
        return;
      }
      selectedNodeIdsRef.current = nextNodeIds;
      selectedNodeIdRef.current = nextNodeId;
      selectedEdgeIdRef.current = undefined;
      setSelectedNodeIds(nextNodeIds);
      setSelectedNodeId(nextNodeId);
      setSelectedEdgeId(undefined);
      return;
    }

    const nextEdgeId = edgeIds.length === 1 ? edgeIds[0] : undefined;
    if (
      selectedNodeIdsRef.current.size === 0
      && selectedNodeIdRef.current === undefined
      && selectedEdgeIdRef.current === nextEdgeId
    ) {
      return;
    }

    selectedNodeIdRef.current = undefined;
    selectedNodeIdsRef.current = nextNodeIds;
    selectedEdgeIdRef.current = nextEdgeId;
    setSelectedNodeIds(nextNodeIds);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(nextEdgeId);
  }

  function openDynamicPage(pageId: string) {
    setActiveDynamicPageId(pageId);
    setMapPageUrl(pageId);
  }

  function closeDynamicPage(nodeId?: string) {
    setActiveDynamicPageId(null);
    clearMapPageUrl();
    if (nodeId) {
      const node = nodes.find((current) => current.id === nodeId);
      if (node) setActiveMapId(node.mapId);
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(undefined);
      setViewMode("map");
      window.setTimeout(() => {
        if (node) {
          flowInstance?.setCenter(node.positionX + 140, node.positionY + 90, { zoom: 0.95, duration: 320 });
        } else {
          flowInstance?.fitView(getFitViewOptions());
        }
      }, 120);
    }
  }

  function openExternalUrl(url: string) {
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setMessage("Link externo invalido.");
      return;
    }
    if (!window.confirm("Abrir este link externo em uma nova aba?")) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleNodeMove(nodeId: string, positionX: number, positionY: number) {
    if (!editMode) return;
    if (layoutPreview) {
      setMessage("Aplique ou cancele a pre-visualizacao antes de mover um quadro.");
      return;
    }
    const node = nodes.find((current) => current.id === nodeId);
    if (!node) return;
    persistNode({ ...node, positionX, positionY, updatedAt: new Date().toISOString() });
  }

  function toggleCollapse(nodeId: string) {
    if (layoutPreview) {
      setMessage("Aplique ou cancele a pre-visualizacao antes de recolher ramificacoes.");
      return;
    }
    const node = nodes.find((current) => current.id === nodeId);
    if (!node) return;
    persistNode({ ...node, isCollapsed: !node.isCollapsed, updatedAt: new Date().toISOString() });
  }

  function addNode() {
    if (!activeMap || !editMode || !guardEditAction()) return;
    setCreateDialogMode("node");
  }

  function addChildNode() {
    if (!activeMap || !editMode || !guardEditAction()) return;
    setCreateDialogMode("child");
  }

  function startInlineTitleEdit(nodeId: string) {
    if (!editMode || !guardEditAction()) return;
    const node = activeNodes.find((current) => current.id === nodeId);
    if (!node) return;
    setSelectedNodeId(node.id);
    setSelectedNodeIds(new Set([node.id]));
    setSelectedEdgeId(undefined);
    setInlineEditingNodeId(node.id);
    setInlineTitleDraft(node.title);
    setMessage("Editando titulo. Enter salva, Escape cancela.");
  }

  function cancelInlineTitleEdit() {
    setInlineEditingNodeId(null);
    setInlineTitleDraft("");
    setMessage("Edicao cancelada.");
  }

  async function commitInlineTitleEdit() {
    if (!inlineEditingNodeId || !guardEditAction()) return;
    const node = nodes.find((current) => current.id === inlineEditingNodeId);
    const nextTitle = inlineTitleDraft.trim();
    if (!node) return;
    if (!nextTitle) {
      setMessage("Titulo vazio nao pode ser salvo.");
      setSaveStatus("error");
      return;
    }
    if (nextTitle === node.title) {
      setInlineEditingNodeId(null);
      setInlineTitleDraft("");
      setMessage("Titulo mantido.");
      return;
    }

    const previousNode = node;
    const nextNode = { ...node, title: nextTitle, updatedAt: new Date().toISOString() };
    setSaveStatus("saving");
    updateNodeLocal(nextNode);
    setInlineEditingNodeId(null);
    setInlineTitleDraft("");

    try {
      const { node: savedNode, pageSummary } = await saveMasterMapNodeWithProjectionRemote(nextNode);
      updateNodeLocal(savedNode);
      if (pageSummary) upsertPageSummary(pageSummary);
      setOutlineUndoAction({
        kind: "edit-title",
        mapId: savedNode.mapId,
        nodeId: savedNode.id,
        previousTitle: previousNode.title,
        nextTitle: savedNode.title,
      });
      setSaveStatus("saved");
      setMessage("Titulo salvo.");
    } catch {
      updateNodeLocal(previousNode);
      setSaveStatus("error");
      setMessage("Erro ao salvar titulo. O texto anterior foi restaurado.");
    }
  }

  function requestQuickCreate(kind: MasterMapQuickCreateKind, nodeId = selectedNodeId) {
    if (!activeMap || !editMode || !guardEditAction()) return;
    if (!nodeId) {
      setMessage("Selecione um quadro para usar a criacao rapida.");
      return;
    }
    setQuickCreateRequest({ kind, referenceNodeId: nodeId });
  }

  async function submitQuickCreate(title: string) {
    if (!activeMap || !quickCreateRequest || !guardEditAction()) return;
    const referenceNode = activeNodes.find((node) => node.id === quickCreateRequest.referenceNodeId);
    if (!referenceNode) return;

    setQuickCreateRequest(null);
    setSaveStatus("saving");
    setMessage("Criando quadro rapido...");

    const { node, edge } = createQuickOutlineNode(activeMap.id, referenceNode, quickCreateRequest.kind, title, activeNodes, activeEdges);
    try {
      const result = await insertMasterMapOutlineBatchAtPositionRemote(
        activeMap.id,
        referenceNode.id,
        getQuickCreateInsertPosition(quickCreateRequest.kind),
        [node],
        edge ? [edge] : [],
      );
      replaceActiveMapState(activeMap.id, result);
      setSelectedNodeId(node.id);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedEdgeId(undefined);
      setOutlineUndoAction({ kind: "create-batch", mapId: activeMap.id, nodeIds: [node.id], edgeIds: edge ? [edge.id] : [] });
      setSaveStatus("saved");
      setMessage("Quadro rapido criado.");
      setViewMode("map");
      window.setTimeout(() => flowInstance?.setCenter(node.positionX + 140, node.positionY + 90, { zoom: 0.95, duration: 320 }), 120);
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao criar quadro rapido. Nada foi gravado.");
    }
  }

  async function submitBranchText(text: string) {
    if (!activeMap || !guardEditAction()) return;
    const parsed = parseMasterMapOutlineText(text);
    if (parsed.errors.length > 0) {
      setMessage("Corrija os erros da ramificacao antes de criar.");
      return;
    }
    const baseParent = selectedNode ?? activeNodes.find((node) => node.nodeType === "root") ?? activeNodes[0] ?? null;
    if (!baseParent) {
      setMessage("Nenhum quadro base encontrado para criar a ramificacao.");
      return;
    }

    setBranchTextOpen(false);
    setSaveStatus("saving");
    setMessage("Criando ramificacao em lote...");

    const { nodes: batchNodes, edges: batchEdges } = createOutlineNodesFromText(activeMap.id, baseParent, parsed.items);
    try {
      const result = await insertMasterMapOutlineBatchAtPositionRemote(
        activeMap.id,
        baseParent.id,
        "child",
        batchNodes,
        batchEdges,
      );
      replaceActiveMapState(activeMap.id, result);
      setSelectedNodeId(batchNodes[0]?.id);
      setSelectedNodeIds(batchNodes[0] ? new Set([batchNodes[0].id]) : new Set());
      setOutlineUndoAction({
        kind: "create-batch",
        mapId: activeMap.id,
        nodeIds: batchNodes.map((node) => node.id),
        edgeIds: batchEdges.map((edge) => edge.id),
      });
      setSaveStatus("saved");
      setMessage("Ramificacao criada em uma unica transacao.");
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao criar ramificacao. Nenhum quadro do lote foi gravado.");
    }
  }

  async function reorderSibling(nodeId: string, direction: "up" | "down") {
    if (!activeMap || !guardEditAction()) return;
    const hierarchy = buildMasterMapHierarchy(activeNodes, activeEdges);
    const parentId = hierarchy.parentByChild.get(nodeId) ?? null;
    const siblings = getOutlineSiblingIds(parentId, hierarchy);
    const currentIndex = siblings.indexOf(nodeId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) {
      setMessage("Nao ha irmao para mover nessa direcao.");
      return;
    }

    const nextOrder = [...siblings];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, moved);
    setSaveStatus("saving");
    try {
      const result = await saveMasterMapOutlineOrderRemote(activeMap.id, parentId, nextOrder);
      replaceActiveMapState(activeMap.id, result);
      setOutlineUndoAction({ kind: "reorder", mapId: activeMap.id, parentId, previousOrder: siblings, nextOrder });
      setSaveStatus("saved");
      setMessage("Ordem dos irmaos salva.");
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao reordenar irmaos. Nenhuma ordem parcial foi gravada.");
    }
  }

  async function reorderSiblingToTarget(nodeId: string, targetNodeId: string) {
    if (!activeMap || !guardEditAction()) return;
    const hierarchy = buildMasterMapHierarchy(activeNodes, activeEdges);
    const parentId = hierarchy.parentByChild.get(nodeId) ?? null;
    const targetParentId = hierarchy.parentByChild.get(targetNodeId) ?? null;
    if (parentId !== targetParentId) {
      setMessage("Arraste somente entre irmaos do mesmo pai. Para mudar de pai, use Alterar pai.");
      return;
    }
    const siblings = getOutlineSiblingIds(parentId, hierarchy);
    const currentIndex = siblings.indexOf(nodeId);
    const targetIndex = siblings.indexOf(targetNodeId);
    if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) return;

    const nextOrder = [...siblings];
    const [moved] = nextOrder.splice(currentIndex, 1);
    const adjustedTargetIndex = nextOrder.indexOf(targetNodeId);
    nextOrder.splice(adjustedTargetIndex, 0, moved);
    if (areSameStringArrays(siblings, nextOrder)) return;

    setSaveStatus("saving");
    try {
      const result = await saveMasterMapOutlineOrderRemote(activeMap.id, parentId, nextOrder);
      replaceActiveMapState(activeMap.id, result);
      setOutlineUndoAction({ kind: "reorder", mapId: activeMap.id, parentId, previousOrder: siblings, nextOrder });
      setSaveStatus("saved");
      setMessage("Ordem dos irmaos salva pela alca.");
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao reordenar por alca. Nenhuma ordem parcial foi gravada.");
    }
  }

  function requestReparent(nodeId: string) {
    if (!editMode || !guardEditAction()) return;
    setReparentNodeId(nodeId);
  }

  async function submitReparent(nodeId: string, newParentId: string | null) {
    if (!activeMap || !guardEditAction()) return;
    const hierarchy = buildMasterMapHierarchy(activeNodes, activeEdges);
    const previousParentId = hierarchy.parentByChild.get(nodeId) ?? null;
    if (previousParentId === newParentId) {
      setReparentNodeId(null);
      setMessage("Pai mantido.");
      return;
    }
    const previousParentOrder = getOutlineSiblingIds(previousParentId, hierarchy);
    const nextParentOrder = [...getOutlineSiblingIds(newParentId, hierarchy).filter((id) => id !== nodeId), nodeId];

    setSaveStatus("saving");
    try {
      const result = await reparentMasterMapNodeAtPositionRemote(activeMap.id, nodeId, newParentId, nextParentOrder);
      replaceActiveMapState(activeMap.id, result);
      setOutlineUndoAction({
        kind: "reparent",
        mapId: activeMap.id,
        nodeId,
        previousParentId,
        nextParentId: newParentId,
        previousParentOrder,
        nextParentOrder,
      });
      setReparentNodeId(null);
      setSelectedNodeId(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
      setSaveStatus("saved");
      setMessage("Pai hierarquico alterado. Conexoes operacionais preservadas.");
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao alterar pai. A hierarquia anterior foi mantida.");
    }
  }

  async function undoLastOutlineAction() {
    if (!outlineUndoAction || !guardEditAction()) {
      setMessage("Nao ha acao rapida para desfazer.");
      return;
    }

    setSaveStatus("saving");
    try {
      if (outlineUndoAction.kind === "create-batch") {
        const result = await inactivateMasterMapOutlineBatchRemote(outlineUndoAction.mapId, outlineUndoAction.nodeIds, outlineUndoAction.edgeIds);
        replaceActiveMapState(outlineUndoAction.mapId, result);
        setSelectedNodeId(undefined);
        setSelectedNodeIds(new Set());
      } else if (outlineUndoAction.kind === "edit-title") {
        const node = nodes.find((current) => current.id === outlineUndoAction.nodeId);
        if (!node) throw new Error("Node not found");
        const { node: savedNode, pageSummary } = await saveMasterMapNodeWithProjectionRemote({ ...node, title: outlineUndoAction.previousTitle, updatedAt: new Date().toISOString() });
        updateNodeLocal(savedNode);
        if (pageSummary) upsertPageSummary(pageSummary);
      } else if (outlineUndoAction.kind === "reorder") {
        const result = await saveMasterMapOutlineOrderRemote(outlineUndoAction.mapId, outlineUndoAction.parentId, outlineUndoAction.previousOrder);
        replaceActiveMapState(outlineUndoAction.mapId, result);
      } else {
        const result = await reparentMasterMapNodeAtPositionRemote(
          outlineUndoAction.mapId,
          outlineUndoAction.nodeId,
          outlineUndoAction.previousParentId,
          outlineUndoAction.previousParentOrder,
        );
        replaceActiveMapState(outlineUndoAction.mapId, result);
      }
      setOutlineUndoAction(null);
      setSaveStatus("saved");
      setMessage("Ultima acao do outline desfeita.");
    } catch {
      setSaveStatus("error");
      setMessage("Nao foi possivel desfazer a ultima acao agora.");
    }
  }

  async function submitCreateNode(draft: MasterMapCreateNodeDraft) {
    if (!activeMap || !createDialogMode || !guardEditAction()) return;
    const parent = createDialogMode === "child" ? selectedNode ?? activeNodes.find((node) => node.nodeType === "root") ?? activeNodes[0] : null;
    const newNode = createEmptyMasterMapNode(activeMap.id, (parent?.positionX ?? 0) + 330, (parent?.positionY ?? 0) + 90, parent?.id);
    const nextNode: MasterMapNode = {
      ...newNode,
      title: draft.title,
      description: draft.description,
      nodeType: draft.nodeType,
      iconKey: draft.iconKey,
      destinationType: draft.destinationType,
      targetScreen: draft.destinationType === "EXISTING_SCREEN" ? draft.targetScreen : undefined,
      externalUrl: draft.destinationType === "EXTERNAL_URL" ? draft.externalUrl : undefined,
      plannedModuleKey: draft.destinationType === "PLANNED_MODULE" ? draft.plannedModuleKey : undefined,
    };
    setCreateDialogMode(null);

    if (draft.destinationType === "DYNAMIC_PAGE" && draft.pageType && draft.templateId) {
      setSaveStatus("saving");
      try {
        const payload = await createDynamicPageForNode({
          nodeId: nextNode.id,
          mapId: nextNode.mapId,
          title: nextNode.title,
          description: nextNode.description,
          nodeType: nextNode.nodeType,
          iconKey: nextNode.iconKey,
          pageType: draft.pageType,
          templateId: draft.templateId,
          positionX: nextNode.positionX,
          positionY: nextNode.positionY,
          parentNodeId: parent?.id,
        });
        const mergedNodes = [...nodes, payload.node ?? nextNode].map((node) => (
          node.id === payload.node?.id ? payload.node : node
        ));
        const mergedEdges = payload.edge ? [...edges, payload.edge] : edges;
        setNodes(mergedNodes);
        setEdges(mergedEdges);
        saveLocalMasterMapCache({ maps, nodes: mergedNodes, edges: mergedEdges });
        setSelectedNodeId(payload.node?.id ?? nextNode.id);
        setSelectedEdgeId(undefined);
        upsertPageSummaryFromPage(payload.page);
        setSaveStatus("saved");
        setMessage("Quadro e pagina dinamica criados no Supabase.");
        openDynamicPage(payload.page.id);
      } catch {
        setSaveStatus("error");
        setMessage("Erro ao criar pagina dinamica. Nenhum quadro foi mantido na tela.");
      }
      return;
    }

    const newEdge = parent ? createMasterMapEdgeDraft(activeMap.id, parent.id, nextNode.id, "BELONGS_TO") : null;
    void persistNewNode(nextNode, newEdge);
  }

  function createConnection(sourceNodeId: string, targetNodeId: string) {
    if (!activeMap || !editMode || !guardEditAction()) return;
    const exists = activeEdges.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId && edge.isActive);
    if (exists) {
      setMessage("Essa conexão já existe.");
      return;
    }
    const nextEdge = createMasterMapEdgeDraft(activeMap.id, sourceNodeId, targetNodeId);
    persistEdge(nextEdge, true);
  }

  function persistNode(nextNode: MasterMapNode) {
    if (!guardEditAction()) return;
    setSaveStatus("saving");
    updateNodeLocal(nextNode);
    const savePromise = nextNode.destinationType === "DYNAMIC_PAGE" && nextNode.dynamicPageId
      ? saveMasterMapNodeWithProjectionRemote(nextNode)
      : saveMasterMapNodeRemote(nextNode).then((node) => ({ node, pageSummary: undefined }));

    savePromise.then(({ node: savedNode, pageSummary }) => {
      updateNodeLocal(savedNode);
      if (pageSummary) upsertPageSummary(pageSummary);
      setSaveStatus("saved");
      setMessage("Mapa Mestre salvo.");
    }).catch(() => {
      setSaveStatus("error");
      setMessage("Erro ao salvar. O estado visual foi mantido para você tentar novamente.");
    });
  }

  async function persistNewNode(newNode: MasterMapNode, newEdge?: MasterMapEdge | null) {
    if (!guardEditAction()) return;
    setSaveStatus("saving");
    const nextNodes = [...nodes, newNode];
    const nextEdges = newEdge ? [...edges, newEdge] : edges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    saveLocalMasterMapCache({ maps, nodes: nextNodes, edges: nextEdges });
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(undefined);

    try {
      const savedNode = await createMasterMapNodeRemote(newNode);
      let savedEdge = newEdge;
      if (newEdge) savedEdge = await createMasterMapEdgeRemote(newEdge);
      const mergedNodes = nextNodes.map((node) => (node.id === savedNode.id ? savedNode : node));
      const mergedEdges = savedEdge ? nextEdges.map((edge) => (edge.id === savedEdge?.id ? savedEdge : edge)) : nextEdges;
      setNodes(mergedNodes);
      setEdges(mergedEdges);
      saveLocalMasterMapCache({ maps, nodes: mergedNodes, edges: mergedEdges });
      setSaveStatus("saved");
      setMessage("Nó criado no Mapa Mestre.");
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao criar nó. O rascunho ficou na tela para revisão.");
    }
  }

  function persistEdge(nextEdge: MasterMapEdge, create = false) {
    if (!guardEditAction()) return;
    setSaveStatus("saving");
    if (create) {
      const nextEdges = [...edges, nextEdge];
      setEdges(nextEdges);
      saveLocalMasterMapCache({ maps, nodes, edges: nextEdges });
      setSelectedEdgeId(nextEdge.id);
      setSelectedNodeId(undefined);
      createMasterMapEdgeRemote(nextEdge).then((savedEdge) => {
        updateEdgeLocal(savedEdge);
        setSaveStatus("saved");
        setMessage("Conexão criada.");
      }).catch(() => {
        setSaveStatus("error");
        setMessage("Erro ao criar conexão. Revise e tente novamente.");
      });
      return;
    }

    updateEdgeLocal(nextEdge);
    saveMasterMapEdgeRemote(nextEdge).then((savedEdge) => {
      updateEdgeLocal(savedEdge);
      setSaveStatus("saved");
      setMessage("Conexão salva.");
    }).catch(() => {
      setSaveStatus("error");
      setMessage("Erro ao salvar conexão. O estado visual foi mantido.");
    });
  }

  function inactivateNode(node: MasterMapNode) {
    if (!guardEditAction()) return;
    if (!window.confirm("Excluir este nó do Mapa Mestre? Ele será inativado e poderá permanecer no histórico do banco.")) return;
    persistNode({ ...node, isActive: false, updatedAt: new Date().toISOString() });
    setSelectedNodeId(undefined);
  }

  function inactivateEdge(edge: MasterMapEdge) {
    if (!guardEditAction()) return;
    if (!window.confirm("Excluir esta conexão do Mapa Mestre?")) return;
    persistEdge({ ...edge, isActive: false, updatedAt: new Date().toISOString() });
    setSelectedEdgeId(undefined);
  }

  function requestFullscreen() {
    const element = canvasShellRef.current;
    if (!element?.requestFullscreen) {
      setMessage("Tela cheia não está disponível neste navegador.");
      return;
    }
    void element.requestFullscreen();
  }

  function handleLayoutPreferencesChange(nextPreferences: MasterMapLayoutPreferences) {
    setLayoutPreferences(nextPreferences);
  }

  function handleVisualStyleDraftChange(field: MasterMapNodeVisualStyleField, value: Required<MasterMapNodeVisualStyle>[MasterMapNodeVisualStyleField]) {
    setVisualStyleDraft((current) => ({ ...current, [field]: value }));
    setVisualStyleDirtyFields((current) => new Set(current).add(field));
  }

  function openLayoutPanel() {
    if (!guardEditAction()) return;
    if (viewMode !== "map") setViewMode("map");
    setLayoutSessionSnapshot({
      preferences: layoutPreferences,
      visualStyle: visualStyleDraft,
    });
    setVisualStyleDirtyFields(new Set());
    setLayoutPanelOpen(true);
  }

  function closeLayoutPanel() {
    if (layoutPreview) {
      cancelLayoutPreview();
    } else if (layoutSessionSnapshot) {
      setLayoutPreferences(layoutSessionSnapshot.preferences);
      setVisualStyleDraft(layoutSessionSnapshot.visualStyle);
    }
    setVisualStyleDirtyFields(new Set());
    setLayoutSessionSnapshot(null);
    setLayoutPanelOpen(false);
  }

  async function previewMasterMapLayout() {
    if (!activeMap) return;
    if (layoutPreview) {
      setMessage("Aplique ou cancele a pre-visualizacao atual antes de criar outra.");
      return;
    }
    const styleTargetIds = getVisualStyleTargetNodeIds();
    const visualStylePatch = getVisualStylePatch(visualStyleDirtyFields, visualStyleDraft);
    const styleChanged = hasMasterMapVisualStylePatch(visualStylePatch);
    const preferencesChanged = layoutSessionSnapshot
      ? !areSameMasterMapLayoutPreferences(layoutSessionSnapshot.preferences, layoutPreferences)
      : false;
    if (styleTargetIds.size > 0 && styleChanged && !preferencesChanged) {
      await previewVisualStyleOnly(styleTargetIds, visualStylePatch);
      return;
    }
    if (layoutPreferences.scope === "branch" && !selectedNode) {
      setMessage("Selecione um quadro para organizar apenas uma ramificação.");
      return;
    }

    setViewMode("map");
    setLayoutCalculating(true);
    setMessage("Calculando organização...");

    await waitForMapMeasurements();

    try {
      const visibleGraph = getVisibleMasterMapGraph(activeNodes, activeEdges, forceVisibleNodeIds);
      const affectedNodeIds = getAffectedLayoutNodeIds(visibleGraph.nodes, visibleGraph.edges, layoutPreferences, selectedNode);
      const originalNodeIds = new Set([...affectedNodeIds, ...styleTargetIds]);
      const originalNodes = createMasterMapNodeSnapshot(activeNodes.filter((node) => originalNodeIds.has(node.id)));
      const dimensions = getMeasuredMasterMapNodeDimensions(layoutPreferences.nodeDensity);
      applyVisualStyleDimensions(dimensions, styleTargetIds, visualStylePatch, layoutPreferences.nodeDensity);
      const result = await calculateMasterMapLayout({
        nodes: visibleGraph.nodes,
        edges: visibleGraph.edges,
        affectedNodeIds,
        dimensions,
        preferences: layoutPreferences,
        anchorNodeId: layoutPreferences.scope === "branch" ? selectedNode?.id : undefined,
      });
      const previewNodes = createPreviewNodes(activeNodes, result.positions, styleTargetIds, visualStylePatch);
      const previewAffectedNodeIds = new Set([...result.affectedNodeIds, ...(styleChanged ? styleTargetIds : new Set<string>())]);
      const collisions = detectPreviewCollisions(visibleGraph.nodes, result.positions, dimensions, previewAffectedNodeIds);

      setNodes((current) => mergePreviewNodesIntoNodes(current, previewNodes));
      setLayoutPreview({
        mapId: activeMap.id,
        originalNodes,
        previewNodes,
        previewPositions: result.positions,
        affectedNodeIds: previewAffectedNodeIds,
        collisionCount: collisions.length,
        originalPreferences: layoutSessionSnapshot?.preferences ?? layoutPreferences,
        previewPreferences: layoutPreferences,
        originalVisualStyle: layoutSessionSnapshot?.visualStyle ?? visualStyleDraft,
      });
      setHighlightedNodeId(null);
      setMessage(collisions.length
        ? `Prévia criada, mas existem ${collisions.length} sobreposições. Aumente o espaçamento antes de salvar.`
        : "Pré-visualização aplicada somente na tela. Salve ou cancele para continuar.");
      window.setTimeout(() => flowInstance?.fitView(getFitViewOptions()), 160);
    } catch {
      setSaveStatus("error");
      setMessage("Não foi possível calcular a organização agora.");
    } finally {
      setLayoutCalculating(false);
    }
  }

  async function previewVisualStyleOnly(
    styleTargetIds: Set<string>,
    visualStylePatch: Partial<Required<MasterMapNodeVisualStyle>>,
    successMessage = "Estilo pre-visualizado. Salve ou cancele para continuar.",
  ) {
    if (!activeMap) return;
    if (!hasMasterMapVisualStylePatch(visualStylePatch)) {
      setMessage("Altere algum campo visual ou use a acao de estilo completo do quadro de referencia.");
      return;
    }
    setViewMode("map");
    setLayoutCalculating(true);
    setMessage("Criando previa do estilo dos quadros...");

    await waitForMapMeasurements();

    try {
      const originalNodes = createMasterMapNodeSnapshot(activeNodes.filter((node) => styleTargetIds.has(node.id)));
      const dimensions = getMeasuredMasterMapNodeDimensions(layoutPreferences.nodeDensity);
      applyVisualStyleDimensions(dimensions, styleTargetIds, visualStylePatch, layoutPreferences.nodeDensity);
      const previewNodes = createPreviewNodes(activeNodes, [], styleTargetIds, visualStylePatch);
      const collisions = detectPreviewCollisions(activeNodes, [], dimensions, styleTargetIds);

      setNodes((current) => mergePreviewNodesIntoNodes(current, previewNodes));
      setLayoutPreview({
        mapId: activeMap.id,
        originalNodes,
        previewNodes,
        previewPositions: [],
        affectedNodeIds: new Set(styleTargetIds),
        collisionCount: collisions.length,
        originalPreferences: layoutSessionSnapshot?.preferences ?? layoutPreferences,
        previewPreferences: layoutPreferences,
        originalVisualStyle: layoutSessionSnapshot?.visualStyle ?? visualStyleDraft,
      });
      setMessage(collisions.length
        ? `Previa criada, mas existem ${collisions.length} sobreposicoes. Ajuste a largura antes de salvar.`
        : successMessage);
    } catch {
      setSaveStatus("error");
      setMessage("Nao foi possivel criar a previa do estilo agora.");
    } finally {
      setLayoutCalculating(false);
    }
  }

  async function previewReferenceVisualStyle() {
    if (layoutPreview) {
      setMessage("Aplique ou cancele a pre-visualizacao atual antes de criar outra.");
      return;
    }
    if (!selectedLayoutNodes.length) {
      setMessage("Selecione os quadros que receberao o estilo completo.");
      return;
    }
    const referenceNode = selectedLayoutNodes.find((node) => node.id === layoutReferenceNodeId) ?? selectedLayoutNodes[0];
    await previewVisualStyleOnly(
      new Set(selectedLayoutNodes.map((node) => node.id)),
      normalizeMasterMapVisualStyle(referenceNode.metadata.visualStyle),
      `Estilo completo de "${referenceNode.title}" pre-visualizado. Salve ou cancele para continuar.`,
    );
  }

  async function previewAlignment(action: MasterMapAlignmentAction) {
    if (!activeMap) return;
    if (layoutPreview) {
      setMessage("Aplique ou cancele a pre-visualizacao atual antes de criar outra.");
      return;
    }
    if (selectedLayoutNodes.length < 2) {
      setMessage("Selecione pelo menos dois quadros para alinhar.");
      return;
    }
    if ((action === "distribute-x" || action === "distribute-y") && selectedLayoutNodes.length < 3) {
      setMessage("Selecione pelo menos tres quadros para distribuir.");
      return;
    }

    setViewMode("map");
    setLayoutCalculating(true);
    setMessage("Calculando alinhamento...");

    await waitForMapMeasurements();

    try {
      const dimensions = getMeasuredMasterMapNodeDimensions(layoutPreferences.nodeDensity);
      const affectedNodeIds = new Set(selectedLayoutNodes.map((node) => node.id));
      const referenceNode = selectedLayoutNodes.find((node) => node.id === layoutReferenceNodeId) ?? selectedLayoutNodes[0];
      const previewPositions = resolveAlignmentCollisions(
        activeNodes,
        calculateAlignmentPositions(selectedLayoutNodes, dimensions, referenceNode, action),
        dimensions,
        affectedNodeIds,
        action,
        referenceNode.id,
      );
      const previewNodes = createPreviewNodes(activeNodes, previewPositions, new Set<string>(), {});
      const collisions = detectPreviewCollisions(activeNodes, previewPositions, dimensions, affectedNodeIds);

      setNodes((current) => mergePreviewNodesIntoNodes(current, previewNodes));
      setLayoutPreview({
        mapId: activeMap.id,
        originalNodes: createMasterMapNodeSnapshot(selectedLayoutNodes),
        previewNodes,
        previewPositions,
        affectedNodeIds,
        collisionCount: collisions.length,
        originalPreferences: layoutSessionSnapshot?.preferences ?? layoutPreferences,
        previewPreferences: layoutPreferences,
        originalVisualStyle: layoutSessionSnapshot?.visualStyle ?? visualStyleDraft,
      });
      setMessage(collisions.length
        ? `Previa criada, mas existem ${collisions.length} sobreposicoes. Ajuste o espacamento antes de salvar.`
        : "Alinhamento pre-visualizado. Salve ou cancele para continuar.");
    } catch {
      setSaveStatus("error");
      setMessage("Nao foi possivel calcular o alinhamento agora.");
    } finally {
      setLayoutCalculating(false);
    }
  }

  async function applyLayoutPreview() {
    if (!layoutPreview || !activeMap || !guardEditAction()) return;
    if (layoutPreview.collisionCount > 0) {
      setMessage("Corrija as sobreposições antes de salvar a organização.");
      return;
    }

    setSaveStatus("saving");
    try {
      const updates = getMasterMapNodeLayoutUpdates(layoutPreview.originalNodes, layoutPreview.previewNodes);
      const savedNodes = updates.length
        ? await saveMasterMapNodeLayoutUpdatesRemote(layoutPreview.mapId, updates)
        : [];
      const savedNodeById = new Map(savedNodes.map((node) => [node.id, node]));
      setNodes((current) => {
        const nextNodes = savedNodes.length
          ? current.map((node) => savedNodeById.get(node.id) ?? node)
          : mergePreviewNodesIntoNodes(current, layoutPreview.previewNodes);
        saveLocalMasterMapCache({ maps, nodes: nextNodes, edges });
        return nextNodes;
      });
      setLayoutUndoSnapshot({
        mapId: layoutPreview.mapId,
        nodes: layoutPreview.originalNodes,
        preferences: layoutPreview.originalPreferences,
        visualStyle: layoutPreview.originalVisualStyle,
      });
      setLayoutPreferences(layoutPreview.previewPreferences);
      setVisualStyleDraft(normalizeMasterMapVisualStyle(visualStyleDraft));
      setVisualStyleDirtyFields(new Set());
      saveMasterMapLayoutPreference(layoutPreview.mapId, layoutPreview.previewPreferences);
      setLayoutSessionSnapshot(null);
      setLayoutPreview(null);
      setSaveStatus("saved");
      setMessage("Organização salva no Mapa Mestre.");
      window.setTimeout(() => flowInstance?.fitView(getFitViewOptions()), 120);
    } catch {
      setSaveStatus("error");
      setMessage("Erro ao salvar a organização. A pré-visualização foi mantida para você tentar novamente.");
    }
  }

  function cancelLayoutPreview() {
    if (!layoutPreview) return;
    setNodes((current) => restoreNodesFromSnapshot(current, layoutPreview.originalNodes));
    setLayoutPreferences(layoutPreview.originalPreferences);
    setVisualStyleDraft(layoutPreview.originalVisualStyle);
    setVisualStyleDirtyFields(new Set());
    setLayoutPreview(null);
    setMessage("Pré-visualização cancelada. Posições anteriores restauradas.");
    window.setTimeout(() => flowInstance?.fitView(getFitViewOptions()), 100);
  }

  async function undoLastLayout() {
    if (!layoutUndoSnapshot || !guardEditAction()) return;
    if (layoutPreview) cancelLayoutPreview();
    const snapshot = layoutUndoSnapshot;
    setActiveMapId(snapshot.mapId);
    setSaveStatus("saving");
    setNodes((current) => restoreNodesFromSnapshot(current, snapshot.nodes));

    try {
      const updates = snapshot.nodes.map((node): MasterMapNodeLayoutUpdate => ({
        id: node.id,
        positionX: node.positionX,
        positionY: node.positionY,
        visualStyle: node.metadata.visualStyle ? normalizeMasterMapVisualStyle(node.metadata.visualStyle) : null,
      }));
      const savedNodes = updates.length ? await saveMasterMapNodeLayoutUpdatesRemote(snapshot.mapId, updates) : [];
      const savedNodeById = new Map(savedNodes.map((node) => [node.id, node]));
      setNodes((current) => {
        const nextNodes = savedNodeById.size
          ? current.map((node) => savedNodeById.get(node.id) ?? node)
          : restoreNodesFromSnapshot(current, snapshot.nodes);
        saveLocalMasterMapCache({ maps, nodes: nextNodes, edges });
        return nextNodes;
      });
      setLayoutPreferences(snapshot.preferences);
      setVisualStyleDraft(snapshot.visualStyle);
      setVisualStyleDirtyFields(new Set());
      saveMasterMapLayoutPreference(snapshot.mapId, snapshot.preferences);
      setLayoutUndoSnapshot(null);
      setSaveStatus("saved");
      setMessage("Última organização desfeita e salva.");
      window.setTimeout(() => flowInstance?.fitView(getFitViewOptions()), 160);
    } catch {
      setSaveStatus("error");
      setMessage("Não foi possível desfazer no Supabase. As posições continuam visíveis para nova tentativa.");
    }
  }

  function getMeasuredMasterMapNodeDimensions(density = layoutPreferences.nodeDensity) {
    const dimensions = new Map<string, MasterMapNodeDimension>();
    flowInstance?.getNodes().forEach((flowNode) => {
      const measured = flowNode.measured;
      const width = measured?.width ?? flowNode.width;
      const height = measured?.height ?? flowNode.height;
      if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
        dimensions.set(flowNode.id, { id: flowNode.id, width, height });
      }
    });

    activeNodes.forEach((node) => {
      if (dimensions.has(node.id)) return;
      dimensions.set(node.id, {
        id: node.id,
        width: getMasterMapNodeWidth(node.metadata.visualStyle, density === "compact"),
        height: density === "compact" ? 104 : 178,
      });
    });

    return dimensions;
  }

  function getVisualStyleTargetNodeIds() {
    if (!selectedLayoutNodes.length) return new Set<string>();
    return new Set(selectedLayoutNodes.map((node) => node.id));
  }

  function applyVisualStyleDimensions(
    dimensions: Map<string, MasterMapNodeDimension>,
    nodeIds: Set<string>,
    visualStylePatch: Partial<Required<MasterMapNodeVisualStyle>>,
    density = layoutPreferences.nodeDensity,
  ) {
    if (!hasMasterMapVisualStylePatch(visualStylePatch)) return;
    nodeIds.forEach((nodeId) => {
      const current = dimensions.get(nodeId);
      const node = activeNodes.find((activeNode) => activeNode.id === nodeId);
      const nextStyle = mergeMasterMapVisualStylePatch(node?.metadata.visualStyle, visualStylePatch);
      dimensions.set(nodeId, {
        id: nodeId,
        width: getMasterMapNodeWidth(nextStyle, density === "compact"),
        height: current?.height ?? (density === "compact" ? 104 : 178),
      });
    });
  }

  function waitForMapMeasurements() {
    return new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  }

  function renderWorkspaceContent() {
    if (loading || !activeMap) {
      return <section className="empty-state master-map-loading"><h2>Carregando Mapa Mestre...</h2></section>;
    }

    if (viewMode === "list") {
      return (
        <MasterMapListView
          nodes={filteredActiveNodes}
          edges={activeEdges}
          pageSummaries={activePageSummaries}
          editMode={editMode}
          selectedNodeId={selectedNodeId}
          inlineEditingNodeId={inlineEditingNodeId}
          inlineTitleDraft={inlineTitleDraft}
          onOpenPage={openNodePage}
          onViewInMap={(nodeId) => centerNodeInMap(nodeId, true)}
          onOpenDetails={openNodeDetails}
          onSelectNode={(nodeId) => handleSelectNode(nodeId)}
          onStartInlineTitleEdit={startInlineTitleEdit}
          onInlineTitleDraftChange={setInlineTitleDraft}
          onCommitInlineTitleEdit={commitInlineTitleEdit}
          onCancelInlineTitleEdit={cancelInlineTitleEdit}
          onCreateSibling={(nodeId, before) => requestQuickCreate(before ? "sibling-before" : "sibling-after", nodeId)}
          onCreateChild={(nodeId) => requestQuickCreate("child", nodeId)}
          onReorderSibling={reorderSibling}
          onReorderSiblingTo={reorderSiblingToTarget}
          onRequestReparent={requestReparent}
        />
      );
    }

    if (viewMode === "focus") {
      return (
        <MasterMapFocusView
          selectedNode={selectedNode}
          nodes={activeNodes}
          edges={activeEdges}
          pageSummaries={activePageSummaries}
          onExit={() => setViewMode("map")}
          onViewFullMap={() => {
            setViewMode("map");
            if (selectedNodeId) centerNodeInMap(selectedNodeId, true);
          }}
          onOpenPage={openNodePage}
          onOpenDetails={openNodeDetails}
        />
      );
    }

    if (viewMode === "impact") {
      return (
        <MasterMapImpactView
          selectedNode={selectedNode}
          nodes={activeNodes}
          edges={activeEdges}
          onViewInMap={(nodeId) => centerNodeInMap(nodeId, true)}
          onOpenDetails={openNodeDetails}
          onOpenPage={openNodePage}
        />
      );
    }

    if (viewMode === "director") {
      return (
        <MasterMapDirectorView
          nodes={filteredActiveNodes}
          pageSummaries={activePageSummaries}
          attentionItems={attentionItems}
          onOpenPage={openNodePage}
          onFocusNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            setViewMode("focus");
          }}
        />
      );
    }

    return (
      <MasterMapCanvas
        nodes={activeNodes}
        edges={activeEdges}
        editMode={editMode}
        nodeDensity={layoutPreferences.nodeDensity}
        connectionMode={layoutPreferences.connectionMode}
        layoutMode={layoutPreferences.layoutMode}
        selectedNodeId={selectedNodeId}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeId={selectedEdgeId}
        inlineEditingNodeId={inlineEditingNodeId}
        inlineTitleDraft={inlineTitleDraft}
        highlightedNodeIds={highlightedNodeIds}
        dimmedNodeIds={dimmedNodeIds}
        layoutPreviewNodeIds={activeLayoutPreviewNodeIds}
        forceVisibleNodeIds={forceVisibleNodeIds}
        onInit={setFlowInstance}
        onSelectNode={handleSelectNode}
        onSelectEdge={handleSelectEdge}
        onSelectionChange={handleCanvasSelectionChange}
        onMoveNode={handleNodeMove}
        onCreateConnection={createConnection}
        onOpenNodeDetails={openNodeDetails}
        onOpenModule={onOpenModule}
        onOpenDynamicPage={openDynamicPage}
        onOpenExternalUrl={openExternalUrl}
        onToggleCollapse={toggleCollapse}
        onStartInlineTitleEdit={startInlineTitleEdit}
        onInlineTitleDraftChange={setInlineTitleDraft}
        onCommitInlineTitleEdit={commitInlineTitleEdit}
        onCancelInlineTitleEdit={cancelInlineTitleEdit}
      />
    );
  }

  if (activeDynamicPageId) {
    return (
      <DynamicPageScreen
        pageId={activeDynamicPageId}
        canEdit={canEdit}
        onBackToMap={closeDynamicPage}
        onLogout={onLogout}
        onNodeSynced={updateNodeLocal}
        onPageSynced={upsertPageSummaryFromPage}
      />
    );
  }

  return (
    <section className="screen master-map-screen">
      <header className="top-bar">
        <div>
          <p className="eyebrow">HUB SM</p>
          <h1>Mapa Mestre</h1>
          <p>Visão geral dos módulos, projetos, dependências e andamento do HUB SM.</p>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
      </header>

      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>

      {message && <p className={`notice-message ${saveStatus === "error" ? "error" : ""}`}>{message}</p>}
      {!canEdit && <section className="empty-state"><h2>Acesso restrito</h2><p>Somente Admin/Tezzei pode acessar o Mapa Mestre nesta versão.</p></section>}

      {canEdit && (
        <>
          <MasterMapLegend />
          <MasterMapNavigationBar
            maps={maps}
            activeMapId={activeMap?.id ?? ""}
            viewMode={viewMode}
            searchQuery={searchQuery}
            activeFilterCount={activeFilterCount}
            attentionCount={attentionItems.length}
            filtersOpen={filtersOpen}
            attentionOpen={attentionOpen}
            canEdit={editable}
            editMode={editMode}
            saveStatus={saveStatus}
            onMapChange={handleMapChange}
            onViewModeChange={handleViewModeChange}
            onSearchChange={setSearchQuery}
            onToggleFilters={() => setFiltersOpen((current) => !current)}
            onToggleAttention={() => setAttentionOpen((current) => !current)}
            onClearNavigation={clearNavigationState}
            onSearchSubmit={submitSearchResult}
            onToggleEditMode={toggleEditMode}
            onAddNode={addNode}
            onAddChildNode={addChildNode}
            onAddQuickSibling={() => requestQuickCreate("sibling-after")}
            onAddQuickChild={() => requestQuickCreate("child")}
            onOpenBranchText={() => {
              if (!guardEditAction()) return;
              setBranchTextOpen(true);
            }}
            onOpenLayoutPanel={openLayoutPanel}
            onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
            onUndoLayout={undoLastLayout}
            onUndoOutline={() => void undoLastOutlineAction()}
            undoLayoutAvailable={Boolean(layoutUndoSnapshot)}
            undoOutlineAvailable={Boolean(outlineUndoAction)}
            onZoomIn={() => flowInstance?.zoomIn({ duration: 180 })}
            onZoomOut={() => flowInstance?.zoomOut({ duration: 180 })}
            onCenter={() => flowInstance?.fitView(getFitViewOptions())}
            onFullscreen={requestFullscreen}
          />
          <MasterMapFilters
            open={filtersOpen}
            filters={filters}
            responsibleOptions={responsibleOptions}
            onChange={setFilters}
            onClose={() => setFiltersOpen(false)}
          />
          <MasterMapAttentionPanel
            open={attentionOpen}
            items={attentionItems}
            onClose={() => setAttentionOpen(false)}
            onOpenPage={openNodePage}
            onViewInMap={(nodeId) => centerNodeInMap(nodeId, true)}
          />
          {debouncedSearchQuery.trim() && (
            <section className="master-map-search-results" aria-label="Resultados da busca do Mapa Mestre">
              <div className="master-map-panel-head">
                <div>
                  <p className="eyebrow">Busca</p>
                  <h2>{searchResults.length ? "Resultados encontrados" : "Nenhum resultado"}</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setSearchQuery("")}>Limpar busca</button>
              </div>
              {searchResults.length ? (
                <div className="master-map-search-result-list">
                  {searchResults.map((node) => {
                    const mapName = maps.find((map) => map.id === node.mapId)?.name ?? "Mapa";
                    return (
                      <article className="master-map-search-result" key={node.id}>
                        <div>
                          <span className={`master-map-status-dot status-${node.status.toLowerCase().replace(/_/g, "-")}`} aria-hidden />
                          <strong>{renderHighlightedText(node.title, debouncedSearchQuery)}</strong>
                          <p>{mapName} - {masterMapStatusLabels[node.status]}</p>
                        </div>
                        <div className="master-map-card-actions">
                          {node.destinationType === "DYNAMIC_PAGE" && node.dynamicPageId && (
                            <button className="secondary-button" type="button" onClick={() => openNodePage(node)}>Abrir pagina</button>
                          )}
                          <button className="primary-button" type="button" onClick={() => centerNodeInMap(node.id, true)}>Ver no mapa</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="master-map-muted">Tente outro termo ou limpe os filtros ativos.</p>
              )}
            </section>
          )}

          <section className="master-map-workspace" ref={canvasShellRef}>
            {renderWorkspaceContent()}
            <MasterMapLayoutPanel
              open={layoutPanelOpen}
              preferences={layoutPreferences}
              selectedNode={selectedNode}
              selectedNodes={selectedLayoutNodes}
              referenceNodeId={layoutReferenceNodeId || selectedLayoutNodes[0]?.id || ""}
              visualStyle={visualStyleDraft}
              visualStyleDirtyFields={visualStyleDirtyFields}
              editable={editable}
              calculating={layoutCalculating}
              previewActive={Boolean(layoutPreview)}
              undoAvailable={Boolean(layoutUndoSnapshot)}
              affectedCount={layoutPreview?.affectedNodeIds.size ?? 0}
              collisionCount={layoutPreview?.collisionCount ?? 0}
              onChange={handleLayoutPreferencesChange}
              onReferenceChange={setLayoutReferenceNodeId}
              onVisualStyleChange={handleVisualStyleDraftChange}
              onApplyReferenceStyle={previewReferenceVisualStyle}
              onClose={closeLayoutPanel}
              onPreview={previewMasterMapLayout}
              onAlignmentPreview={previewAlignment}
              onApply={applyLayoutPreview}
              onCancelPreview={cancelLayoutPreview}
              onUndo={undoLastLayout}
            />
            {viewMode === "map" && (
              <MasterMapDetails
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
                nodes={activeNodes}
                edges={activeEdges}
                editMode={editMode}
                onClose={() => {
                  setSelectedNodeId(undefined);
                  setSelectedEdgeId(undefined);
                }}
                onSaveNode={persistNode}
                onInactivateNode={inactivateNode}
                onSaveEdge={(edge) => persistEdge(edge)}
                onInactivateEdge={inactivateEdge}
                onOpenModule={onOpenModule}
                onOpenDynamicPage={openDynamicPage}
                onOpenExternalUrl={openExternalUrl}
              />
            )}
            <MasterMapCreateNodeDialog
              open={Boolean(createDialogMode)}
              mode={createDialogMode ?? "node"}
              templates={templates}
              onClose={() => setCreateDialogMode(null)}
              onSubmit={submitCreateNode}
            />
            <MasterMapQuickTitleDialog
              open={Boolean(quickCreateRequest)}
              kind={quickCreateRequest?.kind ?? "sibling-after"}
              referenceTitle={quickCreateRequest ? activeNodes.find((node) => node.id === quickCreateRequest.referenceNodeId)?.title : undefined}
              onClose={() => setQuickCreateRequest(null)}
              onSubmit={submitQuickCreate}
            />
            <MasterMapBranchTextDialog
              open={branchTextOpen}
              referenceTitle={(selectedNode ?? activeNodes.find((node) => node.nodeType === "root") ?? activeNodes[0])?.title}
              onClose={() => setBranchTextOpen(false)}
              onSubmit={submitBranchText}
            />
            <MasterMapReparentDialog
              open={Boolean(reparentNodeId)}
              node={reparentNodeId ? activeNodes.find((node) => node.id === reparentNodeId) ?? null : null}
              nodes={activeNodes}
              edges={activeEdges}
              onClose={() => setReparentNodeId(null)}
              onSubmit={submitReparent}
            />
            <MasterMapShortcutHelp
              open={shortcutHelpOpen}
              onClose={() => setShortcutHelpOpen(false)}
            />
          </section>
        </>
      )}
    </section>
  );
}

function getDynamicPageIdFromUrl() {
  if (typeof window === "undefined") return null;
  const pageId = new URL(window.location.href).searchParams.get("mapPage");
  return pageId || null;
}

function setMapPageUrl(pageId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("mapPage", pageId);
  window.history.pushState({ mapPage: pageId }, "", url);
}

function clearMapPageUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("mapPage");
  window.history.pushState({}, "", url);
}

function getInitialMasterMapViewMode(): MasterMapViewMode {
  if (typeof window === "undefined") return "map";
  const savedMode = window.localStorage.getItem(MASTER_MAP_VIEW_MODE_KEY);
  if (isMasterMapViewMode(savedMode)) return savedMode;
  return window.matchMedia("(max-width: 720px)").matches ? "list" : "map";
}

function saveMasterMapViewModePreference(viewMode: MasterMapViewMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MASTER_MAP_VIEW_MODE_KEY, viewMode);
}

function getInitialMasterMapFilters(): MasterMapFilterState {
  if (typeof window === "undefined") return defaultMasterMapFilters;
  const savedFilters = window.localStorage.getItem(MASTER_MAP_FILTERS_KEY);
  if (!savedFilters) return defaultMasterMapFilters;
  try {
    const parsed = JSON.parse(savedFilters) as Partial<MasterMapFilterState>;
    return {
      statuses: Array.isArray(parsed.statuses) ? parsed.statuses : defaultMasterMapFilters.statuses,
      nodeTypes: Array.isArray(parsed.nodeTypes) ? parsed.nodeTypes : defaultMasterMapFilters.nodeTypes,
      destinationTypes: Array.isArray(parsed.destinationTypes) ? parsed.destinationTypes : defaultMasterMapFilters.destinationTypes,
      responsible: typeof parsed.responsible === "string" ? parsed.responsible : defaultMasterMapFilters.responsible,
      withDynamicPage: Boolean(parsed.withDynamicPage),
      withoutDynamicPage: Boolean(parsed.withoutDynamicPage),
      highPriority: Boolean(parsed.highPriority),
      overdue: Boolean(parsed.overdue),
      withoutResponsible: Boolean(parsed.withoutResponsible),
      withoutNextAction: Boolean(parsed.withoutNextAction),
      onlyActive: parsed.onlyActive !== false,
    };
  } catch {
    return defaultMasterMapFilters;
  }
}

function saveMasterMapFiltersPreference(filters: MasterMapFilterState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MASTER_MAP_FILTERS_KEY, JSON.stringify(filters));
}

function isMasterMapViewMode(value: string | null): value is MasterMapViewMode {
  return value === "map" || value === "list" || value === "focus" || value === "impact" || value === "director";
}

function getAffectedLayoutNodeIds(
  visibleNodes: MasterMapNode[],
  visibleEdges: MasterMapEdge[],
  preferences: MasterMapLayoutPreferences,
  selectedNode: MasterMapNode | null,
) {
  if (preferences.scope === "branch" && selectedNode) {
    const descendants = getMasterMapDescendants(selectedNode.id, visibleNodes, visibleEdges);
    return new Set([selectedNode.id, ...descendants.map((node) => node.id)]);
  }

  return new Set(visibleNodes.map((node) => node.id));
}

function createMasterMapNodeSnapshot(nodes: MasterMapNode[]): MasterMapNodeSnapshot[] {
  return nodes.map((node) => ({
    id: node.id,
    positionX: node.positionX,
    positionY: node.positionY,
    metadata: cloneNodeMetadata(node.metadata),
    updatedAt: node.updatedAt,
  }));
}

function restoreNodesFromSnapshot(nodes: MasterMapNode[], snapshot: MasterMapNodeSnapshot[]) {
  const snapshotById = new Map(snapshot.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const previous = snapshotById.get(node.id);
    if (!previous) return node;
    return {
      ...node,
      positionX: previous.positionX,
      positionY: previous.positionY,
      metadata: cloneNodeMetadata(previous.metadata),
      updatedAt: new Date().toISOString(),
    };
  });
}

function createPreviewNodes(
  nodes: MasterMapNode[],
  positions: MasterMapPositionPatch[],
  visualStyleNodeIds: Set<string>,
  visualStylePatch: Partial<Required<MasterMapNodeVisualStyle>>,
) {
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const hasVisualPatch = hasMasterMapVisualStylePatch(visualStylePatch);
  const affectedIds = new Set([...positionById.keys(), ...(hasVisualPatch ? visualStyleNodeIds : new Set<string>())]);
  return nodes
    .filter((node) => affectedIds.has(node.id))
    .map((node) => {
      const position = positionById.get(node.id);
      const metadata = hasVisualPatch && visualStyleNodeIds.has(node.id)
        ? { ...node.metadata, visualStyle: mergeMasterMapVisualStylePatch(node.metadata.visualStyle, visualStylePatch) }
        : node.metadata;
      return {
        ...node,
        positionX: position?.positionX ?? node.positionX,
        positionY: position?.positionY ?? node.positionY,
        metadata,
        updatedAt: new Date().toISOString(),
      };
    });
}

function mergePreviewNodesIntoNodes(nodes: MasterMapNode[], previewNodes: MasterMapNode[]) {
  const previewById = new Map(previewNodes.map((node) => [node.id, node]));
  return nodes.map((node) => previewById.get(node.id) ?? node);
}

function getMasterMapNodeLayoutUpdates(originalNodes: MasterMapNodeSnapshot[], previewNodes: MasterMapNode[]): MasterMapNodeLayoutUpdate[] {
  const originalById = new Map(originalNodes.map((node) => [node.id, node]));
  return previewNodes.flatMap((node) => {
    const original = originalById.get(node.id);
    if (!original) return [];

    const update: MasterMapNodeLayoutUpdate = { id: node.id };
    const positionChanged = original.positionX !== node.positionX || original.positionY !== node.positionY;
    const visualStyleChanged = !areSameMasterMapVisualStyle(original.metadata.visualStyle, node.metadata.visualStyle);

    if (positionChanged) {
      update.positionX = node.positionX;
      update.positionY = node.positionY;
    }

    if (visualStyleChanged) {
      update.visualStyle = node.metadata.visualStyle ? normalizeMasterMapVisualStyle(node.metadata.visualStyle) : null;
    }

    return positionChanged || visualStyleChanged ? [update] : [];
  });
}

function getVisualStylePatch(
  dirtyFields: Set<MasterMapNodeVisualStyleField>,
  visualStyle: Required<MasterMapNodeVisualStyle>,
): Partial<Required<MasterMapNodeVisualStyle>> {
  const patch: Partial<Required<MasterMapNodeVisualStyle>> = {};
  dirtyFields.forEach((field) => {
    patch[field] = visualStyle[field] as never;
  });
  return normalizeMasterMapVisualStylePatch(patch);
}

function normalizeMasterMapVisualStylePatch(patch: Partial<Required<MasterMapNodeVisualStyle>>) {
  const normalized = normalizeMasterMapVisualStyle(patch);
  const nextPatch: Partial<Required<MasterMapNodeVisualStyle>> = {};
  (Object.keys(patch) as MasterMapNodeVisualStyleField[]).forEach((field) => {
    nextPatch[field] = normalized[field] as never;
  });
  return nextPatch;
}

function hasMasterMapVisualStylePatch(patch: Partial<Required<MasterMapNodeVisualStyle>>) {
  return Object.keys(patch).length > 0;
}

function detectPreviewCollisions(
  nodes: MasterMapNode[],
  previewPositions: MasterMapPositionPatch[],
  dimensions: Map<string, MasterMapNodeDimension>,
  affectedNodeIds: Set<string>,
) {
  const mergedPositions = mergeMasterMapPositions(
    nodes.map((node) => ({ id: node.id, positionX: node.positionX, positionY: node.positionY })),
    previewPositions,
  );
  return detectMasterMapLayoutCollisions(mergedPositions, dimensions)
    .filter((collision) => affectedNodeIds.has(collision.firstNodeId) || affectedNodeIds.has(collision.secondNodeId));
}

function calculateAlignmentPositions(
  nodes: MasterMapNode[],
  dimensions: Map<string, MasterMapNodeDimension>,
  referenceNode: MasterMapNode,
  action: MasterMapAlignmentAction,
): MasterMapPositionPatch[] {
  const spacing = masterMapSpacingPresets.comfortable.nodeGap;
  const referenceBox = getMasterMapNodeBox(referenceNode, dimensions);
  const boxes = nodes.map((node) => ({ node, box: getMasterMapNodeBox(node, dimensions) }));

  if (action === "distribute-x") {
    const sorted = [...boxes].sort((a, b) => a.box.left - b.box.left);
    const minLeft = sorted[0].box.left;
    const totalWidth = sorted.reduce((total, item) => total + item.box.width, 0);
    const maxRight = sorted[sorted.length - 1].box.right;
    const gap = Math.max(spacing, (maxRight - minLeft - totalWidth) / Math.max(1, sorted.length - 1));
    let cursorX = minLeft;
    return sorted.map(({ node, box }) => {
      const patch = { id: node.id, positionX: Math.round(cursorX), positionY: node.positionY };
      cursorX += box.width + gap;
      return patch;
    });
  }

  if (action === "distribute-y") {
    const sorted = [...boxes].sort((a, b) => a.box.top - b.box.top);
    const minTop = sorted[0].box.top;
    const totalHeight = sorted.reduce((total, item) => total + item.box.height, 0);
    const maxBottom = sorted[sorted.length - 1].box.bottom;
    const gap = Math.max(spacing, (maxBottom - minTop - totalHeight) / Math.max(1, sorted.length - 1));
    let cursorY = minTop;
    return sorted.map(({ node, box }) => {
      const patch = { id: node.id, positionX: node.positionX, positionY: Math.round(cursorY) };
      cursorY += box.height + gap;
      return patch;
    });
  }

  return boxes.map(({ node, box }) => {
    if (action === "align-left") return { id: node.id, positionX: referenceBox.left, positionY: node.positionY };
    if (action === "align-center-x") return { id: node.id, positionX: Math.round(referenceBox.centerX - box.width / 2), positionY: node.positionY };
    if (action === "align-right") return { id: node.id, positionX: Math.round(referenceBox.right - box.width), positionY: node.positionY };
    if (action === "align-top") return { id: node.id, positionX: node.positionX, positionY: referenceBox.top };
    if (action === "align-center-y") return { id: node.id, positionX: node.positionX, positionY: Math.round(referenceBox.centerY - box.height / 2) };
    return { id: node.id, positionX: node.positionX, positionY: Math.round(referenceBox.bottom - box.height) };
  });
}

function resolveAlignmentCollisions(
  nodes: MasterMapNode[],
  positions: MasterMapPositionPatch[],
  dimensions: Map<string, MasterMapNodeDimension>,
  affectedNodeIds: Set<string>,
  action: MasterMapAlignmentAction,
  referenceNodeId: string,
) {
  const spacing = masterMapSpacingPresets.comfortable.nodeGap;
  const movableAxis: "x" | "y" = ["align-left", "align-center-x", "align-right", "distribute-x"].includes(action) ? "y" : "x";
  const nextPositions = positions.map((position) => ({ ...position }));
  const positionById = new Map(nextPositions.map((position) => [position.id, position]));
  const orderedMovableIds = nextPositions.map((position) => position.id).filter((nodeId) => nodeId !== referenceNodeId);

  orderedMovableIds.forEach((nodeId) => {
    const patch = positionById.get(nodeId);
    if (!patch) return;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const nodeBox = getMasterMapPreviewNodeBox(nodeId, nodes, dimensions, positionById);
      const collisionNode = nodes.find((node) => node.id !== nodeId && boxesOverlap(nodeBox, getMasterMapPreviewNodeBox(node.id, nodes, dimensions, positionById)));
      if (!collisionNode) return;

      const collisionBox = getMasterMapPreviewNodeBox(collisionNode.id, nodes, dimensions, positionById);
      if (movableAxis === "x") {
        patch.positionX = Math.max(patch.positionX, Math.ceil(collisionBox.right + spacing));
      } else {
        patch.positionY = Math.max(patch.positionY, Math.ceil(collisionBox.bottom + spacing));
      }
    }
  });

  return nextPositions.filter((position) => affectedNodeIds.has(position.id));
}

function getMasterMapNodeBox(node: MasterMapNode, dimensions: Map<string, MasterMapNodeDimension>) {
  const dimension = dimensions.get(node.id);
  const width = dimension?.width ?? 270;
  const height = dimension?.height ?? 140;
  return {
    left: node.positionX,
    top: node.positionY,
    right: node.positionX + width,
    bottom: node.positionY + height,
    centerX: node.positionX + width / 2,
    centerY: node.positionY + height / 2,
    width,
    height,
  };
}

function getMasterMapPreviewNodeBox(
  nodeId: string,
  nodes: MasterMapNode[],
  dimensions: Map<string, MasterMapNodeDimension>,
  positionById: Map<string, MasterMapPositionPatch>,
) {
  const node = nodes.find((current) => current.id === nodeId);
  const position = positionById.get(nodeId);
  const dimension = dimensions.get(nodeId);
  const width = dimension?.width ?? 270;
  const height = dimension?.height ?? 140;
  const left = position?.positionX ?? node?.positionX ?? 0;
  const top = position?.positionY ?? node?.positionY ?? 0;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function boxesOverlap(
  first: { left: number; top: number; right: number; bottom: number },
  second: { left: number; top: number; right: number; bottom: number },
) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function cloneNodeMetadata(metadata: MasterMapNode["metadata"]) {
  return JSON.parse(JSON.stringify(metadata ?? {})) as MasterMapNode["metadata"];
}

function createQuickOutlineNode(
  mapId: string,
  referenceNode: MasterMapNode,
  kind: MasterMapQuickCreateKind,
  title: string,
  nodes: MasterMapNode[],
  edges: MasterMapEdge[],
) {
  const hierarchy = buildMasterMapHierarchy(nodes, edges);
  const parentId = kind === "child" ? referenceNode.id : hierarchy.parentByChild.get(referenceNode.id) ?? undefined;
  const positionX = kind === "child" ? referenceNode.positionX + 330 : referenceNode.positionX;
  const positionY = kind === "sibling-before" ? referenceNode.positionY - 150 : referenceNode.positionY + 150;
  const node = {
    ...createEmptyMasterMapNode(mapId, positionX, positionY, parentId),
    title,
    nodeType: "task" as const,
    iconKey: "settings" as const,
    status: "NOT_STARTED" as const,
    destinationType: "NONE" as const,
    metadata: {
      ...(parentId ? { parentId } : {}),
      outlineOrder: 0,
    },
  };

  return {
    node,
    edge: parentId ? createMasterMapEdgeDraft(mapId, parentId, node.id, "BELONGS_TO") : null,
  };
}

function createOutlineNodesFromText(
  mapId: string,
  baseParent: MasterMapNode,
  items: MasterMapOutlineTextItem[],
) {
  const nodeByTempId = new Map<string, MasterMapNode>();
  const orderByParent = new Map<string, number>();
  const nodes: MasterMapNode[] = [];
  const edges: MasterMapEdge[] = [];

  items.forEach((item, index) => {
    const parentNode = item.parentTempId ? nodeByTempId.get(item.parentTempId) : baseParent;
    const parentKey = parentNode?.id ?? "__root__";
    const outlineOrder = (orderByParent.get(parentKey) ?? 0) + 1;
    orderByParent.set(parentKey, outlineOrder);
    const node = {
      ...createEmptyMasterMapNode(
        mapId,
        baseParent.positionX + ((item.level + 1) * 330),
        baseParent.positionY + ((index + 1) * 125),
        parentNode?.id,
      ),
      title: item.title,
      nodeType: "task" as const,
      iconKey: "settings" as const,
      status: "NOT_STARTED" as const,
      destinationType: "NONE" as const,
      metadata: {
        ...(parentNode ? { parentId: parentNode.id } : {}),
        outlineOrder,
      },
    };
    nodes.push(node);
    nodeByTempId.set(item.id, node);
    if (parentNode) edges.push(createMasterMapEdgeDraft(mapId, parentNode.id, node.id, "BELONGS_TO"));
  });

  return { nodes, edges };
}

function getQuickCreateInsertPosition(kind: MasterMapQuickCreateKind): "before" | "after" | "child" {
  if (kind === "child") return "child";
  return kind === "sibling-before" ? "before" : "after";
}

function getOutlineSiblingIds(parentId: string | null, hierarchy: ReturnType<typeof buildMasterMapHierarchy>) {
  if (parentId) return [...(hierarchy.childrenByParent.get(parentId) ?? [])];
  return [...hierarchy.rootIds, ...hierarchy.orphanIds];
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (["input", "textarea", "select", "button"].includes(tagName)) return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest(".ProseMirror, .tiptap, [contenteditable='true'], .dialog"));
}

function areSameStringArrays(first: string[], second: string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function getInitialMasterMapLayoutPreferences(mapId: string): MasterMapLayoutPreferences {
  const defaultPreferences = getDefaultMasterMapLayoutPreferences();
  if (typeof window === "undefined") return defaultPreferences;
  const saved = window.localStorage.getItem(getMasterMapLayoutStorageKey(mapId));
  if (!saved) return defaultPreferences;
  try {
    const parsed = JSON.parse(saved) as Partial<MasterMapLayoutPreferences>;
    return {
      layoutMode: isMasterMapLayoutMode(parsed.layoutMode) ? parsed.layoutMode : defaultPreferences.layoutMode,
      scope: parsed.scope === "branch" || parsed.scope === "map" ? parsed.scope : defaultPreferences.scope,
      spacing: isMasterMapSpacingPreset(parsed.spacing) ? parsed.spacing : defaultPreferences.spacing,
      nodeDensity: parsed.nodeDensity === "compact" || parsed.nodeDensity === "detailed" ? parsed.nodeDensity : defaultPreferences.nodeDensity,
      connectionMode: parsed.connectionMode === "hierarchy" || parsed.connectionMode === "operational" || parsed.connectionMode === "all" ? parsed.connectionMode : defaultPreferences.connectionMode,
    };
  } catch {
    return defaultPreferences;
  }
}

function saveMasterMapLayoutPreference(mapId: string, preferences: MasterMapLayoutPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getMasterMapLayoutStorageKey(mapId), JSON.stringify(preferences));
}

function getDefaultMasterMapLayoutPreferences() {
  if (typeof window === "undefined") return defaultMasterMapLayoutPreferences;
  return window.matchMedia("(max-width: 720px)").matches
    ? defaultMobileMasterMapLayoutPreferences
    : defaultMasterMapLayoutPreferences;
}

function getMasterMapLayoutStorageKey(mapId: string) {
  return `${MASTER_MAP_LAYOUT_KEY}:${mapId || "default"}`;
}

function isMasterMapLayoutMode(value: unknown): value is MasterMapLayoutPreferences["layoutMode"] {
  return value === "manual"
    || value === "horizontal"
    || value === "vertical"
    || value === "mind"
    || value === "tree-horizontal"
    || value === "tree-vertical";
}

function isMasterMapSpacingPreset(value: unknown): value is MasterMapLayoutPreferences["spacing"] {
  return value === "compact" || value === "comfortable" || value === "wide";
}

function areSameStringSets(first: Set<string>, second: Set<string>) {
  if (first.size !== second.size) return false;
  for (const value of first) {
    if (!second.has(value)) return false;
  }
  return true;
}

function areSameMasterMapVisualStyle(first: MasterMapNodeVisualStyle | undefined, second: MasterMapNodeVisualStyle | undefined) {
  const normalizedFirst = normalizeMasterMapVisualStyle(first);
  const normalizedSecond = normalizeMasterMapVisualStyle(second);
  return normalizedFirst.fillColor === normalizedSecond.fillColor
    && normalizedFirst.borderColor === normalizedSecond.borderColor
    && normalizedFirst.shape === normalizedSecond.shape
    && normalizedFirst.borderStyle === normalizedSecond.borderStyle
    && normalizedFirst.borderWidth === normalizedSecond.borderWidth
    && normalizedFirst.widthPreset === normalizedSecond.widthPreset
    && normalizedFirst.sourcePosition === normalizedSecond.sourcePosition
    && normalizedFirst.targetPosition === normalizedSecond.targetPosition;
}

function areSameMasterMapLayoutPreferences(first: MasterMapLayoutPreferences, second: MasterMapLayoutPreferences) {
  return first.layoutMode === second.layoutMode
    && first.scope === second.scope
    && first.spacing === second.spacing
    && first.nodeDensity === second.nodeDensity
    && first.connectionMode === second.connectionMode;
}

function renderHighlightedText(text: string, query: string) {
  const safeQuery = query.trim();
  if (!safeQuery) return text;
  const index = text.toLowerCase().indexOf(safeQuery.toLowerCase());
  if (index < 0) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + safeQuery.length);
  const after = text.slice(index + safeQuery.length);
  return (
    <>
      {before}
      <mark>{match}</mark>
      {after}
    </>
  );
}
