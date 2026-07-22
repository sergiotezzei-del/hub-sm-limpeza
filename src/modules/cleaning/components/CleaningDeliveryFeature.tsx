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

type DeliveryDraftItem = {
  key: string;
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

const receiverOptions = [
  { id: "tezzei", name: "Sergio Tezzei" },
  { id: "neia", name: "Néia" },
  { id: "selma", name: "Selma" },
  { id: "helena", name: "Helena" },
];

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDefaultReceiverId() {
  try {
    const rawSession = window.sessionStorage.getItem("hub-sm-active-session");
    if (!rawSession) return "tezzei";
    const currentUser = JSON.parse(rawSession)?.currentUser;
    return receiverOptions.some((option) => option.id === currentUser) ? currentUser : "tezzei";
  } catch {
    return "tezzei";
  }
}

function getReceivedByOrderItem(deliveries: CleaningDeliveryRecord[]) {
  const totals = new Map<string, number>();
  deliveries.forEach((delivery) => {
    delivery.items.forEach((item) => {
      totals.set(item.orderItemId, (totals.get(item.orderItemId) ?? 0) + item.receivedQuantity);
    });
  });
  return totals;
}

function buildDraftItems(
  order: CleaningOrder,
  inventory: InventoryProduct[],
  deliveries: CleaningDeliveryRecord[],
): DeliveryDraftItem[] {
  const inventoryByName = new Map(inventory.map((product) => [normalizeText(product.name), product]));
  const receivedByOrderItem = getReceivedByOrderItem(deliveries);

  return order.itens.map((item) => {
    const matchedProduct = inventoryByName.get(normalizeText(item.productName));
    const previouslyReceived = receivedByOrderItem.get(item.id) ?? 0;
    const pendingQuantity = Math.max(0, item.quantity - previouslyReceived);
    return {
      key: item.id,
      orderItemId: item.id,
      orderProductName: item.productName,
      productSlug: matchedProduct?.id ?? "",
      productName: matchedProduct?.name ?? item.productName,
      unit: matchedProduct?.unit ?? item.unit,
      orderedQuantity: item.quantity,
      previouslyReceived,
      pendingQuantity,
      preStockQuantity: "",
      receivedQuantity: pendingQuantity > 0 ? String(pendingQuantity) : "0",
      observation: item.observation ?? "",
    };
  });
}

function getFriendlyError(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível registrar a entrega.";
  if (error.message.includes("exige conexão")) return error.message;
  if (error.message.includes("duplicate") || error.message.includes("unique")) {
    return "Esta conferência já foi registrada. Atualize a tela antes de tentar novamente.";
  }
  if (error.message.includes("Produto") || error.message.includes("pedido") || error.message.includes("quantidade")) {
    return error.message.replace(/^.*?message\\?"?:\\?"?/, "").slice(0, 240);
  }
  return "Não foi possível registrar a entrega. Confira a conexão e os dados informados.";
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
  const [draftItems, setDraftItems] = useState<DeliveryDraftItem[]>([]);
  const [receiverId, setReceiverId] = useState(() => getDefaultReceiverId());
  const [notes, setNotes] = useState("");
  const [deliverySeparated, setDeliverySeparated] = useState(false);
  const [countLocked, setCountLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const recentDeliveries = useMemo(() => deliveries.slice(0, 10), [deliveries]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    function updateTarget() {
      const screens = Array.from(root.querySelectorAll<HTMLElement>(".screen"));
      const cleaningScreen = screens.find((screen) => (
        Array.from(screen.querySelectorAll("h1")).some((title) => title.textContent?.trim() === "Gestão de Limpeza")
      ));
      const nextTarget = cleaningScreen?.querySelector<HTMLElement>(".cleaning-dashboard-grid") ?? null;
      setDashboardTarget((current) => current === nextTarget ? current : nextTarget);
      if (!cleaningScreen) setOpen(false);
    }

    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshData();
  }, [open]);

  async function refreshData() {
    setLoading(true);
    setError("");
    try {
      const [loadedOrders, loadedInventory, loadedDeliveries] = await Promise.all([
        getOrders(),
        getInventoryProducts(),
        loadCleaningDeliveries(),
      ]);
      setOrders(loadedOrders.filter((order) => order.status === "Pedido feito" && !order.deletedAt));
      setInventory(loadedInventory);
      setDeliveries(loadedDeliveries);
    } catch (loadError) {
      setError(getFriendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setDeliverySeparated(false);
    setCountLocked(false);
    setNotice("");
    setError("");
    const order = orders.find((current) => current.id === orderId);
    setDraftItems(order ? buildDraftItems(order, inventory, deliveries) : []);
  }

  function updateDraftItem(key: string, patch: Partial<DeliveryDraftItem>) {
    setDraftItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function selectProduct(key: string, productSlug: string) {
    const product = inventory.find((current) => current.id === productSlug);
    updateDraftItem(key, {
      productSlug,
      productName: product?.name ?? "",
      unit: product?.unit ?? "Unidade",
    });
  }

  function validateProductMappings() {
    if (draftItems.some((item) => !item.productSlug)) {
      setError("Selecione o produto correto do estoque para todos os itens da entrega.");
      return false;
    }
    const slugs = draftItems.map((item) => item.productSlug);
    if (new Set(slugs).size !== slugs.length) {
      setError("O mesmo produto foi selecionado em mais de uma linha. Agrupe a quantidade em uma única linha antes de continuar.");
      return false;
    }
    return true;
  }

  function lockPreviousCount() {
    setError("");
    if (!deliverySeparated) {
      setError("Confirme primeiro que a mercadoria recebida foi separada e não entrou na contagem anterior.");
      return;
    }
    if (!validateProductMappings()) return;
    if (draftItems.some((item) => parseQuantity(item.preStockQuantity) === null)) {
      setError("Informe a contagem física anterior de todos os produtos.");
      return;
    }
    setCountLocked(true);
    setNotice("Contagem anterior registrada na tela. Agora confira somente o que chegou na entrega.");
  }

  function unlockPreviousCount() {
    setCountLocked(false);
    setNotice("Corrija a contagem anterior e conclua novamente antes de registrar a entrega.");
  }

  async function submitDelivery() {
    setError("");
    setNotice("");
    if (!selectedOrder) {
      setError("Selecione o pedido que chegou.");
      return;
    }
    if (!countLocked) {
      setError("Conclua a contagem do estoque anterior antes de dar entrada na entrega.");
      return;
    }
    if (!validateProductMappings()) return;

    const parsedItems = draftItems.map((item) => ({
      item,
      preStockQuantity: parseQuantity(item.preStockQuantity),
      receivedQuantity: parseQuantity(item.receivedQuantity),
    }));
    if (parsedItems.some((entry) => entry.preStockQuantity === null || entry.receivedQuantity === null)) {
      setError("Revise as quantidades da contagem anterior e da entrega recebida.");
      return;
    }
    if (!parsedItems.some((entry) => Number(entry.receivedQuantity) > 0)) {
      setError("Informe ao menos uma quantidade recebida maior que zero.");
      return;
    }

    const receiver = receiverOptions.find((option) => option.id === receiverId);
    if (!receiver) {
      setError("Informe quem recebeu e conferiu a mercadoria.");
      return;
    }

    const receivedTotal = parsedItems.reduce((total, entry) => total + Number(entry.receivedQuantity), 0);
    const hasDivergence = parsedItems.some((entry) => Number(entry.receivedQuantity) !== entry.item.pendingQuantity);
    const confirmationText = [
      `Registrar a entrega do pedido de ${selectedOrder.data} às ${selectedOrder.hora}?`,
      `Total recebido: ${formatQuantity(receivedTotal)} unidade(s) de controle.`,
      hasDivergence ? "Há diferença entre a quantidade pendente e a quantidade recebida." : "As quantidades recebidas conferem com o saldo pendente.",
      "O estoque será ajustado pela contagem física anterior e depois receberá a entrada da mercadoria.",
    ].join("\n\n");
    if (!window.confirm(confirmationText)) return;

    setSaving(true);
    try {
      await registerCleaningDelivery({
        id: createId(),
        orderId: selectedOrder.id,
        receivedById: receiver.id,
        receivedByName: receiver.name,
        notes,
        items: parsedItems.map(({ item, preStockQuantity, receivedQuantity }) => ({
          orderItemId: item.orderItemId,
          productSlug: item.productSlug,
          orderedQuantity: item.orderedQuantity,
          preStockQuantity: Number(preStockQuantity),
          receivedQuantity: Number(receivedQuantity),
          observation: item.observation,
        })),
      });
      const [nextInventory, nextDeliveries] = await Promise.all([
        getInventoryProducts(),
        loadCleaningDeliveries(),
      ]);
      setInventory(nextInventory);
      setDeliveries(nextDeliveries);
      setSelectedOrderId("");
      setDraftItems([]);
      setDeliverySeparated(false);
      setCountLocked(false);
      setNotes("");
      setNotice("Entrega conferida. A entrada foi registrada e o estoque foi atualizado.");
      window.dispatchEvent(new CustomEvent("hub-sm-cleaning-delivery-saved"));
    } catch (submitError) {
      setError(getFriendlyError(submitError));
    } finally {
      setSaving(false);
    }
  }

  const deliveryCard = dashboardTarget ? createPortal(
    <button
      className="admin-card module-card with-icon has-access action-card cleaning-control-card cleaning-delivery-card"
      type="button"
      onClick={() => setOpen(true)}
    >
      <span className="module-icon-circle" aria-hidden="true">
        <AppIcon name="stock" size="lg" className="module-icon" />
      </span>
      <span className="module-card-copy">
        <span className="module-card-title">Conferência de Entrega</span>
        <strong>Receber, conferir e dar entrada no estoque</strong>
      </span>
    </button>,
    dashboardTarget,
  ) : null;

  const deliveryScreen = open ? createPortal(
    <div className="cleaning-delivery-overlay" role="dialog" aria-modal="true" aria-label="Conferência de Entrega">
      <main className="cleaning-delivery-shell">
        <section className="screen cleaning-delivery-screen">
          <header className="cleaning-delivery-header">
            <div>
              <p className="eyebrow">Gestão de Limpeza</p>
              <h1>Conferência de Entrega</h1>
              <p>Receba o pedido, registre a contagem anterior e dê entrada correta no estoque.</p>
            </div>
            <button className="logout-button" type="button" disabled={saving} onClick={() => setOpen(false)}>Fechar</button>
          </header>

          <button className="ghost-button cleaning-delivery-back" type="button" disabled={saving} onClick={() => setOpen(false)}>
            <AppIcon name="back" size="sm" className="action-icon" />Voltar para Limpeza
          </button>

          {!isCleaningDeliveryCloudEnabled() && (
            <section className="cleaning-delivery-warning danger">
              <AppIcon name="warning" size="md" />
              <div><strong>Conexão online obrigatória</strong><p>A entrada de mercadoria não pode ser gravada offline, porque altera o estoque e precisa ser atômica.</p></div>
            </section>
          )}

          <section className="cleaning-delivery-warning">
            <AppIcon name="warning" size="md" />
            <div>
              <strong>Antes de lançar a entrega</strong>
              <p>Separe tudo o que acabou de chegar. Conte somente o estoque que já estava guardado, sem incluir a mercadoria recebida.</p>
            </div>
          </section>

          {error && <p className="error-message cleaning-delivery-message">{error}</p>}
          {notice && <p className="success-message cleaning-delivery-message">{notice}</p>}

          <section className="cleaning-delivery-section">
            <div className="cleaning-delivery-section-title"><span>1</span><div><h2>Selecione o pedido recebido</h2><p>Mostramos pedidos marcados como “Pedido feito”.</p></div></div>
            <label className="cleaning-delivery-field">
              Pedido
              <select value={selectedOrderId} disabled={loading || saving || countLocked} onChange={(event) => selectOrder(event.target.value)}>
                <option value="">Selecione o pedido que chegou</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>{order.data} às {order.hora} — {order.itens.length} item(ns)</option>
                ))}
              </select>
            </label>
            {!loading && orders.length === 0 && <p className="cleaning-delivery-empty">Nenhum pedido marcado como “Pedido feito” foi encontrado.</p>}
            {loading && <p className="cleaning-delivery-empty">Carregando pedidos e estoque...</p>}
          </section>

          {selectedOrder && (
            <>
              <section className="cleaning-delivery-section">
                <div className="cleaning-delivery-section-title"><span>2</span><div><h2>Conte o estoque anterior</h2><p>Esta quantidade será a base real antes da entrada.</p></div></div>
                <label className="cleaning-delivery-confirmation">
                  <input type="checkbox" checked={deliverySeparated} disabled={saving || countLocked} onChange={(event) => setDeliverySeparated(event.target.checked)} />
                  <span>Separei a mercadoria recebida e confirmei que ela não foi incluída na contagem do estoque anterior.</span>
                </label>

                <div className="cleaning-delivery-items">
                  {draftItems.map((item) => (
                    <article className="cleaning-delivery-item" key={item.key}>
                      <div className="cleaning-delivery-item-head">
                        <div><small>ITEM DO PEDIDO</small><h3>{item.orderProductName}</h3></div>
                        <span>Pedido: {formatQuantity(item.orderedQuantity)} {item.unit}</span>
                      </div>
                      <div className="cleaning-delivery-grid">
                        <label>Produto no estoque<select value={item.productSlug} disabled={saving || countLocked} onChange={(event) => selectProduct(item.key, event.target.value)}><option value="">Selecione o produto cadastrado</option>{inventory.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.unit}</option>)}</select></label>
                        <label>Já recebido anteriormente<input type="text" readOnly value={`${formatQuantity(item.previouslyReceived)} ${item.unit}`} /></label>
                        <label>Saldo pendente<input type="text" readOnly value={`${formatQuantity(item.pendingQuantity)} ${item.unit}`} /></label>
                        <label className="pre-stock-field">Estoque físico antes da entrega<input type="number" inputMode="decimal" min="0" step="any" placeholder="Conte sem incluir o que chegou" value={item.preStockQuantity} disabled={saving || countLocked || !deliverySeparated} onChange={(event) => updateDraftItem(item.key, { preStockQuantity: event.target.value })} /></label>
                      </div>
                    </article>
                  ))}
                </div>

                {!countLocked ? (
                  <button className="primary-button wide-button" type="button" disabled={saving || !deliverySeparated || draftItems.length === 0} onClick={lockPreviousCount}>Concluir contagem anterior</button>
                ) : (
                  <div className="cleaning-delivery-count-locked"><strong>Contagem anterior concluída.</strong><button className="ghost-button" type="button" disabled={saving} onClick={unlockPreviousCount}>Corrigir contagem</button></div>
                )}
              </section>

              <section className={`cleaning-delivery-section ${countLocked ? "" : "disabled-section"}`}>
                <div className="cleaning-delivery-section-title"><span>3</span><div><h2>Confira o que chegou</h2><p>Informe a quantidade efetivamente recebida, inclusive quando vier faltando ou sobrando.</p></div></div>
                <div className="cleaning-delivery-items">
                  {draftItems.map((item) => {
                    const preStock = parseQuantity(item.preStockQuantity) ?? 0;
                    const received = parseQuantity(item.receivedQuantity) ?? 0;
                    const difference = received - item.pendingQuantity;
                    return (
                      <article className="cleaning-delivery-item" key={`received-${item.key}`}>
                        <div className="cleaning-delivery-item-head"><div><small>CONFERÊNCIA DA ENTREGA</small><h3>{item.productName || item.orderProductName}</h3></div><span className={difference === 0 ? "delivery-ok" : "delivery-difference"}>{difference === 0 ? "Confere" : `Diferença: ${difference > 0 ? "+" : ""}${formatQuantity(difference)}`}</span></div>
                        <div className="cleaning-delivery-grid received-grid">
                          <label>Quantidade recebida<input type="number" inputMode="decimal" min="0" step="any" value={item.receivedQuantity} disabled={saving || !countLocked} onChange={(event) => updateDraftItem(item.key, { receivedQuantity: event.target.value })} /></label>
                          <label>Estoque após a entrada<input type="text" readOnly value={`${formatQuantity(preStock + received)} ${item.unit}`} /></label>
                          <label className="delivery-observation">Observação<textarea rows={2} placeholder="Falta, sobra, avaria, troca de produto..." value={item.observation} disabled={saving || !countLocked} onChange={(event) => updateDraftItem(item.key, { observation: event.target.value })} /></label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className={`cleaning-delivery-section ${countLocked ? "" : "disabled-section"}`}>
                <div className="cleaning-delivery-section-title"><span>4</span><div><h2>Confirme o recebimento</h2><p>O sistema registrará o ajuste da contagem física e depois a entrada da entrega.</p></div></div>
                <div className="cleaning-delivery-grid final-grid">
                  <label>Recebido e conferido por<select value={receiverId} disabled={saving || !countLocked} onChange={(event) => setReceiverId(event.target.value)}>{receiverOptions.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.name}</option>)}</select></label>
                  <label>Observação geral<textarea rows={3} placeholder="Nota fiscal, fornecedor, condição da entrega ou informação importante." value={notes} disabled={saving || !countLocked} onChange={(event) => setNotes(event.target.value)} /></label>
                </div>
                <button className="primary-button wide-button sticky-action" type="button" disabled={saving || !countLocked || !isCleaningDeliveryCloudEnabled()} onClick={() => { void submitDelivery(); }}>
                  <AppIcon name="save" size="sm" className="action-icon" />{saving ? "Registrando entrada..." : "Confirmar entrega e dar entrada no estoque"}
                </button>
              </section>
            </>
          )}

          <section className="cleaning-delivery-section delivery-history-section">
            <div className="cleaning-delivery-section-title"><span>H</span><div><h2>Últimas entregas conferidas</h2><p>Histórico para auditoria do recebimento e da entrada no estoque.</p></div></div>
            {recentDeliveries.length === 0 ? <p className="cleaning-delivery-empty">Nenhuma entrega registrada ainda.</p> : (
              <div className="cleaning-delivery-history-list">
                {recentDeliveries.map((delivery) => (
                  <article className="cleaning-delivery-history-card" key={delivery.id}>
                    <div><small>{formatDateTime(delivery.receivedAt)}</small><h3>{delivery.receivedByName}</h3><p>{delivery.items.length} item(ns) conferido(s)</p></div>
                    <div className="delivery-history-quantities"><span>Entrada<strong>{formatQuantity(delivery.items.reduce((total, item) => total + item.receivedQuantity, 0))}</strong></span><span>Ajustes<strong>{delivery.items.filter((item) => item.adjustmentQuantity !== 0).length}</strong></span></div>
                    {delivery.notes && <p className="delivery-history-notes">{delivery.notes}</p>}
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

  return <>{deliveryCard}{deliveryScreen}</>;
}
