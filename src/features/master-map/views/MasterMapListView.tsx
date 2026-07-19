import { useMemo, useState, type CSSProperties } from "react";
import { AppIcon } from "../../../components/AppIcon";
import { buildMasterMapHierarchy, createPageSummaryMap, dynamicPagePriorityLabelsShort, getMasterMapNextAction, getMasterMapResponsible, masterMapDestinationLabels, masterMapNodeTypeLabels, masterMapStatusLabels } from "../graph/masterMapGraphUtils";
import type { MasterMapEdge, MasterMapNode } from "../masterMapTypes";
import type { DynamicPageSummary } from "../types/masterMapNavigationTypes";

export function MasterMapListView({
  nodes,
  edges,
  pageSummaries,
  onOpenPage,
  onViewInMap,
  onOpenDetails,
}: {
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  pageSummaries: DynamicPageSummary[];
  onOpenPage: (node: MasterMapNode) => void;
  onViewInMap: (nodeId: string) => void;
  onOpenDetails: (nodeId: string) => void;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const hierarchy = useMemo(() => buildMasterMapHierarchy(nodes, edges), [edges, nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const pageSummaryByNode = useMemo(() => createPageSummaryMap(pageSummaries), [pageSummaries]);

  function toggleCollapsed(nodeId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function renderNode(nodeId: string, level: number) {
    const node = nodeById.get(nodeId);
    if (!node) return null;
    const children = hierarchy.childrenByParent.get(node.id) ?? [];
    const collapsed = collapsedIds.has(node.id);
    const pageSummary = pageSummaryByNode.get(node.id);

    return (
      <div className="master-map-list-branch" key={node.id}>
        <article className="master-map-list-item" style={{ "--level": level } as CSSProperties}>
          <button
            aria-label={children.length > 0 ? (collapsed ? "Expandir ramo" : "Recolher ramo") : "Sem filhos"}
            className="ghost-button master-map-tree-toggle"
            disabled={children.length === 0}
            type="button"
            onClick={() => toggleCollapsed(node.id)}
          >
            {children.length > 0 ? (collapsed ? "+" : "-") : ""}
          </button>
          <span className="module-icon-circle" aria-hidden="true"><AppIcon name={node.iconKey} size="md" className="module-icon" /></span>
          <div className="master-map-list-main">
            <div className="master-map-list-title">
              <h3>{node.title}</h3>
              <span className={`master-map-chip status-${node.status.toLowerCase().replace(/_/g, "-")}`}>{masterMapStatusLabels[node.status]}</span>
            </div>
            <p>{node.description || masterMapDestinationLabels[node.destinationType]}</p>
            <div className="master-map-list-meta">
              <span>{masterMapNodeTypeLabels[node.nodeType]}</span>
              <span>Resp.: {getMasterMapResponsible(node, pageSummary) || "Nao informado"}</span>
              <span>Acao: {getMasterMapNextAction(node, pageSummary) || "Nao informada"}</span>
              {pageSummary && <span>Prioridade: {dynamicPagePriorityLabelsShort[pageSummary.priority]}</span>}
              {pageSummary?.dueDate && <span>Prazo: {pageSummary.dueDate}</span>}
            </div>
          </div>
          <div className="master-map-card-actions">
            {node.dynamicPageId && <button className="secondary-button" type="button" onClick={() => onOpenPage(node)}>Abrir pagina</button>}
            <button className="ghost-button" type="button" onClick={() => onViewInMap(node.id)}>Ver no mapa</button>
            <button className="ghost-button" type="button" onClick={() => onOpenDetails(node.id)}>Detalhes</button>
          </div>
        </article>
        {!collapsed && children.map((childId) => renderNode(childId, level + 1))}
      </div>
    );
  }

  return (
    <section className="master-map-view-panel master-map-list-view" aria-label="Lista hierarquica do Mapa Mestre">
      <div className="master-map-view-head">
        <div>
          <p className="eyebrow">Modo lista</p>
          <h2>Arvore hierarquica</h2>
        </div>
        <span>{nodes.length} quadro(s)</span>
      </div>

      {nodes.length === 0 ? (
        <section className="empty-state"><h2>Nenhum resultado</h2><p>Limpe a busca ou ajuste os filtros para voltar a visualizar os quadros.</p></section>
      ) : (
        <>
          <div className="master-map-list-tree">
            {hierarchy.rootIds.map((nodeId) => renderNode(nodeId, 0))}
          </div>
          {hierarchy.orphanIds.length > 0 && (
            <section className="master-map-orphan-section">
              <h3>Sem vinculo hierarquico</h3>
              <div className="master-map-list-tree">
                {hierarchy.orphanIds.map((nodeId) => renderNode(nodeId, 0))}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
