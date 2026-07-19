import { useEffect, useMemo, useRef, useState } from "react";
import { type ReactFlowInstance } from "@xyflow/react";
import { AppIcon } from "../../components/AppIcon";
import { MasterMapCanvas } from "./MasterMapCanvas";
import { MasterMapDetails } from "./MasterMapDetails";
import { MasterMapLegend } from "./MasterMapLegend";
import { MasterMapToolbar } from "./MasterMapToolbar";
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

  const activeMap = maps.find((map) => map.id === activeMapId) ?? maps[0];
  const activeNodes = useMemo(() => nodes.filter((node) => node.mapId === activeMap?.id), [activeMap?.id, nodes]);
  const activeEdges = useMemo(() => edges.filter((edge) => edge.mapId === activeMap?.id), [activeMap?.id, edges]);
  const selectedNode = activeNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = activeEdges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const editable = canEdit && remoteEditable;

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

  function getFitViewOptions() {
    const compactViewport = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    return {
      padding: compactViewport ? 0.08 : 0.24,
      minZoom: compactViewport ? 0.5 : 0.25,
      maxZoom: compactViewport ? 0.9 : 1,
      duration: 260,
    };
  }

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
  }

  function handleSelectEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
  }

  function openNodeDetails(nodeId: string) {
    handleSelectNode(nodeId);
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
    const newNode = createEmptyMasterMapNode(activeMap.id, 120, 120);
    void persistNewNode(newNode);
  }

  function addChildNode() {
    if (!activeMap || !editMode || !guardEditAction()) return;
    const parent = selectedNode ?? activeNodes.find((node) => node.nodeType === "root") ?? activeNodes[0];
    const newNode = createEmptyMasterMapNode(activeMap.id, (parent?.positionX ?? 0) + 330, (parent?.positionY ?? 0) + 90, parent?.id);
    const newEdge = parent ? createMasterMapEdgeDraft(activeMap.id, parent.id, newNode.id, "BELONGS_TO") : null;
    void persistNewNode(newNode, newEdge);
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
    saveMasterMapNodeRemote(nextNode).then((savedNode) => {
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
          <MasterMapToolbar
            maps={maps}
            activeMapId={activeMap?.id ?? ""}
            canEdit={editable}
            editMode={editMode}
            saveStatus={saveStatus}
            onMapChange={handleMapChange}
            onToggleEditMode={toggleEditMode}
            onAddNode={addNode}
            onAddChildNode={addChildNode}
            onZoomIn={() => flowInstance?.zoomIn({ duration: 180 })}
            onZoomOut={() => flowInstance?.zoomOut({ duration: 180 })}
            onCenter={() => flowInstance?.fitView(getFitViewOptions())}
            onFullscreen={requestFullscreen}
          />

          <section className="master-map-workspace" ref={canvasShellRef}>
            {loading || !activeMap ? (
              <section className="empty-state master-map-loading"><h2>Carregando Mapa Mestre...</h2></section>
            ) : (
              <MasterMapCanvas
                nodes={activeNodes}
                edges={activeEdges}
                editMode={editMode}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                onInit={setFlowInstance}
                onSelectNode={handleSelectNode}
                onSelectEdge={handleSelectEdge}
                onMoveNode={handleNodeMove}
                onCreateConnection={createConnection}
                onOpenNodeDetails={openNodeDetails}
                onOpenModule={onOpenModule}
                onToggleCollapse={toggleCollapse}
              />
            )}
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
            />
          </section>
        </>
      )}
    </section>
  );
}
