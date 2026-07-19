import { AppIcon } from "../../../components/AppIcon";
import { getMasterMapNextAction, getMasterMapResponsible, masterMapStatusLabels } from "../graph/masterMapGraphUtils";
import type { MasterMapNode } from "../masterMapTypes";
import type { MasterMapAttentionItem } from "./masterMapAttention";
import { masterMapAttentionReasonLabels } from "./masterMapAttention";

export function MasterMapAttentionPanel({
  open,
  items,
  onClose,
  onOpenPage,
  onViewInMap,
}: {
  open: boolean;
  items: MasterMapAttentionItem[];
  onClose: () => void;
  onOpenPage: (node: MasterMapNode) => void;
  onViewInMap: (nodeId: string) => void;
}) {
  if (!open) return null;

  return (
    <section className="master-map-attention-panel" aria-label="Itens que precisam de atencao">
      <div className="master-map-panel-head">
        <div>
          <p className="eyebrow">Precisa da minha atencao</p>
          <h2>{items.length > 0 ? `${items.length} quadro(s) para revisar` : "Tudo certo"}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
      </div>

      {items.length === 0 ? (
        <section className="empty-state compact">
          <AppIcon name="success" size="lg" className="status-icon icon-success" />
          <h2>Nenhum ponto critico agora</h2>
          <p>Os filtros atuais nao encontraram pendencias de prazo, responsavel ou proxima acao.</p>
        </section>
      ) : (
        <div className="master-map-attention-list">
          {items.map((item) => (
            <article className="master-map-attention-card" key={item.node.id}>
              <div>
                <div className="master-map-chip-list">
                  {item.reasons.map((reason) => <span className="master-map-chip warning" key={reason}>{masterMapAttentionReasonLabels[reason]}</span>)}
                </div>
                <h3>{item.node.title}</h3>
                <p>{item.node.description || "Sem descricao curta."}</p>
              </div>
              <dl>
                <div><dt>Status</dt><dd>{masterMapStatusLabels[item.pageSummary?.status ?? item.node.status]}</dd></div>
                <div><dt>Responsavel</dt><dd>{getMasterMapResponsible(item.node, item.pageSummary) || "Nao informado"}</dd></div>
                <div><dt>Prazo</dt><dd>{item.pageSummary?.dueDate || "Nao informado"}</dd></div>
                <div><dt>Proxima acao</dt><dd>{getMasterMapNextAction(item.node, item.pageSummary) || "Nao informada"}</dd></div>
              </dl>
              <div className="master-map-card-actions">
                {item.node.dynamicPageId && <button className="secondary-button" type="button" onClick={() => onOpenPage(item.node)}>Abrir pagina</button>}
                <button className="ghost-button" type="button" onClick={() => onViewInMap(item.node.id)}>Ver no mapa</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
