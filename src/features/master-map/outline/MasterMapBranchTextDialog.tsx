import { useMemo, useState, type CSSProperties } from "react";
import { parseMasterMapOutlineText } from "./masterMapOutlineText";

const sampleText = `Painel fisico
    Medidas
    Fechadura
    Alimentacao eletrica
Software
    Cadastro de chaves
    Retirada
    Devolucao`;

export function MasterMapBranchTextDialog({
  open,
  referenceTitle,
  onClose,
  onSubmit,
}: {
  open: boolean;
  referenceTitle?: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(sampleText);
  const preview = useMemo(() => parseMasterMapOutlineText(text), [text]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog master-map-branch-dialog" role="dialog" aria-modal="true" aria-label="Criar ramificacao por texto">
        <div className="master-map-panel-head">
          <div>
            <p className="eyebrow">Criacao por texto</p>
            <h2>Criar ramificacao por texto</h2>
            <p>Uma linha por quadro. Use recuo para indicar filhos.</p>
            {referenceTitle && <p>Base: os itens de primeiro nivel entram abaixo de {referenceTitle}.</p>}
          </div>
        </div>

        <div className="master-map-branch-grid">
          <label>
            Texto da ramificacao
            <textarea
              rows={12}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
              }}
            />
          </label>

          <section className="master-map-branch-preview" aria-label="Previa da ramificacao">
            <h3>Previa</h3>
            {preview.items.length ? (
              <ol>
                {preview.items.map((item) => (
                  <li key={item.id} style={{ "--level": item.level } as CSSProperties}>
                    <span>Linha {item.lineNumber}</span>
                    <strong>{item.title}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="master-map-muted">Digite os titulos para ver a previa.</p>
            )}
          </section>
        </div>

        {preview.errors.length > 0 && (
          <section className="master-map-validation-list error" aria-label="Erros da ramificacao">
            <h3>Corrigir antes de aplicar</h3>
            {preview.errors.map((error) => <p key={error}>{error}</p>)}
          </section>
        )}
        {preview.warnings.length > 0 && (
          <section className="master-map-validation-list warning" aria-label="Avisos da ramificacao">
            <h3>Avisos</h3>
            {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </section>
        )}

        <div className="master-map-panel-actions">
          <button className="primary-button" type="button" disabled={preview.errors.length > 0 || preview.items.length === 0} onClick={() => onSubmit(text)}>
            Criar ramificacao
          </button>
          <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
