import { useEffect, useState } from "react";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { getMasterMapNodeDependencies } from "./masterMapLayout";
import type {
  MasterMapActionType,
  MasterMapCardKind,
  MasterMapDestinationType,
  MasterMapEdge,
  MasterMapNode,
  MasterMapNodeType,
  MasterMapRelationType,
  MasterMapStatus,
  MasterMapTargetScreen,
} from "./masterMapTypes";

const statusOptions: Array<{ value: MasterMapStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Nao iniciado" },
  { value: "IN_PROGRESS", label: "Em desenvolvimento" },
  { value: "COMPLETED", label: "Concluido e validado" },
];

const nodeTypeOptions: Array<{ value: MasterMapNodeType; label: string }> = [
  { value: "root", label: "Raiz" },
  { value: "module", label: "Modulo" },
  { value: "submodule", label: "Submodulo" },
  { value: "project", label: "Projeto" },
  { value: "task", label: "Tarefa" },
  { value: "physical", label: "Fisico" },
  { value: "integration", label: "Integracao" },
  { value: "milestone", label: "Marco" },
];

const relationTypeOptions: Array<{ value: MasterMapRelationType; label: string }> = [
  { value: "BELONGS_TO", label: "Pertence a" },
  { value: "DEPENDS_ON", label: "Depende de" },
  { value: "CONNECTS_WITH", label: "Conecta com" },
  { value: "TRIGGERS", label: "Se acontecer, aciona" },
  { value: "INTEGRATES_WITH", label: "Integra com" },
];

const cardKindLabels: Record<MasterMapCardKind, string> = {
  MODULE: "Modulo",
  SCREEN: "Tela real do sistema",
  SYSTEM_COMPONENT: "Componente interno",
  ADMIN_ACTION: "Acao administrativa",
  PROJECT: "Projeto",
};

const actionTypeLabels: Record<MasterMapActionType, string> = {
  OPEN_SCREEN: "Abre outra pagina",
  CREATE_RECORD: "Cria registro",
  UPDATE_STATUS: "Altera status",
  UPDATE_DATA: "Atualiza dados",
  DELETE_OR_INACTIVATE: "Exclui ou inativa",
  QUEUE_OFFLINE: "Envia para fila offline",
  SYNC: "Sincroniza dados",
  DESTRUCTIVE: "Acao administrativa critica",
};

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
  { value: "stock-exit-history", label: "Historico de Estoque" },
  { value: "product-register", label: "Cadastro de Produtos" },
  { value: "copa-cafe-menu", label: "Copa & Cafe" },
  { value: "security-menu", label: "Seguranca" },
  { value: "security-guards", label: "Guardas" },
  { value: "security-monitoring", label: "Monitoramento" },
  { value: "security-parking", label: "Estacionamento" },
  { value: "security-guards-payment", label: "Fechamento / Pagamento" },
  { value: "users-permissions", label: "Usuarios & Permissoes" },
  { value: "system-status", label: "Status do Sistema" },
  { value: "master-map", label: "Mapa Mestre" },
];

const destinationOptions: Array<{ value: MasterMapDestinationType; label: string }> = [
  { value: "NONE", label: "Apenas mostrar detalhes" },
  { value: "DYNAMIC_PAGE", label: "Criar/abrir pagina dinamica" },
  { value: "EXISTING_SCREEN", label: "Abrir tela existente" },
  { value: "EXTERNAL_URL", label: "Abrir link externo" },
  { value: "PLANNED_MODULE", label: "Modulo ainda nao desenvolvido" },
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
  onOpenDynamicPage,
  onOpenExternalUrl,
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
  onOpenDynamicPage: (pageId: string) => void;
  onOpenExternalUrl: (url: string) => void;
}) {
  const [nodeDraft, setNodeDraft] = useState<MasterMapNode | null>(selectedNode);
  const [edgeDraft, setEdgeDraft] = useState<MasterMapEdge | null>(selectedEdge);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  useEffect(() => {
    setNodeDraft(selectedNode);
    setExpandedActionId(null);
  }, [selectedNode]);
  useEffect(() => setEdgeDraft(selectedEdge), [selectedEdge]);

  if (!selectedNode && !selectedEdge) return null;

  if (selectedEdge && edgeDraft) {
    const source = nodes.find((node) => node.id === selectedEdge.sourceNodeId);
    const target = nodes.find((node) => node.id === selectedEdge.targetNodeId);

    return (
      <aside className="master-map-details-panel" aria-label="Detalhes da conexao">
        <div className="master-map-details-head">
          <div>
            <p className="eyebrow">Conexao</p>
            <h2>{source?.title ?? "Origem"} {"->"} {target?.title ?? "Destino"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </div>
        <dl className="master-map-details-list">
          <div><dt>Origem</dt><dd>{source?.title ?? selectedEdge.sourceNodeId}</dd></div>
          <div><dt>Destino</dt><dd>{target?.title ?? selectedEdge.targetNodeId}</dd></div>
        </dl>
        {editMode ? (
          <section className="master-map-edit-form">
            <label>Tipo de conexao
              <select value={edgeDraft.relationType} onChange={(event) => setEdgeDraft({ ...edgeDraft, relationType: event.target.value as MasterMapRelationType })}>
                {relationTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Texto curto
              <input value={edgeDraft.label ?? ""} onChange={(event) => setEdgeDraft({ ...edgeDraft, label: event.target.value })} />
            </label>
            <div className="master-map-details-actions">
              <button className="primary-button" type="button" onClick={() => onSaveEdge(edgeDraft)}><AppIcon name="save" size="sm" className="action-icon" />Salvar conexao</button>
              <button className="danger-button" type="button" onClick={() => onInactivateEdge(edgeDraft)}><AppIcon name="blocked" size="sm" className="action-icon" />Excluir conexao</button>
            </div>
          </section>
        ) : (
          <p className="master-map-readonly-note">Ative o modo edicao para alterar esta conexao.</p>
        )}
      </aside>
    );
  }

  if (!selectedNode || !nodeDraft) return null;

  const dependencies = getMasterMapNodeDependencies(selectedNode, nodes, edges);
  const actions = selectedNode.metadata.actions ?? [];

  return (
    <aside className="master-map-details-panel" aria-label="Detalhes do no">
      <div className="master-map-details-head">
        <div>
          <p className="eyebrow">Detalhes</p>
          <h2>{selectedNode.title}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
      </div>

      <dl className="master-map-details-list">
        <div><dt>Tipo</dt><dd>{nodeTypeOptions.find((option) => option.value === selectedNode.nodeType)?.label ?? selectedNode.nodeType}</dd></div>
        <div><dt>Representa</dt><dd>{selectedNode.metadata.cardKind ? cardKindLabels[selectedNode.metadata.cardKind] : "Estrutura do mapa"}</dd></div>
        <div><dt>Rota interna</dt><dd>{selectedNode.metadata.screenKey || "Nao se aplica"}</dd></div>
        <div><dt>Status</dt><dd>{statusOptions.find((option) => option.value === selectedNode.status)?.label}</dd></div>
        <div><dt>Destino</dt><dd>{destinationOptions.find((option) => option.value === selectedNode.destinationType)?.label ?? "Apenas mostrar detalhes"}</dd></div>
        <div><dt>Responsavel</dt><dd>{selectedNode.responsible || "Nao informado"}</dd></div>
        <div><dt>Dependencias</dt><dd>{dependencies.length > 0 ? dependencies.map((node) => node.title).join(", ") : "Nenhuma dependencia cadastrada."}</dd></div>
        <div><dt>Data de inicio</dt><dd>{selectedNode.metadata.startDate || "Nao informada"}</dd></div>
        <div><dt>Data de validacao</dt><dd>{selectedNode.metadata.validatedAt || "Nao informada"}</dd></div>
        <div><dt>PR</dt><dd>{selectedNode.metadata.pr || "Nao informado"}</dd></div>
        <div><dt>Commit</dt><dd>{selectedNode.metadata.commit || "Nao informado"}</dd></div>
        <div><dt>Documento</dt><dd>{renderLink(selectedNode.metadata.documentUrl)}</dd></div>
        <div><dt>Foto ou evidencia</dt><dd>{renderLink(selectedNode.metadata.evidenceUrl)}</dd></div>
        <div><dt>Teste real</dt><dd>{selectedNode.metadata.realTest || "Nao informado"}</dd></div>
        <div><dt>Observacoes</dt><dd>{selectedNode.metadata.observations || "Sem observacoes."}</dd></div>
        <div><dt>Proxima acao</dt><dd>{selectedNode.nextAction || "Nao informada."}</dd></div>
      </dl>

      {selectedNode.destinationType === "DYNAMIC_PAGE" && selectedNode.dynamicPageId && (
        <button className="secondary-button wide-button" type="button" onClick={() => onOpenDynamicPage(selectedNode.dynamicPageId as string)}>
          Abrir pagina dinamica
        </button>
      )}
      {selectedNode.destinationType === "EXISTING_SCREEN" && selectedNode.targetScreen && (
        <button className="secondary-button wide-button" type="button" onClick={() => onOpenModule(selectedNode.targetScreen as MasterMapTargetScreen)}>
          Abrir modulo relacionado
        </button>
      )}
      {selectedNode.destinationType === "EXTERNAL_URL" && selectedNode.externalUrl && (
        <button className="secondary-button wide-button" type="button" onClick={() => onOpenExternalUrl(selectedNode.externalUrl as string)}>
          Abrir link externo
        </button>
      )}

      {actions.length > 0 && (
        <section className="master-map-edit-form" aria-label="Botoes e acoes desta tela">
          <div>
            <p className="eyebrow">Fluxo funcional</p>
            <h3>Botoes e acoes desta tela</h3>
          </div>
          {actions.map((action) => {
            const relatedNodes = (action.targetNodeIds ?? [])
              .map((nodeId) => nodes.find((node) => node.id === nodeId))
              .filter((node): node is MasterMapNode => Boolean(node));
            const expanded = expandedActionId === action.id;

            return (
              <article className="master-map-search-result" key={action.id}>
                <div>
                  <strong>{action.label}</strong>
                  <p>{actionTypeLabels[action.actionType]}</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setExpandedActionId(expanded ? null : action.id)}
                  aria-expanded={expanded}
                >
                  {expanded ? "Ocultar acao" : "Ver acao"}
                </button>
                {expanded && (
                  <div className="master-map-edit-form">
                    <p>{action.description}</p>
                    <dl className="master-map-details-list">
                      <div><dt>Abre outra pagina</dt><dd>{action.opensScreen ? "Sim" : "Nao"}</dd></div>
                      <div><dt>Ligado a</dt><dd>{relatedNodes.length > 0 ? relatedNodes.map((node) => node.title).join(", ") : "Nenhum outro quadro"}</dd></div>
                      <div><dt>Condicao</dt><dd>{action.condition || "Nenhuma condicao especial"}</dd></div>
                      <div><dt>Permissao</dt><dd>{action.permission || "Permissao padrao da tela"}</dd></div>
                      <div><dt>Comportamento offline</dt><dd>{action.offlineBehavior || "Nao se aplica"}</dd></div>
                    </dl>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {editMode ? (
        <section className="master-map-edit-form">
          <label>Nome
            <input value={nodeDraft.title} onChange={(event) => setNodeDraft({ ...nodeDraft, title: event.target.value })} />
          </label>
          <label>Descricao
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
            <label>Icone
              <select value={nodeDraft.iconKey} onChange={(event) => setNodeDraft({ ...nodeDraft, iconKey: event.target.value as AppIconName })}>
                {iconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </label>
            <label>Ao clicar neste quadro, o que deve acontecer?
              <select value={nodeDraft.destinationType} onChange={(event) => setNodeDraft(normalizeDestinationDraft({ ...nodeDraft, destinationType: event.target.value as MasterMapDestinationType }))}>
                {destinationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          {nodeDraft.destinationType === "EXISTING_SCREEN" && (
            <label>Link para modulo
              <select value={nodeDraft.targetScreen ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, targetScreen: event.target.value ? event.target.value as MasterMapTargetScreen : undefined })}>
                {targetScreenOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          {nodeDraft.destinationType === "DYNAMIC_PAGE" && !nodeDraft.dynamicPageId && (
            <p className="master-map-readonly-note">Para criar uma pagina nova com template, use o botao Criar no no modo edicao.</p>
          )}
          {nodeDraft.destinationType === "EXTERNAL_URL" && (
            <label>Link externo
              <input placeholder="https://..." value={nodeDraft.externalUrl ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, externalUrl: event.target.value })} />
            </label>
          )}
          {nodeDraft.destinationType === "PLANNED_MODULE" && (
            <label>Chave do modulo planejado
              <input value={nodeDraft.plannedModuleKey ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, plannedModuleKey: event.target.value })} />
            </label>
          )}
          <label>Responsavel
            <input value={nodeDraft.responsible ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, responsible: event.target.value })} />
          </label>
          <label>Proxima acao
            <textarea rows={2} value={nodeDraft.nextAction ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, nextAction: event.target.value })} />
          </label>
          <div className="master-map-form-grid">
            <label>Data de inicio
              <input type="date" value={nodeDraft.metadata.startDate ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, startDate: event.target.value } })} />
            </label>
            <label>Data de validacao
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
          <label>Foto ou evidencia
            <input value={nodeDraft.metadata.evidenceUrl ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, evidenceUrl: event.target.value } })} />
          </label>
          <label>Teste real
            <textarea rows={2} value={nodeDraft.metadata.realTest ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, realTest: event.target.value } })} />
          </label>
          <label>Observacoes
            <textarea rows={3} value={nodeDraft.metadata.observations ?? ""} onChange={(event) => setNodeDraft({ ...nodeDraft, metadata: { ...nodeDraft.metadata, observations: event.target.value } })} />
          </label>
          <div className="master-map-details-actions">
            <button className="primary-button" type="button" onClick={() => onSaveNode({ ...nodeDraft, updatedAt: new Date().toISOString() })}><AppIcon name="save" size="sm" className="action-icon" />Salvar no</button>
            <button className="danger-button" type="button" onClick={() => onInactivateNode(nodeDraft)}><AppIcon name="blocked" size="sm" className="action-icon" />Excluir no</button>
          </div>
        </section>
      ) : (
        <p className="master-map-readonly-note">Ative o modo edicao para alterar este no.</p>
      )}
    </aside>
  );
}

function normalizeDestinationDraft(node: MasterMapNode): MasterMapNode {
  if (node.destinationType === "EXISTING_SCREEN") {
    return { ...node, externalUrl: undefined, plannedModuleKey: undefined };
  }
  if (node.destinationType === "EXTERNAL_URL") {
    return { ...node, targetScreen: undefined, plannedModuleKey: undefined };
  }
  if (node.destinationType === "PLANNED_MODULE") {
    return { ...node, targetScreen: undefined, externalUrl: undefined };
  }
  if (node.destinationType === "DYNAMIC_PAGE") {
    return { ...node, targetScreen: undefined, externalUrl: undefined, plannedModuleKey: undefined };
  }
  return { ...node, targetScreen: undefined, dynamicPageId: undefined, externalUrl: undefined, plannedModuleKey: undefined };
}

function renderLink(value?: string) {
  if (!value) return "Nao informado";
  return <a href={value} target="_blank" rel="noreferrer">Abrir link</a>;
}
