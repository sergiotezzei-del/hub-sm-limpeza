import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../components/AppIcon";
import { CaptureSchedulePicker } from "./CaptureSchedulePicker";
import { ExclusiveChoice } from "./ExclusiveChoice";
import {
  formatCaptureRange,
  formatDuration,
  formatMarketingDateTime,
  MARKETING_ASSIGNEES,
  MARKETING_CONTENT_OPTIONS,
  MARKETING_REVIEW_REASONS,
  MarketingCaptureSelection,
} from "./marketingConfig";
import {
  adminDeleteMarketingRequest,
  adminRestoreMarketingRequest,
  adminUpdateMarketingRequest,
  createMarketingRequest,
  decideMarketingQueueOverride,
  getMarketingDashboard,
  getMarketingErrorMessage,
  isMarketingError,
  markMarketingNotificationsRead,
  MarketingDashboard,
  MarketingDeletedRequest,
  MarketingManagerReview,
  MarketingManagerReviewReason,
  MarketingNotification,
  MarketingQueueOverrideRequest,
  MarketingRequest,
  MarketingRequestStatus,
  MarketingRole,
  openMarketingManagerReview,
  requestMarketingQueueOverride,
  resolveMarketingManagerReview,
  saveMarketingAccess,
  updateMarketingRequest,
} from "./marketingService";
import "./marketing.css";

const REFRESH_MS = 20000;

const statusOrder: MarketingRequestStatus[] = [
  "solicitado",
  "agendado",
  "aguardando_edicao",
  "em_edicao",
  "em_aprovacao",
  "revisao",
  "bloqueado",
];

const statusLabels: Record<MarketingRequestStatus, string> = {
  solicitado: "Solicitado",
  agendado: "Agendado",
  aguardando_edicao: "Fila de edição",
  em_edicao: "Em edição",
  em_aprovacao: "Em aprovação",
  revisao: "Revisão",
  pronto: "Pronto",
  bloqueado: "Bloqueado",
  cancelado: "Cancelado",
};

const contentLabels: Record<string, string> = Object.fromEntries(
  MARKETING_CONTENT_OPTIONS.map((option) => [option.value, option.label]),
);

type MarketingTab = "central" | "agenda" | "request" | "mine" | "reviews" | "updates" | "access" | "deleted";

type RequestFormState = {
  teamId: string;
  brokerName: string;
  hasPropertyCode: boolean;
  propertyReference: string;
  isExclusive: boolean | null;
  requestKind: "capture_edit" | "edit_only";
  contentTypes: string[];
  captureLocation: string;
  capturePreference: "choose" | "marketing";
  preferredCaptureAt: string;
  preferredCaptureDurationMinutes: number | null;
  assetLink: string;
  paidTraffic: boolean;
  requesterNotes: string;
  urgencyRequested: boolean;
  urgencyReason: string;
};

export type MarketingSummary = {
  newCount: number;
  urgencyCount: number;
  unreadCount: number;
  queueOverrideCount: number;
  managerReviewCount: number;
};

type MarketingFeatureProps = {
  active: boolean;
  currentUserId: string;
  sessionToken: string | null;
  onBack: () => void;
  onOpen: () => void;
  onSessionInvalid: () => void;
  onSummaryChange: (summary: MarketingSummary) => void;
};

const emptyRequestForm = (): RequestFormState => ({
  teamId: "",
  brokerName: "",
  hasPropertyCode: true,
  propertyReference: "",
  isExclusive: null,
  requestKind: "capture_edit",
  contentTypes: ["video"],
  captureLocation: "",
  capturePreference: "marketing",
  preferredCaptureAt: "",
  preferredCaptureDurationMinutes: null,
  assetLink: "",
  paidTraffic: false,
  requesterNotes: "",
  urgencyRequested: false,
  urgencyReason: "",
});

export function MarketingFeature(props: MarketingFeatureProps) {
  const [alertHost, setAlertHost] = useState<HTMLElement | null>(null);
  const [dashboard, setDashboard] = useState<MarketingDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<MarketingTab>("central");
  const [selected, setSelected] = useState<MarketingRequest | null>(null);

  useEffect(() => {
    const sync = () => {
      setAlertHost(document.querySelector<HTMLElement>(".hub-alert-panel .hub-alert-cards"));
    };
    sync();
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const sessionToken = props.sessionToken;
    if (!sessionToken) {
      setDashboard(null);
      setError(props.active ? "Sua sessão do Marketing não está disponível. Entre novamente no HUB." : "");
      return;
    }
    let active = true;
    let busy = false;
    const refresh = async (showLoader = false) => {
      if (busy) return;
      busy = true;
      if (showLoader) setLoading(true);
      try {
        const next = await getMarketingDashboard(sessionToken);
        if (!active) return;
        if (next.context.userId !== props.currentUserId) {
          props.onSessionInvalid();
          throw new Error("MARKETING_SESSION_MISMATCH");
        }
        setDashboard(next);
        setError("");
      } catch (refreshError) {
        if (!active) return;
        setDashboard(null);
        setError(getMarketingErrorMessage(refreshError));
      } finally {
        busy = false;
        if (active && showLoader) setLoading(false);
      }
    };
    void refresh(false);
    const interval = window.setInterval(() => { void refresh(false); }, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [props.currentUserId, props.onSessionInvalid, props.sessionToken]);

  useEffect(() => {
    if (!props.active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [props.active]);

  useEffect(() => {
    if (!props.active || !dashboard) return;
    setNotice("");
    setError("");
    setTab(defaultTab(dashboard.context.role));
  }, [dashboard?.context.role, props.active]);

  const openRequests = useMemo(
    () => dashboard?.requests.filter((request) => !["pronto", "cancelado"].includes(request.status)) ?? [],
    [dashboard?.requests],
  );
  const tracksOperations = dashboard?.context.role !== "sales_manager";
  const newCount = tracksOperations ? openRequests.filter((request) => request.status === "solicitado").length : 0;
  const urgencyCount = tracksOperations ? openRequests.filter((request) => request.urgencyRequested && !request.urgencyDecidedAt).length : 0;
  const unreadCount = dashboard?.notifications.filter((notification) => !notification.readAt).length ?? 0;
  const queueOverrideCount = dashboard?.context.role === "admin"
    ? dashboard.queueOverrideRequests.filter((request) => request.status === "pending").length
    : 0;
  const managerReviewCount = dashboard?.context.role === "sales_manager"
    ? dashboard.managerReviews.filter((review) => review.status === "pending").length
    : 0;

  useEffect(() => {
    props.onSummaryChange({ newCount, urgencyCount, unreadCount, queueOverrideCount, managerReviewCount });
  }, [managerReviewCount, newCount, props.onSummaryChange, queueOverrideCount, unreadCount, urgencyCount]);

  async function refreshDashboard() {
    if (!props.sessionToken) return;
    setLoading(true);
    try {
      const next = await getMarketingDashboard(props.sessionToken);
      if (next.context.userId !== props.currentUserId) {
        props.onSessionInvalid();
        throw new Error("MARKETING_SESSION_MISMATCH");
      }
      setDashboard(next);
      if (selected) setSelected(next.requests.find((request) => request.id === selected.id) ?? null);
      setError("");
    } catch (refreshError) {
      setError(getMarketingErrorMessage(refreshError));
    } finally {
      setLoading(false);
    }
  }

  const adminAlerts = dashboard?.context.role === "admin" && alertHost
    ? dashboard.requests.filter((request) => request.status === "solicitado" || (request.urgencyRequested && !request.urgencyDecidedAt)).slice(0, 8)
    : [];
  const queueOverrideAlerts = dashboard?.context.role === "admin" && alertHost
    ? dashboard.queueOverrideRequests.filter((request) => request.status === "pending").slice(0, 8)
    : [];

  return (
    <>
      {alertHost && adminAlerts.map((request) => createPortal(
        <article className={`hub-alert-card marketing-day-alert ${request.urgencyRequested && !request.urgencyDecidedAt ? "is-urgent" : ""}`} key={`marketing-alert-${request.id}`} data-marketing-request-id={request.id}>
          <div className="hub-alert-card-status"><span>{request.urgencyRequested && !request.urgencyDecidedAt ? "URGÊNCIA" : "MARKETING"}</span><time>{formatTime(request.createdAt)}</time></div>
          <h3>{request.urgencyRequested && !request.urgencyDecidedAt ? "Pedido de urgência" : "Novo pedido de Marketing"}</h3>
          <p>{request.managerName} · {request.brokerName} · {request.propertyReference}</p>
          <small>{contentSummary(request)} · {statusLabels[request.status]}</small>
          <button className="hub-alert-done-button marketing-alert-open" type="button" onClick={() => { setSelected(request); setTab("central"); props.onOpen(); }}>VER PEDIDO</button>
        </article>,
        alertHost,
      ))}
      {alertHost && queueOverrideAlerts.map((override) => createPortal(
        <article className="hub-alert-card marketing-day-alert is-urgent" key={`marketing-queue-alert-${override.id}`} data-marketing-override-id={override.id}>
          <div className="hub-alert-card-status"><span>ALTERAÇÃO DE FILA</span><time>{formatTime(override.createdAt)}</time></div>
          <h3>Alteração de fila do Marketing</h3>
          <p>Pedido #{override.requestNumber} · {override.brokerName}</p>
          <small>Existe pedido anterior aguardando atendimento.</small>
          <button className="hub-alert-done-button marketing-alert-open" type="button" onClick={() => { setTab("central"); props.onOpen(); }}>ANALISAR</button>
        </article>,
        alertHost,
      ))}
      {props.active && dashboard && props.sessionToken && (
        <MarketingScreen
          sessionToken={props.sessionToken}
          dashboard={dashboard}
          loading={loading}
          error={error}
          notice={notice}
          tab={tab}
          selected={selected}
          onTab={setTab}
          onSelect={setSelected}
          onBack={() => { setSelected(null); props.onBack(); }}
          onRefresh={refreshDashboard}
          onError={setError}
          onNotice={setNotice}
        />
      )}
      {props.active && (!dashboard || !props.sessionToken) && <MarketingUnavailableScreen loading={loading} error={error} onBack={props.onBack} />}
    </>
  );
}

function MarketingUnavailableScreen({ loading, error, onBack }: { loading: boolean; error: string; onBack: () => void }) {
  return (
    <section className="marketing-screen">
      <header className="marketing-topbar">
        <button type="button" className="marketing-back" onClick={onBack}><AppIcon name="back" size="sm" /> Voltar ao HUB</button>
        <div><small>SANTA MARIA · OPERAÇÃO</small><h1>Marketing</h1><p>{loading ? "Carregando acesso..." : "Acesso indisponível"}</p></div>
      </header>
      <main className="marketing-content"><div className="marketing-message error">{error || "Não foi possível carregar o Marketing."}</div></main>
    </section>
  );
}

function MarketingScreen(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  loading: boolean;
  error: string;
  notice: string;
  tab: MarketingTab;
  selected: MarketingRequest | null;
  onTab: (tab: MarketingTab) => void;
  onSelect: (request: MarketingRequest | null) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const role = props.dashboard.context.role;
  const tabs = availableTabs(role);
  return (
    <section className="marketing-screen">
      <header className="marketing-topbar">
        <button type="button" className="marketing-back" onClick={props.onBack}><AppIcon name="back" size="sm" /> Voltar ao HUB</button>
        <div>
          <small>SANTA MARIA · OPERAÇÃO</small>
          <h1>Marketing</h1>
          <p>{roleLabel(role)} · {props.dashboard.context.teamName || props.dashboard.context.userName}</p>
        </div>
        <button type="button" className="marketing-refresh" onClick={() => void props.onRefresh()} disabled={props.loading}>{props.loading ? "Atualizando..." : "Atualizar"}</button>
      </header>

      <nav className="marketing-tabs" aria-label="Áreas do Marketing">
        {tabs.map((item) => {
          const unread = item.id === "updates" ? props.dashboard.notifications.filter((notification) => !notification.readAt).length : 0;
          const pendingReviews = item.id === "reviews" ? props.dashboard.managerReviews.filter((review) => review.status === "pending").length : 0;
          const badge = unread || pendingReviews;
          return <button type="button" key={item.id} className={props.tab === item.id ? "active" : ""} onClick={() => props.onTab(item.id)}>{item.label}{badge > 0 && <span className="marketing-tab-badge">{badge}</span>}</button>;
        })}
      </nav>

      {props.error && <div className="marketing-message error">{props.error}</div>}
      {props.notice && <div className="marketing-message success">{props.notice}</div>}

      <main className="marketing-content">
        {props.tab === "central" && (
          <CentralView
            sessionToken={props.sessionToken}
            dashboard={props.dashboard}
            onSelect={props.onSelect}
            onRefresh={props.onRefresh}
            onError={props.onError}
            onNotice={props.onNotice}
          />
        )}
        {props.tab === "agenda" && <AgendaView dashboard={props.dashboard} onSelect={props.onSelect} />}
        {props.tab === "request" && (
          <RequestView
            sessionToken={props.sessionToken}
            dashboard={props.dashboard}
            onSaved={async (message) => { props.onNotice(message); await props.onRefresh(); props.onTab(role === "sales_manager" ? "mine" : "central"); }}
            onError={props.onError}
          />
        )}
        {props.tab === "mine" && <MyTeamView dashboard={props.dashboard} onSelect={props.onSelect} />}
        {props.tab === "reviews" && (
          <ManagerReviewsView
            sessionToken={props.sessionToken}
            dashboard={props.dashboard}
            onRefresh={props.onRefresh}
            onError={props.onError}
            onNotice={props.onNotice}
          />
        )}
        {props.tab === "updates" && (
          <UpdatesView
            sessionToken={props.sessionToken}
            dashboard={props.dashboard}
            onSelect={props.onSelect}
            onRefresh={props.onRefresh}
            onError={props.onError}
          />
        )}
        {props.tab === "access" && (
          <AccessView sessionToken={props.sessionToken} dashboard={props.dashboard} onSaved={props.onRefresh} onError={props.onError} onNotice={props.onNotice} />
        )}
        {props.tab === "deleted" && role === "admin" && (
          <DeletedRequestsView
            sessionToken={props.sessionToken}
            dashboard={props.dashboard}
            onRefresh={props.onRefresh}
            onError={props.onError}
            onNotice={props.onNotice}
          />
        )}
      </main>

      {props.selected && (
        <RequestDetail
          key={props.selected.id}
          sessionToken={props.sessionToken}
          dashboard={props.dashboard}
          request={props.selected}
          role={role}
          onSelect={props.onSelect}
          onClose={() => props.onSelect(null)}
          onChanged={async () => { await props.onRefresh(); }}
          onError={props.onError}
          onNotice={props.onNotice}
        />
      )}
    </section>
  );
}

function CentralView(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  onSelect: (request: MarketingRequest) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { dashboard, onSelect } = props;
  const active = dashboard.requests.filter((request) => !["pronto", "cancelado"].includes(request.status));
  const ready = dashboard.requests.filter((request) => request.status === "pronto").slice(-12).reverse();
  const metrics = {
    new: active.filter((request) => request.status === "solicitado").length,
    production: active.filter((request) => ["aguardando_edicao", "em_edicao", "em_aprovacao", "revisao"].includes(request.status)).length,
    blocked: active.filter((request) => request.status === "bloqueado").length,
    urgency: active.filter((request) => request.urgencyRequested && !request.urgencyDecidedAt).length,
  };
  return (
    <>
      {dashboard.queueOverrideRequests.length > 0 && (
        <QueueOverridePanel
          sessionToken={props.sessionToken}
          role={dashboard.context.role}
          requests={dashboard.queueOverrideRequests}
          onRefresh={props.onRefresh}
          onError={props.onError}
          onNotice={props.onNotice}
        />
      )}
      <section className="marketing-metrics">
        <Metric label="Novos pedidos" value={metrics.new} />
        <Metric label="Em produção" value={metrics.production} />
        <Metric label="Bloqueados" value={metrics.blocked} />
        <Metric label="Urgências para decidir" value={metrics.urgency} danger={metrics.urgency > 0} />
      </section>
      <section className="marketing-section-head"><div><h2>Fila de produção</h2><p>Ordem de entrada. A urgência só altera a posição após análise interna.</p></div></section>
      <section className="marketing-kanban">
        {statusOrder.map((status) => {
          const requests = active.filter((request) => request.status === status);
          return (
            <div className="marketing-column" key={status}>
              <header><strong>{statusLabels[status]}</strong><span>{requests.length}</span></header>
              <div className="marketing-column-body">
                {requests.length === 0 && <p className="marketing-empty-small">Sem pedidos.</p>}
                {requests.map((request) => <RequestCard key={request.id} request={request} onClick={() => onSelect(request)} />)}
              </div>
            </div>
          );
        })}
      </section>
      {ready.length > 0 && (
        <section className="marketing-ready-list">
          <h2>Prontos recentes</h2>
          <div>{ready.map((request) => <RequestCard key={request.id} request={request} onClick={() => onSelect(request)} />)}</div>
        </section>
      )}
    </>
  );
}

function QueueOverridePanel(props: {
  sessionToken: string;
  role: MarketingRole;
  requests: MarketingQueueOverrideRequest[];
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const visible = props.role === "admin"
    ? props.requests.filter((request) => request.status === "pending")
    : props.requests.slice(0, 6);
  if (visible.length === 0) return null;

  async function decide(request: MarketingQueueOverrideRequest, decision: "approved" | "rejected") {
    setBusyId(request.id);
    props.onError("");
    try {
      await decideMarketingQueueOverride(props.sessionToken, request.id, decision);
      props.onNotice(decision === "approved" ? "Alteração de fila autorizada para um único avanço." : "A ordem original da fila foi mantida.");
      await props.onRefresh();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="marketing-override-panel">
      <div className="marketing-section-head"><div><h2>Alterações de fila</h2><p>Autorizações são específicas por pedido e consumidas no primeiro avanço.</p></div></div>
      <div className="marketing-override-list">
        {visible.map((request) => (
          <article key={request.id} className={request.status === "pending" ? "pending" : request.status}>
            <header><strong>Pedido #{request.requestNumber} · {request.brokerName}</strong><span>{overrideStatusLabel(request.status, request.consumedAt)}</span></header>
            <p>Existe pedido anterior aguardando atendimento{request.blockingRequestNumber ? ` (#${request.blockingRequestNumber})` : ""}.</p>
            <blockquote>{request.reason}</blockquote>
            <small>Solicitado por {request.requestedByName} · {formatDateTime(request.createdAt)}</small>
            {props.role === "admin" && request.status === "pending" && (
              <div>
                <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "approved")}>APROVAR</button>
                <button type="button" className="secondary" disabled={busyId === request.id} onClick={() => void decide(request, "rejected")}>MANTER ORDEM</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function AgendaView({ dashboard, onSelect }: { dashboard: MarketingDashboard; onSelect: (request: MarketingRequest) => void }) {
  const scheduled = dashboard.requests
    .filter((request) => request.requestKind === "capture_edit" && request.status !== "cancelado" && (request.confirmedCaptureAt || request.preferredCaptureAt))
    .sort((a, b) => new Date(a.confirmedCaptureAt || a.preferredCaptureAt || 0).getTime() - new Date(b.confirmedCaptureAt || b.preferredCaptureAt || 0).getTime())
    .filter((request, index, requests) => !request.captureGroupId
      || requests.findIndex((candidate) => candidate.captureGroupId === request.captureGroupId) === index);
  return (
    <section className="marketing-agenda-view">
      <div className="marketing-section-head"><div><h2>Agenda de captação</h2><p>Data solicitada pelo gerente e confirmação do Marketing ficam separadas.</p></div></div>
      {scheduled.length === 0 ? <div className="marketing-empty"><h3>Nenhuma captação agendada.</h3><p>Os novos pedidos aparecem aqui assim que tiverem data.</p></div> : (
        <div className="marketing-agenda-list">
          {scheduled.map((request) => {
            const groupMembers = request.captureGroupId
              ? dashboard.requests.filter((candidate) => candidate.captureGroupId === request.captureGroupId)
              : [request];
            const date = request.confirmedCaptureAt || request.preferredCaptureAt!;
            const duration = request.confirmedCaptureAt
              ? request.confirmedCaptureDurationMinutes
              : request.preferredCaptureDurationMinutes;
            return (
              <button type="button" key={request.id} className="marketing-agenda-row" onClick={() => onSelect(request)}>
                <time>{duration ? formatCaptureRange(date, duration, dashboard.scheduleConfig.timezone) : formatMarketingDateTime(date, dashboard.scheduleConfig.timezone)}</time>
                <div>
                  <strong>{request.brokerName} · {propertyLabel(request)}</strong>
                  <span>{request.managerName} · {request.captureLocation || "Local não informado"}</span>
                  <small>{request.assignedMarketingName || "Responsável não definido"} · {formatDuration(duration)}</small>
                  {groupMembers.length > 1 && <small className="marketing-group-summary">Saída agrupada · {groupMembers.length} imóveis · {groupMembers.map((member) => `#${member.requestNumber}`).join(", ")}</small>}
                </div>
                <em className={request.confirmedCaptureAt ? "confirmed" : "pending"}>{request.confirmedCaptureAt ? "CAPTAÇÃO CONFIRMADA" : "SOLICITAÇÃO DE DATA"}</em>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MyTeamView({ dashboard, onSelect }: { dashboard: MarketingDashboard; onSelect: (request: MarketingRequest) => void }) {
  const requests = [...dashboard.requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <section>
      <div className="marketing-section-head"><div><h2>Pedidos da minha equipe</h2><p>Acompanhe a posição e o andamento sem precisar cobrar o Marketing.</p></div></div>
      {requests.length === 0 ? <div className="marketing-empty"><h3>Nenhum pedido ainda.</h3><p>Use “Novo pedido” para enviar a primeira solicitação.</p></div> : (
        <div className="marketing-team-list">{requests.map((request) => <RequestCard key={request.id} request={request} onClick={() => onSelect(request)} showCaptureStatus timezone={dashboard.scheduleConfig.timezone} />)}</div>
      )}
    </section>
  );
}

function UpdatesView(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  onSelect: (request: MarketingRequest) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const notifications = [...props.dashboard.notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function openNotification(notification: MarketingNotification) {
    setBusyId(notification.id);
    props.onError("");
    try {
      if (!notification.readAt) {
        await markMarketingNotificationsRead(props.sessionToken, [notification.id]);
        await props.onRefresh();
      }
      const request = props.dashboard.requests.find((item) => item.id === notification.requestId);
      if (request) props.onSelect(request);
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="marketing-updates-view">
      <div className="marketing-section-head"><div><h2>Atualizações</h2><p>Mudanças importantes dos pedidos da sua equipe.</p></div></div>
      {notifications.length === 0 ? (
        <div className="marketing-empty"><h3>Nenhuma atualização.</h3><p>Confirmações e mudanças do Marketing aparecerão aqui.</p></div>
      ) : (
        <div className="marketing-notification-list">
          {notifications.map((notification) => (
            <article key={notification.id} className={!notification.readAt ? "unread" : ""}>
              <header><span>Marketing</span><time>{formatDateTime(notification.createdAt)}</time></header>
              <strong>Pedido #{notification.requestNumber} · {notification.brokerName}</strong>
              <h3>{notification.title}</h3>
              <p>{notification.message}</p>
              <button type="button" disabled={busyId === notification.id} onClick={() => void openNotification(notification)}>VER PEDIDO</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ManagerReviewsView(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [selected, setSelected] = useState<MarketingManagerReview | null>(null);
  const pending = props.dashboard.managerReviews.filter((review) => review.status === "pending");
  const answered = props.dashboard.managerReviews.filter((review) => review.status !== "pending").slice(0, 12);

  return (
    <section className="marketing-reviews-view">
      <div className="marketing-section-head"><div><h2>Para conferir</h2><p>Somente pedidos em que o Marketing encontrou uma divergência aparecem aqui.</p></div></div>
      {pending.length === 0 ? (
        <div className="marketing-empty"><h3>Nenhuma pendência.</h3><p>Os pedidos da equipe continuam entrando diretamente na fila do Marketing.</p></div>
      ) : (
        <div className="marketing-review-list">
          {pending.map((review) => {
            const request = props.dashboard.requests.find((item) => item.id === review.requestId);
            return <article key={review.id} className="pending">
              <header><strong>PEDIDO #{review.requestNumber}</strong><span>AGUARDANDO CONFERÊNCIA</span></header>
              <h3>Marketing pediu sua conferência</h3>
              <p><strong>Corretor:</strong> {review.brokerName}</p>
              <p><strong>Exclusividade:</strong> {exclusiveLabel(request?.isExclusive ?? null)}</p>
              <p><strong>Motivo:</strong> {review.details}</p>
              <button type="button" onClick={() => setSelected(review)}>ANALISAR</button>
            </article>;
          })}
        </div>
      )}
      {answered.length > 0 && <div className="marketing-review-history"><h3>Respondidas recentemente</h3>{answered.map((review) => <article key={review.id}><strong>Pedido #{review.requestNumber} · {review.brokerName}</strong><span>{managerReviewStatusLabel(review.status)}</span><small>{formatDateTime(review.updatedAt)}</small></article>)}</div>}
      {selected && (
        <ManagerReviewModal
          key={selected.id}
          sessionToken={props.sessionToken}
          dashboard={props.dashboard}
          review={selected}
          onClose={() => setSelected(null)}
          onError={props.onError}
          onResolved={async (message) => {
            props.onNotice(message);
            setSelected(null);
            await props.onRefresh();
          }}
        />
      )}
    </section>
  );
}

function ManagerReviewModal(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  review: MarketingManagerReview;
  onClose: () => void;
  onError: (message: string) => void;
  onResolved: (message: string) => Promise<void>;
}) {
  const request = props.dashboard.requests.find((item) => item.id === props.review.requestId);
  const [mode, setMode] = useState<"choice" | "modified" | "declined">("choice");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [form, setForm] = useState<RequestFormState>(() => request ? requestToForm(request) : emptyRequestForm());

  if (!request) return null;

  async function resolve(decision: "confirmed" | "modified" | "declined", corrections: Record<string, unknown> = {}) {
    if (decision === "declined" && response.trim().length < 3) {
      props.onError("Informe o motivo para declinar o pedido.");
      return;
    }
    setBusy(true);
    props.onError("");
    try {
      await resolveMarketingManagerReview(props.sessionToken, props.review.id, decision, response, corrections);
      await props.onResolved(
        decision === "confirmed"
          ? "Pedido confirmado e devolvido ao Marketing."
          : decision === "modified"
            ? "Correções salvas e devolvidas ao Marketing."
            : "Pedido declinado e cancelado sem excluir o histórico.",
      );
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleContent(value: string) {
    setForm((current) => ({ ...current, contentTypes: current.contentTypes.includes(value) ? current.contentTypes.filter((item) => item !== value) : [...current.contentTypes, value] }));
  }

  function submitCorrection(event: FormEvent) {
    event.preventDefault();
    const corrections = buildManagerReviewCorrections(request!, form);
    void resolve("modified", corrections);
  }

  return createPortal(
    <div className="marketing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="marketing-request-modal marketing-review-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-review-title">
        <header><div><small>PARA CONFERIR · PEDIDO #{props.review.requestNumber}</small><h2 id="marketing-review-title">{request.brokerName}</h2><p>{request.managerName} · {propertyLabel(request)}</p></div><button type="button" onClick={props.onClose}>×</button></header>
        <div className="marketing-review-reason"><span>{reviewReasonLabel(props.review.reason)}</span><p>{props.review.details}</p><small>Solicitado por {props.review.openedByName} · {formatDateTime(props.review.createdAt)}</small></div>

        {mode === "choice" && <>
          <label className="marketing-review-response">Observação opcional<textarea value={response} onChange={(event) => setResponse(event.target.value)} maxLength={2000} /></label>
          <div className="marketing-review-actions">
            <button type="button" disabled={busy} onClick={() => void resolve("confirmed")}>ESTÁ CORRETO</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setMode("modified")}>CORRIGIR PEDIDO</button>
            <button type="button" className="danger" disabled={busy} onClick={() => setMode("declined")}>DECLINAR PEDIDO</button>
          </div>
        </>}

        {mode === "declined" && <form className="marketing-review-decline" onSubmit={(event) => { event.preventDefault(); void resolve("declined"); }}><label>Motivo para declinar<textarea value={response} onChange={(event) => setResponse(event.target.value)} minLength={3} maxLength={2000} required /></label><div><button type="button" className="secondary" onClick={() => setMode("choice")}>VOLTAR</button><button type="submit" className="danger" disabled={busy}>{busy ? "Salvando..." : "DECLINAR PEDIDO"}</button></div></form>}

        {mode === "modified" && <form className="marketing-review-correction" onSubmit={submitCorrection}>
          <label>Corretor<input value={form.brokerName} onChange={(event) => setForm({ ...form, brokerName: event.target.value })} required /></label>
          <fieldset><legend>O imóvel já tem código?</legend><label><input type="radio" checked={form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: true })} /> Sim</label><label><input type="radio" checked={!form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: false, propertyReference: "" })} /> Ainda não</label></fieldset>
          <label className={!form.hasPropertyCode ? "marketing-field-disabled" : ""}>Código do imóvel<input value={form.propertyReference} onChange={(event) => setForm({ ...form, propertyReference: event.target.value })} required={form.hasPropertyCode} disabled={!form.hasPropertyCode} placeholder={form.hasPropertyCode ? "Ex.: 78119" : "Sem código informado"} /></label>
          <ExclusiveChoice name="manager-review-exclusive" value={form.isExclusive} onChange={(isExclusive) => setForm({ ...form, isExclusive })} />
          <fieldset><legend>Tipo de solicitação</legend><label><input type="radio" checked={form.requestKind === "capture_edit"} onChange={() => setForm({ ...form, requestKind: "capture_edit" })} /> Captação + edição</label><label><input type="radio" checked={form.requestKind === "edit_only"} onChange={() => { setForm({ ...form, requestKind: "edit_only", captureLocation: "", capturePreference: "marketing", preferredCaptureAt: "", preferredCaptureDurationMinutes: null }); setPickerOpen(false); }} /> Somente edição</label></fieldset>
          <fieldset className="span-2"><legend>Tipo de conteúdo</legend>{MARKETING_CONTENT_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={form.contentTypes.includes(option.value)} onChange={() => toggleContent(option.value)} /> {option.label}</label>)}</fieldset>
          {form.requestKind === "capture_edit" && <>
            <label className="span-2">Local solicitado<input value={form.captureLocation} onChange={(event) => setForm({ ...form, captureLocation: event.target.value })} /></label>
            <fieldset className="span-2 marketing-capture-choice"><legend>Data solicitada</legend><button type="button" className={form.capturePreference === "choose" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "choose" }); setPickerOpen(true); }}>ESCOLHER DATA E HORÁRIO</button><button type="button" className={form.capturePreference === "marketing" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "marketing", preferredCaptureAt: "", preferredCaptureDurationMinutes: null }); setPickerOpen(false); }}>DEIXAR O MARKETING DEFINIR</button>{form.capturePreference === "choose" && form.preferredCaptureAt && form.preferredCaptureDurationMinutes && !pickerOpen && <div className="marketing-capture-summary"><strong>{formatCaptureRange(form.preferredCaptureAt, form.preferredCaptureDurationMinutes, props.dashboard.scheduleConfig.timezone)}</strong><button type="button" onClick={() => setPickerOpen(true)}>ALTERAR</button></div>}</fieldset>
            {form.capturePreference === "choose" && pickerOpen && <div className="span-2"><CaptureSchedulePicker config={props.dashboard.scheduleConfig} occupiedSlots={props.dashboard.occupiedCaptureSlots} excludedRequestId={request.id} excludedCaptureGroupId={request.captureGroupId} value={form.preferredCaptureAt && form.preferredCaptureDurationMinutes ? { startAt: form.preferredCaptureAt, durationMinutes: form.preferredCaptureDurationMinutes } : null} onConfirm={(selection) => { setForm({ ...form, preferredCaptureAt: selection.startAt, preferredCaptureDurationMinutes: selection.durationMinutes }); setPickerOpen(false); }} onCancel={() => setPickerOpen(false)} /></div>}
          </>}
          <label className="span-2">Link de arquivos<input type="url" value={form.assetLink} onChange={(event) => setForm({ ...form, assetLink: event.target.value })} /></label>
          <label className="marketing-check span-2"><input type="checkbox" checked={form.paidTraffic} onChange={(event) => setForm({ ...form, paidTraffic: event.target.checked })} /> Tráfego pago</label>
          <label className="span-2">Observações<textarea value={form.requesterNotes} onChange={(event) => setForm({ ...form, requesterNotes: event.target.value })} maxLength={3000} /></label>
          <label className="marketing-check span-2 urgent"><input type="checkbox" checked={form.urgencyRequested} onChange={(event) => setForm({ ...form, urgencyRequested: event.target.checked })} /> Solicitação de urgência</label>
          {form.urgencyRequested && <label className="span-2">Motivo da urgência<textarea value={form.urgencyReason} onChange={(event) => setForm({ ...form, urgencyReason: event.target.value })} maxLength={1000} /></label>}
          <label className="span-2">Observação da correção<textarea value={response} onChange={(event) => setResponse(event.target.value)} maxLength={2000} /></label>
          <div className="marketing-review-correction-actions span-2"><button type="button" className="secondary" onClick={() => setMode("choice")}>VOLTAR</button><button type="submit" disabled={busy}>{busy ? "Salvando..." : "SALVAR CORREÇÃO"}</button></div>
        </form>}
      </section>
    </div>,
    document.body,
  );
}

function requestToForm(request: MarketingRequest): RequestFormState {
  return {
    teamId: request.teamId,
    brokerName: request.brokerName,
    hasPropertyCode: request.hasPropertyCode,
    propertyReference: request.hasPropertyCode ? request.propertyReference : "",
    isExclusive: request.isExclusive,
    requestKind: request.requestKind,
    contentTypes: [...request.contentTypes],
    captureLocation: request.captureLocation || "",
    capturePreference: request.preferredCaptureAt ? "choose" : "marketing",
    preferredCaptureAt: request.preferredCaptureAt || "",
    preferredCaptureDurationMinutes: request.preferredCaptureDurationMinutes || null,
    assetLink: request.assetLink || "",
    paidTraffic: request.paidTraffic,
    requesterNotes: request.requesterNotes || "",
    urgencyRequested: request.urgencyRequested,
    urgencyReason: request.urgencyReason || "",
  };
}

function buildManagerReviewCorrections(request: MarketingRequest, form: RequestFormState) {
  const corrections: Record<string, unknown> = {};
  const setIfChanged = (key: string, previous: unknown, next: unknown) => {
    if (JSON.stringify(previous) !== JSON.stringify(next)) corrections[key] = next;
  };
  setIfChanged("brokerName", request.brokerName, form.brokerName.trim());
  setIfChanged("hasPropertyCode", request.hasPropertyCode, form.hasPropertyCode);
  setIfChanged("propertyReference", request.hasPropertyCode ? request.propertyReference : "", form.hasPropertyCode ? form.propertyReference.trim() : "");
  setIfChanged("isExclusive", request.isExclusive, form.isExclusive);
  setIfChanged("requestKind", request.requestKind, form.requestKind);
  setIfChanged("contentTypes", request.contentTypes, form.contentTypes);
  setIfChanged("captureLocation", request.captureLocation || "", form.requestKind === "capture_edit" ? form.captureLocation.trim() : "");
  setIfChanged("preferredCaptureAt", request.preferredCaptureAt || "", form.requestKind === "capture_edit" ? form.preferredCaptureAt : "");
  setIfChanged("preferredCaptureDurationMinutes", request.preferredCaptureDurationMinutes || null, form.requestKind === "capture_edit" ? form.preferredCaptureDurationMinutes : null);
  setIfChanged("assetLink", request.assetLink || "", form.assetLink.trim());
  setIfChanged("paidTraffic", request.paidTraffic, form.paidTraffic);
  setIfChanged("requesterNotes", request.requesterNotes || "", form.requesterNotes.trim());
  setIfChanged("urgencyRequested", request.urgencyRequested, form.urgencyRequested);
  setIfChanged("urgencyReason", request.urgencyReason || "", form.urgencyRequested ? form.urgencyReason.trim() : "");
  return corrections;
}

function RequestView(props: { sessionToken: string; dashboard: MarketingDashboard; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const role = props.dashboard.context.role;
  const initialTeam = role === "sales_manager" ? props.dashboard.context.teamId || "" : props.dashboard.teams[0]?.id || "";
  const [form, setForm] = useState<RequestFormState>(() => ({ ...emptyRequestForm(), teamId: initialTeam }));
  const [busy, setBusy] = useState(false);
  const [capturePickerOpen, setCapturePickerOpen] = useState(false);
  const teamBrokers = props.dashboard.brokers.filter((broker) => broker.teamId === form.teamId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    props.onError("");
    const isExclusive = form.isExclusive;
    if (!form.teamId || !form.brokerName.trim() || (form.hasPropertyCode && !form.propertyReference.trim()) || form.contentTypes.length === 0) {
      props.onError("Preencha equipe, corretor, imóvel e tipo de conteúdo.");
      return;
    }
    if (isExclusive === null) {
      props.onError("Informe se o imóvel é exclusividade.");
      return;
    }
    if (form.requestKind === "capture_edit" && form.capturePreference === "choose" && (!form.preferredCaptureAt || !form.preferredCaptureDurationMinutes)) {
      props.onError("Escolha a data, o horário e a duração da captação.");
      return;
    }
    if (form.urgencyRequested && !form.urgencyReason.trim()) {
      props.onError("Explique o motivo da urgência. Ela não altera a fila até ser aprovada.");
      return;
    }
    setBusy(true);
    try {
      const result = await createMarketingRequest(props.sessionToken, { ...form, isExclusive });
      const number = result?.[0]?.request_number;
      setForm({ ...emptyRequestForm(), teamId: initialTeam });
      setCapturePickerOpen(false);
      await props.onSaved(number ? `Pedido #${number} enviado ao Marketing.` : "Pedido enviado ao Marketing.");
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleContent(value: string) {
    setForm((current) => ({ ...current, contentTypes: current.contentTypes.includes(value) ? current.contentTypes.filter((item) => item !== value) : [...current.contentTypes, value] }));
  }

  return (
    <section className="marketing-request-view">
      <div className="marketing-section-head"><div><h2>Novo pedido</h2><p>Um pedido por corretor/imóvel. A fila começa no momento do envio.</p></div></div>
      <form className="marketing-request-form" onSubmit={submit}>
        {role === "admin" && <label>Equipe / gerente<select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value, brokerName: "" })}>{props.dashboard.teams.map((team) => <option key={team.id} value={team.id}>{team.managerName}</option>)}</select></label>}
        {role === "sales_manager" && <div className="marketing-locked-field"><small>Equipe</small><strong>{props.dashboard.context.teamName}</strong></div>}
        <label>Corretor<input list="marketing-brokers" value={form.brokerName} onChange={(event) => setForm({ ...form, brokerName: event.target.value })} placeholder="Nome do corretor" required /></label>
        <datalist id="marketing-brokers">{teamBrokers.map((broker) => <option key={broker.id} value={broker.name} />)}</datalist>
        <fieldset><legend>O imóvel já tem código?</legend><label><input type="radio" checked={form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: true })} /> Sim</label><label><input type="radio" checked={!form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: false, propertyReference: "" })} /> Ainda não</label></fieldset>
        <label className={`span-2 ${!form.hasPropertyCode ? "marketing-field-disabled" : ""}`}>Código do imóvel<input value={form.propertyReference} onChange={(event) => setForm({ ...form, propertyReference: event.target.value })} placeholder={form.hasPropertyCode ? "Ex.: 78119" : "Sem código informado"} required={form.hasPropertyCode} disabled={!form.hasPropertyCode} /></label>
        <ExclusiveChoice name="internal-marketing-exclusive" value={form.isExclusive} onChange={(isExclusive) => setForm({ ...form, isExclusive })} className="span-2" />
        <fieldset className="span-2"><legend>O que precisa?</legend><label><input type="radio" checked={form.requestKind === "capture_edit"} onChange={() => setForm({ ...form, requestKind: "capture_edit" })} /> Captação + edição</label><label><input type="radio" checked={form.requestKind === "edit_only"} onChange={() => { setForm({ ...form, requestKind: "edit_only", captureLocation: "", capturePreference: "marketing", preferredCaptureAt: "", preferredCaptureDurationMinutes: null }); setCapturePickerOpen(false); }} /> Somente edição</label></fieldset>
        <fieldset className="span-2"><legend>Tipo de conteúdo</legend>{Object.entries(contentLabels).map(([value, label]) => <label key={value}><input type="checkbox" checked={form.contentTypes.includes(value)} onChange={() => toggleContent(value)} /> {label}</label>)}</fieldset>
        {form.requestKind === "capture_edit" && <>
          <label className="span-2">Onde será a captação?<input value={form.captureLocation} onChange={(event) => setForm({ ...form, captureLocation: event.target.value })} placeholder="Endereço / empreendimento" /></label>
          <fieldset className="span-2 marketing-capture-choice">
            <legend>Data da captação</legend>
            <button type="button" className={form.capturePreference === "choose" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "choose" }); setCapturePickerOpen(true); }}>ESCOLHER DATA E HORÁRIO</button>
            <button type="button" className={form.capturePreference === "marketing" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "marketing", preferredCaptureAt: "", preferredCaptureDurationMinutes: null }); setCapturePickerOpen(false); }}>DEIXAR O MARKETING DEFINIR</button>
            {form.capturePreference === "marketing" && <p>O Marketing definirá a melhor data e horário conforme disponibilidade.</p>}
            {form.capturePreference === "choose" && form.preferredCaptureAt && form.preferredCaptureDurationMinutes && !capturePickerOpen && (
              <div className="marketing-capture-summary">
                <strong>{formatCaptureRange(form.preferredCaptureAt, form.preferredCaptureDurationMinutes, props.dashboard.scheduleConfig.timezone)}</strong>
                <button type="button" onClick={() => setCapturePickerOpen(true)}>ALTERAR</button>
              </div>
            )}
          </fieldset>
          {form.capturePreference === "choose" && capturePickerOpen && (
            <div className="span-2">
              <CaptureSchedulePicker
                config={props.dashboard.scheduleConfig}
                occupiedSlots={props.dashboard.occupiedCaptureSlots}
                value={form.preferredCaptureAt && form.preferredCaptureDurationMinutes ? { startAt: form.preferredCaptureAt, durationMinutes: form.preferredCaptureDurationMinutes } : null}
                onConfirm={(selection) => {
                  setForm({ ...form, preferredCaptureAt: selection.startAt, preferredCaptureDurationMinutes: selection.durationMinutes });
                  setCapturePickerOpen(false);
                }}
              />
            </div>
          )}
        </>}
        <label className="span-2">Link dos arquivos, se já existirem<input type="url" value={form.assetLink} onChange={(event) => setForm({ ...form, assetLink: event.target.value })} placeholder="Google Drive, OneDrive..." /></label>
        <label className="marketing-check span-2"><input type="checkbox" checked={form.paidTraffic} onChange={(event) => setForm({ ...form, paidTraffic: event.target.checked })} /> O conteúdo será usado para tráfego pago</label>
        <label className="marketing-check span-2 urgent"><input type="checkbox" checked={form.urgencyRequested} onChange={(event) => setForm({ ...form, urgencyRequested: event.target.checked })} /> Solicitar urgência <small>Não muda a fila automaticamente.</small></label>
        {form.urgencyRequested && <label className="span-2">Motivo da urgência<textarea value={form.urgencyReason} onChange={(event) => setForm({ ...form, urgencyReason: event.target.value })} placeholder="Explique por que este trabalho precisa de análise prioritária." /></label>}
        <label className="span-2">Observações<textarea value={form.requesterNotes} onChange={(event) => setForm({ ...form, requesterNotes: event.target.value })} placeholder="Somente o que o Marketing precisa saber." /></label>
        <div className="marketing-form-footer span-2"><span>A data de entrega será definida pelo Marketing. Nesta primeira fase ainda não há SLA automático.</span><button type="submit" disabled={busy}>{busy ? "Enviando..." : "ENVIAR PEDIDO"}</button></div>
      </form>
    </section>
  );
}

function AdminRequestEditForm(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  request: MarketingRequest;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [form, setForm] = useState<RequestFormState>(() => requestToForm(props.request));
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const brokers = props.dashboard.brokers.filter((broker) => broker.teamId === form.teamId);

  function toggleContent(value: string) {
    setForm((current) => ({
      ...current,
      contentTypes: current.contentTypes.includes(value)
        ? current.contentTypes.filter((item) => item !== value)
        : [...current.contentTypes, value],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!form.teamId || !form.brokerName.trim() || (form.hasPropertyCode && !form.propertyReference.trim()) || form.contentTypes.length === 0) {
      props.onError("Preencha equipe, corretor, imóvel e tipo de conteúdo.");
      return;
    }
    if (form.requestKind === "capture_edit" && form.capturePreference === "choose" && (!form.preferredCaptureAt || !form.preferredCaptureDurationMinutes)) {
      props.onError("Escolha a data, o horário e a duração da captação.");
      return;
    }
    if (form.urgencyRequested && !form.urgencyReason.trim()) {
      props.onError("Explique o motivo da urgência.");
      return;
    }

    setBusy(true);
    props.onError("");
    try {
      await adminUpdateMarketingRequest(
        props.sessionToken,
        props.request.id,
        buildAdminRequestChanges(props.request, form),
      );
      props.onNotice("Pedido corrigido pelo administrador. As alterações foram registradas no histórico.");
      await props.onSaved();
      props.onCancel();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="marketing-admin-edit-panel">
      <div className="marketing-section-head"><div><h3>Editar pedido</h3><p>Dados da solicitação. O controle operacional permanece separado.</p></div></div>
      <form className="marketing-review-correction" onSubmit={submit}>
        <label>Equipe / gerente<select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value, brokerName: "" })}>{props.dashboard.teams.map((team) => <option key={team.id} value={team.id}>{team.managerName}</option>)}</select></label>
        <label>Corretor<input list={`marketing-admin-brokers-${props.request.id}`} value={form.brokerName} onChange={(event) => setForm({ ...form, brokerName: event.target.value })} required /></label>
        <datalist id={`marketing-admin-brokers-${props.request.id}`}>{brokers.map((broker) => <option key={broker.id} value={broker.name} />)}</datalist>
        <fieldset><legend>O imóvel já tem código?</legend><label><input type="radio" checked={form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: true })} /> Sim</label><label><input type="radio" checked={!form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: false, propertyReference: "" })} /> Ainda não</label></fieldset>
        <label className={!form.hasPropertyCode ? "marketing-field-disabled" : ""}>Código do imóvel<input value={form.propertyReference} onChange={(event) => setForm({ ...form, propertyReference: event.target.value })} required={form.hasPropertyCode} disabled={!form.hasPropertyCode} placeholder={form.hasPropertyCode ? "Ex.: 78119" : "Sem código informado"} /></label>
        <ExclusiveChoice name={`admin-edit-exclusive-${props.request.id}`} value={form.isExclusive} onChange={(isExclusive) => setForm({ ...form, isExclusive })} />
        <fieldset><legend>Tipo da solicitação</legend><label><input type="radio" checked={form.requestKind === "capture_edit"} onChange={() => setForm({ ...form, requestKind: "capture_edit" })} /> Captação + edição</label><label><input type="radio" checked={form.requestKind === "edit_only"} onChange={() => { setForm({ ...form, requestKind: "edit_only", captureLocation: "", capturePreference: "marketing", preferredCaptureAt: "", preferredCaptureDurationMinutes: null }); setPickerOpen(false); }} /> Somente edição</label></fieldset>
        <fieldset className="span-2"><legend>Tipos de conteúdo</legend>{MARKETING_CONTENT_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={form.contentTypes.includes(option.value)} onChange={() => toggleContent(option.value)} /> {option.label}</label>)}</fieldset>
        {form.requestKind === "capture_edit" && <>
          <label className="span-2">Local da captação<input value={form.captureLocation} onChange={(event) => setForm({ ...form, captureLocation: event.target.value })} maxLength={300} /></label>
          <fieldset className="span-2 marketing-capture-choice"><legend>Data solicitada</legend><button type="button" className={form.capturePreference === "choose" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "choose" }); setPickerOpen(true); }}>ESCOLHER DATA E HORÁRIO</button><button type="button" className={form.capturePreference === "marketing" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "marketing", preferredCaptureAt: "", preferredCaptureDurationMinutes: null }); setPickerOpen(false); }}>DEIXAR O MARKETING DEFINIR</button>{form.capturePreference === "choose" && form.preferredCaptureAt && form.preferredCaptureDurationMinutes && !pickerOpen && <div className="marketing-capture-summary"><strong>{formatCaptureRange(form.preferredCaptureAt, form.preferredCaptureDurationMinutes, props.dashboard.scheduleConfig.timezone)}</strong><button type="button" onClick={() => setPickerOpen(true)}>ALTERAR</button></div>}</fieldset>
          {form.capturePreference === "choose" && pickerOpen && <div className="span-2"><CaptureSchedulePicker config={props.dashboard.scheduleConfig} occupiedSlots={props.dashboard.occupiedCaptureSlots} excludedRequestId={props.request.id} excludedCaptureGroupId={props.request.captureGroupId} value={form.preferredCaptureAt && form.preferredCaptureDurationMinutes ? { startAt: form.preferredCaptureAt, durationMinutes: form.preferredCaptureDurationMinutes } : null} onConfirm={(selection) => { setForm({ ...form, preferredCaptureAt: selection.startAt, preferredCaptureDurationMinutes: selection.durationMinutes }); setPickerOpen(false); }} onCancel={() => setPickerOpen(false)} /></div>}
        </>}
        <label className="span-2">Link de arquivos<input type="url" value={form.assetLink} onChange={(event) => setForm({ ...form, assetLink: event.target.value })} maxLength={2000} /></label>
        <label className="marketing-check span-2"><input type="checkbox" checked={form.paidTraffic} onChange={(event) => setForm({ ...form, paidTraffic: event.target.checked })} /> Tráfego pago</label>
        <label className="span-2">Observação do pedido<textarea value={form.requesterNotes} onChange={(event) => setForm({ ...form, requesterNotes: event.target.value })} maxLength={3000} /></label>
        <label className="marketing-check span-2 urgent"><input type="checkbox" checked={form.urgencyRequested} disabled={Boolean(props.request.urgencyDecidedAt)} onChange={(event) => setForm({ ...form, urgencyRequested: event.target.checked })} /> Urgência solicitada</label>
        {form.urgencyRequested && <label className="span-2">Motivo da urgência<textarea value={form.urgencyReason} disabled={Boolean(props.request.urgencyDecidedAt)} onChange={(event) => setForm({ ...form, urgencyReason: event.target.value })} maxLength={1000} /></label>}
        {props.request.urgencyDecidedAt && <small className="span-2">A urgência já foi decidida e permanece protegida pela regra operacional.</small>}
        <div className="marketing-review-correction-actions span-2"><button type="button" className="secondary" onClick={props.onCancel}>CANCELAR</button><button type="submit" disabled={busy}>{busy ? "Salvando..." : "SALVAR EDIÇÃO"}</button></div>
      </form>
    </section>
  );
}

function buildAdminRequestChanges(request: MarketingRequest, form: RequestFormState) {
  const changes = buildManagerReviewCorrections(request, form);
  if (request.teamId !== form.teamId) changes.teamId = form.teamId;
  return changes;
}

function AdminDeleteRequestModal(props: {
  sessionToken: string;
  request: MarketingRequest;
  onClose: () => void;
  onDeleted: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      props.onError("Informe o motivo da exclusão com pelo menos 5 caracteres.");
      return;
    }
    setBusy(true);
    props.onError("");
    try {
      await adminDeleteMarketingRequest(props.sessionToken, props.request.id, reason);
      await props.onDeleted();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="marketing-modal-backdrop marketing-confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="marketing-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-delete-title">
        <h2 id="marketing-delete-title">Excluir pedido #{props.request.requestNumber}</h2>
        <p>Este pedido será retirado da operação, mas seu histórico será preservado.</p>
        <form onSubmit={submit}>
          <label>Motivo<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={2000} required autoFocus /></label>
          <div><button type="button" className="secondary" onClick={props.onClose}>CANCELAR</button><button type="submit" className="danger" disabled={busy}>{busy ? "Excluindo..." : "CONFIRMAR EXCLUSÃO"}</button></div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function AccessView(props: { sessionToken: string; dashboard: MarketingDashboard; onSaved: () => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<MarketingRole>("sales_manager");
  const [teamId, setTeamId] = useState(props.dashboard.teams[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const accessByUser = new Map(props.dashboard.access.map((access) => [access.managedUserId, access]));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!userId) { props.onError("Escolha um usuário do HUB."); return; }
    setBusy(true);
    props.onError("");
    try {
      await saveMarketingAccess(props.sessionToken, { managedUserId: userId, role, teamId: role === "sales_manager" ? teamId : null });
      props.onNotice("Acesso do Marketing atualizado.");
      await props.onSaved();
      setUserId("");
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="marketing-access-view">
      <div className="marketing-section-head"><div><h2>Equipes e acessos</h2><p>O usuário continua sendo do HUB. Aqui você apenas define o papel dele dentro do Marketing.</p></div></div>
      <div className="marketing-access-grid">
        <form onSubmit={save} className="marketing-access-form">
          <h3>Vincular usuário</h3>
          <label>Usuário do HUB<select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Selecione...</option>{props.dashboard.availableUsers.filter((user) => user.id !== "tezzei").map((user) => <option value={user.id} key={user.id}>{user.name} · {user.jobTitle || user.department || "Usuário"}</option>)}</select></label>
          <label>Papel<select value={role} onChange={(event) => setRole(event.target.value as MarketingRole)}><option value="sales_manager">Gerente de Vendas — faz pedidos</option><option value="marketing">Marketing — gerencia produção</option></select></label>
          {role === "sales_manager" && <label>Equipe<select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{props.dashboard.teams.map((team) => <option value={team.id} key={team.id}>{team.managerName}</option>)}</select></label>}
          <button type="submit" disabled={busy}>{busy ? "Salvando..." : "SALVAR ACESSO"}</button>
          <small>Se a pessoa ainda não existe, crie primeiro em Administração do HUB → Usuários e Permissões.</small>
        </form>
        <div className="marketing-team-access-list">
          {props.dashboard.teams.map((team) => {
            const managerAccess = props.dashboard.access.find((access) => access.role === "sales_manager" && access.teamId === team.id && access.active);
            return <article key={team.id}><strong>{team.managerName}</strong><span>{managerAccess ? `Usuário vinculado: ${managerAccess.userName}` : "Sem usuário vinculado"}</span><small>{props.dashboard.brokers.filter((broker) => broker.teamId === team.id).length} corretor(es) já usados em pedidos</small></article>;
          })}
          <article className="marketing-staff-access"><strong>Equipe de Marketing</strong>{props.dashboard.access.filter((access) => access.role === "marketing" && access.active).map((access) => <span key={access.managedUserId}>{access.userName}</span>)}{props.dashboard.access.filter((access) => access.role === "marketing" && access.active).length === 0 && <span>Maria e Arthur ainda não vinculados a usuários do HUB.</span>}</article>
        </div>
      </div>
    </section>
  );
}

function DeletedRequestsView(props: {
  sessionToken: string;
  dashboard: MarketingDashboard;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const requests = props.dashboard.deletedRequests ?? [];
  const [historyId, setHistoryId] = useState("");
  const [restoreRequest, setRestoreRequest] = useState<MarketingDeletedRequest | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore() {
    if (!restoreRequest || busy) return;
    setBusy(true);
    props.onError("");
    try {
      await adminRestoreMarketingRequest(props.sessionToken, restoreRequest.id);
      props.onNotice(`Pedido #${restoreRequest.requestNumber} restaurado na posição original da fila.`);
      setRestoreRequest(null);
      await props.onRefresh();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="marketing-deleted-view">
      <div className="marketing-section-head"><div><h2>Pedidos excluídos</h2><p>Fora da operação, com número e histórico preservados.</p></div></div>
      {requests.length === 0 ? (
        <div className="marketing-empty"><h3>Nenhum pedido excluído.</h3><p>Exclusões administrativas aparecerão aqui.</p></div>
      ) : (
        <div className="marketing-deleted-list">
          {requests.map((request) => (
            <article key={request.id}>
              <header><div><small>PEDIDO #{request.requestNumber}</small><h3>{request.brokerName}</h3><p>{request.managerName} · {propertyLabel(request)}</p></div><span>{request.requestSource === "public" ? "LINK PÚBLICO" : "HUB"}</span></header>
              <dl>
                <div><dt>Criado em</dt><dd>{formatDateTime(request.createdAt)}</dd></div>
                <div><dt>Excluído em</dt><dd>{formatDateTime(request.deletedAt)}</dd></div>
                <div><dt>Excluído por</dt><dd>{request.deletedByName}</dd></div>
                <div><dt>Motivo</dt><dd>{request.deletionReason}</dd></div>
              </dl>
              <div className="marketing-deleted-actions"><button type="button" className="secondary" onClick={() => setHistoryId(historyId === request.id ? "" : request.id)}>{historyId === request.id ? "OCULTAR HISTÓRICO" : "VER HISTÓRICO"}</button><button type="button" onClick={() => setRestoreRequest(request)}>RESTAURAR</button></div>
              {historyId === request.id && (
                <div className="marketing-deleted-history">
                  {request.events.length === 0 ? <p>Nenhum evento registrado.</p> : request.events.map((event) => <div className="marketing-deleted-event" key={event.id}><div><strong>{event.eventType.split("_").join(" ")}</strong><time>{formatDateTime(event.createdAt)}</time></div><span>{event.actorName || "Sistema"}</span>{Object.keys(event.details || {}).length > 0 && <pre>{JSON.stringify(event.details, null, 2)}</pre>}</div>)}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {restoreRequest && createPortal(
        <div className="marketing-modal-backdrop marketing-confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRestoreRequest(null); }}>
          <section className="marketing-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-restore-title">
            <h2 id="marketing-restore-title">Restaurar pedido #{restoreRequest.requestNumber}</h2>
            <p>O pedido voltará à operação com o número, a data de criação, o status e o histórico originais.</p>
            {restoreRequest.confirmedCaptureAt && <small>A disponibilidade da captação confirmada será validada novamente antes da restauração.</small>}
            <div><button type="button" className="secondary" onClick={() => setRestoreRequest(null)}>CANCELAR</button><button type="button" disabled={busy} onClick={() => void restore()}>{busy ? "Restaurando..." : "RESTAURAR PEDIDO"}</button></div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

function RequestDetail(props: { sessionToken: string; dashboard: MarketingDashboard; request: MarketingRequest; role: MarketingRole; onSelect: (request: MarketingRequest) => void; onClose: () => void; onChanged: () => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<MarketingRequestStatus>(props.request.status);
  const [confirmed, setConfirmed] = useState<MarketingCaptureSelection | null>(() => props.request.confirmedCaptureAt && props.request.confirmedCaptureDurationMinutes
    ? { startAt: props.request.confirmedCaptureAt, durationMinutes: props.request.confirmedCaptureDurationMinutes }
    : null);
  const [promised, setPromised] = useState(toLocalDateTime(props.request.promisedAt));
  const [assigned, setAssigned] = useState(props.request.assignedMarketingName || "");
  const [notes, setNotes] = useState(props.request.marketingNotes || "");
  const [busy, setBusy] = useState(false);
  const [capturePickerOpen, setCapturePickerOpen] = useState(false);
  const [queueBlocked, setQueueBlocked] = useState(false);
  const [overrideFormOpen, setOverrideFormOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewReason, setReviewReason] = useState<MarketingManagerReviewReason>("incomplete_request");
  const [reviewDetails, setReviewDetails] = useState("");
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canManage = props.role === "admin" || props.role === "marketing";
  const pendingOverride = props.dashboard.queueOverrideRequests.find((request) => request.requestId === props.request.id && request.status === "pending");
  const pendingManagerReview = props.dashboard.managerReviews.find((review) => review.requestId === props.request.id && review.status === "pending");

  async function run(action: "save_management" | "approve_urgency" | "reject_urgency" | "cancel", payload: Record<string, unknown> = {}) {
    setBusy(true);
    props.onError("");
    try {
      await updateMarketingRequest(props.sessionToken, props.request.id, action, payload);
      props.onNotice(action === "approve_urgency" ? "Urgência aprovada." : action === "reject_urgency" ? "Pedido mantido na fila normal." : action === "cancel" ? "Pedido cancelado." : "Pedido atualizado pelo Marketing.");
      await props.onChanged();
      if (action === "cancel") props.onClose();
    } catch (error) {
      if (isMarketingError(error, "MARKETING_QUEUE_ORDER_BLOCKED")) setQueueBlocked(true);
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestOverride(event: FormEvent) {
    event.preventDefault();
    if (!overrideReason.trim()) { props.onError("Informe o motivo para alterar a ordem da fila."); return; }
    setBusy(true);
    props.onError("");
    try {
      await requestMarketingQueueOverride(props.sessionToken, props.request.id, overrideReason);
      props.onNotice("Solicitação de alteração da fila enviada para análise interna.");
      setQueueBlocked(false);
      setOverrideFormOpen(false);
      setOverrideReason("");
      await props.onChanged();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function saveManagement(event: FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      status,
      promisedAt: promised ? new Date(promised).toISOString() : "",
      assignedMarketingName: assigned,
      marketingNotes: notes,
    };
    if (props.request.requestKind === "capture_edit") {
      payload.confirmedCaptureAt = confirmed?.startAt || "";
      payload.confirmedCaptureDurationMinutes = confirmed?.durationMinutes || null;
    }
    void run("save_management", payload);
  }

  async function openManagerReview(event: FormEvent) {
    event.preventDefault();
    if (reviewDetails.trim().length < 5) {
      props.onError("Descreva o problema para o gerente.");
      return;
    }
    setBusy(true);
    props.onError("");
    try {
      await openMarketingManagerReview(props.sessionToken, props.request.id, reviewReason, reviewDetails);
      props.onNotice("Pendência enviada ao gerente. O pedido ficou temporariamente bloqueado.");
      setReviewFormOpen(false);
      setReviewDetails("");
      await props.onChanged();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="marketing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="marketing-request-modal" role="dialog" aria-modal="true">
        <header><div><small>PEDIDO #{props.request.requestNumber}</small><h2>{props.request.brokerName}</h2><p>{props.request.managerName} · {propertyLabel(props.request)}</p></div><button type="button" onClick={props.onClose}>×</button></header>
        <div className="marketing-detail-grid">
          <Detail label="Pedido" value={props.request.requestKind === "capture_edit" ? "Captação + edição" : "Somente edição"} />
          <Detail label="Conteúdo" value={contentSummary(props.request)} />
          <Detail label="Entrada" value={formatDateTime(props.request.createdAt)} />
          <Detail label="Status" value={statusLabels[props.request.status]} />
          <Detail label="Origem" value={props.request.requestSource === "public" ? "Link público" : "HUB"} />
          <Detail label="Exclusividade" value={exclusiveLabel(props.request.isExclusive)} />
          {props.request.requestSource === "public" && props.request.publicRequesterName && <Detail label="Solicitado por" value={props.request.publicRequesterName} />}
          {props.request.requestKind === "capture_edit" && props.request.preferredCaptureAt && <Detail label="Data solicitada" value={props.request.preferredCaptureDurationMinutes ? formatCaptureRange(props.request.preferredCaptureAt, props.request.preferredCaptureDurationMinutes, props.dashboard.scheduleConfig.timezone) : formatDateTime(props.request.preferredCaptureAt)} />}
          {props.request.requestKind === "capture_edit" && !props.request.preferredCaptureAt && <Detail label="Data solicitada" value="Aguardando definição do Marketing" />}
          {props.request.requestKind === "capture_edit" && props.request.confirmedCaptureAt && props.request.confirmedCaptureDurationMinutes && <Detail label="Captação confirmada" value={formatCaptureRange(props.request.confirmedCaptureAt, props.request.confirmedCaptureDurationMinutes, props.dashboard.scheduleConfig.timezone)} />}
          {props.request.captureLocation && <Detail label="Local" value={props.request.captureLocation} />}
          {props.request.assetLink && <div className="marketing-detail"><span>Arquivos</span><button className="marketing-link-button" type="button" onClick={() => safeOpen(props.request.assetLink!)}>Abrir link</button></div>}
          <Detail label="Tráfego pago" value={props.request.paidTraffic ? "Sim" : "Não"} />
        </div>
        {props.request.captureGroupId && (
          <section className="marketing-capture-group-detail">
            <div><strong>Este pedido faz parte de uma saída agrupada</strong><span>Total de imóveis nesta saída: {props.request.captureGroupSize || 1}</span></div>
            <nav aria-label="Pedidos vinculados desta saída">
              {(props.request.captureGroupRequestIds || []).map((requestId, index) => {
                const linked = props.dashboard.requests.find((request) => request.id === requestId);
                if (!linked) return null;
                return <button type="button" className={linked.id === props.request.id ? "active" : ""} key={linked.id} onClick={() => props.onSelect(linked)}>#{props.request.captureGroupRequestNumbers?.[index] || linked.requestNumber}</button>;
              })}
            </nav>
          </section>
        )}
        {props.request.requesterNotes && <div className="marketing-note-box"><strong>Observação do pedido</strong><p>{props.request.requesterNotes}</p></div>}
        {props.request.urgencyRequested && <div className={`marketing-urgency-box ${props.request.urgencyApproved ? "approved" : ""}`}><strong>Urgência solicitada</strong><p>{props.request.urgencyReason}</p><small>{props.request.urgencyDecidedAt ? `${props.request.urgencyApproved ? "Aprovada" : "Mantida na fila normal"} por ${props.request.urgencyDecidedByName || "Admin"}` : "Aguardando análise interna"}</small>{props.role === "admin" && !props.request.urgencyDecidedAt && <div><button type="button" disabled={busy} onClick={() => void run("approve_urgency")}>APROVAR PRIORIDADE</button><button type="button" disabled={busy} onClick={() => void run("reject_urgency")}>MANTER FILA</button></div>}</div>}
        {props.role === "admin" && <div className="marketing-admin-actions"><button type="button" className="secondary" onClick={() => setAdminEditOpen((open) => !open)}>{adminEditOpen ? "FECHAR EDIÇÃO" : "EDITAR PEDIDO"}</button><button type="button" className="danger" onClick={() => setDeleteOpen(true)}>EXCLUIR PEDIDO</button></div>}
        {props.role === "admin" && adminEditOpen && <AdminRequestEditForm key={props.request.updatedAt} sessionToken={props.sessionToken} dashboard={props.dashboard} request={props.request} onCancel={() => setAdminEditOpen(false)} onSaved={props.onChanged} onError={props.onError} onNotice={props.onNotice} />}
        {props.request.managerReviewStatus && props.request.managerReviewStatus !== "pending" && <div className="marketing-review-answered"><strong>AUDITORIA RESPONDIDA</strong><span>{managerReviewStatusLabel(props.request.managerReviewStatus)}</span></div>}
        {canManage && <form className="marketing-management-form" onSubmit={saveManagement}>
          <h3>Controle do Marketing</h3>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as MarketingRequestStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Previsão de entrega<input type="datetime-local" value={promised} onChange={(event) => setPromised(event.target.value)} /></label>
          <label>Responsável no Marketing<select value={assigned} onChange={(event) => setAssigned(event.target.value)}><option value="">Não definido</option>{MARKETING_ASSIGNEES.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
          {props.request.requestKind === "capture_edit" && (
            <section className="marketing-capture-control span-2">
              <h4>Captação</h4>
              <div className="marketing-requested-capture">
                <span>Data solicitada pelo gerente</span>
                <strong>{props.request.preferredCaptureAt ? formatMarketingDateTime(props.request.preferredCaptureAt, props.dashboard.scheduleConfig.timezone) : "Aguardando definição do Marketing"}</strong>
                {props.request.preferredCaptureAt && <small>Duração solicitada: {formatDuration(props.request.preferredCaptureDurationMinutes)}</small>}
              </div>
              <div className="marketing-capture-actions">
                {props.request.preferredCaptureAt && props.request.preferredCaptureDurationMinutes && <button type="button" onClick={() => { setConfirmed({ startAt: props.request.preferredCaptureAt!, durationMinutes: props.request.preferredCaptureDurationMinutes! }); setCapturePickerOpen(false); }}>MANTER DATA SOLICITADA</button>}
                <button type="button" className="secondary" onClick={() => setCapturePickerOpen(true)}>ESCOLHER OUTRA DATA/HORA</button>
              </div>
              {confirmed && !capturePickerOpen && <div className="marketing-confirmed-summary"><span>Captação selecionada</span><strong>{formatCaptureRange(confirmed.startAt, confirmed.durationMinutes, props.dashboard.scheduleConfig.timezone)}</strong></div>}
              {capturePickerOpen && (
                <CaptureSchedulePicker
                  config={props.dashboard.scheduleConfig}
                  occupiedSlots={props.dashboard.occupiedCaptureSlots}
                  excludedRequestId={props.request.id}
                  excludedCaptureGroupId={props.request.captureGroupId}
                  value={confirmed}
                  onCancel={() => setCapturePickerOpen(false)}
                  onConfirm={(selection) => { setConfirmed(selection); setCapturePickerOpen(false); }}
                />
              )}
            </section>
          )}
          <label className="span-2">Observação interna<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bloqueio, retorno do corretor, ajuste solicitado..." /></label>
          <button className="span-2" type="submit" disabled={busy}>{busy ? "Salvando..." : "SALVAR CONTROLE"}</button>
        </form>}
        {canManage && pendingManagerReview && <div className="marketing-review-pending"><strong>AGUARDANDO CONFERÊNCIA DO GERENTE</strong><p>{pendingManagerReview.details}</p><small>Enviado por {pendingManagerReview.openedByName}.</small></div>}
        {canManage && !pendingManagerReview && !["pronto", "cancelado"].includes(props.request.status) && !reviewFormOpen && <button type="button" className="marketing-open-review" onClick={() => setReviewFormOpen(true)}>SOLICITAR AUDITORIA DO GERENTE</button>}
        {canManage && !pendingManagerReview && reviewFormOpen && <form className="marketing-open-review-form" onSubmit={openManagerReview}><h3>Motivo da auditoria</h3><label>Tipo de divergência<select value={reviewReason} onChange={(event) => setReviewReason(event.target.value as MarketingManagerReviewReason)}>{MARKETING_REVIEW_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label><label>Descreva o problema<textarea value={reviewDetails} onChange={(event) => setReviewDetails(event.target.value)} minLength={5} maxLength={2000} required /></label><div><button type="button" className="secondary" onClick={() => setReviewFormOpen(false)}>CANCELAR</button><button type="submit" disabled={busy}>{busy ? "Enviando..." : "ENVIAR AO GERENTE"}</button></div></form>}
        {pendingOverride && <div className="marketing-queue-blocked"><strong>Autorização de fila pendente</strong><p>O pedido permanece bloqueado até a análise interna.</p></div>}
        {queueBlocked && !pendingOverride && (
          <section className="marketing-queue-blocked">
            <strong>Existe um pedido anterior aguardando atendimento.</strong>
            <p>A fila deve ser seguida na ordem de entrada.</p>
            {props.role === "marketing" && !overrideFormOpen && <button type="button" onClick={() => setOverrideFormOpen(true)}>SOLICITAR AUTORIZAÇÃO</button>}
            {props.role === "marketing" && overrideFormOpen && (
              <form onSubmit={requestOverride}>
                <label>Motivo para alterar a ordem<textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label>
                <button type="submit" disabled={busy}>ENVIAR PARA ANÁLISE</button>
              </form>
            )}
            {props.role === "admin" && <small>A equipe de Marketing deve justificar a alteração antes da aprovação administrativa.</small>}
          </section>
        )}
        {!canManage && !["pronto", "cancelado"].includes(props.request.status) && <button type="button" className="marketing-cancel-request" disabled={busy} onClick={() => void run("cancel")}>Cancelar pedido</button>}
        {deleteOpen && <AdminDeleteRequestModal sessionToken={props.sessionToken} request={props.request} onClose={() => setDeleteOpen(false)} onError={props.onError} onDeleted={async () => { props.onNotice(`Pedido #${props.request.requestNumber} excluído da operação com o histórico preservado.`); setDeleteOpen(false); await props.onChanged(); props.onClose(); }} />}
      </section>
    </div>,
    document.body,
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <article className={danger ? "danger" : ""}><span>{label}</span><strong>{value}</strong></article>;
}

function RequestCard({ request, onClick, showCaptureStatus = false, timezone }: { request: MarketingRequest; onClick: () => void; showCaptureStatus?: boolean; timezone?: string }) {
  return (
    <button type="button" className={`marketing-request-card ${request.urgencyApproved ? "priority" : ""}`} onClick={onClick}>
      <div><small>#{request.requestNumber} · {request.managerName}</small>{request.urgencyApproved && <em>PRIORIDADE</em>}</div>
      <div className="marketing-card-tags">{request.isExclusive === true && <em className="exclusive">EXCLUSIVO</em>}{request.requestSource === "public" && <em className="public">LINK PÚBLICO</em>}{request.captureGroupId && <em className="capture-group">SAÍDA AGRUPADA · {request.captureGroupSize || 1}</em>}{request.managerReviewStatus === "pending" && <em className="review-pending">AGUARDANDO GERENTE</em>}{request.managerReviewStatus && request.managerReviewStatus !== "pending" && <em className="review-answered">AUDITORIA RESPONDIDA</em>}</div>
      <strong>{request.brokerName}</strong>
      <span>{propertyLabel(request)}</span>
      <small className="marketing-card-exclusive">Exclusividade: {exclusiveLabel(request.isExclusive)}</small>
      <p>{contentSummary(request)}</p>
      {showCaptureStatus && timezone && request.requestKind === "capture_edit" && (
        <div className={`marketing-card-capture ${request.confirmedCaptureAt && request.confirmedCaptureDurationMinutes ? "confirmed" : "pending"}`}>
          <small>{request.confirmedCaptureAt && request.confirmedCaptureDurationMinutes ? "CAPTAÇÃO CONFIRMADA" : "AGUARDANDO DEFINIÇÃO DO MARKETING"}</small>
          {request.confirmedCaptureAt && request.confirmedCaptureDurationMinutes && <strong>{formatCaptureRange(request.confirmedCaptureAt, request.confirmedCaptureDurationMinutes, timezone)}</strong>}
        </div>
      )}
      <footer><span>{request.assignedMarketingName || "Não atribuído"}</span><time>{request.promisedAt ? `Entrega ${formatShortDate(request.promisedAt)}` : request.confirmedCaptureAt ? `Captação ${formatShortDate(request.confirmedCaptureAt)}` : "Sem previsão"}</time></footer>
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="marketing-detail"><span>{label}</span><strong>{value}</strong></div>;
}

function availableTabs(role: MarketingRole): Array<{ id: MarketingTab; label: string }> {
  if (role === "sales_manager") return [{ id: "request", label: "Novo pedido" }, { id: "mine", label: "Minha equipe" }, { id: "reviews", label: "Para conferir" }, { id: "updates", label: "Atualizações" }];
  if (role === "marketing") return [{ id: "central", label: "Central do Marketing" }, { id: "agenda", label: "Agenda" }, { id: "updates", label: "Atualizações" }];
  return [{ id: "central", label: "Central do Marketing" }, { id: "agenda", label: "Agenda" }, { id: "request", label: "Novo pedido" }, { id: "updates", label: "Atualizações" }, { id: "access", label: "Equipes e acessos" }, { id: "deleted", label: "Excluídos" }];
}

function defaultTab(role: MarketingRole): MarketingTab {
  return role === "sales_manager" ? "request" : "central";
}

function roleLabel(role: MarketingRole) {
  return role === "admin" ? "Administração" : role === "marketing" ? "Equipe de Marketing" : "Gerente de Vendas";
}

function contentSummary(request: MarketingRequest) {
  return request.contentTypes.map((item) => contentLabels[item] || item).join(" + ");
}

function propertyLabel(request: MarketingRequest) {
  return request.hasPropertyCode ? request.propertyReference : "Sem código informado";
}

function exclusiveLabel(value: boolean | null) {
  if (value === null) return "Não informado";
  return value ? "SIM" : "NÃO";
}

function reviewReasonLabel(reason: MarketingManagerReviewReason) {
  return MARKETING_REVIEW_REASONS.find((item) => item.value === reason)?.label || "Outra divergência";
}

function managerReviewStatusLabel(status: MarketingManagerReview["status"]) {
  if (status === "confirmed") return "Dados confirmados";
  if (status === "modified") return "Pedido corrigido";
  if (status === "declined") return "Pedido declinado";
  return "Aguardando conferência";
}

function overrideStatusLabel(status: MarketingQueueOverrideRequest["status"], consumedAt?: string | null) {
  if (consumedAt) return "UTILIZADA";
  if (status === "approved") return "APROVADA";
  if (status === "rejected") return "ORDEM MANTIDA";
  return "AGUARDANDO ANÁLISE";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function safeOpen(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {
    // Link inválido: não abre nada.
  }
}
