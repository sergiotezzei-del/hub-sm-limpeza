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
  const match = error.message.match(/message[\\\"': ]+([^\"}]+)/i);
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
      setOrders(loadedOrders.filter((order) => order.status === "Pedido feito" && !order.deletedAt));
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
      setError("Selecione o produto correto do estoque para todos os itens.");
      return false;
    }
    const slugs = items.map((item) => item.productSlug);
    if (new Set(slugs).size !== slugs.length) {
      setError("O mesmo produto não pode aparecer em duas linhas da mesma entrega.");
      return false;
    }
    return true;
  }

  function lockCount() {
    setError("");
    if (!separated) return setError("Confirme que a mercadoria recebida foi separada da contagem anterior.");
    if (!validateMappings()) return;
    if (items.some((item) => parseQuantity(item.preStockQuantity) === null)) return setError("Informe a contagem física anterior de todos os produtos.");
    setCountLocked(true);
    setNotice("Contagem anterior concluída. Agora confira somente a mercadoria recebida.");
  }

  async function submit() {
    setError("");
    setNotice("");
    if (!selectedOrder || !countLocked || !validateMappings()) return setError("Conclua a seleção do pedido e a contagem anterior antes da entrada.");
    const parsed = items.map((item) => ({ item, pre: parseQuantity(item.preStockQuantity), received: parseQuantity(item.receivedQuantity) }));
    if (parsed.some(({ pre, received }) => pre === null || received === null)) return setError("Revise as quantidades informadas.");
    if (!parsed.some(({ received }) => Number(received) > 0)) return setError("Informe ao menos uma quantidade recebida maior que zero.");
    const receiver = receivers.find((entry) => entry.id === receiverId);
    if (!receiver) return setError("Informe quem recebeu a mercadoria.");

    const divergences = parsed.filter(({ item, received }) => Number(received) !== item.pendingQuantity).length;
    if (!window.confirm(`Confirmar a entrada deste pedido?\n\n${divergences ? `${divergences} item(ns) têm diferença entre o pendente e o recebido.\n\n` : ""}O estoque será corrigido pela contagem física anterior e depois receberá a entrada.`)) return;

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
      setNotice("Entrega conferida e entrada registrada no estoque.");
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setSaving(false);
    }
  }

  const card = dashboardTarget ? createPortal(
    <button className="admin-card module-card with-icon has-access action-card cleaning-control-card cleaning-delivery-card" type="button" onClick={() => setOpen(true)}>
      <span className="module-icon-circle" aria-hidden="true"><AppIcon name="stock" size="lg" className="module-icon" /></span>
      <span className="module-card-copy"><span className="module-card-title">Conferência de Entrega</span><strong>Receber, conferir e dar entrada no estoque</strong></span>
    </button>,
    dashboardTarget,
  ) : null;

  const screen = open ? createPortal(
    <div className="cleaning-delivery-overlay" role="dialog" aria-modal="true" aria-label="Conferência de Entrega">
      <main className="cleaning-delivery-shell">
        <section className="screen cleaning-delivery-screen">
          <header className="cleaning-delivery-header">
            <div><p className="eyebrow">Gestão de Limpeza</p><h1>Conferência de Entrega</h1><p>Receba o pedido, registre a contagem anterior e dê entrada correta no estoque.</p></div>
            <button className="logout-button" type="button" disabled={saving} onClick={() => setOpen(false)}>Fechar</button>
          </header>
          <button className="ghost-button cleaning-delivery-back" type="button" disabled={saving} onClick={() => setOpen(false)}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Limpeza</button>

          {!isCleaningDeliveryCloudEnabled() && <section className="cleaning-delivery-warning danger"><AppIcon name="warning" size="md" /><div><strong>Conexão online obrigatória</strong><p>A entrada altera o estoque e não pode ficar pendente offline.</p></div></section>}
          <section className="cleaning-delivery-warning"><AppIcon name="warning" size="md" /><div><strong>Antes de lançar a entrega</strong><p>Separe o que acabou de chegar. Conte somente o estoque que já estava guardado, sem incluir a nova mercadoria.</p></div></section>
          {error && <p className="error-message cleaning-delivery-message">{error}</p>}
          {notice && <p className="success-message cleaning-delivery-message">{notice}</p>}

          <section className="cleaning-delivery-section">
            <div className="cleaning-delivery-section-title"><span>1</span><div><h2>Selecione o pedido recebido</h2><p>Aparecem pedidos marcados como “Pedido feito”.</p></div></div>
            <label className="cleaning-delivery-field">Pedido<select value={selectedOrderId} disabled={loading || saving || countLocked} onChange={(event) => resetDraft(event.target.value)}><option value="">Selecione o pedido que chegou</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.data} às {order.hora} — {order.itens.length} item(ns)</option>)}</select></label>
            {loading && <p className="cleaning-delivery-empty">Carregando pedidos e estoque...</p>}
            {!loading && orders.length === 0 && <p className="cleaning-delivery-empty">Nenhum pedido marcado como “Pedido feito” foi encontrado.</p>}
          </section>

          {selectedOrder && <>
            <section className="cleaning-delivery-section">
              <div className="cleaning-delivery-section-title"><span>2</span><div><h2>Conte o estoque anterior</h2><p>Esta será a base real antes da entrada.</p></div></div>
              <label className="cleaning-delivery-confirmation"><input type="checkbox" checked={separated} disabled={saving || countLocked} onChange={(event) => setSeparated(event.target.checked)} /><span>Separei a mercadoria recebida e ela não foi incluída na contagem do estoque anterior.</span></label>
              <div className="cleaning-delivery-items">{items.map((item) => <article className="cleaning-delivery-item" key={item.orderItemId}>
                <div className="cleaning-delivery-item-head"><div><small>ITEM DO PEDIDO</small><h3>{item.orderProductName}</h3></div><span>Pedido: {formatQuantity(item.orderedQuantity)} {item.unit}</span></div>
                <div className="cleaning-delivery-grid">
                  <label>Produto no estoque<select value={item.productSlug} disabled={saving || countLocked} onChange={(event) => selectProduct(item.orderItemId, event.target.value)}><option value="">Selecione o produto</option>{inventory.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.unit}</option>)}</select></label>
                  <label>Já recebido<input readOnly value={`${formatQuantity(item.previouslyReceived)} ${item.unit}`} /></label>
                  <label>Saldo pendente<input readOnly value={`${formatQuantity(item.pendingQuantity)} ${item.unit}`} /></label>
                  <label>Estoque físico antes da entrega<input type="number" inputMode="decimal" min="0" step="any" placeholder="Sem incluir o que chegou" value={item.preStockQuantity} disabled={!separated || countLocked || saving} onChange={(event) => updateItem(item.orderItemId, { preStockQuantity: event.target.value })} /></label>
                </div>
              </article>)}</div>
              {!countLocked ? <button className="primary-button wide-button" type="button" disabled={!separated || saving} onClick={lockCount}>Concluir contagem anterior</button> : <div className="cleaning-delivery-count-locked"><strong>Contagem anterior concluída.</strong><button className="ghost-button" type="button" disabled={saving} onClick={() => setCountLocked(false)}>Corrigir contagem</button></div>}
            </section>

            <section className={`cleaning-delivery-section ${countLocked ? "" : "disabled-section"}`}>
              <div className="cleaning-delivery-section-title"><span>3</span><div><h2>Confira o que chegou</h2><p>Informe a quantidade efetivamente recebida.</p></div></div>
              <div className="cleaning-delivery-items">{items.map((item) => {
                const pre = parseQuantity(item.preStockQuantity) ?? 0;
                const received = parseQuantity(item.receivedQuantity) ?? 0;
                const difference = received - item.pendingQuantity;
                return <article className="cleaning-delivery-item" key={`delivery-${item.orderItemId}`}>
                  <div className="cleaning-delivery-item-head"><div><small>CONFERÊNCIA DA ENTREGA</small><h3>{item.productName}</h3></div><span className={difference === 0 ? "delivery-ok" : "delivery-difference"}>{difference === 0 ? "Confere" : `Diferença: ${difference > 0 ? "+" : ""}${formatQuantity(difference)}`}</span></div>
                  <div className="cleaning-delivery-grid received-grid"><label>Quantidade recebida<input type="number" inputMode="decimal" min="0" step="any" value={item.receivedQuantity} disabled={!countLocked || saving} onChange={(event) => updateItem(item.orderItemId, { receivedQuantity: event.target.value })} /></label><label>Estoque após entrada<input readOnly value={`${formatQuantity(pre + received)} ${item.unit}`} /></label><label className="delivery-observation">Observação<textarea rows={2} placeholder="Falta, sobra, avaria ou troca..." value={item.observation} disabled={!countLocked || saving} onChange={(event) => updateItem(item.orderItemId, { observation: event.target.value })} /></label></div>
                </article>;
              })}</div>
            </section>

            <section className={`cleaning-delivery-section ${countLocked ? "" : "disabled-section"}`}>
              <div className="cleaning-delivery-section-title"><span>4</span><div><h2>Confirme o recebimento</h2><p>O sistema registra o ajuste e depois a entrada.</p></div></div>
              <div className="cleaning-delivery-grid final-grid"><label>Recebido e conferido por<select value={receiverId} disabled={!countLocked || saving} onChange={(event) => setReceiverId(event.target.value)}>{receivers.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.name}</option>)}</select></label><label>Observação geral<textarea rows={3} placeholder="Fornecedor, nota fiscal ou condição da entrega." value={notes} disabled={!countLocked || saving} onChange={(event) => setNotes(event.target.value)} /></label></div>
              <button className="primary-button wide-button sticky-action" type="button" disabled={!countLocked || saving || !isCleaningDeliveryCloudEnabled()} onClick={() => void submit()}><AppIcon name="save" size="sm" className="action-icon" />{saving ? "Registrando entrada..." : "Confirmar entrega e dar entrada no estoque"}</button>
            </section>
          </>}

          <section className="cleaning-delivery-section delivery-history-section">
            <div className="cleaning-delivery-section-title"><span>H</span><div><h2>Últimas entregas conferidas</h2><p>Histórico do recebimento e da entrada.</p></div></div>
            {recentDeliveries.length === 0 ? <p className="cleaning-delivery-empty">Nenhuma entrega registrada ainda.</p> : <div className="cleaning-delivery-history-list">{recentDeliveries.map((delivery) => <article className="cleaning-delivery-history-card" key={delivery.id}><div><small>{formatDateTime(delivery.receivedAt)}</small><h3>{delivery.receivedByName}</h3><p>{delivery.items.length} item(ns) conferido(s)</p></div><div className="delivery-history-quantities"><span>Entrada<strong>{formatQuantity(delivery.items.reduce((sum, item) => sum + item.receivedQuantity, 0))}</strong></span><span>Ajustes<strong>{delivery.items.filter((item) => item.adjustmentQuantity !== 0).length}</strong></span></div>{delivery.notes && <p className="delivery-history-notes">{delivery.notes}</p>}</article>)}</div>}
          </section>
        </section>
      </main>
    </div>,
    document.body,
  ) : null;

  return <>{card}{screen}</>;
}
