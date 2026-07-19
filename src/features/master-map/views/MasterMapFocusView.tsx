import { useMemo } from "react";
import { AppIcon } from "../../../components/AppIcon";
import { getMasterMapAncestors, getMasterMapDescendants, getMasterMapNextAction, getMasterMapResponsible, masterMapRelationLabels, masterMapStatusLabels } from "../graph/masterMapGraphUtils";
import type { MasterMapEdge, MasterMapNode } from "../masterMapTypes";
import type { DynamicPageSummary } from "../types/masterMapNavigationTypes";

export function MasterMapFocusView({
  selectedNode,
  nodes,
  edges,
  pageSummaries,
  onExit,
  onViewFullMap,
  onOpenPage,
  onOpenDetails,
}: {
  selectedNode: MasterMapNode | null;
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  pageSummaries: DynamicPageSummary[];
  onExit: () => void;
  onViewFullMap: (nodeId: string) => void;
  onOpenPage: (node: MasterMapNode) => void;
  onOpenDetails: (nodeId: string) => void;
}) {
  const pageSummaryByNode = useMemo(() => new Map(pageSummaries.map((summary) => [summary.nodeId, summary])), [pageSummaries]);
  const focusData = useMemo(() => {
    if (!selectedNode) return null;
    return {
      ancestors: getMasterMapAncestors(selectedNode.id, nodes, edges),
      descendants: getMasterMapDescendants(selectedNode.id, nodes, edges),
      directEdges: edges.filter((edge) => edge.isActive && (edge.sourceNodeId === selectedNode.id || edge.targetNodeId === selectedNode.id)),
    };
  }, [edges, nodes, selectedNode]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  if (!selectedNode || !focusData) {
    return (
      <section className="master-map-view-panel">
        <section className="empty-state">
          <h2>Selecione um quadro</h2>
          <p>Escolha um quadro no mapa ou na lista para enxergar a ramificacao em foco.</p>
        </section>
      </section>
    );
  }

  return (
    <section className="master-map-view-panel master-map-focus-view" aria-label="Modo foco do Mapa Mestre">
      <div className="master-map-view-head">
        <div>
          <p className="eyebrow">Modo foco</p>
          <h2>{selectedNode.title}</h2>
        </div>
        <div className="master-map-card-actions">
          <button className="ghost-button" type="button" onClick={onExit}>Sair do foco</button>
          <button className="secondary-button" type="button" onClick={() => onViewFullMap(selectedNode.id)}>Ver no mapa completo</button>
        </div>
      </div>

      <nav className="master-map-breadcrumb" aria-label="Caminho da ramificacao">
        {focusData.ancestors.map((node) => <button className="ghost-button" key={node.id} type="button" onClick={() => onViewFullMap(node.id)}>{node.title}</button>)}
        <strong>{selectedNode.title}</strong>
      </nav>

      <div className="master-map-focus-grid">
        <section>
          <h3>Quadro selecionado</h3>
          <FocusCard node={selectedNode} pageSummary={pageSummaryByNode.get(selectedNode.id)} onOpenDetails={onOpenDetails} onOpenPage={onOpenPage} />
        </section>

        <section>
          <h3>Descendentes</h3>
          {focusData.descendants.length === 0 ? <p className="master-map-muted">Nenhum descendente direto neste ramo.</p> : focusData.descendants.map((node) => (
            <FocusCard key={node.id} node={node} pageSummary={pageSummaryByNode.get(node.id)} onOpenDetails={onOpenDetails} onOpenPage={onOpenPage} compact />
          ))}
        </section>

        <section>
          <h3>Conexoes diretas</h3>
          {focusData.directEdges.length === 0 ? <p className="master-map-muted">Nenhuma conexao direta cadastrada.</p> : focusData.directEdges.map((edge) => {
            const otherNode = nodeById.get(edge.sourceNodeId === selectedNode.id ? edge.targetNodeId : edge.sourceNodeId);
            return (
              <article className="master-map-connection-card" key={edge.id}>
                <span>{masterMapRelationLabels[edge.relationType]}</span>
                <strong>{otherNode?.title ?? "Quadro relacionado"}</strong>
                <small>{edge.sourceNodeId === selectedNode.id ? "Sai deste quadro" : "Chega neste quadro"}</small>
              </article>
            );
          })}
        </section>
      </div>
    </section>
  );
}

function FocusCard({
  node,
  pageSummary,
  compact = false,
  onOpenPage,
  onOpenDetails,
}: {
  node: MasterMapNode;
  pageSummary?: DynamicPageSummary;
  compact?: boolean;
  onOpenPage: (node: MasterMapNode) => void;
  onOpenDetails: (nodeId: string) => void;
}) {
  return (
    <article className={`master-map-small-card ${compact ? "compact" : ""}`}>
      <span className="module-icon-circle" aria-hidden="true"><AppIcon name={node.iconKey} size="md" className="module-icon" /></span>
      <div>
        <h4>{node.title}</h4>
        <p>{node.description || "Sem descricao curta."}</p>
        <div className="master-map-list-meta">
          <span>{masterMapStatusLabels[node.status]}</span>
          <span>Resp.: {getMasterMapResponsible(node, pageSummary) || "Nao informado"}</span>
          <span>Acao: {getMasterMapNextAction(node, pageSummary) || "Nao informada"}</span>
        </div>
        <div className="master-map-card-actions">
          {node.dynamicPageId && <button className="secondary-button" type="button" onClick={() => onOpenPage(node)}>Abrir pagina</button>}
          <button className="ghost-button" type="button" onClick={() => onOpenDetails(node.id)}>Detalhes</button>
        </div>
      </div>
    </article>
  );
}
