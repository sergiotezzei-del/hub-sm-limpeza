import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getStockChecks } from "../../../storage";
import type { StockCheck } from "../../../types";
import "./neiaHistory.css";

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

function formatQuantity(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function NeiaHistoryEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [checks, setChecks] = useState<StockCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const root = document.getElementById("root");
    if (!(root instanceof HTMLElement)) return;

    const updateTarget = () => {
      const screens = Array.from(root.querySelectorAll<HTMLElement>(".screen"));
      const sessionSaysHistory = currentView() === "neia-history";
      const historyScreen = screens.find((screen) => {
        const heading = Array.from(screen.querySelectorAll("h1, h2"))
          .map((node) => normalize(node.textContent ?? ""))
          .join(" ");
        const text = normalize(screen.innerText);
        if (heading.includes("GESTAO DE LIMPEZA")) return false;
        return (sessionSaysHistory && text.includes("NEIA"))
          || (text.includes("HISTORICO") && text.includes("NEIA"));
      });

      if (!historyScreen) {
        setTarget(null);
        return;
      }

      let host = historyScreen.querySelector<HTMLElement>(".neia-history-enhancer-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "neia-history-enhancer-host";
        const footer = historyScreen.querySelector("footer");
        if (footer?.parentElement === historyScreen) {
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
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    void getStockChecks()
      .then((records) => {
        if (cancelled) return;
        setChecks(records.filter((check) => check.conferente === "Neia"));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as conferências.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return null;

  return createPortal(
    <section className="neia-stock-history" aria-label="Histórico de conferências de estoque da Néia">
      <header className="neia-stock-history-heading">
        <div>
          <span>Histórico da Néia</span>
          <h2>Conferências de estoque</h2>
          <p>As conferências ficam registradas junto do histórico de pedidos.</p>
        </div>
        <strong>{checks.length}</strong>
      </header>

      {loading ? (
        <p className="neia-stock-history-state">Carregando conferências...</p>
      ) : error ? (
        <p className="neia-stock-history-state error">{error}</p>
      ) : checks.length === 0 ? (
        <p className="neia-stock-history-state">Nenhuma conferência de estoque registrada pela Néia.</p>
      ) : (
        <div className="neia-stock-history-list">
          {checks.map((check) => (
            <details className="neia-stock-history-card" key={check.id}>
              <summary>
                <div>
                  <strong>Conferência de estoque</strong>
                  <span>{check.data} · {check.hora}</span>
                </div>
                <span className="neia-stock-history-count">{check.itens.length} {check.itens.length === 1 ? "item" : "itens"}</span>
              </summary>
              <div className="neia-stock-history-items">
                {check.itens.map((item) => (
                  <div className="neia-stock-history-item" key={item.id}>
                    <div>
                      <strong>{item.productName}</strong>
                      {item.observation && <small>{item.observation}</small>}
                    </div>
                    <span>{formatQuantity(item.quantity)} {item.unit}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>,
    target,
  );
}
