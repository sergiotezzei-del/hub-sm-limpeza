import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CleaningConsumption } from "../CleaningConsumption";

const SESSION_KEY = "hub-sm-active-session";

function currentView() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? String(JSON.parse(raw)?.view ?? "") : "";
  } catch {
    return "";
  }
}

function triggerCurrentLogout() {
  const root = document.getElementById("root");
  if (!(root instanceof HTMLElement)) return;
  const visibleLogout = Array.from(root.querySelectorAll<HTMLButtonElement>("button.logout-button"))
    .find((button) => button.offsetParent !== null);
  visibleLogout?.click();
}

export function CleaningConsumptionEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!(root instanceof HTMLElement)) return;

    const updateTarget = () => {
      if (currentView() !== "cleaning-dashboard") {
        setTarget(null);
        setOpen(false);
        return;
      }

      const grid = root.querySelector<HTMLElement>(".cleaning-dashboard-grid");
      if (!grid) {
        setTarget(null);
        return;
      }

      let host = grid.querySelector<HTMLElement>(".cleaning-consumption-enhancer-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "cleaning-consumption-enhancer-host";
        grid.appendChild(host);
      }
      setTarget((current) => current === host ? current : host);
    };

    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!target) return null;

  return <>
    {createPortal(
      <button className="cleaning-consumption-launch-card" type="button" onClick={() => setOpen(true)}>
        <span className="cleaning-consumption-card-kicker">Histórico</span>
        <strong>Consultar consumo e compras</strong>
        <span>Pergunte por produto, período, conferências ou pedidos da Néia.</span>
      </button>,
      target,
    )}
    {open && createPortal(
      <div className="cleaning-consumption-overlay" role="dialog" aria-modal="true" aria-label="Consulta do histórico da Limpeza">
        <CleaningConsumption
          onBack={() => setOpen(false)}
          onLogout={() => {
            setOpen(false);
            window.setTimeout(triggerCurrentLogout, 0);
          }}
        />
      </div>,
      document.body,
    )}
  </>;
}
