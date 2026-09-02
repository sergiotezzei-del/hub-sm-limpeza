import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getNeiaOrderHistory, getStockChecks, getStockMovements } from "../../storage";
import type { CleaningOrder, InventoryProduct, StockCheck, StockMovement } from "../../types";
import { neiaStockChecks, productStockActivity, stockHistoryDate } from "./stockHistory";
import "./cleaning-history.css";

export function HistoryDisclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return <details className="order-card cleaning-history-record">
    <summary className="cleaning-history-summary">
      <div className="cleaning-history-summary-copy">{summary}</div>
      <span className="cleaning-history-chevron" aria-hidden="true" />
    </summary>
    <div className="cleaning-history-details">{children}</div>
  </details>;
}

export function NeiaHistory({ renderOrders }: {
  renderOrders: (orders: CleaningOrder[]) => ReactNode;
}) {
  const [section, setSection] = useState<"menu" | "orders" | "checks">("menu");
  const [orders, setOrders] = useState<CleaningOrder[]>([]);
  const [checks, setChecks] = useState<StockCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (section === "menu") return;
    let active = true;
    setLoading(true);
    setError(false);
    const load = section === "orders"
      ? getNeiaOrderHistory({ requireRemote: true }).then((rows) => { if (active) setOrders(rows); })
      : getStockChecks({ requireRemote: true }).then((rows) => { if (active) setChecks(neiaStockChecks(rows)); });
    void load.catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [section, retry]);

  function openSection(next: typeof section) {
    setLoading(next !== "menu");
    setError(false);
    setSection(next);
  }

  return <div className="cleaning-history">
    {section === "menu" ? <div className="button-grid cleaning-history-menu">
      <button type="button" className="secondary-button" onClick={() => openSection("orders")}>Histórico de pedidos</button>
      <button type="button" className="secondary-button" onClick={() => openSection("checks")}>Histórico de conferências</button>
    </div> : <>
      <button type="button" className="ghost-button" onClick={() => openSection("menu")}>Voltar para Histórico Neia</button>
      <h2>{section === "orders" ? "Histórico de pedidos" : "Histórico de conferências"}</h2>
      {loading ? <p role="status">Carregando histórico...</p> : error ? <div role="alert">
        <p>Não foi possível consultar o histórico agora.</p>
        <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
      </div> : section === "orders" ? renderOrders(orders) : checks.length === 0 ? <p>Nenhuma conferência da Neia registrada.</p> :
        <div className="orders-list">{checks.map((check) => <HistoryDisclosure key={check.id} summary={<>
          <strong>{check.data} às {check.hora}</strong>
          <small>Neia · {check.itens.length} produtos conferidos</small>
        </>}>
          <ul className="item-list">{[...check.itens].sort((a, b) => a.productName.localeCompare(b.productName, "pt-BR")).map((item) => <li key={item.id}>
            <span>{item.productName}{item.observation && <small>{item.observation}</small>}</span>
            <strong>{item.quantity.toLocaleString("pt-BR")} {item.unit}</strong>
          </li>)}</ul>
          {check.itens.length === 0 && <p>Esta conferência não contém itens salvos.</p>}
        </HistoryDisclosure>)}</div>}
    </>}
  </div>;
}

export function useProductStockActivity(products: InventoryProduct[]) {
  const [records, setRecords] = useState<{ checks: StockCheck[]; movements: StockMovement[] }>({ checks: [], movements: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading");
    void Promise.all([getStockChecks({ requireRemote: true }), getStockMovements({ requireRemote: true })])
      .then(([checks, movements]) => {
        if (active) { setRecords({ checks, movements }); setStatus("ready"); }
      }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [retry]);
  const activity = useMemo(() => productStockActivity(products, records.checks, records.movements), [products, records]);
  return { activity, status, retry: () => setRetry((value) => value + 1) };
}

export function ProductStockDates({ check, exit, status }: {
  check?: StockCheck; exit?: StockMovement; status: "loading" | "ready" | "error";
}) {
  const pending = status === "loading" ? "Carregando..." : "Consulta indisponível";
  return <span className="cleaning-stock-dates">
    <small>Última conferência: {status !== "ready" ? pending : check ? `${check.data} às ${check.hora}` : "Sem registro"}</small>
    <small>Última saída para uso: {status !== "ready" ? pending : exit ? stockHistoryDate(exit.createdAt) : "Sem registro"}</small>
  </span>;
}
