import { useEffect, useRef, useState } from "react";

export type MasterMapQuickCreateKind = "sibling-after" | "sibling-before" | "child";

const quickCreateLabels: Record<MasterMapQuickCreateKind, string> = {
  "sibling-after": "Criar quadro irmao",
  "sibling-before": "Criar quadro irmao anterior",
  child: "Criar quadro filho",
};

export function MasterMapQuickTitleDialog({
  open,
  kind,
  referenceTitle,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: MasterMapQuickCreateKind;
  referenceTitle?: string;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setError("");
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  if (!open) return null;

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Informe um titulo para criar o quadro.");
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog master-map-quick-dialog" role="dialog" aria-modal="true" aria-label={quickCreateLabels[kind]}>
        <div className="master-map-panel-head">
          <div>
            <p className="eyebrow">Edicao rapida</p>
            <h2>{quickCreateLabels[kind]}</h2>
            {referenceTitle && <p>Referencia: {referenceTitle}</p>}
          </div>
        </div>

        <label className="master-map-title-field">
          Titulo do quadro
          <input
            ref={inputRef}
            value={title}
            placeholder="Digite o titulo"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onClose();
            }}
          />
        </label>
        {error && <p className="notice-message error">{error}</p>}

        <div className="master-map-panel-actions">
          <button className="primary-button" type="button" onClick={submit}>Criar quadro</button>
          <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
