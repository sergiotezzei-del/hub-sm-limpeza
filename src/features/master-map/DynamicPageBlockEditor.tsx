import { AppIcon } from "../../components/AppIcon";
import { dynamicPageBlockTypeLabels, type DynamicPageBlock, type DynamicPageBlockContent, type DynamicPageBlockType } from "./dynamicPageTypes";
import { RichTextBlock } from "./RichTextBlock";

type DynamicPageBlockEditorProps = {
  block: DynamicPageBlock;
  index: number;
  totalBlocks: number;
  onChange: (block: DynamicPageBlock) => void;
  onDuplicate: (block: DynamicPageBlock) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onInactivate: (blockId: string) => void;
};

const editableBlockTypes: DynamicPageBlockType[] = [
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

export function DynamicPageBlockEditor({
  block,
  index,
  totalBlocks,
  onChange,
  onDuplicate,
  onMove,
  onInactivate,
}: DynamicPageBlockEditorProps) {
  function updateBlock(nextBlock: DynamicPageBlock) {
    onChange({ ...nextBlock, updatedAt: new Date().toISOString() });
  }

  function updateContent(key: string, value: unknown) {
    updateBlock({ ...block, content: { ...block.content, [key]: value } });
  }

  function replaceContent(content: DynamicPageBlockContent) {
    updateBlock({ ...block, content });
  }

  function confirmInactivate() {
    if (!window.confirm("Remover este bloco da pagina? Ele sera inativado no historico.")) return;
    onInactivate(block.id);
  }

  return (
    <article className={`dynamic-page-block-card dynamic-page-block-${block.blockType.toLowerCase()}`}>
      <div className="dynamic-page-block-head">
        <div>
          <p className="eyebrow">{dynamicPageBlockTypeLabels[block.blockType]}</p>
          <input
            aria-label="Titulo do bloco"
            value={block.title}
            onChange={(event) => updateBlock({ ...block, title: event.target.value })}
          />
        </div>
        <div className="dynamic-page-block-actions">
          <button className="ghost-button" type="button" disabled={index === 0} onClick={() => onMove(block.id, -1)}>Subir</button>
          <button className="ghost-button" type="button" disabled={index === totalBlocks - 1} onClick={() => onMove(block.id, 1)}>Descer</button>
          <button className="secondary-button" type="button" onClick={() => onDuplicate(block)}><AppIcon name="edit" size="sm" className="action-icon" />Duplicar</button>
          <button className="danger-button" type="button" onClick={confirmInactivate}><AppIcon name="blocked" size="sm" className="action-icon" />Remover</button>
        </div>
      </div>

      <label>Tipo de bloco
        <select value={block.blockType} onChange={(event) => updateBlock({ ...block, blockType: event.target.value as DynamicPageBlockType, content: getCompatibleContent(event.target.value as DynamicPageBlockType, block.content) })}>
          {editableBlockTypes.map((type) => <option key={type} value={type}>{dynamicPageBlockTypeLabels[type]}</option>)}
        </select>
      </label>

      {renderBlockBody(block, updateContent, replaceContent)}
    </article>
  );
}

function renderBlockBody(
  block: DynamicPageBlock,
  updateContent: (key: string, value: unknown) => void,
  replaceContent: (content: DynamicPageBlockContent) => void,
) {
  if (["TEXT", "NOTE", "WARNING"].includes(block.blockType)) {
    return <RichTextBlock content={block.content} onChange={replaceContent} />;
  }

  if (block.blockType === "CHECKLIST") {
    const items = getChecklistItems(block.content);
    return (
      <div className="dynamic-page-checklist">
        {items.map((item) => (
          <div className="dynamic-page-checklist-item" key={item.id}>
            <input type="checkbox" checked={item.done} onChange={(event) => updateContent("items", items.map((current) => current.id === item.id ? { ...current, done: event.target.checked } : current))} />
            <input value={item.text} placeholder="Item do checklist" onChange={(event) => updateContent("items", items.map((current) => current.id === item.id ? { ...current, text: event.target.value } : current))} />
            <button className="ghost-button" type="button" onClick={() => updateContent("items", items.filter((current) => current.id !== item.id))}>Remover</button>
          </div>
        ))}
        <button className="secondary-button" type="button" onClick={() => updateContent("items", [...items, { id: createId(), text: "", done: false }])}>Adicionar item</button>
      </div>
    );
  }

  if (block.blockType === "DECISION") {
    return (
      <div className="dynamic-page-form-grid">
        {textAreaField("Contexto", "context", block.content, updateContent)}
        {textAreaField("Opcoes", "options", block.content, updateContent)}
        {textAreaField("Decisao tomada", "decision", block.content, updateContent)}
        {textAreaField("Motivo", "reason", block.content, updateContent)}
        {textAreaField("Impactos", "impacts", block.content, updateContent)}
        {textField("Evidencia", "evidence", block.content, updateContent)}
      </div>
    );
  }

  if (block.blockType === "RISK") {
    return (
      <div className="dynamic-page-form-grid">
        {textAreaField("Descricao", "description", block.content, updateContent)}
        {textField("Probabilidade", "probability", block.content, updateContent)}
        {textField("Impacto", "impact", block.content, updateContent)}
        {textAreaField("Mitigacao", "mitigation", block.content, updateContent)}
        {textField("Responsavel", "responsible", block.content, updateContent)}
        {textField("Status", "status", block.content, updateContent)}
      </div>
    );
  }

  if (block.blockType === "QUESTION") {
    return (
      <div className="dynamic-page-form-grid">
        {textAreaField("Pergunta", "question", block.content, updateContent)}
        {textAreaField("Resposta", "answer", block.content, updateContent)}
      </div>
    );
  }

  if (block.blockType === "TEST") {
    return (
      <div className="dynamic-page-form-grid">
        {textAreaField("Objetivo", "objective", block.content, updateContent)}
        {textAreaField("Hipotese", "hypothesis", block.content, updateContent)}
        {textAreaField("Materiais", "materials", block.content, updateContent)}
        {textAreaField("Procedimento", "procedure", block.content, updateContent)}
        {textAreaField("Resultado esperado", "expectedResult", block.content, updateContent)}
        {textAreaField("Resultado real", "actualResult", block.content, updateContent)}
        {textField("Evidencia", "evidence", block.content, updateContent)}
        <label className="checkbox-label">
          <input type="checkbox" checked={Boolean(block.content.approved)} onChange={(event) => updateContent("approved", event.target.checked)} />
          Aprovado
        </label>
      </div>
    );
  }

  if (block.blockType === "EVIDENCE") {
    return (
      <div className="dynamic-page-form-grid">
        {textAreaField("Descricao", "description", block.content, updateContent)}
        {textField("Link da evidencia", "url", block.content, updateContent)}
      </div>
    );
  }

  if (block.blockType === "LINK") {
    return (
      <div className="dynamic-page-form-grid">
        {textField("Texto do link", "label", block.content, updateContent)}
        {textField("URL", "url", block.content, updateContent)}
      </div>
    );
  }

  if (block.blockType === "METRIC") {
    return (
      <div className="dynamic-page-form-grid">
        {textField("Indicador", "label", block.content, updateContent)}
        {textField("Valor", "value", block.content, updateContent)}
        {textField("Unidade", "unit", block.content, updateContent)}
        {textField("Meta", "target", block.content, updateContent)}
      </div>
    );
  }

  return (
    <div className="dynamic-page-form-grid">
      {textAreaField("Acao", "action", block.content, updateContent)}
      {textField("Responsavel", "responsible", block.content, updateContent)}
      {textField("Prazo", "dueDate", block.content, updateContent, "date")}
      {textField("Status", "status", block.content, updateContent)}
    </div>
  );
}

function textField(
  label: string,
  key: string,
  content: DynamicPageBlockContent,
  updateContent: (key: string, value: unknown) => void,
  type = "text",
) {
  return (
    <label>{label}
      <input type={type} value={getString(content[key])} onChange={(event) => updateContent(key, event.target.value)} />
    </label>
  );
}

function textAreaField(
  label: string,
  key: string,
  content: DynamicPageBlockContent,
  updateContent: (key: string, value: unknown) => void,
) {
  return (
    <label>{label}
      <textarea rows={3} value={getString(content[key])} onChange={(event) => updateContent(key, event.target.value)} />
    </label>
  );
}

function getCompatibleContent(blockType: DynamicPageBlockType, currentContent: DynamicPageBlockContent) {
  if (["TEXT", "NOTE", "WARNING"].includes(blockType)) {
    return currentContent.doc ? currentContent : { text: "", doc: { type: "doc", content: [{ type: "paragraph" }] } };
  }
  if (blockType === "CHECKLIST") return { items: getChecklistItems(currentContent) };
  if (blockType === "DECISION") return { context: "", options: "", decision: "", reason: "", impacts: "", evidence: "" };
  if (blockType === "RISK") return { description: "", probability: "", impact: "", mitigation: "", responsible: "", status: "Aberto" };
  if (blockType === "QUESTION") return { question: "", answer: "" };
  if (blockType === "TEST") return { objective: "", hypothesis: "", materials: "", procedure: "", expectedResult: "", actualResult: "", approved: false, evidence: "" };
  if (blockType === "EVIDENCE") return { description: "", url: "" };
  if (blockType === "LINK") return { label: "", url: "" };
  if (blockType === "METRIC") return { label: "", value: "", unit: "", target: "" };
  return { action: "", responsible: "", dueDate: "", status: "Pendente" };
}

function getChecklistItems(content: DynamicPageBlockContent) {
  if (!Array.isArray(content.items)) return [];
  return content.items.map((item) => {
    const candidate = item as { id?: unknown; text?: unknown; done?: unknown };
    return {
      id: typeof candidate.id === "string" ? candidate.id : createId(),
      text: typeof candidate.text === "string" ? candidate.text : "",
      done: Boolean(candidate.done),
    };
  });
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
