import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CleaningConsumption } from "../CleaningConsumption";

const SESSION_KEY = "hub-sm-active-session";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

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
      if (currentView() !== "neia-history") {
        setTarget(null);
        setOpen(false);
        return;
      }

      const screens = Array.from(root.querySelectorAll<HTMLElement>(".screen"));
      const historyScreen = screens.find((screen) => {
        const heading = Array.from(screen.querySelectorAll("h1, h2"))
          .map((node) => normalize(node.textContent ?? ""))
          .join(" ");
        return heading.includes("HISTORICO DE PEDIDOS DA NEIA");
      });

      if (!historyScreen) {
        setTarget(null);
        return;
      }

      let host = historyScreen.querySelector<HTMLElement>(".cleaning-consumption-enhancer-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "cleaning-consumption-enhancer-host";
        const neiaHistoryHost = historyScreen.querySelector(".neia-history-enhancer-host");
        const footer = historyScreen.querySelector("footer");
        if (neiaHistoryHost?.parentElement === historyScreen) {
          historyScreen.insertBefore(host, neiaHistoryHost);
        } else if (footer?.parentElement === historyScreen) {
          historyScreen.insertBefore(host, footer);
        } else {
          historyScreen.appendChild(host);
        }
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
      <button className="cleaning-consumption-history-launch" type="button" onClick={() => setOpen(true)}>
        <span className="cleaning-consumption-history-icon" aria-hidden="true">▥</span>
        <span className="cleaning-consumption-history-copy">
          <span className="cleaning-consumption-card-kicker">Consulta do histórico</span>
          <strong>Consultar consumo e compras</strong>
          <span>Pesquise por produto, período, conferências ou pedidos da Néia.</span>
        </span>
        <span className="cleaning-consumption-history-action" aria-hidden="true">Consultar</span>
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
