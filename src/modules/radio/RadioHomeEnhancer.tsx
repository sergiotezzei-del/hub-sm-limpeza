import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RadioTestPage } from "./RadioTestPage";

const HUB_SESSION_KEY = "hub-sm-active-session";

export function RadioHomeEnhancer() {
  const [managementGrid, setManagementGrid] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (!isTezzeiAdminSession()) {
        setManagementGrid(null);
        return;
      }

      const sections = Array.from(document.querySelectorAll<HTMLElement>(".hub-home-section"));
      const managementSection = sections.find((section) => section.querySelector("h2")?.textContent?.trim() === "Gestão");
      const nextGrid = managementSection?.querySelector<HTMLElement>(".module-grid") ?? null;
      setManagementGrid((current) => current === nextGrid ? current : nextGrid);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      {managementGrid ? createPortal(
        <button
          className="admin-card module-card with-icon has-access action-card"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir Rádio Santa Maria"
        >
          <span className="module-icon-circle" aria-hidden="true" style={{ fontSize: 24, fontWeight: 800 }}>♫</span>
          <span className="module-card-copy">
            <span className="module-card-title">Rádio Santa Maria</span>
            <strong>Música ambiente, controles, comunicados e programação.</strong>
          </span>
        </button>,
        managementGrid,
      ) : null}

      {open ? createPortal(
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Rádio Santa Maria">
          <button type="button" onClick={() => setOpen(false)} style={backButtonStyle}>← Voltar ao HUB</button>
          <div style={contentStyle}>
            <RadioTestPage />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function isTezzeiAdminSession() {
  try {
    const raw = window.sessionStorage.getItem(HUB_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { currentUser?: unknown };
    return parsed.currentUser === "tezzei";
  } catch {
    return false;
  }
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  overflow: "auto",
  background: "#f3f4f6",
};

const backButtonStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: 16,
  zIndex: 10001,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#ffffff",
  color: "#111827",
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.10)",
};

const contentStyle: React.CSSProperties = {
  minHeight: "100vh",
};
