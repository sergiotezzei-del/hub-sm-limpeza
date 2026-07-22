import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../../components/AppIcon";
import { getInventoryProducts, getOrders } from "../../../storage";
import type { CleaningOrder, InventoryProduct } from "../../../types";
import {
  isCleaningDeliveryCloudEnabled,
  loadCleaningDeliveries,
  registerCleaningDelivery,
  type CleaningDeliveryRecord,
} from "../services/deliveryService";
import "./cleaningDelivery.css";

type DraftItem = {
  orderItemId: string;
  orderProductName: string;
  productSlug: string;
  productName: string;
  unit: string;
  orderedQuantity: number;
  previouslyReceived: number;
  pendingQuantity: number;
  preStockQuantity: string;
  receivedQuantity: string;
  observation: string;
};

const receivers = [
  { id: "tezzei", name: "Sergio Tezzei" },
  { id: "neia", name: "Néia" },
  { id: "selma", name: "Selma" },
  { id: "helena", name: "Helena" },
] as const;

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

function getDefaultReceiverId() {
  try {
    const raw = window.sessionStorage.getItem("hub-sm-active-session");
    const userId = raw ? String(JSON.parse(raw)?.currentUser ?? "") : "";
    return receivers.some((receiver) => receiver.id === userId) ? userId : "tezzei";
  } catch {
    return "tezzei";
  }
}

function buildReceivedTotals(deliveries: CleaningDeliveryRecord[]) {
  const totals = new Map<string, number>();
  deliveries.forEach((delivery) => delivery.items.forEach((item) => {
    totals.set(item.orderItemId, (totals.get(item.orderItemId) ?? 0) + item.receivedQuantity);
  }));
  return totals;
}

function buildDraft(order: CleaningOrder, inventory: InventoryProduct[], deliveries: CleaningDeliveryRecord[]): DraftItem[] {
  const inventoryByName = new Map(inventory.map((product) => [normalizeText(product.name), product]));
  const receivedTotals = buildReceivedTotals(deliveries);
  return order.itens.map((item) => {
    const product = inventoryByName.get(normalizeText(item.productName));
    const previouslyReceived = receivedTotals.get(item.id) ?? 0;
    const pendingQuantity = Math.max(0, item.quantity - previouslyReceived);
    return {
      orderItemId: item.id,
      orderProductName: item.productName,
      productSlug: product?.id ?? "",
      productName: product?.name ?? item.productName,
      unit: product?.unit ?? item.unit,
      orderedQuantity: item.quantity,
      previouslyReceived,
      pendingQuantity,
      preStockQuantity: "",
      receivedQuantity: String(pendingQuantity),
      observation: item.observation ?? "",
    };
  });
}

function friendlyError(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível registrar a entrega.";
  if (error.message.includes("exige conexão")) return error.message;
  if (error.message.includes("duplicate") || error.message.includes("unique")) return "Esta conferência já foi registrada.";
  const match = error.message.match(/message[\\"': ]+([^"}]+)/i);
  return (match?.[1] ?? error.message).slice(0, 260);
}

export function CleaningDeliveryFeature() {
  const [dashboardTarget, setDashboardTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<CleaningOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [deliveries, setDeliveries] = useState<CleaningDeliveryRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [receiverId, setReceiverId] = useState(getDefaultReceiverId);
  const [notes, setNotes] = useState("");
  const [separated, setSeparated] = useState(false);
  const [countLocked, setCountLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const recentDeliveries = useMemo(() => deliveries.slice(0, 10), [deliveries]);
  const unmatchedItems = useMemo(() => items.filter((item) => !item.productSlug), [items]);
  const currentStep = !selectedOrder ? 1 : !countLocked ? 2 : 3;

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
    if (open) void refreshData();
  }, [open]);

  async function refreshData() {
    setLoading(true);
    setError("");
    try {
      const [loadedOrders, loadedInventory, loadedDeliveries] = await Promise.all([
        getOrders(), getInventoryProducts(), loadCleaningDeliveries(),
      ]);
      const pendingOrders = loadedOrders.filter((order) => {
        if (order.status !== "Pedido feito" || order.deletedAt) return false;
        return buildDraft(order, loadedInventory, loadedDeliveries).some((item) => item.pendingQuantity > 0);
      });
      setOrders(pendingOrders);
      setInventory(loadedInventory);
      setDeliveries(loadedDeliveries);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }

  function resetDraft(orderId = "") {
    setSelectedOrderId(orderId);
    setSeparated(false);
    setCountLocked(false);
    setNotice("");
    setError("");
    const order = orders.find((entry) => entry.id === orderId);
    setItems(order ? buildDraft(order, inventory, deliveries) : []);
  }

  function updateItem(orderItemId: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => item.orderItemId === orderItemId ? { ...item, ...patch } : item));
  }

  function selectProduct(orderItemId: string, productSlug: string) {
    const product = inventory.find((entry) => entry.id === productSlug);
    updateItem(orderItemId, { productSlug, productName: product?.name ?? "", unit: product?.unit ?? "Unidade" });
  }

  function validateMappings() {
    if (items.some((item) => !item.productSlug)) {
      setError("Selecione o produto correto do estoque para os itens destacados.");
      return false;
    }
    const slugs = items.map((item) => item.productSlug);
    if (new Set(slugs).size !== slugs.length) {
      setError("O mesmo produto não pode aparecer em duas linhas da mesma entrega.");
      return false;
    }
    return true;
  }

  function startCount() {
    setError("");
    if (!validateMappings()) return;
    setSeparated(true);
  }

  function lockCount() {
    setError("");
    if (!separated || !validateMappings()) return;
    if (items.some((item) => parseQuantity(item.preStockQuantity) === null)) {
      setError("Informe quanto havia no estoque antes da entrega em todos os produtos.");
      return;
    }
    setCountLocked(true);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    setError("");
    setNotice("");
    if (!selectedOrder || !countLocked || !validateMappings()) {
      setError("Conclua a contagem anterior antes de confirmar a entrada.");
      return;
    }
    const parsed = items.map((item) => ({ item, pre: parseQuantity(item.preStockQuantity), received: parseQuantity(item.receivedQuantity) }));
    if (parsed.some(({ pre, received }) => pre === null || received === null)) {
      setError("Revise as quantidades informadas.");
      return;
    }
    if (!parsed.some(({ received }) => Number(received) > 0)) {
      setError("Informe ao menos uma quantidade recebida maior que zero.");
      return;
    }
    const receiver = receivers.find((entry) => entry.id === receiverId);
    if (!receiver) {
      setError("Informe quem recebeu a mercadoria.");
      return;
    }

    const divergences = parsed.filter(({ item, received }) => Number(received) !== item.pendingQuantity).length;
    const totalReceived = parsed.reduce((total, { received }) => total + Number(received), 0);
    const confirmation = [
      `Confirmar a entrada de ${formatQuantity(totalReceived)} unidade(s) de controle?`,
      divergences ? `${divergences} item(ns) têm diferença entre o esperado e o recebido.` : "As quantidades recebidas conferem com o pedido.",
      "O estoque final será calculado usando a contagem feita antes da entrega.",
    ].join("\n\n");
    if (!window.confirm(confirmation)) return;

    setSaving(true);
    try {
      await registerCleaningDelivery({
        id: createId(),
        orderId: selectedOrder.id,
        receivedById: receiver.id,
        receivedByName: receiver.name,
        notes,
        items: parsed.map(({ item, pre, received }) => ({
          orderItemId: item.orderItemId,
          productSlug: item.productSlug,
          orderedQuantity: item.orderedQuantity,
          preStockQuantity: Number(pre),
          receivedQuantity: Number(received),
          observation: item.observation,
        })),
      });
      const [nextInventory, nextDeliveries] = await Promise.all([getInventoryProducts(), loadCleaningDeliveries()]);
      setInventory(nextInventory);
      setDeliveries(nextDeliveries);
      resetDraft();
      setNotes("");
      setNotice("Entrega conferida e estoque atualizado.");
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setSaving(false);
    }
  }

  const card = dashboardTarget ? createPortal(
    <button className="admin-card module-card with-icon has-access action-card cleaning-control-card cleaning-delivery-card" type="button" onClick={() => setOpen(true)}>
      <span className="module-icon-circle" aria-hidden="true"><AppIcon name="stock" size="lg" className="module-icon" /></span>
      <span className="module-card-copy"><span className="module-card-title">Conferência de Entrega</span><strong>Receber pedido e atualizar o estoque</strong></span>
    </button>,
    dashboardTarget,
  ) : null;

  const screen = open ? createPortal(
    <div className="cleaning-delivery-overlay" role="dialog" aria-modal="true" aria-label="Conferência de Entrega">
      <main className="cleaning-delivery-shell">
        <section className="screen cleaning-delivery-screen">
          <header className="cleaning-delivery-header">
            <div><p className="eyebrow">Gestão de Limpeza</p><h1>Conferência de Entrega</h1><p>Siga uma etapa por vez. O sistema cuida dos cálculos.</p></div>
            <button className="logout-button" type="button" disabled={saving} onClick={() => setOpen(false)}>Fechar</button>
          </header>

          <div className="cleaning-delivery-progress" aria-label={`Etapa ${currentStep} de 3`}>
            <span className={currentStep >= 1 ? "active" : ""}>1. Pedido</span>
            <span className={currentStep >= 2 ? "active" : ""}>2. Estoque antigo</span>
            <span className={currentStep >= 3 ? "active" : ""}>3. O que chegou</span>
          </div>

          {!isCleaningDeliveryCloudEnabled() && <section className="cleaning-delivery-warning danger"><AppIcon name="warning" size="md" /><div><strong>Sem conexão</strong><p>Conecte o aparelho à internet para registrar a entrada com segurança.</p></div></section>}
          {error && <p className="error-message cleaning-delivery-message">{error}</p>}
          {notice && <p className="success-message cleaning-delivery-message">{notice}</p>}

          {!selectedOrder && <section className="cleaning-delivery-section cleaning-delivery-current-step">
            <div className="cleaning-delivery-section-title"><span>1</span><div><h2>Qual pedido chegou?</h2><p>Escolha o pedido recebido.</p></div></div>
            <label className="cleaning-delivery-field">Pedido
              <select value={selectedOrderId} disabled={loading || saving} onChange={(event) => resetDraft(event.target.value)}>
                <option value="">Selecione o pedido</option>
                {orders.map((order) => <option key={order.id} value={order.id}>{order.data} às {order.hora} — {order.itens.length} item(ns)</option>)}
              </select>
            </label>
            {loading && <p className="cleaning-delivery-empty">Carregando pedidos...</p>}
            {!loading && orders.length === 0 && <p className="cleaning-delivery-empty">Não há pedido pendente de entrega.</p>}
          </section>}

          {selectedOrder && !separated && <section className="cleaning-delivery-section cleaning-delivery-current-step">
            <div className="cleaning-delivery-section-title"><span>2</span><div><h2>Separe o que acabou de chegar</h2><p>Deixe a nova mercadoria fora do estoque por enquanto.</p></div></div>
            <div className="cleaning-delivery-simple-instruction">
              <strong>Por que fazer isso?</strong>
              <p>Primeiro vamos contar somente o que já estava guardado. Depois o sistema soma o que chegou.</p>
            </div>

            {unmatchedItems.length > 0 && <div className="cleaning-delivery-mapping-alert">
              <strong>Confirme {unmatchedItems.length === 1 ? "este produto" : "estes produtos"} antes de continuar</strong>
              {unmatchedItems.map((item) => <label key={item.orderItemId}>{item.orderProductName}
                <select value={item.productSlug} disabled={saving} onChange={(event) => selectProduct(item.orderItemId, event.target.value)}>
                  <option value="">Selecione o produto do estoque</option>
                  {inventory.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.unit}</option>)}
                </select>
              </label>)}
            </div>}

            <button className="primary-button wide-button cleaning-delivery-start-button" type="button" disabled={saving || unmatchedItems.length > 0} onClick={startCount}>
              Já deixei separado. Começar contagem
            </button>
            <button className="ghost-button cleaning-delivery-change-order" type="button" disabled={saving} onClick={() => resetDraft()}>Escolher outro pedido</button>
          </section>}

          {selectedOrder && separated && !countLocked && <section className="cleaning-delivery-section cleaning-delivery-current-step">
            <div className="cleaning-delivery-section-title"><span>2</span><div><h2>Quanto havia antes da entrega?</h2><p>Conte somente os produtos que já estavam guardados.</p></div></div>
            <div className="cleaning-delivery-count-list">
              {items.map((item) => <article className="cleaning-delivery-count-card" key={item.orderItemId}>
                <div><h3>{item.productName}</h3><p>Pedido recebido: {formatQuantity(item.pendingQuantity)} {item.unit}</p></div>
                <label>Quantidade que já estava no estoque
                  <input type="number" inputMode="decimal" min="0" step="any" autoComplete="off" placeholder="Digite a quantidade" value={item.preStockQuantity} disabled={saving} onChange={(event) => updateItem(item.orderItemId, { preStockQuantity: event.target.value })} />
                </label>
              </article>)}
            </div>
            <button className="primary-button wide-button" type="button" disabled={saving} onClick={lockCount}>Continuar para conferir o que chegou</button>
            <button className="ghost-button cleaning-delivery-change-order" type="button" disabled={saving} onClick={() => setSeparated(false)}>Voltar</button>
          </section>}

          {selectedOrder && countLocked && <>
            <section className="cleaning-delivery-completed-step">
              <div><strong>Estoque antigo contado</strong><p>{items.length} produto(s) registrado(s) antes da entrega.</p></div>
              <button className="ghost-button" type="button" disabled={saving} onClick={() => setCountLocked(false)}>Corrigir</button>
            </section>

            <section className="cleaning-delivery-section cleaning-delivery-current-step">
              <div className="cleaning-delivery-section-title"><span>3</span><div><h2>Quanto chegou agora?</h2><p>Confira a mercadoria recebida e confirme a entrada.</p></div></div>
              <div className="cleaning-delivery-received-list">
                {items.map((item) => {
                  const pre = parseQuantity(item.preStockQuantity) ?? 0;
                  const received = parseQuantity(item.receivedQuantity) ?? 0;
                  const difference = received - item.pendingQuantity;
                  return <article className="cleaning-delivery-received-card" key={item.orderItemId}>
                    <div className="cleaning-delivery-received-head">
                      <div><h3>{item.productName}</h3><p>Esperado: {formatQuantity(item.pendingQuantity)} {item.unit}{item.previouslyReceived > 0 ? ` • Já recebido antes: ${formatQuantity(item.previouslyReceived)}` : ""}</p></div>
                      <span className={difference === 0 ? "delivery-ok" : "delivery-difference"}>{difference === 0 ? "Confere" : `Diferença ${difference > 0 ? "+" : ""}${formatQuantity(difference)}`}</span>
                    </div>
                    <label className="cleaning-delivery-main-input">Quantidade recebida agora
                      <input type="number" inputMode="decimal" min="0" step="any" value={item.receivedQuantity} disabled={saving} onChange={(event) => updateItem(item.orderItemId, { receivedQuantity: event.target.value })} />
                    </label>
                    <p className="cleaning-delivery-result">Estoque final: <strong>{formatQuantity(pre)} + {formatQuantity(received)} = {formatQuantity(pre + received)} {item.unit}</strong></p>
                    <details className="cleaning-delivery-details">
                      <summary>Observação ou corrigir produto</summary>
                      <label>Produto no estoque
                        <select value={item.productSlug} disabled={saving} onChange={(event) => selectProduct(item.orderItemId, event.target.value)}>
                          <option value="">Selecione o produto</option>
                          {inventory.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.unit}</option>)}
                        </select>
                      </label>
                      <label>Observação do item
                        <textarea rows={2} placeholder="Falta, sobra, avaria ou troca..." value={item.observation} disabled={saving} onChange={(event) => updateItem(item.orderItemId, { observation: event.target.value })} />
                      </label>
                    </details>
                  </article>;
                })}
              </div>

              <div className="cleaning-delivery-final-box">
                <label>Conferido por
                  <select value={receiverId} disabled={saving} onChange={(event) => setReceiverId(event.target.value)}>{receivers.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.name}</option>)}</select>
                </label>
                <details className="cleaning-delivery-details cleaning-delivery-general-note">
                  <summary>Adicionar observação geral</summary>
                  <label>Observação
                    <textarea rows={3} placeholder="Fornecedor, nota fiscal ou condição da entrega." value={notes} disabled={saving} onChange={(event) => setNotes(event.target.value)} />
                  </label>
                </details>
              </div>

              <button className="primary-button wide-button sticky-action" type="button" disabled={saving || !isCleaningDeliveryCloudEnabled()} onClick={() => void submit()}>
                <AppIcon name="save" size="sm" className="action-icon" />{saving ? "Atualizando estoque..." : "Confirmar entrada no estoque"}
              </button>
            </section>
          </>}

          <details className="cleaning-delivery-history-disclosure">
            <summary>Ver últimas entregas conferidas</summary>
            {recentDeliveries.length === 0 ? <p className="cleaning-delivery-empty">Nenhuma entrega registrada ainda.</p> : <div className="cleaning-delivery-history-list">{recentDeliveries.map((delivery) => <article className="cleaning-delivery-history-card" key={delivery.id}><div><small>{formatDateTime(delivery.receivedAt)}</small><h3>{delivery.receivedByName}</h3><p>{delivery.items.length} item(ns) conferido(s)</p></div><div className="delivery-history-quantities"><span>Entrada<strong>{formatQuantity(delivery.items.reduce((sum, item) => sum + item.receivedQuantity, 0))}</strong></span><span>Ajustes<strong>{delivery.items.filter((item) => item.adjustmentQuantity !== 0).length}</strong></span></div>{delivery.notes && <p className="delivery-history-notes">{delivery.notes}</p>}</article>)}</div>}
          </details>

          <button className="ghost-button cleaning-delivery-back" type="button" disabled={saving} onClick={() => setOpen(false)}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Limpeza</button>
        </section>
      </main>
    </div>,
    document.body,
  ) : null;

  return <>{card}{screen}</>;
}
