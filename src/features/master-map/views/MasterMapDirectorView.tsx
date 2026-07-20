import { AppIcon } from "../../../components/AppIcon";
import type { MasterMapAttentionItem } from "../attention/masterMapAttention";
import { masterMapAttentionReasonLabels } from "../attention/masterMapAttention";
import { createPageSummaryMap, dynamicPagePriorityLabelsShort, getMasterMapDirectorNodes, getMasterMapDirectorStats, getMasterMapNextAction, getMasterMapResponsible, masterMapStatusLabels } from "../graph/masterMapGraphUtils";
import type { MasterMapNode } from "../masterMapTypes";
import type { DynamicPageSummary } from "../types/masterMapNavigationTypes";

export function MasterMapDirectorView({
  nodes,
  pageSummaries,
  attentionItems,
  onOpenPage,
  onFocusNode,
}: {
  nodes: MasterMapNode[];
  pageSummaries: DynamicPageSummary[];
  attentionItems: MasterMapAttentionItem[];
  onOpenPage: (node: MasterMapNode) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const attentionNodeIds = new Set(attentionItems.map((item) => item.node.id));
  const attentionByNode = new Map(attentionItems.map((item) => [item.node.id, item]));
  const pageSummaryByNode = createPageSummaryMap(pageSummaries);
  const stats = getMasterMapDirectorStats(nodes, pageSummaries);
  const directorNodes = getMasterMapDirectorNodes(nodes, pageSummaries, attentionNodeIds);

  return (
    <section className="master-map-view-panel master-map-director-view" aria-label="Visao diretoria do Mapa Mestre">
      <div className="master-map-view-head">
        <div>
          <p className="eyebrow">Modo diretoria</p>
          <h2>Resumo executivo do mapa</h2>
          <p>Visao simplificada para acompanhar andamento, pendencias e proximas decisoes.</p>
        </div>
      </div>

      <div className="master-map-summary-grid">
        <SummaryCard label="Total" value={stats.total} icon="map" />
        <SummaryCard label="Nao iniciados" value={stats.notStarted} icon="blocked" />
        <SummaryCard label="Em andamento" value={stats.inProgress} icon="settings" />
        <SummaryCard label="Concluidos" value={stats.completed} icon="success" />
        <SummaryCard label="Atrasados" value={stats.overdue} icon="warning" tone="danger" />
        <SummaryCard label="Sem responsavel" value={stats.withoutResponsible} icon="users" tone="warning" />
        <SummaryCard label="Sem proxima acao" value={stats.withoutNextAction} icon="reports" tone="warning" />
      </div>

      {directorNodes.length === 0 ? (
        <section className="empty-state"><h2>Nenhum item para exibir</h2><p>Os filtros atuais nao retornaram itens executivos.</p></section>
      ) : (
        <div className="master-map-director-list">
          {directorNodes.map((node) => {
            const pageSummary = pageSummaryByNode.get(node.id);
            const attentionItem = attentionByNode.get(node.id);
            return (
              <article className="master-map-director-card" key={node.id}>
                <span className="module-icon-circle" aria-hidden="true"><AppIcon name={node.iconKey} size="md" className="module-icon" /></span>
                <div>
                  <div className="master-map-chip-list">
                    <span className={`master-map-chip status-${node.status.toLowerCase().replace(/_/g, "-")}`}>{masterMapStatusLabels[node.status]}</span>
                    {pageSummary && <span className="master-map-chip">Prioridade {dynamicPagePriorityLabelsShort[pageSummary.priority]}</span>}
                    {attentionItem?.reasons.map((reason) => <span className="master-map-chip warning" key={reason}>{masterMapAttentionReasonLabels[reason]}</span>)}
                  </div>
                  <h3>{node.title}</h3>
                  <p>{node.description || "Sem descricao curta."}</p>
                  <dl>
                    <div><dt>Responsavel</dt><dd>{getMasterMapResponsible(node, pageSummary) || "Nao informado"}</dd></div>
                    <div><dt>Proxima acao</dt><dd>{getMasterMapNextAction(node, pageSummary) || "Nao informada"}</dd></div>
                    <div><dt>Prazo</dt><dd>{pageSummary?.dueDate || "Nao informado"}</dd></div>
                  </dl>
                  <div className="master-map-card-actions">
                    {node.dynamicPageId && <button className="secondary-button" type="button" onClick={() => onOpenPage(node)}>Abrir pagina</button>}
                    <button className="ghost-button" type="button" onClick={() => onFocusNode(node.id)}>Focar item</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, icon, tone = "neutral" }: { label: string; value: number; icon: "map" | "blocked" | "settings" | "success" | "warning" | "users" | "reports"; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <article className={`master-map-summary-card ${tone}`}>
      <AppIcon name={icon} size="md" className="status-icon" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
