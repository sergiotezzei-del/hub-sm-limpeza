import { useEffect, useState } from "react";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { getMasterMapNodeDependencies } from "./masterMapLayout";
import type { MasterMapEdge, MasterMapNode, MasterMapNodeType, MasterMapRelationType, MasterMapStatus, MasterMapTargetScreen } from "./masterMapTypes";

const statusOptions: Array<{ value: MasterMapStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Não iniciado" },
  { value: "IN_PROGRESS", label: "Em desenvolvimento" },
  { value: "COMPLETED", label: "Concluído e validado" },
];

const nodeTypeOptions: Array<{ value: MasterMapNodeType; label: string }> = [
  { value: "root", label: "Raiz" },
  { value: "module", label: "Módulo" },
  { value: "submodule", label: "Submódulo" },
  { value: "project", label: "Projeto" },
  { value: "task", label: "Tarefa" },
  { value: "physical", label: "Físico" },
  { value: "integration", label: "Integração" },
  { value: "milestone", label: "Marco" },
];

const relationTypeOptions: Array<{ value: MasterMapRelationType; label: string }> = [
  { value: "BELONGS_TO", label: "Pertence a" },
  { value: "DEPENDS_ON", label: "Depende de" },
  { value: "CONNECTS_WITH", label: "Conecta com" },
  { value: "TRIGGERS", label: "Se acontecer, aciona" },
  { value: "INTEGRATES_WITH", label: "Integra com" },
];

const iconOptions: AppIconName[] = [
  "map",
  "cleaning",
  "coffee",
  "water",
  "security",
  "guards",
  "parking",
  "vehicle",
  "search",
  "camera",
  "edit",
  "save",
  "warning",
  "success",
  "blocked",
  "stock",
  "users",
  "reports",
  "qr",
  "payment",
  "settings",
];

const targetScreenOptions: Array<{ value: "" | MasterMapTargetScreen; label: string }> = [
  { value: "", label: "Sem link" },
  { value: "cleaning-dashboard", label: "Limpeza" },
  { value: "current-stock", label: "Estoque Atual da Limpeza" },
  { value: "stock-exit-history", label: "Histórico de Estoque" },
  { value: "product-register", label: "Cadastro de Produtos" },
  { value: "copa-cafe-menu", label: "Copa & Café" },
  { value: "security-menu", label: "Segurança" },
  { value: "security-guards", label: "Guardas" },
  { value: "security-monitoring", label: "Monitoramento" },
  { value: "security-parking", label: "Estacionamento" },
  { value: "security-guards-payment", label: "Fechamento / Pagamento" },
  { value: "users-permissions", label: "Usuários & Permissões" },
  { value: "system-status", label: "Status do Sistema" },
  { value: "master-map", label: "Mapa Mestre" },
];

export function MasterMapDetails({
  selectedNode,
  selectedEdge,
  nodes,
  edges,
  editMode,
  onClose,
  onSaveNode,
  onInactivateNode,
  onSaveEdge,
  onInactivateEdge,
  onOpenModule,
}: {
  selectedNode: MasterMapNode | null;
  selectedEdge: MasterMapEdge | null;
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  editMode: boolean;
  onClose: () => void;
  onSaveNode: (node: MasterMapNode) => void;
  onInactivateNode: (node: MasterMapNode) => void;
  onSaveEdge: (edge: MasterMapEdge) => void;
  onInactivateEdge: (edge: MasterMapEdge) => void;
  onOpenModule: (targetScreen: MasterMapTargetScreen) => void;
}) {
  const [nodeDraft, setNodeDraft] = useState<MasterMapNode | null>(selectedNode);
  const [edgeDraft, setEdgeDraft] = useState<MasterMapEdge | null>(selectedEdge);

  useEffect(() => setNodeDraft(selectedNode), [selectedNode]);
  useEffect(() => setEdgeDraft(selectedEdge), [selectedEdge]);

  if (!selectedNode && !selectedEdge) return null;

  if (selectedEdge && edgeDraft) {
    const source = nodes.find((node) => node.id === selectedEdge.sourceNodeId);
    const target = nodes.find((node) => node.id === selectedEdge.targetNodeId);

    return (
      <aside className="master-map-details-panel" aria-label="Detalhes da conexão">
        <div className="master-map-details-head">
          <div>
            <p className="eyebrow">Conexão</p>
            <h2>{source?.title ?? "Origem"} → {target?.title ?? "Destino"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </div>
        <dl className="master-map-details-list">
          <div><dt>Origem</dt><dd>{source?.title ?? selectedEdge.sourceNodeId}</dd></div>
          <div><dt>Destino</dt><dd>{target?.title ?? selectedEdge.targetNodeId}</dd></div>
        </dl>
        {editMode ? (
          <section className="master-map-edit-form">
            <label>Tipo de conexão
              <select value={edgeDraft.relationType} onChange={(event) => setEdgeDraft({ ...edgeDraft, relationType: event.target.value as MasterMapRelationType })}>
                {relationTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Texto curto
              <input value={edgeDraft.label ?? ""} onChange={(event) => setEdgeDraft({ ...edgeDraft, label: event.target.value })} />
            </label>
            <div className="master-map-details-actions">
              <button className="primary-button" type="button" onClick={() => onSaveEdge(edgeDraft)}><AppIcon name="save" size="sm" className="action-icon" />Salvar conexão</button>
              <button className="danger-button" type="button" onClick={() => onInactivateEdge(edgeDraft)}><AppIcon name="blocked" size="sm" className="action-icon" />Excluir conexão</button>
            </div>
          </section>
        ) : (
          <p className="master-map-readonly-note">Ative o modo edição para alterar esta conexão.</p>
        )}
      </aside>
    );
  }

  if (!selectedNode || !nodeDraft) return null;

  const dependencies = getMasterMapNodeDependencies(selectedNode, nodes, edges);

  return (
    <aside className="master-map-details-panel" aria-label="Detalhes do nó">
      <div className="master-map-details-head">
        <div>
          <p className="eyebrow">Detalhes</p>
          <h2>{selectedNode.title}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
      </div>

      <dl className="master-map-details-list">
        <div><dt>Tipo</dt><dd>{nodeTypeOptions.find((option) => option.value === selectedNode.nodeType)?.label ?? selectedNode.nodeType}</dd></div>
        <div><dt>Status</dt><dd>{statusOptions.find((option) => option.value === selectedNode.status)?.label}</dd></div>
        <div><dt>Responsável</dt><dd>{selectedNode.responsible || "Não informado"}</dd></div>
        <div><dt>Dependências</dt><dd>{dependencies.length > 0 ? dependencies.map((node) => node.title).join(", ") : "Nenhuma dependência cadastrada."}</dd></div>
        <div><dt>Data de início</dt><dd>{selectedNode.metadata.startDate || "Não informada"}</dd></div>
        <div><dt>Data de validação</dt><dd>{selectedNode.metadata.validatedAt || "Não informada"}</dd></div>
        <div><dt>PR</dt><dd>{selectedNode.metadata.pr || "Não informado"}</dd></div>
        <div><dt>Commit</dt><dd>{selectedNode.metadata.commit || "Não informado"}</dd></div>
        <div><dt>Documento</dt><dd>{renderLink(selectedNode.metadata.documentUrl)}</dd></div>
        <div><dt>Foto ou evidência</dt><dd>{renderLink(selectedNode.metadata.evidenceUrl)}</dd></div>
        <div><dt>Teste real</dt><dd>{selectedNode.metadata.realTest || "Não informado"}</dd></div>
        <div><dt>Observações</dt><dd>{selectedNode.metadata.observations || "Sem observações."}</dd></div>
        <div><dt>Próxima ação</dt><dd>{selectedNode.nextAction || "Não informada."}</dd></div>
      </dl>

      {selectedNode.targetScreen && (
        <button className="secondary-button wide-button" type="button" onClick={() => onOpenModule(selectedNode.targetScreen as MasterMapTargetScreen)}>
          Abrir módulo relacionado
        </button>
      )}

      {editMode ? (
        <section className="master-map-edit-form">
          <label>Nome
            <input value={nodeDraft.title} onChange={(event) => setNodeDraft({ ...nodeDraft, title: event.target.value })} />
          </label>
          <label>Descrição
            <textarea rows={3} value={nodeDraft.description} onChange={(event) => setNodeDraft({ ...nodeDraft, description: event.target.value })} />
          </label>
          <div className="master-map-form-grid">
            <label>Tipo
              <select value={nodeDraft.nodeType} onChange={(event) => setNodeDraft({ ...nodeDraft, nodeType: event.target.value as MasterMapNodeType })}>
                {nodeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Status
              <select value={nodeDraft.status} onChange={(event) => setNodeDraft({ ...nodeDraft, status: event.target.value as MasterMapStatus })}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="master-map-form-grid">
            <label>Ícone
              <select value={nodeDraft.iconKey} onChange={(event) => setNodeDraft({ ...nodeDraft, iconKey: event.target.value as AppIconName })}>
                {iconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </label>
            <label>Link para módulo
              <select value={nodeDraft.targetScreen ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, targetScreen: event.target.value ? event.target.value as MasterMapTargetScreen : undefined })}>
                {targetScreenOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label>Responsável
            <input value={nodeDraft.responsible ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, responsible: event.target.value })} />
          </label>
          <label>Próxima ação
            <textarea rows={2} value={nodeDraft.nextAction ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, nextAction: event.target.value })} />
          </label>
          <div className="master-map-form-grid">
            <label>Data de início
              <input type="date" value={nodeDraft.metadata.startDate ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, startDate: event.target.value } })} />
            </label>
            <label>Data de validação
              <input type="date" value={nodeDraft.metadata.validatedAt ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, validatedAt: event.target.value } })} />
            </label>
          </div>
          <div className="master-map-form-grid">
            <label>PR
              <input value={nodeDraft.metadata.pr ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, pr: event.target.value } })} />
            </label>
            <label>Commit
              <input value={nodeDraft.metadata.commit ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, commit: event.target.value } })} />
            </label>
          </div>
          <label>Documento
            <input value={nodeDraft.metadata.documentUrl ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, documentUrl: event.target.value } })} />
          </label>
          <label>Foto ou evidência
            <input value={nodeDraft.metadata.evidenceUrl ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, evidenceUrl: event.target.value } })} />
          </label>
          <label>Teste real
            <textarea rows={2} value={nodeDraft.metadata.realTest ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, realTest: event.target.value } })} />
          </label>
          <label>Observações
            <textarea rows={3} value={nodeDraft.metadata.observations ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, observations: event.target.value } })} />
          </label>
          <div className="master-map-details-actions">
            <button className="primary-button" type="button" onClick={() => onSaveNode({ ...nodeDraft, updatedAt: new Date().toISOString() })}><AppIcon name="save" size="sm" className="action-icon" />Salvar nó</button>
            <button className="danger-button" type="button" onClick={() => onInactivateNode(nodeDraft)}><AppIcon name="blocked" size="sm" className="action-icon" />Excluir nó</button>
          </div>
        </section>
      ) : (
        <p className="master-map-readonly-note">Ative o modo edição para alterar este nó.</p>
      )}
    </aside>
  );
}

function renderLink(value?: string) {
  if (!value) return "Não informado";
  return <a href={value} target="_blank" rel="noreferrer">Abrir link</a>;
}
