import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "../../components/AppIcon";
import { DynamicPageBlockEditor } from "./DynamicPageBlockEditor";
import {
  cloneDynamicPageBlock,
  createDynamicPageBlockDraft,
  DynamicPageConflictError,
  loadDynamicPage,
  saveDynamicPage,
} from "./dynamicPageService";
import {
  dynamicPageBlockTypeLabels,
  dynamicPagePriorityLabels,
  dynamicPageTypeLabels,
  type DynamicPage,
  type DynamicPageBlock,
  type DynamicPageBlockType,
  type DynamicPagePriority,
} from "./dynamicPageTypes";
import type { MasterMapNode, MasterMapStatus } from "./masterMapTypes";

const statusOptions: Array<{ value: MasterMapStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Nao iniciado" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "COMPLETED", label: "Concluido e validado" },
];

const priorityOptions: DynamicPagePriority[] = ["LOW", "MEDIUM", "HIGH"];
const blockTypeOptions: DynamicPageBlockType[] = [
  "TEXT",
  "CHECKLIST",
  "DECISION",
  "RISK",
  "QUESTION",
  "TEST",
  "EVIDENCE",
  "LINK",
  "NOTE",
  "WARNING",
  "METRIC",
  "NEXT_ACTION",
];

type DynamicPageScreenProps = {
  pageId: string;
  canEdit: boolean;
  onBackToMap: (nodeId?: string) => void;
  onLogout: () => void;
  onNodeSynced: (node: MasterMapNode) => void;
  onPageSynced?: (page: DynamicPage) => void;
};

export function DynamicPageScreen({ pageId, canEdit, onBackToMap, onLogout, onNodeSynced, onPageSynced }: DynamicPageScreenProps) {
  const [page, setPage] = useState<DynamicPage | null>(null);
  const [blocks, setBlocks] = useState<DynamicPageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const [newBlockType, setNewBlockType] = useState<DynamicPageBlockType>("TEXT");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    loadDynamicPage(pageId).then((payload) => {
      if (!active) return;
      setPage(payload.page);
      setBlocks(normalizeBlockPositions(payload.blocks));
      setSaveStatus("saved");
      setDirty(false);
    }).catch(() => {
      if (!active) return;
      setMessage("Nao foi possivel abrir esta pagina dinamica agora.");
      setSaveStatus("error");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [pageId]);

  const visibleBlocks = useMemo(() => blocks.filter((block) => block.isActive).sort((a, b) => a.position - b.position), [blocks]);
  const saveLabel = saveStatus === "saving" ? "Salvando..." : saveStatus === "saved" && !dirty ? "Salvo" : saveStatus === "error" ? "Erro ao salvar" : "Alteracoes pendentes";

  function updatePage(patch: Partial<DynamicPage>) {
    if (!page) return;
    setPage({ ...page, ...patch });
    setDirty(true);
    setSaveStatus("idle");
  }

  function updateBlock(nextBlock: DynamicPageBlock) {
    setBlocks((current) => current.map((block) => (block.id === nextBlock.id ? nextBlock : block)));
    setDirty(true);
    setSaveStatus("idle");
  }

  function duplicateBlock(block: DynamicPageBlock) {
    const duplicate = cloneDynamicPageBlock(block, block.position + 1);
    const nextBlocks = normalizeBlockPositions([
      ...blocks.map((current) => current.position > block.position ? { ...current, position: current.position + 1 } : current),
      duplicate,
    ]);
    setBlocks(nextBlocks);
    setDirty(true);
    setSaveStatus("idle");
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    const activeBlocks = visibleBlocks;
    const currentIndex = activeBlocks.findIndex((block) => block.id === blockId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeBlocks.length) return;
    const reordered = [...activeBlocks];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const positions = new Map(reordered.map((block, index) => [block.id, index]));
    setBlocks((current) => current.map((block) => positions.has(block.id) ? { ...block, position: positions.get(block.id) ?? block.position } : block));
    setDirty(true);
    setSaveStatus("idle");
  }

  function inactivateBlock(blockId: string) {
    const nextBlocks = normalizeBlockPositions(blocks.map((block) => block.id === blockId ? { ...block, isActive: false, updatedAt: new Date().toISOString() } : block));
    setBlocks(nextBlocks);
    setDirty(true);
    setSaveStatus("idle");
  }

  function addBlock() {
    if (!page) return;
    const nextBlock = createDynamicPageBlockDraft(page.id, newBlockType, visibleBlocks.length);
    setBlocks(normalizeBlockPositions([...blocks, nextBlock]));
    setDirty(true);
    setSaveStatus("idle");
  }

  async function handleSave() {
    if (!page || !canEdit) return;
    setSaveStatus("saving");
    setMessage("");
    try {
      const payload = await saveDynamicPage(page, normalizeBlockPositions(blocks));
      setPage(payload.page);
      setBlocks(normalizeBlockPositions(payload.blocks));
      if (payload.node) onNodeSynced(payload.node);
      onPageSynced?.(payload.page);
      setDirty(false);
      setSaveStatus("saved");
      setMessage("Pagina dinamica salva no Supabase.");
    } catch (error) {
      setSaveStatus("error");
      if (error instanceof DynamicPageConflictError) {
        setMessage("Esta pagina foi alterada em outra sessao. Recarregue antes de salvar para nao sobrescrever dados.");
        return;
      }
      setMessage("Erro ao salvar. Seu conteudo continua na tela para tentar novamente.");
    }
  }

  function copyDirectUrl() {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    setMessage("URL direta copiada.");
  }

  if (!canEdit) {
    return (
      <section className="screen dynamic-page-screen">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Mapa Mestre</p>
            <h1>Acesso restrito</h1>
            <p>Somente Admin/Tezzei pode acessar paginas dinamicas nesta versao.</p>
          </div>
          <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
        </header>
        <button className="ghost-button" type="button" onClick={() => onBackToMap()}><AppIcon name="back" size="sm" className="action-icon" />Voltar ao mapa</button>
      </section>
    );
  }

  if (loading || !page) {
    return (
      <section className="screen dynamic-page-screen">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Mapa Mestre</p>
            <h1>Pagina dinamica</h1>
            <p>Carregando conteudo vinculado ao quadro.</p>
          </div>
          <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
        </header>
        <button className="ghost-button" type="button" onClick={() => onBackToMap()}><AppIcon name="back" size="sm" className="action-icon" />Voltar ao mapa</button>
        <section className="empty-state"><h2>Carregando...</h2></section>
      </section>
    );
  }

  return (
    <section className="screen dynamic-page-screen">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Mapa Mestre / {dynamicPageTypeLabels[page.pageType]}</p>
          <h1>{page.title}</h1>
          <p>Pagina vinculada ao quadro do mapa. Edite, salve e recarregue para confirmar a persistencia.</p>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
      </header>

      <div className="dynamic-page-actions">
        <button className="ghost-button" type="button" onClick={() => onBackToMap(page.nodeId)}><AppIcon name="back" size="sm" className="action-icon" />Voltar e centralizar no quadro</button>
        <button className="secondary-button" type="button" onClick={copyDirectUrl}>Copiar URL direta</button>
        <button className="primary-button" type="button" disabled={saveStatus === "saving" || !dirty} onClick={handleSave}><AppIcon name="save" size="sm" className="action-icon" />Salvar</button>
        <span className={`master-map-save-state master-map-save-${saveStatus}`}>{saveLabel}</span>
      </div>

      {message && <p className={`notice-message ${saveStatus === "error" ? "error" : ""}`}>{message}</p>}

      <section className="dynamic-page-header-card">
        <div className="dynamic-page-form-grid">
          <label>Titulo
            <input value={page.title} onChange={(event) => updatePage({ title: event.target.value })} />
          </label>
          <label>Tipo
            <input value={dynamicPageTypeLabels[page.pageType]} disabled />
          </label>
          <label>Status
            <select value={page.status} onChange={(event) => updatePage({ status: event.target.value as MasterMapStatus })}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>Responsavel
            <input value={page.responsible} onChange={(event) => updatePage({ responsible: event.target.value })} />
          </label>
          <label>Prioridade
            <select value={page.priority} onChange={(event) => updatePage({ priority: event.target.value as DynamicPagePriority })}>
              {priorityOptions.map((priority) => <option key={priority} value={priority}>{dynamicPagePriorityLabels[priority]}</option>)}
            </select>
          </label>
          <label>Data de inicio
            <input type="date" value={page.startDate ?? ""} onChange={(event) => updatePage({ startDate: event.target.value || undefined })} />
          </label>
          <label>Prazo
            <input type="date" value={page.dueDate ?? ""} onChange={(event) => updatePage({ dueDate: event.target.value || undefined })} />
          </label>
        </div>
      </section>

      <section className="dynamic-page-executive-summary">
        <label>Resumo executivo
          <textarea rows={3} value={page.summary} onChange={(event) => updatePage({ summary: event.target.value })} />
        </label>
        <label>Objetivo
          <textarea rows={3} value={page.objective} onChange={(event) => updatePage({ objective: event.target.value })} />
        </label>
        <label>Proxima acao
          <textarea rows={2} value={page.nextAction} onChange={(event) => updatePage({ nextAction: event.target.value })} />
        </label>
      </section>

      <section className="dynamic-page-content">
        <div className="dynamic-page-section-head">
          <div>
            <p className="eyebrow">Conteudo</p>
            <h2>Blocos da pagina</h2>
          </div>
          <div className="dynamic-page-add-block">
            <select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value as DynamicPageBlockType)}>
              {blockTypeOptions.map((type) => <option key={type} value={type}>{dynamicPageBlockTypeLabels[type]}</option>)}
            </select>
            <button className="secondary-button" type="button" onClick={addBlock}>Adicionar bloco</button>
          </div>
        </div>

        {visibleBlocks.length === 0 ? (
          <section className="empty-state"><h2>Nenhum bloco ativo</h2><p>Adicione um bloco para documentar este quadro.</p></section>
        ) : (
          visibleBlocks.map((block, index) => (
            <DynamicPageBlockEditor
              key={block.id}
              block={block}
              index={index}
              totalBlocks={visibleBlocks.length}
              onChange={updateBlock}
              onDuplicate={duplicateBlock}
              onMove={moveBlock}
              onInactivate={inactivateBlock}
            />
          ))
        )}
      </section>
    </section>
  );
}

function normalizeBlockPositions(blocks: DynamicPageBlock[]) {
  let activePosition = 0;
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((block) => {
      if (!block.isActive) return block;
      const nextBlock = { ...block, position: activePosition };
      activePosition += 1;
      return nextBlock;
    });
}
