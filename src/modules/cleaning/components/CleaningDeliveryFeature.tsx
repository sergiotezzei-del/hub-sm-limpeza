import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../../components/AppIcon";
import { getInventoryProducts, getOrders, getStockChecks } from "../../../storage";
import type { CleaningOrder, InventoryProduct, StockCheck } from "../../../types";
import {
  decideCleaningDeliveryApproval,
  isCleaningDeliveryCloudEnabled,
  loadCleaningDeliveries,
  loadCleaningDeliveryApprovals,
  registerCleaningDelivery,
  requestCleaningDeliveryApproval,
  type CleaningDeliveryApproval,
  type CleaningDeliveryRecord,
} from "../services/deliveryService";
import "./cleaningDelivery.css";

const SESSION_KEY = "hub-sm-active-session";
const RETURN_TO_DELIVERY_KEY = "hub-sm-return-to-delivery";
const SUPERVISOR_ID = "tezzei";
const STOCK_CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const userNames: Record<string, string> = {
  tezzei: "Sergio Tezzei",
  neia: "Néia",
  selma: "Selma",
  helena: "Helena",
};

type DraftItem = {
  orderItemId: string;
  orderProductName: string;
  productSlug: string;
  productName: string;
  unit: string;
  orderedQuantity: number;
  previouslyReceived: number;
  expectedQuantity: number;
  receivedQuantity: string;
  stockBefore: number;
  observation: string;
};

type SessionUser = {
  id: string;
  name: string;
  isSupervisor: boolean;
};

function createId() {
  return crypto.randomUUID?.() ?? `delivery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseQuantity(value: string) {
  const number = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(number) && number >= 0 ? number : null;
}

function formatQuantity(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : value;
}

function readSessionUser(): SessionUser {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const currentUser = raw ? String(JSON.parse(raw)?.currentUser ?? "") : "";
    return {
      id: currentUser || "neia",
      name: userNames[currentUser] ?? currentUser || "Néia",
      isSupervisor: currentUser === SUPERVISOR_ID,
    };
  } catch {
    return { id: "neia", name: "Néia", isSupervisor: false };
  }
}

function parseStockCheckDate(check: StockCheck) {
  const dateMatch = check.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = check.hora.match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const [, day, month, year] = dateMatch;
  const [, hour, minute] = timeMatch;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isFinite(date.getTime()) ? date : null;
}

function isRecentStockCheck(check: StockCheck | null) {
  if (!check) return false;
  const date = parseStockCheckDate(check);
  if (!date) return false;
  const age = Date.now() - date.getTime();
  return age >= 0 && age <= STOCK_CHECK_MAX_AGE_MS;
}

function buildReceivedTotals(deliveries: CleaningDeliveryRecord[]) {
  const totals = new Map<string, number>();
  deliveries.forEach((delivery) => delivery.items.forEach((item) => {
    totals.set(item.orderItemId, (totals.get(item.orderItemId) ?? 0) + item.receivedQuantity);
  }));
  return totals;
}

function buildDraft(
  order: CleaningOrder,
  inventory: InventoryProduct[],
  deliveries: CleaningDeliveryRecord[],
  stockCheck: StockCheck,
): DraftItem[] {
  const inventoryByName = new Map(inventory.map((product) => [normalizeText(product.name), product]));
  const stockByName = new Map(stockCheck.itens.map((item) => [normalizeText(item.productName), item.quantity]));
  const receivedTotals = buildReceivedTotals(deliveries);

  return order.itens.map((item) => {
    const product = inventoryByName.get(normalizeText(item.productName));
    const previouslyReceived = receivedTotals.get(item.id) ?? 0;
    const expectedQuantity = Math.max(0, item.quantity - previouslyReceived);
    const stockBefore = product ? stockByName.get(normalizeText(product.name)) ?? 0 : 0;
    return {
      orderItemId: item.id,
      orderProductName: item.productName,
      productSlug: product?.id ?? "",
      productName: product?.name ?? item.productName,
      unit: product?.unit ?? item.unit,
      orderedQuantity: item.quantity,
      previouslyReceived,
      expectedQuantity,
      receivedQuantity: String(expectedQuantity),
      stockBefore,
      observation: item.observation ?? "",
    };
  });
}

function approvalMatchesItems(approval: CleaningDeliveryApproval, items: DraftItem[]) {
  if (approval.items.length !== items.length) return false;
  return items.every((item) => {
    const received = parseQuantity(item.receivedQuantity);
    return approval.items.some((approvedItem) => (
      approvedItem.orderItemId === item.orderItemId
      && approvedItem.productSlug === item.productSlug
      && approvedItem.receivedQuantity === received
    ));
  });
}

function friendlyError(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível concluir esta operação.";
  const message = error.message;
  if (message.includes("exige conexão") || message.includes("Entre novamente")) return message;
  const match = message.match(/message[\\"': ]+([^"}]+)/i);
  return (match?.[1] ?? message).slice(0, 300);
}

export function CleaningDeliveryFeature() {
  const [dashboardTarget, setDashboardTarget] = useState<HTMLElement | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser>(readSessionUser);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [decisionBusyId, setDecisionBusyId] = useState("");
  const [orders, setOrders] = useState<CleaningOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [deliveries, setDeliveries] = useState<CleaningDeliveryRecord[]>([]);
  const [latestStockCheck, setLatestStockCheck] = useState<StockCheck | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState("");
  const [activeApproval, setActiveApproval] = useState<CleaningDeliveryApproval | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<CleaningDeliveryApproval[]>([]);
  const [approvalCenterOpen, setApprovalCenterOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const recentDeliveries = useMemo(() => deliveries.slice(0, 10), [deliveries]);
  const mappingError = useMemo(() => items.some((item) => !item.productSlug), [items]);
  const parsedItems = useMemo(() => items.map((item) => ({ ...item, received: parseQuantity(item.receivedQuantity) })), [items]);
  const hasInvalidQuantity = parsedItems.some((item) => item.received === null);
  const hasDivergence = parsedItems.some((item) => item.received !== null && item.received !== item.expectedQuantity);
  const approvedForCurrentValues = Boolean(
    activeApproval?.status === "approved" && approvalMatchesItems(activeApproval, items),
  );
  const approvalPending = Boolean(
    activeApproval?.status === "pending" && approvalMatchesItems(activeApproval, items),
  );
  const canConfirm = Boolean(
    selectedOrder
    && latestStockCheck
    && !mappingError
    && !hasInvalidQuantity
    && (!hasDivergence || approvedForCurrentValues)
    && !saving,
  );

  useEffect(() => {
    const rootElement = document.getElementById("root");
    if (!(rootElement instanceof HTMLElement)) return;
    const appRoot: HTMLElement = rootElement;

    const updateTarget = () => {
      const cleaningScreen = Array.from(appRoot.querySelectorAll<HTMLElement>(".screen")).find((screen) =>
        Array.from(screen.querySelectorAll("h1")).some((title) => title.textContent?.trim() === "Gestão de Limpeza"),
      );
      const target = cleaningScreen?.querySelector<HTMLElement>(".cleaning-dashboard-grid") ?? null;
      setDashboardTarget((current) => current === target ? current : target);
      if (!cleaningScreen) setOpen(false);
    };

    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(appRoot, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setSessionUser(readSessionUser()), 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!dashboardTarget) return;
    const shouldReturn = window.localStorage.getItem(RETURN_TO_DELIVERY_KEY) === "1";
    if (!shouldReturn) return;
    window.localStorage.removeItem(RETURN_TO_DELIVERY_KEY);
    void beginDeliveryFlow();
  }, [dashboardTarget]);

  useEffect(() => {
    if (!sessionUser.isSupervisor) {
      setPendingApprovals([]);
      return;
    }
    void refreshSupervisorApprovals();
    const interval = window.setInterval(() => { void refreshSupervisorApprovals(); }, 12000);
    return () => window.clearInterval(interval);
  }, [sessionUser.id, sessionUser.isSupervisor]);

  useEffect(() => {
    if (!selectedOrder || !open) return;
    void refreshCurrentApproval();
    const interval = window.setInterval(() => { void refreshCurrentApproval(); }, 6000);
    return () => window.clearInterval(interval);
  }, [open, selectedOrderId, sessionUser.id, items]);

  async function loadBaseData() {
    const [loadedOrders, loadedInventory, loadedDeliveries, loadedChecks] = await Promise.all([
      getOrders(),
      getInventoryProducts(),
      loadCleaningDeliveries(),
      getStockChecks(),
    ]);
    const stockCheck = loadedChecks[0] ?? null;
    const pendingOrders = loadedOrders.filter((order) => {
      if (order.status !== "Pedido feito" || order.deletedAt) return false;
      const receivedTotals = buildReceivedTotals(loadedDeliveries);
      return order.itens.some((item) => (receivedTotals.get(item.id) ?? 0) < item.quantity);
    });
    setOrders(pendingOrders);
    setInventory(loadedInventory);
    setDeliveries(loadedDeliveries);
    setLatestStockCheck(stockCheck);
    return { stockCheck };
  }

  async function beginDeliveryFlow() {
    setLoading(true);
    setPreflightError("");
    setError("");
    setNotice("");
    try {
      await loadBaseData();
      setPreflightOpen(true);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }

  function confirmStockCheckDone() {
    if (!latestStockCheck || !isRecentStockCheck(latestStockCheck)) {
      setPreflightError("Não encontrei uma conferência de estoque feita nas últimas 24 horas. Faça a contagem antes de receber o pedido.");
      return;
    }
    setPreflightError("");
    setPreflightOpen(false);
    setOpen(true);
  }

  function goToStockCheck() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      const session = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(RETURN_TO_DELIVERY_KEY, "1");
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, view: "stock-check" }));
      window.location.reload();
    } catch {
      setPreflightError("Não foi possível abrir a Conferência de Estoque. Feche esta janela e acesse a tela pela área da Néia.");
    }
  }

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setActiveApproval(null);
    setNotice("");
    setError("");
    const order = orders.find((entry) => entry.id === orderId);
    if (!order || !latestStockCheck) {
      setItems([]);
      return;
    }
    setItems(buildDraft(order, inventory, deliveries, latestStockCheck));
  }

  function updateReceivedQuantity(orderItemId: string, value: string) {
    setItems((current) => current.map((item) => item.orderItemId === orderItemId ? { ...item, receivedQuantity: value } : item));
    setActiveApproval(null);
    setNotice("");
  }

  async function refreshCurrentApproval() {
    if (!selectedOrder) return;
    try {
      const approvals = await loadCleaningDeliveryApprovals({ requesterId: sessionUser.id, orderId: selectedOrder.id });
      const matching = approvals.find((approval) => approvalMatchesItems(approval, items)) ?? null;
      setActiveApproval(matching);
      if (matching?.status === "approved") {
        setNotice(`Entrega liberada por ${matching.decidedByName ?? "supervisor"}. O botão de confirmação está disponível.`);
      } else if (matching?.status === "rejected") {
        setNotice(`Liberação recusada${matching.decisionNote ? `: ${matching.decisionNote}` : ". Procure seu encarregado ou gerente."}`);
      }
    } catch {
      // A tela continua utilizável; uma nova tentativa ocorrerá no próximo ciclo.
    }
  }

  async function refreshSupervisorApprovals() {
    try {
      const approvals = await loadCleaningDeliveryApprovals({ pendingSupervisorId: SUPERVISOR_ID });
      setPendingApprovals(approvals);
    } catch {
      setPendingApprovals([]);
    }
  }

  async function requestApproval() {
    setError("");
    setNotice("");
    if (!selectedOrder || !latestStockCheck) {
      setError("Selecione o pedido recebido.");
      return;
    }
    if (mappingError) {
      setError("Há produto do pedido sem cadastro correspondente no estoque. Procure o supervisor antes de continuar.");
      return;
    }
    if (hasInvalidQuantity) {
      setError("Revise as quantidades recebidas.");
      return;
    }
    if (!hasDivergence) {
      setError("As quantidades conferem. Use o botão Confirmar entrega.");
      return;
    }

    setRequestingApproval(true);
    try {
      const requestId = createId();
      await requestCleaningDeliveryApproval({
        id: requestId,
        orderId: selectedOrder.id,
        stockCheckId: latestStockCheck.id,
        requestedById: sessionUser.id,
        requestedByName: sessionUser.name,
        supervisorId: SUPERVISOR_ID,
        items: parsedItems.map((item) => ({
          orderItemId: item.orderItemId,
          productSlug: item.productSlug,
          receivedQuantity: Number(item.received),
        })),
      });
      const approvals = await loadCleaningDeliveryApprovals({ requesterId: sessionUser.id, orderId: selectedOrder.id });
      setActiveApproval(approvals.find((approval) => approval.id === requestId) ?? approvals[0] ?? null);
      setNotice("Divergência registrada. Ligue para seu encarregado ou gerente. A solicitação de liberação foi enviada ao Admin Tezzei.");
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setRequestingApproval(false);
    }
  }

  async function decideApproval(approval: CleaningDeliveryApproval, decision: "approved" | "rejected") {
    const action = decision === "approved" ? "liberar" : "recusar";
    if (!window.confirm(`Deseja ${action} esta entrega divergente?`)) return;
    const note = decision === "rejected" ? window.prompt("Motivo da recusa:", "Conferir novamente com o fornecedor.") ?? "" : "";
    setDecisionBusyId(approval.id);
    try {
      await decideCleaningDeliveryApproval({
        approvalId: approval.id,
        decision,
        supervisorName: sessionUser.name,
        note,
      });
      await refreshSupervisorApprovals();
    } catch (decisionError) {
      window.alert(friendlyError(decisionError));
    } finally {
      setDecisionBusyId("");
    }
  }

  async function submitDelivery() {
    setError("");
    setNotice("");
    if (!selectedOrder || !latestStockCheck || mappingError || hasInvalidQuantity) {
      setError("Revise o pedido e as quantidades recebidas.");
      return;
    }
    if (hasDivergence && !approvedForCurrentValues) {
      setError("A entrega tem divergência e ainda não foi liberada pelo supervisor.");
      return;
    }
    if (!window.confirm("Confirmar o recebimento e atualizar o estoque?")) return;

    setSaving(true);
    try {
      await registerCleaningDelivery({
        id: createId(),
        orderId: selectedOrder.id,
        stockCheckId: latestStockCheck.id,
        approvalId: hasDivergence ? activeApproval?.id : undefined,
        receivedById: sessionUser.id,
        receivedByName: sessionUser.name,
        notes,
        items: parsedItems.map((item) => ({
          orderItemId: item.orderItemId,
          productSlug: item.productSlug,
          orderedQuantity: item.orderedQuantity,
          receivedQuantity: Number(item.received),
          observation: item.observation,
        })),
      });
      await loadBaseData();
      setSelectedOrderId("");
      setItems([]);
      setActiveApproval(null);
      setNotes("");
      setNotice("Entrega confirmada. O estoque e o histórico de pedidos recebidos foram atualizados.");
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setSaving(false);
    }
  }

  const card = dashboardTarget ? createPortal(
    <button className="admin-card module-card with-icon has-access action-card cleaning-control-card cleaning-delivery-card" type="button" onClick={() => { void beginDeliveryFlow(); }}>
      <span className="module-icon-circle" aria-hidden="true"><AppIcon name="stock" size="lg" className="module-icon" /></span>
      <span className="module-card-copy"><span className="module-card-title">Conferência de Entrega</span><strong>Conferir pedido e dar entrada no estoque</strong></span>
    </button>,
    dashboardTarget,
  ) : null;

  const preflight = preflightOpen ? createPortal(
    <div className="cleaning-delivery-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmação da conferência de estoque">
      <section className="cleaning-delivery-preflight">
        <span className="cleaning-delivery-preflight-icon"><AppIcon name="warning" size="lg" /></span>
        <h2>Você conferiu o estoque atual?</h2>
        <p>A contagem deve ser feita <strong>sem incluir os produtos que acabaram de chegar</strong>.</p>
        {latestStockCheck && isRecentStockCheck(latestStockCheck) && (
          <small>Última conferência registrada: {latestStockCheck.data} às {latestStockCheck.hora}</small>
        )}
        {preflightError && <p className="error-message">{preflightError}</p>}
        <div className="cleaning-delivery-preflight-actions">
          <button className="secondary-button" type="button" onClick={goToStockCheck}>Não, fazer a conferência</button>
          <button className="primary-button" type="button" onClick={confirmStockCheckDone}>Sim, já conferi</button>
        </div>
        <button className="ghost-button" type="button" onClick={() => setPreflightOpen(false)}>Cancelar</button>
      </section>
    </div>,
    document.body,
  ) : null;

  const screen = open ? createPortal(
    <div className="cleaning-delivery-overlay" role="dialog" aria-modal="true" aria-label="Conferência de Entrega">
      <main className="cleaning-delivery-shell">
        <section className="screen cleaning-delivery-screen">
          <header className="cleaning-delivery-header">
            <div><p className="eyebrow">Gestão de Limpeza</p><h1>Conferência de Entrega</h1><p>Selecione o pedido e altere somente o que chegou diferente.</p></div>
            <button className="logout-button" type="button" disabled={saving} onClick={() => setOpen(false)}>Fechar</button>
          </header>

          {latestStockCheck && <p className="cleaning-delivery-baseline"><AppIcon name="save" size="sm" />Estoque conferido em {latestStockCheck.data} às {latestStockCheck.hora}. Essa contagem será usada automaticamente.</p>}
          {!isCleaningDeliveryCloudEnabled() && <p className="error-message">Sem conexão. A entrega não pode ser registrada offline.</p>}
          {error && <p className="error-message cleaning-delivery-message">{error}</p>}
          {notice && <p className="notice-message cleaning-delivery-message">{notice}</p>}

          <section className="cleaning-delivery-section">
            <label className="cleaning-delivery-order-select">Qual pedido chegou?
              <select value={selectedOrderId} disabled={loading || saving} onChange={(event) => selectOrder(event.target.value)}>
                <option value="">Selecione o pedido recebido</option>
                {orders.map((order) => <option key={order.id} value={order.id}>{order.data} às {order.hora} — {order.itens.length} produto(s)</option>)}
              </select>
            </label>
            {loading && <p className="cleaning-delivery-empty">Carregando pedidos...</p>}
            {!loading && orders.length === 0 && <p className="cleaning-delivery-empty">Não há pedido aguardando recebimento.</p>}
          </section>

          {selectedOrder && (
            <section className="cleaning-delivery-section">
              <div className="cleaning-delivery-list-head">
                <div><h2>Produtos recebidos</h2><p>As quantidades já vieram preenchidas conforme o pedido.</p></div>
                <span>{items.length} item(ns)</span>
              </div>

              {mappingError && <p className="error-message">Um produto do pedido não corresponde a um produto cadastrado no estoque. Procure o supervisor para corrigir o cadastro.</p>}

              <div className="cleaning-delivery-simple-list">
                {items.map((item) => {
                  const received = parseQuantity(item.receivedQuantity);
                  const different = received !== null && received !== item.expectedQuantity;
                  return (
                    <article className={`cleaning-delivery-simple-row ${different ? "has-divergence" : "is-correct"}`} key={item.orderItemId}>
                      <div className="cleaning-delivery-product-copy">
                        <strong>{item.orderProductName}</strong>
                        <small>Pedido: {formatQuantity(item.expectedQuantity)} {item.unit}{item.previouslyReceived > 0 ? ` · Já recebido antes: ${formatQuantity(item.previouslyReceived)}` : ""}</small>
                      </div>
                      <label>Recebido
                        <input type="number" inputMode="decimal" min="0" step="any" value={item.receivedQuantity} disabled={saving || requestingApproval} onChange={(event) => updateReceivedQuantity(item.orderItemId, event.target.value)} />
                        <span>{item.unit}</span>
                      </label>
                      <span className={`cleaning-delivery-row-status ${different ? "divergent" : "correct"}`}>{different ? "Divergência" : "Certo"}</span>
                    </article>
                  );
                })}
              </div>

              {activeApproval && approvalMatchesItems(activeApproval, items) && (
                <section className={`cleaning-delivery-approval-status ${activeApproval.status}`}>
                  {activeApproval.status === "pending" && <><strong>Aguardando liberação</strong><p>O Admin Tezzei recebeu a solicitação. Ligue para seu encarregado ou gerente.</p></>}
                  {activeApproval.status === "approved" && <><strong>Entrega liberada</strong><p>{activeApproval.decidedByName ?? "Supervisor"} autorizou a conclusão desta divergência.</p></>}
                  {activeApproval.status === "rejected" && <><strong>Liberação recusada</strong><p>{activeApproval.decisionNote ?? "Confira novamente com o fornecedor e o supervisor."}</p></>}
                </section>
              )}

              <label className="cleaning-delivery-notes">Observação geral, se necessário
                <textarea rows={2} value={notes} disabled={saving} placeholder="Nota fiscal, avaria ou informação importante." onChange={(event) => setNotes(event.target.value)} />
              </label>

              <div className="cleaning-delivery-final-actions">
                <button
                  className={`cleaning-delivery-confirm-button ${canConfirm ? "released" : "blocked"}`}
                  type="button"
                  disabled={!canConfirm || !isCleaningDeliveryCloudEnabled()}
                  onClick={() => { void submitDelivery(); }}
                >
                  <AppIcon name={canConfirm ? "save" : "blocked"} size="sm" />
                  {saving ? "Confirmando..." : approvedForCurrentValues ? "Confirmar entrega liberada" : "Confirmar entrega"}
                </button>
                <button
                  className="cleaning-delivery-divergence-button"
                  type="button"
                  disabled={!hasDivergence || hasInvalidQuantity || mappingError || requestingApproval || approvalPending}
                  onClick={() => { void requestApproval(); }}
                >
                  <AppIcon name="warning" size="sm" />
                  {requestingApproval ? "Enviando solicitação..." : approvalPending ? "Liberação solicitada" : "Pedido com divergência"}
                </button>
              </div>
            </section>
          )}

          <section className="cleaning-delivery-history-toggle">
            <button className="ghost-button" type="button" onClick={() => setHistoryOpen((current) => !current)}>{historyOpen ? "Ocultar histórico" : "Ver histórico de pedidos recebidos"}</button>
            {historyOpen && (
              <div className="cleaning-delivery-history-list">
                {recentDeliveries.length === 0 ? <p className="cleaning-delivery-empty">Nenhuma entrega registrada.</p> : recentDeliveries.map((delivery) => (
                  <article className="cleaning-delivery-history-card" key={delivery.id}>
                    <div><small>{formatDateTime(delivery.receivedAt)}</small><h3>{delivery.receivedByName}</h3><p>{delivery.items.length} produto(s) recebido(s){delivery.hasDivergence ? " · Com divergência autorizada" : ""}</p></div>
                    <strong>{formatQuantity(delivery.items.reduce((total, item) => total + item.receivedQuantity, 0))}</strong>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>,
    document.body,
  ) : null;

  const supervisorNotification = sessionUser.isSupervisor && pendingApprovals.length > 0 ? createPortal(
    <button className="cleaning-delivery-supervisor-alert" type="button" onClick={() => setApprovalCenterOpen(true)}>
      <AppIcon name="warning" size="md" />
      <span><strong>{pendingApprovals.length} liberação(ões) de entrega</strong><small>Toque para analisar</small></span>
    </button>,
    document.body,
  ) : null;

  const approvalCenter = approvalCenterOpen ? createPortal(
    <div className="cleaning-delivery-modal-backdrop" role="dialog" aria-modal="true" aria-label="Liberações de entrega">
      <section className="cleaning-delivery-approval-center">
        <header><div><p className="eyebrow">Supervisor</p><h2>Liberações de entrega</h2></div><button className="logout-button" type="button" onClick={() => setApprovalCenterOpen(false)}>Fechar</button></header>
        {pendingApprovals.length === 0 ? <p className="cleaning-delivery-empty">Nenhuma liberação pendente.</p> : pendingApprovals.map((approval) => (
          <article className="cleaning-delivery-approval-card" key={approval.id}>
            <div className="cleaning-delivery-approval-head"><div><small>{formatDateTime(approval.requestedAt)}</small><h3>Solicitado por {approval.requestedByName}</h3></div><span>{approval.items.filter((item) => item.expectedQuantity !== item.receivedQuantity).length} divergência(s)</span></div>
            <div className="cleaning-delivery-approval-items">{approval.items.map((item) => (
              <p key={item.orderItemId}><strong>{item.productName}</strong><span>Pedido: {formatQuantity(item.expectedQuantity)} {item.unit}</span><span>Recebido: {formatQuantity(item.receivedQuantity)} {item.unit}</span></p>
            ))}</div>
            <div className="cleaning-delivery-approval-actions">
              <button className="danger-button" type="button" disabled={decisionBusyId === approval.id} onClick={() => { void decideApproval(approval, "rejected"); }}>Recusar</button>
              <button className="primary-button" type="button" disabled={decisionBusyId === approval.id} onClick={() => { void decideApproval(approval, "approved"); }}>{decisionBusyId === approval.id ? "Salvando..." : "Liberar entrega"}</button>
            </div>
          </article>
        ))}
      </section>
    </div>,
    document.body,
  ) : null;

  return <>{card}{preflight}{screen}{supervisorNotification}{approvalCenter}</>;
}
