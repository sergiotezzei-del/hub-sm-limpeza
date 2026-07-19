import { AppIcon } from "../../../components/AppIcon";
import { getMasterMapImpactGraph, masterMapRelationLabels, masterMapStatusLabels } from "../graph/masterMapGraphUtils";
import type { MasterMapEdge, MasterMapNode } from "../masterMapTypes";

export function MasterMapImpactView({
  selectedNode,
  nodes,
  edges,
  onViewInMap,
  onOpenDetails,
  onOpenPage,
}: {
  selectedNode: MasterMapNode | null;
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  onViewInMap: (nodeId: string) => void;
  onOpenDetails: (nodeId: string) => void;
  onOpenPage: (node: MasterMapNode) => void;
}) {
  if (!selectedNode) {
    return (
      <section className="master-map-view-panel">
        <section className="empty-state">
          <h2>Selecione um quadro</h2>
          <p>Escolha um quadro para visualizar impacto, dependencias e conexoes operacionais.</p>
        </section>
      </section>
    );
  }

  const impact = getMasterMapImpactGraph(selectedNode.id, nodes, edges);

  return (
    <section className="master-map-view-panel master-map-impact-view" aria-label="Modo impacto do Mapa Mestre">
      <div className="master-map-view-head">
        <div>
          <p className="eyebrow">Modo impacto</p>
          <h2>{selectedNode.title}</h2>
          <p>BELONGS_TO aparece apenas como contexto hierarquico. Aqui entram dependencias, acionamentos, integracoes e conexoes diretas.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => onViewInMap(selectedNode.id)}>Ver no mapa</button>
      </div>

      <div className="master-map-impact-grid">
        <ImpactColumn
          emptyText="Nenhum item impacta este quadro diretamente."
          items={impact.upstream}
          title="Itens que impactam este quadro"
          directionLabel="Chega neste quadro"
          onOpenDetails={onOpenDetails}
          onViewInMap={onViewInMap}
          onOpenPage={onOpenPage}
        />
        <ImpactColumn
          emptyText="Este quadro ainda nao impacta outros itens diretamente."
          items={impact.downstream}
          title="Itens impactados por este quadro"
          directionLabel="Sai deste quadro"
          onOpenDetails={onOpenDetails}
          onViewInMap={onViewInMap}
          onOpenPage={onOpenPage}
        />
      </div>
    </section>
  );
}

function ImpactColumn({
  title,
  emptyText,
  items,
  directionLabel,
  onViewInMap,
  onOpenDetails,
  onOpenPage,
}: {
  title: string;
  emptyText: string;
  items: Array<{ node: MasterMapNode; edge: MasterMapEdge }>;
  directionLabel: string;
  onViewInMap: (nodeId: string) => void;
  onOpenDetails: (nodeId: string) => void;
  onOpenPage: (node: MasterMapNode) => void;
}) {
  return (
    <section className="master-map-impact-column">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="master-map-muted">{emptyText}</p> : items.map(({ node, edge }) => (
        <article className="master-map-impact-card" key={edge.id}>
          <span className="module-icon-circle" aria-hidden="true"><AppIcon name={node.iconKey} size="md" className="module-icon" /></span>
          <div>
            <div className="master-map-chip-list">
              <span className="master-map-chip info">{directionLabel}</span>
              <span className="master-map-chip">{masterMapRelationLabels[edge.relationType]}</span>
              <span className={`master-map-chip status-${node.status.toLowerCase().replace(/_/g, "-")}`}>{masterMapStatusLabels[node.status]}</span>
            </div>
            <h4>{node.title}</h4>
            <p>{edge.label || node.description || "Conexao sem descricao curta."}</p>
            <div className="master-map-card-actions">
              {node.dynamicPageId && <button className="secondary-button" type="button" onClick={() => onOpenPage(node)}>Abrir pagina</button>}
              <button className="ghost-button" type="button" onClick={() => onViewInMap(node.id)}>Ver no mapa</button>
              <button className="ghost-button" type="button" onClick={() => onOpenDetails(node.id)}>Detalhes</button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
