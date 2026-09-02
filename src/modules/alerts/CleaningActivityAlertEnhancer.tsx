import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getOrders, getStockChecks, getStockMovements } from "../../storage";
import type { CleaningOrder, StockCheck, StockMovement } from "../../types";
import {
  loadCleaningDeliveries,
  loadCleaningDeliveryApprovals,
  type CleaningDeliveryApproval,
  type CleaningDeliveryRecord,
} from "../cleaning/services/deliveryService";
import "./cleaningActivityAlerts.css";
import { acknowledgeAttentionEvent, loadAttentionEvents, type AttentionEvent } from "./attentionEventService";

const SESSION_KEY = "hub-sm-active-session";
const SUPERVISOR_ID = "tezzei";
const REFRESH_MS = 15000;

type CleaningActivity =
  | { kind: "order"; id: string; timestamp: number; order: CleaningOrder }
  | { kind: "stock-check"; id: string; timestamp: number; check: StockCheck; eventId: string }
  | { kind: "delivery"; id: string; timestamp: number; delivery: CleaningDeliveryRecord }
  | { kind: "stock-exit"; id: string; timestamp: number; movement: StockMovement }
  | { kind: "divergence"; id: string; timestamp: number; approval: CleaningDeliveryApproval };

function readCurrentUser() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? String(JSON.parse(raw)?.currentUser ?? "") : "";
  } catch {
    return "";
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function isNeia(value: string) {
  const clean = normalize(value);
  return clean === "neia" || clean === "neia";
}

function todayBr() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseBrDateTime(dateText: string, timeText = "00:00") {
  const [day, month, year] = dateText.split("/").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  const value = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function isTodayIso(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) === todayBr();
}

function formatTime(timestamp: number) {
  if (!timestamp) return "Hoje";
  return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatQuantity(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function activityCopy(activity: CleaningActivity) {
  switch (activity.kind) {
    case "order":
      return {
        status: "PEDIDO",
        title: "Néia fez um pedido",
        description: `${activity.order.itens.length} produto(s) no pedido. Confira antes de enviar ao fornecedor.`,
        action: "CONFERIR PEDIDO",
      };
    case "stock-check":
      return {
        status: "CONFERÊNCIA",
        title: "Néia conferiu o estoque",
        description: `${activity.check.itens.length} produto(s) conferidos. Clique para ver a contagem.`,
        action: "VER CONFERÊNCIA",
      };
    case "delivery":
      return {
        status: activity.delivery.hasDivergence ? "RECEBIMENTO" : "ENTREGA",
        title: activity.delivery.hasDivergence ? "Néia recebeu pedido com divergência" : "Néia conferiu uma entrega",
        description: activity.delivery.hasDivergence
          ? `${activity.delivery.items.length} produto(s) recebidos com divergência já autorizada.`
          : `${activity.delivery.items.length} produto(s) recebidos e lançados no estoque.`,
        action: "VER RECEBIMENTO",
      };
    case "stock-exit":
      return {
        status: "SAÍDA",
        title: "Néia retirou produto do estoque",
        description: `${activity.movement.productName} · ${formatQuantity(activity.movement.quantity)} ${activity.movement.unit}.`,
        action: "VER SAÍDA",
      };
    case "divergence":
      return {
        status: "ATENÇÃO",
        title: "Néia encontrou divergência na entrega",
        description: `${activity.approval.items.length} produto(s) precisam da sua análise antes do recebimento.`,
        action: "ANALISAR DIVERGÊNCIA",
      };
  }
}

export function buildActivities(
  orders: CleaningOrder[],
  checks: StockCheck[],
  deliveries: CleaningDeliveryRecord[],
  movements: StockMovement[],
  approvals: CleaningDeliveryApproval[],
  events: AttentionEvent[],
): CleaningActivity[] {
  const today = todayBr();
  const activities: CleaningActivity[] = [];

  orders
    .filter((order) => order.solicitante === "Neia" && order.data === today && !order.deletedAt)
    .forEach((order) => activities.push({
      kind: "order",
      id: `order:${order.id}`,
      timestamp: parseBrDateTime(order.data, order.hora),
      order,
    }));

  const pendingChecks = new Map(events.filter((event) => event.sourceType === "stock_check").map((event) => [event.sourceId, event.id]));
  checks
    .filter((check) => isNeia(check.conferente) && check.data === today && pendingChecks.has(check.id))
    .forEach((check) => activities.push({
      kind: "stock-check",
      id: `stock-check:${check.id}`,
      timestamp: check.createdAt ? new Date(check.createdAt).getTime() : parseBrDateTime(check.data, check.hora),
      check,
      eventId: pendingChecks.get(check.id)!,
    }));

  deliveries
    .filter((delivery) => (delivery.receivedById === "neia" || isNeia(delivery.receivedByName)) && isTodayIso(delivery.receivedAt))
    .forEach((delivery) => activities.push({
      kind: "delivery",
      id: `delivery:${delivery.id}`,
      timestamp: new Date(delivery.receivedAt).getTime(),
      delivery,
    }));

  movements
    .filter((movement) => movement.movementType === "saida"
      && (movement.userId === "neia" || isNeia(movement.userName))
      && isTodayIso(movement.createdAt))
    .forEach((movement) => activities.push({
      kind: "stock-exit",
      id: `stock-exit:${movement.id}`,
      timestamp: new Date(movement.createdAt).getTime(),
      movement,
    }));

  approvals
    .filter((approval) => approval.status === "pending" && (approval.requestedById === "neia" || isNeia(approval.requestedByName)))
    .forEach((approval) => activities.push({
      kind: "divergence",
      id: `divergence:${approval.id}`,
      timestamp: new Date(approval.requestedAt).getTime(),
      approval,
    }));

  return activities
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 12);
}

export function CleaningActivityAlertEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [activities, setActivities] = useState<CleaningActivity[]>([]);
  const [selected, setSelected] = useState<CleaningActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState("");
  const [message, setMessage] = useState("");
  const acknowledgedIds = useRef(new Set<string>());
  const marking = useRef(false);

  useEffect(() => {
    const onAcknowledged = (event: Event) => {
      const detail = (event as CustomEvent<AttentionEvent>).detail;
      if (detail?.sourceType !== "stock_check") return;
      acknowledgedIds.current.add(detail.sourceId);
      setActivities((current) => current.filter((item) => item.kind !== "stock-check" || item.check.id !== detail.sourceId));
    };
    document.addEventListener("hub:attention-event-acknowledged", onAcknowledged);
    return () => document.removeEventListener("hub:attention-event-acknowledged", onAcknowledged);
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    const sync = () => {
      if (readCurrentUser() !== SUPERVISOR_ID) {
        setHost(null);
        return;
      }
      const next = root.querySelector<HTMLElement>(".hub-alert-panel .hub-alert-cards") ?? null;
      setHost((current) => current === next ? current : next);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host) {
      document.body.classList.remove("hub-cleaning-activity-alerts-enabled");
      return;
    }
    document.body.classList.add("hub-cleaning-activity-alerts-enabled");
    return () => document.body.classList.remove("hub-cleaning-activity-alerts-enabled");
  }, [host]);

  useEffect(() => {
    if (!host) {
      setActivities([]);
      return;
    }

    let active = true;
    let busy = false;

    const refresh = async () => {
      if (busy) return;
      busy = true;
      setLoading(true);
      try {
        const results = await Promise.allSettled([
          getOrders(),
          getStockChecks(),
          loadCleaningDeliveries(),
          getStockMovements(),
          loadCleaningDeliveryApprovals({ pendingSupervisorId: SUPERVISOR_ID }),
          loadAttentionEvents(),
        ]);
        if (!active) return;
        const orders = results[0].status === "fulfilled" ? results[0].value : [];
        const checks = results[1].status === "fulfilled" ? results[1].value : [];
        const deliveries = results[2].status === "fulfilled" ? results[2].value : [];
        const movements = results[3].status === "fulfilled" ? results[3].value : [];
        const approvals = results[4].status === "fulfilled" ? results[4].value : [];
        const eventsResult = results[5];
        const next = buildActivities(orders, checks, deliveries, movements, approvals, eventsResult.status === "fulfilled" ? eventsResult.value : []);
        setActivities((current) => [
          ...next,
          ...(eventsResult.status === "rejected" ? current.filter((item) => item.kind === "stock-check") : []),
        ].filter((item) => item.kind !== "stock-check" || !acknowledgedIds.current.has(item.check.id)));
      } finally {
        if (active) setLoading(false);
        busy = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [host]);

  const pendingDivergences = useMemo(
    () => activities.filter((activity) => activity.kind === "divergence").length,
    [activities],
  );

  useEffect(() => {
    const panel = host?.closest<HTMLElement>(".hub-alert-panel");
    if (!panel) return;
    panel.classList.toggle("has-cleaning-activity", activities.length > 0);
    return () => panel.classList.remove("has-cleaning-activity");
  }, [host, activities.length]);

  if (!host || (activities.length === 0 && !loading)) return null;

  function openActivity(activity: CleaningActivity) {
    if (activity.kind === "divergence") {
      const existingApprovalButton = document.querySelector<HTMLButtonElement>(".cleaning-delivery-supervisor-alert");
      if (existingApprovalButton) {
        existingApprovalButton.click();
        return;
      }
    }
    setSelected(activity);
  }

  async function markCheckDone(activity: Extract<CleaningActivity, { kind: "stock-check" }>) {
    if (marking.current) return;
    marking.current = true;
    setMarkingId(activity.id);
    setMessage("");
    try {
      await acknowledgeAttentionEvent(activity.eventId, "Tezzei");
      acknowledgedIds.current.add(activity.check.id);
      setActivities((current) => current.filter((item) => item.id !== activity.id));
      document.dispatchEvent(new CustomEvent("hub:attention-event-acknowledged", {
        detail: { id: activity.eventId, sourceType: "stock_check", sourceId: activity.check.id },
      }));
    } catch {
      setMessage("Não foi possível marcar como feito. Tente novamente.");
    } finally {
      marking.current = false;
      setMarkingId("");
    }
  }

  return createPortal(
    <>
      <div className="hub-cleaning-activity-heading">
        <div>
          <strong>ATIVIDADE DA NÉIA</strong>
          <span>{loading ? "Atualizando..." : `${activities.length} operação(ões) de hoje${pendingDivergences ? ` · ${pendingDivergences} divergência(s) pendente(s)` : ""}`}</span>
        </div>
      </div>

      {message && <p className="hub-cleaning-activity-error" role="alert">{message}</p>}

      {activities.map((activity) => {
        const copy = activityCopy(activity);
        return (
          <article className={`hub-alert-card hub-cleaning-activity-card ${activity.kind === "divergence" ? "is-divergence" : ""}`} key={activity.id}>
            <div className="hub-alert-card-status">
              <span>{copy.status}</span>
              <time>{activity.kind === "divergence" && !isTodayIso(activity.approval.requestedAt) ? "Pendente" : formatTime(activity.timestamp)}</time>
            </div>
            <h3>{copy.title}</h3>
            <p>{copy.description}</p>
            <small>Limpeza · Néia</small>
            <div className="hub-cleaning-activity-actions">
              <button className="hub-alert-done-button hub-cleaning-activity-button" type="button" onClick={() => openActivity(activity)}>
                {copy.action}
              </button>
              {activity.kind === "stock-check" && <button className="hub-alert-done-button hub-cleaning-activity-done" type="button" disabled={Boolean(markingId)} onClick={() => { void markCheckDone(activity); }}>
                {markingId === activity.id ? "Salvando..." : "FEITO"}
              </button>}
            </div>
          </article>
        );
      })}

      {selected && createPortal(
        <div className="hub-cleaning-activity-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="hub-cleaning-activity-modal" role="dialog" aria-modal="true" aria-label="Detalhe da operação da Néia">
            <header>
              <div>
                <small>ATIVIDADE DA LIMPEZA</small>
                <h2>{activityCopy(selected).title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Fechar">×</button>
            </header>
            <ActivityDetail activity={selected} />
            <button className="hub-cleaning-activity-close" type="button" onClick={() => setSelected(null)}>Fechar</button>
          </section>
        </div>,
        document.body,
      )}
    </>,
    host,
  );
}

function ActivityDetail({ activity }: { activity: CleaningActivity }) {
  if (activity.kind === "order") {
    return (
      <div className="hub-cleaning-activity-detail">
        <p><strong>Data:</strong> {activity.order.data} às {activity.order.hora}</p>
        <p><strong>Status:</strong> {activity.order.status}</p>
        <div className="hub-cleaning-activity-items">
          {activity.order.itens.map((item) => (
            <div key={item.id}><span>{item.productName}</span><strong>{formatQuantity(item.quantity)} {item.unit}</strong></div>
          ))}
        </div>
      </div>
    );
  }

  if (activity.kind === "stock-check") {
    return (
      <div className="hub-cleaning-activity-detail">
        <p><strong>Conferência:</strong> {activity.check.data} às {activity.check.hora}</p>
        <div className="hub-cleaning-activity-items">
          {activity.check.itens.map((item) => (
            <div key={item.id}><span>{item.productName}{item.observation ? <small>{item.observation}</small> : null}</span><strong>{formatQuantity(item.quantity)} {item.unit}</strong></div>
          ))}
        </div>
      </div>
    );
  }

  if (activity.kind === "delivery") {
    return (
      <div className="hub-cleaning-activity-detail">
        <p><strong>Recebimento:</strong> {new Date(activity.delivery.receivedAt).toLocaleString("pt-BR")}</p>
        <p><strong>Divergência:</strong> {activity.delivery.hasDivergence ? "Sim, autorizada" : "Não"}</p>
        <div className="hub-cleaning-activity-items">
          {activity.delivery.items.map((item) => (
            <div key={item.id}>
              <span>{item.productName}<small>Pedido: {formatQuantity(item.orderedQuantity)} {item.unit}</small></span>
              <strong>Recebido: {formatQuantity(item.receivedQuantity)} {item.unit}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activity.kind === "stock-exit") {
    return (
      <div className="hub-cleaning-activity-detail">
        <p><strong>Produto:</strong> {activity.movement.productName}</p>
        <p><strong>Quantidade:</strong> {formatQuantity(activity.movement.quantity)} {activity.movement.unit}</p>
        <p><strong>Horário:</strong> {new Date(activity.movement.createdAt).toLocaleString("pt-BR")}</p>
        {activity.movement.observation && <p><strong>Observação:</strong> {activity.movement.observation}</p>}
      </div>
    );
  }

  return (
    <div className="hub-cleaning-activity-detail">
      <p><strong>Solicitado:</strong> {new Date(activity.approval.requestedAt).toLocaleString("pt-BR")}</p>
      <p><strong>Status:</strong> Aguardando análise</p>
      <div className="hub-cleaning-activity-items">
        {activity.approval.items.map((item) => (
          <div key={`${activity.approval.id}:${item.orderItemId}`}>
            <span>{item.productName}<small>Esperado: {formatQuantity(item.expectedQuantity)} {item.unit}</small></span>
            <strong>Recebido: {formatQuantity(item.receivedQuantity)} {item.unit}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
