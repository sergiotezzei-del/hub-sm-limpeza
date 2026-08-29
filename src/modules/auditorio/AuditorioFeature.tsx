import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppIcon } from "../../components/AppIcon";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import type { ManagedUser, UserPermission } from "../../types";
import {
  decideAuditorioReservation,
  getAdminAuditorioErrorMessage,
  loadAuditorioDashboard,
  markAuditorioNotificationsRead,
} from "./services/auditorioService";
import type {
  AuditorioDashboard,
  AuditorioDecision,
  AuditorioReservation,
  AuditorioStatus,
} from "./types/auditorio.types";
import "./auditorio.css";

const REFRESH_MS = 20000;

type AuditorioTab = "agenda" | "solicitacoes" | "historico";
type StatusFilter = "all" | AuditorioStatus;
type LoadState = "loading" | "ready" | "error";

type AuditorioFeatureProps = {
  currentUser: ManagedUser;
  permissions: UserPermission[];
  onBack: () => void;
  onLogout: () => void;
};

const emptyDashboard: AuditorioDashboard = {
  reservations: [],
  events: [],
  notifications: [],
  generatedAt: "",
};

const statusLabels: Record<AuditorioStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

export function AuditorioFeature({ currentUser, permissions, onBack, onLogout }: AuditorioFeatureProps) {
  const canAccess = permissions.includes("auditorio") || permissions.includes("painel-admin");
  const [dashboard, setDashboard] = useState<AuditorioDashboard>(emptyDashboard);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<AuditorioTab>("agenda");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendente");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const selected = useMemo(
    () => dashboard.reservations.find((reservation) => reservation.id === selectedId) ?? null,
    [dashboard.reservations, selectedId],
  );

  const unreadNotifications = useMemo(
    () => dashboard.notifications.filter((notification) => !notification.readAt),
    [dashboard.notifications],
  );

  const metrics = useMemo(() => {
    const now = new Date();
    const today = toDateInput(now);
    return {
      pending: dashboard.reservations.filter((reservation) => reservation.status === "pendente").length,
      approvedUpcoming: dashboard.reservations.filter((reservation) => reservation.status === "aprovado" && new Date(reservation.reservationEnd) >= now).length,
      today: dashboard.reservations.filter((reservation) => reservation.status === "aprovado" && reservation.eventDate === today).length,
      refused: dashboard.reservations.filter((reservation) => reservation.status === "recusado").length,
    };
  }, [dashboard.reservations]);

  const filteredRequests = useMemo(() => {
    const query = normalize(search);
    return dashboard.reservations
      .filter((reservation) => {
        if (statusFilter !== "all" && reservation.status !== statusFilter) return false;
        if (dateFrom && reservation.eventDate < dateFrom) return false;
        if (dateTo && reservation.eventDate > dateTo) return false;
        if (!query) return true;
        return normalize([
          reservation.protocol,
          reservation.eventName,
          reservation.requesterName,
          reservation.requesterDepartment,
          reservation.requesterCompany,
          reservation.eventTypeLabel,
        ].filter(Boolean).join(" ")).includes(query);
      })
      .sort(sortReservationsForWork);
  }, [dashboard.reservations, dateFrom, dateTo, search, statusFilter]);

  const monthlyReservations = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    return dashboard.reservations
      .filter((reservation) => {
        const date = parseDateInput(reservation.eventDate);
        return date.getFullYear() === year && date.getMonth() === month;
      })
      .sort((first, second) => first.eventDate.localeCompare(second.eventDate) || first.setupTime.localeCompare(second.setupTime));
  }, [dashboard.reservations, monthDate]);

  const reservationsByDate = useMemo(() => {
    const grouped = new Map<string, AuditorioReservation[]>();
    for (const reservation of monthlyReservations) {
      const list = grouped.get(reservation.eventDate) ?? [];
      list.push(reservation);
      grouped.set(reservation.eventDate, list);
    }
    return grouped;
  }, [monthlyReservations]);

  const historyReservations = useMemo(() => {
    const now = new Date();
    return dashboard.reservations
      .filter((reservation) => (
        reservation.status === "recusado"
        || reservation.status === "cancelado"
        || reservation.status === "concluido"
        || (reservation.status === "aprovado" && new Date(reservation.reservationEnd) < now)
      ))
      .sort((first, second) => second.eventDate.localeCompare(first.eventDate) || second.setupTime.localeCompare(first.setupTime));
  }, [dashboard.reservations]);

  useEffect(() => {
    if (!canAccess) return;
    let active = true;
    let busy = false;

    const refreshSafely = async (showLoading = false) => {
      if (busy) return;
      busy = true;
      if (showLoading) setLoadState("loading");
      try {
        const next = await loadAuditorioDashboard();
        if (!active) return;
        setDashboard(next);
        setLoadState("ready");
      } catch (error) {
        if (!active) return;
        setLoadState("error");
        setNotice(getAdminAuditorioErrorMessage(error));
      } finally {
        busy = false;
      }
    };

    void refreshSafely(true);
    const interval = window.setInterval(() => { void refreshSafely(false); }, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [canAccess]);

  useEffect(() => {
    if (!selected) return;
    setAdminNote(selected.adminNote ?? "");
  }, [selected]);

  if (!canAccess) {
    return (
      <section className="screen auditorio-admin-screen">
        <AuditorioTopBar title="Auditório" subtitle="Acesso restrito." onBack={onBack} onLogout={onLogout} />
        <section className="empty-state">
          <h2>Você não tem acesso ao módulo Auditório.</h2>
          <p>Solicite a permissão ao admin.</p>
        </section>
      </section>
    );
  }

  async function refresh() {
    setNotice("");
    setLoadState("loading");
    try {
      setDashboard(await loadAuditorioDashboard());
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setNotice(getAdminAuditorioErrorMessage(error));
    }
  }

  function openDetails(reservation: AuditorioReservation) {
    setSelectedId(reservation.id);
    setAdminNote(reservation.adminNote ?? "");
    setNotice("");
  }

  function closeDetails() {
    if (busyId) return;
    setSelectedId(null);
    setAdminNote("");
  }

  async function runDecision(decision: AuditorioDecision) {
    if (!selected || busyId) return;
    if (decision === "recusar" && !adminNote.trim()) {
      setNotice("Informe uma observação para recusar a solicitação.");
      return;
    }

    setBusyId(selected.id);
    setNotice("");
    try {
      await decideAuditorioReservation({
        reservationId: selected.id,
        decision,
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        note: adminNote,
      });
      await refresh();
      setNotice(getDecisionSuccessMessage(decision));
    } catch (error) {
      setNotice(getAdminAuditorioErrorMessage(error));
    } finally {
      setBusyId("");
    }
  }

  async function markNotifications() {
    if (unreadNotifications.length === 0) return;
    setNotice("");
    try {
      await markAuditorioNotificationsRead(unreadNotifications.map((notification) => notification.id));
      await refresh();
      setNotice("Notificações do Auditório marcadas como lidas.");
    } catch (error) {
      setNotice(getAdminAuditorioErrorMessage(error));
    }
  }

  async function copyPublicLink() {
    const link = `${window.location.origin}/auditorio`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      setNotice(`Link público: ${link}`);
    }
  }

  function changeMonth(offset: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <section className="screen auditorio-admin-screen">
      <AuditorioTopBar
        title="Auditório"
        subtitle="Agenda, solicitações e histórico de uso do auditório."
        onBack={onBack}
        onLogout={onLogout}
      />

      <section className="auditorio-admin-hero">
        <div>
          <p className="auditorio-admin-eyebrow">Agenda operacional</p>
          <h1>Agendamento e uso do auditório</h1>
          <p>Solicitações entram como pendentes e só bloqueiam a agenda depois da aprovação.</p>
        </div>
        <div className="auditorio-admin-actions">
          <button className="ghost-button" type="button" onClick={copyPublicLink}>
            <AppIcon name="qr" size="sm" className="action-icon" />
            {linkCopied ? "Link copiado" : "Copiar link público"}
          </button>
          <button className="ghost-button" type="button" onClick={() => { void refresh(); }}>
            <AppIcon name="success" size="sm" className="action-icon" />
            Atualizar
          </button>
        </div>
      </section>

      {notice && <p className="notice-message auditorio-admin-notice">{notice}</p>}

      {unreadNotifications.length > 0 && (
        <button className="alert-banner auditorio-alert-banner" type="button" onClick={markNotifications}>
          <AppIcon name="warning" size="sm" className="action-icon" />
          {unreadNotifications.length} nova{unreadNotifications.length > 1 ? "s" : ""} solicitação{unreadNotifications.length > 1 ? "ões" : ""} de auditório
        </button>
      )}

      <section className="auditorio-metrics" aria-label="Resumo do auditório">
        <MetricCard label="Pendentes" value={metrics.pending} tone="warning" />
        <MetricCard label="Próximas aprovadas" value={metrics.approvedUpcoming} tone="success" />
        <MetricCard label="Hoje" value={metrics.today} tone="info" />
        <MetricCard label="Recusadas" value={metrics.refused} tone="danger" />
      </section>

      <nav className="auditorio-admin-tabs" aria-label="Áreas do módulo Auditório">
        <button className={tab === "agenda" ? "active" : ""} type="button" onClick={() => setTab("agenda")}>Agenda</button>
        <button className={tab === "solicitacoes" ? "active" : ""} type="button" onClick={() => setTab("solicitacoes")}>Solicitações</button>
        <button className={tab === "historico" ? "active" : ""} type="button" onClick={() => setTab("historico")}>Histórico</button>
      </nav>

      {loadState === "loading" && (
        <section className="empty-state"><h2>Carregando Auditório...</h2></section>
      )}

      {loadState === "error" && (
        <section className="empty-state">
          <h2>Não foi possível carregar o módulo.</h2>
          <p>{notice}</p>
          <button className="primary-action" type="button" onClick={() => { void refresh(); }}>Tentar novamente</button>
        </section>
      )}

      {loadState === "ready" && tab === "agenda" && (
        <section className="auditorio-admin-panel">
          <div className="auditorio-panel-head">
            <div>
              <p className="auditorio-admin-eyebrow">Calendário interno</p>
              <h2>{formatMonth(monthDate)}</h2>
            </div>
            <div className="auditorio-month-actions">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">‹</button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês">›</button>
            </div>
          </div>

          <section className="auditorio-admin-calendar">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <span className="auditorio-weekday" key={day}>{day}</span>)}
            {buildCalendarDays(monthDate).map((day) => {
              const dayReservations = reservationsByDate.get(day.value) ?? [];
              return (
                <article className={`auditorio-admin-day ${day.currentMonth ? "" : "muted"}`} key={day.value}>
                  <strong>{day.label}</strong>
                  <div>
                    {dayReservations.slice(0, 3).map((reservation) => (
                      <button className={`auditorio-calendar-event status-${reservation.status}`} key={reservation.id} type="button" onClick={() => openDetails(reservation)}>
                        <span>{reservation.setupTime} às {reservation.teardownTime}</span>
                        <b>{reservation.eventName}</b>
                        <small>{reservation.requesterName} · {statusLabels[reservation.status]}</small>
                      </button>
                    ))}
                    {dayReservations.length > 3 && <small className="auditorio-more-events">+{dayReservations.length - 3} evento(s)</small>}
                  </div>
                </article>
              );
            })}
          </section>
        </section>
      )}

      {loadState === "ready" && tab === "solicitacoes" && (
        <section className="auditorio-admin-panel">
          <div className="auditorio-panel-head">
            <div>
              <p className="auditorio-admin-eyebrow">Fila de análise</p>
              <h2>Solicitações</h2>
            </div>
          </div>

          <section className="auditorio-filters" aria-label="Filtros">
            <label>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">Todos</option>
                <option value="pendente">Pendentes</option>
                <option value="aprovado">Aprovados</option>
                <option value="recusado">Recusados</option>
                <option value="cancelado">Cancelados</option>
                <option value="concluido">Concluídos</option>
              </select>
            </label>
            <label>
              <span>De</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              <span>Até</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label>
              <span>Busca</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Evento, solicitante ou protocolo" />
            </label>
          </section>

          <section className="auditorio-request-list">
            {filteredRequests.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} onOpen={() => openDetails(reservation)} />
            ))}
            {filteredRequests.length === 0 && <section className="empty-state"><h2>Nenhuma solicitação encontrada.</h2></section>}
          </section>
        </section>
      )}

      {loadState === "ready" && tab === "historico" && (
        <section className="auditorio-admin-panel">
          <div className="auditorio-panel-head">
            <div>
              <p className="auditorio-admin-eyebrow">Histórico</p>
              <h2>Reservas encerradas, recusadas ou canceladas</h2>
            </div>
          </div>

          <section className="auditorio-history-list">
            {historyReservations.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} compact onOpen={() => openDetails(reservation)} />
            ))}
            {historyReservations.length === 0 && <section className="empty-state"><h2>Nenhum histórico ainda.</h2></section>}
          </section>
        </section>
      )}

      {selected && (
        <ReservationDetailModal
          reservation={selected}
          adminNote={adminNote}
          busy={busyId === selected.id}
          onNoteChange={setAdminNote}
          onClose={closeDetails}
          onDecision={runDecision}
        />
      )}
    </section>
  );
}

function AuditorioTopBar({ title, subtitle, onBack, onLogout }: { title: string; subtitle: string; onBack: () => void; onLogout: () => void }) {
  return (
    <header className="auditorio-topbar">
      <div className="auditorio-topbar-title">
        <SantaMariaBrand className="auditorio-topbar-logo panel-corner-brand" />
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="screen-action-row">
        <button className="ghost-button" type="button" onClick={onBack}>
          <AppIcon name="back" size="sm" className="action-icon" />
          Voltar
        </button>
        <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "info" | "danger" }) {
  return (
    <article className={`auditorio-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ReservationCard({ reservation, onOpen, compact = false }: { reservation: AuditorioReservation; onOpen: () => void; compact?: boolean }) {
  return (
    <article className={`auditorio-request-card ${compact ? "compact" : ""}`}>
      <div className="auditorio-request-card-head">
        <span className={`auditorio-status-pill status-${reservation.status}`}>{statusLabels[reservation.status]}</span>
        <small>{reservation.protocol}</small>
      </div>
      <h3>{reservation.eventName}</h3>
      <dl>
        <div><dt>Data</dt><dd>{formatShortDate(reservation.eventDate)}</dd></div>
        <div><dt>Horário</dt><dd>{reservation.setupTime} às {reservation.teardownTime}</dd></div>
        <div><dt>Solicitante</dt><dd>{reservation.requesterName}</dd></div>
        <div><dt>Público</dt><dd>{reservation.peopleCount} pessoas</dd></div>
      </dl>
      <button className="ghost-button" type="button" onClick={onOpen}>Abrir detalhes</button>
    </article>
  );
}

function ReservationDetailModal({
  reservation,
  adminNote,
  busy,
  onNoteChange,
  onClose,
  onDecision,
}: {
  reservation: AuditorioReservation;
  adminNote: string;
  busy: boolean;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onDecision: (decision: AuditorioDecision) => void | Promise<void>;
}) {
  return (
    <div className="auditorio-modal-backdrop" role="presentation">
      <section className="auditorio-modal" role="dialog" aria-modal="true" aria-labelledby="auditorio-detail-title">
        <header className="auditorio-modal-head">
          <div>
            <span className={`auditorio-status-pill status-${reservation.status}`}>{statusLabels[reservation.status]}</span>
            <h2 id="auditorio-detail-title">{reservation.eventName}</h2>
            <p>{reservation.protocol} · {formatShortDate(reservation.eventDate)} · {reservation.setupTime} às {reservation.teardownTime}</p>
          </div>
          <button className="auditorio-icon-button" type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="auditorio-detail-grid">
          <DetailSection title="Solicitante">
            <DetailItem label="Nome" value={reservation.requesterName} />
            <DetailItem label="Contato" value={reservation.requesterPhone} />
            <DetailItem label="E-mail" value={reservation.requesterEmail || "Não informado"} />
            <DetailItem label="Setor" value={reservation.requesterDepartment || "Não informado"} />
            <DetailItem label="Empresa" value={reservation.requesterCompany || "Não informado"} />
          </DetailSection>

          <DetailSection title="Evento">
            <DetailItem label="Tipo" value={reservation.eventTypeLabel} />
            <DetailItem label="Nome do lançamento" value={reservation.launchName || "Não se aplica"} />
            <DetailItem label="Construtora" value={reservation.builderName || "Não se aplica"} />
            <DetailItem label="Data" value={formatDate(reservation.eventDate)} />
            <DetailItem label="Público estimado" value={`${reservation.peopleCount} pessoas`} />
          </DetailSection>

          <DetailSection title="Horários">
            <DetailItem label="Montagem" value={reservation.setupTime} />
            <DetailItem label="Início do evento" value={reservation.startTime} />
            <DetailItem label="Término do evento" value={reservation.endTime} />
            <DetailItem label="Desmontagem" value={reservation.teardownTime} />
            <DetailItem label="Período reservado" value={`${reservation.setupTime} às ${reservation.teardownTime}`} />
          </DetailSection>

          <DetailSection title="Alimentação">
            <DetailItem label="Tipo" value={reservation.foodTypeLabel} />
            <DetailItem label="Responsável" value={reservation.foodResponsibleLabel || "Não se aplica"} />
          </DetailSection>

          <DetailSection title="Estrutura">
            <DetailItem label="Projetor / TV" value={yesNo(reservation.needsProjector)} />
            <DetailItem label="Microfone" value={yesNo(reservation.needsMicrophone)} />
            <DetailItem label="Sistema de som" value={yesNo(reservation.needsSound)} />
            <DetailItem label="Cadeiras" value={yesNo(reservation.needsChairs)} />
            <DetailItem label="Mesas" value={yesNo(reservation.needsTables)} />
            <DetailItem label="Necessidade especial" value={reservation.specialNeeds || "Não informado"} />
          </DetailSection>

          <DetailSection title="Observações">
            <DetailItem label="Solicitante" value={reservation.notes || "Sem observações"} wide />
            <DetailItem label="Administração" value={reservation.adminNote || "Sem observação administrativa"} wide />
          </DetailSection>
        </div>

        <section className="auditorio-admin-decision">
          <label>
            <span>Observação administrativa</span>
            <textarea
              value={adminNote}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Ex.: Aprovado. Auditório liberado a partir das 17h30 para montagem."
              rows={4}
            />
          </label>
          <div className="auditorio-decision-actions">
            {reservation.status === "pendente" && (
              <>
                <button className="auditorio-approve-button" type="button" disabled={busy} onClick={() => { void onDecision("aprovar"); }}>Aprovar</button>
                <button className="auditorio-refuse-button" type="button" disabled={busy} onClick={() => { void onDecision("recusar"); }}>Recusar</button>
              </>
            )}
            {reservation.status === "aprovado" && (
              <>
                <button className="auditorio-approve-button" type="button" disabled={busy} onClick={() => { void onDecision("concluir"); }}>Concluir</button>
                <button className="auditorio-refuse-button" type="button" disabled={busy} onClick={() => { void onDecision("cancelar"); }}>Cancelar reserva</button>
              </>
            )}
            <button className="ghost-button" type="button" disabled={busy} onClick={onClose}>Fechar</button>
          </div>
        </section>
      </section>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="auditorio-detail-section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

function DetailItem({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "wide" : ""}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      value: toDateInput(date),
      label: String(date.getDate()),
      currentMonth: date.getMonth() === month,
    };
  });
}

function sortReservationsForWork(first: AuditorioReservation, second: AuditorioReservation) {
  const statusPriority: Record<AuditorioStatus, number> = {
    pendente: 0,
    aprovado: 1,
    recusado: 2,
    cancelado: 3,
    concluido: 4,
  };
  return statusPriority[first.status] - statusPriority[second.status]
    || first.eventDate.localeCompare(second.eventDate)
    || first.setupTime.localeCompare(second.setupTime);
}

function getDecisionSuccessMessage(decision: AuditorioDecision) {
  if (decision === "aprovar") return "Solicitação aprovada e período reservado na agenda.";
  if (decision === "recusar") return "Solicitação recusada.";
  if (decision === "cancelar") return "Reserva cancelada.";
  return "Reserva concluída.";
}

function yesNo(value: boolean) {
  return value ? "Sim" : "Não";
}

function parseDateInput(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "America/Sao_Paulo",
  }).format(parseDateInput(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(parseDateInput(value));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
