import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const HUB_SAVE_SUCCESS_EVENT = "hub:save-success";

export type HubSaveSuccessDetail = {
  title: string;
  body?: string;
  newLabel?: string;
  onNew?: () => void;
};

export function showHubSaveSuccess(detail: HubSaveSuccessDetail) {
  window.dispatchEvent(new CustomEvent<HubSaveSuccessDetail>(HUB_SAVE_SUCCESS_EVENT, { detail }));
}

export function HubSaveSuccessHost() {
  const [detail, setDetail] = useState<HubSaveSuccessDetail | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<HubSaveSuccessDetail>;
      if (!custom.detail?.title) return;
      setDetail(custom.detail);
    };
    window.addEventListener(HUB_SAVE_SUCCESS_EVENT, handler);
    return () => window.removeEventListener(HUB_SAVE_SUCCESS_EVENT, handler);
  }, []);

  if (!detail) return null;

  const handleNew = () => {
    const action = detail.onNew;
    setDetail(null);
    window.setTimeout(() => action?.(), 20);
  };

  return createPortal(
    <div className="hub-save-success-backdrop" role="presentation">
      <section className="hub-save-success-modal" role="dialog" aria-modal="true" aria-label={detail.title}>
        <div className="hub-save-success-icon">✓</div>
        <h3>{detail.title}</h3>
        <p>{detail.body ?? "As informações foram salvas no HUB."}</p>
        <div className="hub-save-success-actions">
          <button type="button" onClick={() => setDetail(null)}>Sair</button>
          {detail.newLabel && (
            <button className="primary" type="button" onClick={handleNew}>{detail.newLabel}</button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
