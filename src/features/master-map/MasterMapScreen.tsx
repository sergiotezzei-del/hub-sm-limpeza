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
import { getFilteredMasterMapNodes, masterMapStatusLabels } from "./graph/masterMapGraphUtils";
import { MasterMapFilters } from "./navigation/MasterMapFilters";
import { MasterMapNavigationBar } from "./navigation/MasterMapNavigationBar";
import { MasterMapDirectorView } from "./views/MasterMapDirectorView";
import { MasterMapFocusView } from "./views/MasterMapFocusView";
import { MasterMapImpactView } from "./views/MasterMapImpactView";
import { MasterMapListView } from "./views/MasterMapListView";
import { createDynamicPageForNode, loadDynamicPageSummaries, loadDynamicPageTemplates, syncDynamicPageProjectionFromNode } from "./dynamicPageService";
import type { DynamicPage, DynamicPageSummary, DynamicPageTemplate } from "./dynamicPageTypes";
import {
  createEmptyMasterMapNode,
  createMasterMapEdgeDraft,
  createMasterMapEdgeRemote,
  createMasterMapNodeRemote,
  loadMasterMapData,
  saveLocalMasterMapCache,
  saveMasterMapEdgeRemote,
  saveMasterMapNodeRemote,
} from "./masterMapService";
import type { MasterMap, MasterMapData, MasterMapEdge, MasterMapNode, MasterMapSaveStatus, MasterMapTargetScreen } from "./masterMapTypes";
import { defaultMasterMapFilters, getMasterMapActiveFilterCount, type MasterMapFilterState, type MasterMapViewMode } from "./types/masterMapNavigationTypes";

const MASTER_MAP_VIEW_MODE_KEY = "hub-sm-master-map-view-mode";
const MASTER_MAP_FILTERS_KEY = "hub-sm-master-map-filters";

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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
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
    const handlePopState = () => setActiveDynamicPageId(getDynamicPageIdFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFiltersOpen(false);
      setAttentionOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeMap = maps.find((map) => map.id === activeMapId) ?? maps[0];
  const activeNodes = useMemo(() => nodes.filter((node) => node.mapId === activeMap?.id), [activeMap?.id, nodes]);
  const activeEdges = useMemo(() => edges.filter((edge) => edge.mapId === activeMap?.id), [activeMap?.id, edges]);
  const selectedNode = activeNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = activeEdges.find((edge) => edge.id === selectedEdgeId) ?? null;
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
    setActiveMapId(mapId);
    setSelectedNodeId(undefined);
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

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
  }

  function handleSelectEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
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
    const node = nodes.find((current) => current.id === nodeId);
    if (!node) return;
    persistNode({ ...node, positionX, positionY, updatedAt: new Date().toISOString() });
  }

  function toggleCollapse(nodeId: string) {
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
    saveMasterMapNodeRemote(nextNode).then(async (savedNode) => {
      if (savedNode.destinationType === "DYNAMIC_PAGE" && savedNode.dynamicPageId) {
        await syncDynamicPageProjectionFromNode(savedNode);
        setPageSummaries((current) => current.map((summary) => summary.id === savedNode.dynamicPageId ? {
          ...summary,
          status: savedNode.status,
          responsible: savedNode.responsible ?? "",
          nextAction: savedNode.nextAction ?? "",
          updatedAt: new Date().toISOString(),
        } : summary));
      }
      updateNodeLocal(savedNode);
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
          onOpenPage={openNodePage}
          onViewInMap={(nodeId) => centerNodeInMap(nodeId, true)}
          onOpenDetails={openNodeDetails}
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
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        highlightedNodeIds={highlightedNodeIds}
        dimmedNodeIds={dimmedNodeIds}
        forceVisibleNodeIds={forceVisibleNodeIds}
        onInit={setFlowInstance}
        onSelectNode={handleSelectNode}
        onSelectEdge={handleSelectEdge}
        onMoveNode={handleNodeMove}
        onCreateConnection={createConnection}
        onOpenNodeDetails={openNodeDetails}
        onOpenModule={onOpenModule}
        onOpenDynamicPage={openDynamicPage}
        onOpenExternalUrl={openExternalUrl}
        onToggleCollapse={toggleCollapse}
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
