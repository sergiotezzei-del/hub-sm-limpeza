import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../components/AppIcon";
import {
  createMarketingRequest,
  getMarketingDashboard,
  getMarketingErrorMessage,
  MarketingDashboard,
  MarketingRequest,
  MarketingRequestStatus,
  MarketingRole,
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

const contentLabels: Record<string, string> = {
  video: "Vídeo",
  fotos: "Fotos",
  carrossel: "Carrossel",
  post_estatico: "Post estático",
  outro: "Outro",
};

type MarketingTab = "central" | "agenda" | "request" | "mine" | "access";

type RequestFormState = {
  teamId: string;
  brokerName: string;
  hasPropertyCode: boolean;
  propertyReference: string;
  requestKind: "capture_edit" | "edit_only";
  contentTypes: string[];
  captureLocation: string;
  preferredCaptureAt: string;
  assetLink: string;
  paidTraffic: boolean;
  requesterNotes: string;
  urgencyRequested: boolean;
  urgencyReason: string;
};

export type MarketingSummary = {
  newCount: number;
  urgencyCount: number;
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
  requestKind: "capture_edit",
  contentTypes: ["video"],
  captureLocation: "",
  preferredCaptureAt: "",
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
  const newCount = openRequests.filter((request) => request.status === "solicitado").length;
  const urgencyCount = openRequests.filter((request) => request.urgencyRequested && !request.urgencyDecidedAt).length;

  useEffect(() => {
    props.onSummaryChange({ newCount, urgencyCount });
  }, [newCount, props.onSummaryChange, urgencyCount]);

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
        {tabs.map((item) => <button type="button" key={item.id} className={props.tab === item.id ? "active" : ""} onClick={() => props.onTab(item.id)}>{item.label}</button>)}
      </nav>

      {props.error && <div className="marketing-message error">{props.error}</div>}
      {props.notice && <div className="marketing-message success">{props.notice}</div>}

      <main className="marketing-content">
        {props.tab === "central" && <CentralView dashboard={props.dashboard} onSelect={props.onSelect} />}
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
        {props.tab === "access" && (
          <AccessView sessionToken={props.sessionToken} dashboard={props.dashboard} onSaved={props.onRefresh} onError={props.onError} onNotice={props.onNotice} />
        )}
      </main>

      {props.selected && (
        <RequestDetail
          sessionToken={props.sessionToken}
          request={props.selected}
          role={role}
          onClose={() => props.onSelect(null)}
          onChanged={async () => { await props.onRefresh(); }}
          onError={props.onError}
          onNotice={props.onNotice}
        />
      )}
    </section>
  );
}

function CentralView({ dashboard, onSelect }: { dashboard: MarketingDashboard; onSelect: (request: MarketingRequest) => void }) {
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
      <section className="marketing-metrics">
        <Metric label="Novos pedidos" value={metrics.new} />
        <Metric label="Em produção" value={metrics.production} />
        <Metric label="Bloqueados" value={metrics.blocked} />
        <Metric label="Urgências para decidir" value={metrics.urgency} danger={metrics.urgency > 0} />
      </section>
      <section className="marketing-section-head"><div><h2>Fila de produção</h2><p>Ordem de entrada. Urgência só sobe quando aprovada pelo Tezzei.</p></div></section>
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

function AgendaView({ dashboard, onSelect }: { dashboard: MarketingDashboard; onSelect: (request: MarketingRequest) => void }) {
  const scheduled = dashboard.requests
    .filter((request) => request.status !== "cancelado" && (request.confirmedCaptureAt || request.preferredCaptureAt))
    .sort((a, b) => new Date(a.confirmedCaptureAt || a.preferredCaptureAt || 0).getTime() - new Date(b.confirmedCaptureAt || b.preferredCaptureAt || 0).getTime());
  return (
    <section className="marketing-agenda-view">
      <div className="marketing-section-head"><div><h2>Agenda de captação</h2><p>Data solicitada pelo gerente e confirmação do Marketing ficam separadas.</p></div></div>
      {scheduled.length === 0 ? <div className="marketing-empty"><h3>Nenhuma captação agendada.</h3><p>Os novos pedidos aparecem aqui assim que tiverem data.</p></div> : (
        <div className="marketing-agenda-list">
          {scheduled.map((request) => {
            const date = request.confirmedCaptureAt || request.preferredCaptureAt!;
            return (
              <button type="button" key={request.id} className="marketing-agenda-row" onClick={() => onSelect(request)}>
                <time>{formatDateTime(date)}</time>
                <div><strong>{request.brokerName} · {request.propertyReference}</strong><span>{request.managerName} · {request.captureLocation || "Local não informado"}</span></div>
                <em className={request.confirmedCaptureAt ? "confirmed" : "pending"}>{request.confirmedCaptureAt ? "CONFIRMADO" : "A CONFIRMAR"}</em>
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
        <div className="marketing-team-list">{requests.map((request) => <RequestCard key={request.id} request={request} onClick={() => onSelect(request)} />)}</div>
      )}
    </section>
  );
}

function RequestView(props: { sessionToken: string; dashboard: MarketingDashboard; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const role = props.dashboard.context.role;
  const initialTeam = role === "sales_manager" ? props.dashboard.context.teamId || "" : props.dashboard.teams[0]?.id || "";
  const [form, setForm] = useState<RequestFormState>(() => ({ ...emptyRequestForm(), teamId: initialTeam }));
  const [busy, setBusy] = useState(false);
  const teamBrokers = props.dashboard.brokers.filter((broker) => broker.teamId === form.teamId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    props.onError("");
    if (!form.teamId || !form.brokerName.trim() || !form.propertyReference.trim() || form.contentTypes.length === 0) {
      props.onError("Preencha equipe, corretor, imóvel e tipo de conteúdo.");
      return;
    }
    if (form.urgencyRequested && !form.urgencyReason.trim()) {
      props.onError("Explique o motivo da urgência. Ela não altera a fila até ser aprovada.");
      return;
    }
    setBusy(true);
    try {
      const result = await createMarketingRequest(props.sessionToken, form);
      const number = result?.[0]?.request_number;
      setForm({ ...emptyRequestForm(), teamId: initialTeam });
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
        <fieldset><legend>O imóvel já tem código?</legend><label><input type="radio" checked={form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: true })} /> Sim</label><label><input type="radio" checked={!form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: false })} /> Ainda não</label></fieldset>
        <label className="span-2">Código do imóvel e/ou descrição<input value={form.propertyReference} onChange={(event) => setForm({ ...form, propertyReference: event.target.value })} placeholder="Ex.: 78119 ou Lançamento Verano" required /></label>
        <fieldset className="span-2"><legend>O que precisa?</legend><label><input type="radio" checked={form.requestKind === "capture_edit"} onChange={() => setForm({ ...form, requestKind: "capture_edit" })} /> Captação + edição</label><label><input type="radio" checked={form.requestKind === "edit_only"} onChange={() => setForm({ ...form, requestKind: "edit_only" })} /> Somente edição</label></fieldset>
        <fieldset className="span-2"><legend>Tipo de conteúdo</legend>{Object.entries(contentLabels).map(([value, label]) => <label key={value}><input type="checkbox" checked={form.contentTypes.includes(value)} onChange={() => toggleContent(value)} /> {label}</label>)}</fieldset>
        {form.requestKind === "capture_edit" && <><label>Onde será a captação?<input value={form.captureLocation} onChange={(event) => setForm({ ...form, captureLocation: event.target.value })} placeholder="Endereço / empreendimento" /></label><label>Data e hora desejada<input type="datetime-local" value={form.preferredCaptureAt} onChange={(event) => setForm({ ...form, preferredCaptureAt: event.target.value })} /></label></>}
        <label className="span-2">Link dos arquivos, se já existirem<input type="url" value={form.assetLink} onChange={(event) => setForm({ ...form, assetLink: event.target.value })} placeholder="Google Drive, OneDrive..." /></label>
        <label className="marketing-check span-2"><input type="checkbox" checked={form.paidTraffic} onChange={(event) => setForm({ ...form, paidTraffic: event.target.checked })} /> O conteúdo será usado para tráfego pago</label>
        <label className="marketing-check span-2 urgent"><input type="checkbox" checked={form.urgencyRequested} onChange={(event) => setForm({ ...form, urgencyRequested: event.target.checked })} /> Solicitar urgência <small>Não muda a fila automaticamente.</small></label>
        {form.urgencyRequested && <label className="span-2">Motivo da urgência<textarea value={form.urgencyReason} onChange={(event) => setForm({ ...form, urgencyReason: event.target.value })} placeholder="Explique por que este trabalho precisa furar a fila." /></label>}
        <label className="span-2">Observações<textarea value={form.requesterNotes} onChange={(event) => setForm({ ...form, requesterNotes: event.target.value })} placeholder="Somente o que o Marketing precisa saber." /></label>
        <div className="marketing-form-footer span-2"><span>A data de entrega será definida pelo Marketing. Nesta primeira fase ainda não há SLA automático.</span><button type="submit" disabled={busy}>{busy ? "Enviando..." : "ENVIAR PEDIDO"}</button></div>
      </form>
    </section>
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

function RequestDetail(props: { sessionToken: string; request: MarketingRequest; role: MarketingRole; onClose: () => void; onChanged: () => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<MarketingRequestStatus>(props.request.status);
  const [confirmed, setConfirmed] = useState(toLocalDateTime(props.request.confirmedCaptureAt));
  const [promised, setPromised] = useState(toLocalDateTime(props.request.promisedAt));
  const [assigned, setAssigned] = useState(props.request.assignedMarketingName || "");
  const [notes, setNotes] = useState(props.request.marketingNotes || "");
  const [busy, setBusy] = useState(false);
  const canManage = props.role === "admin" || props.role === "marketing";

  async function run(action: "save_management" | "approve_urgency" | "reject_urgency" | "cancel", payload: Record<string, unknown> = {}) {
    setBusy(true);
    props.onError("");
    try {
      await updateMarketingRequest(props.sessionToken, props.request.id, action, payload);
      props.onNotice(action === "approve_urgency" ? "Urgência aprovada." : action === "reject_urgency" ? "Pedido mantido na fila normal." : action === "cancel" ? "Pedido cancelado." : "Pedido atualizado pelo Marketing.");
      await props.onChanged();
      if (action === "cancel") props.onClose();
    } catch (error) {
      props.onError(getMarketingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="marketing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="marketing-request-modal" role="dialog" aria-modal="true">
        <header><div><small>PEDIDO #{props.request.requestNumber}</small><h2>{props.request.brokerName}</h2><p>{props.request.managerName} · {props.request.propertyReference}</p></div><button type="button" onClick={props.onClose}>×</button></header>
        <div className="marketing-detail-grid">
          <Detail label="Pedido" value={props.request.requestKind === "capture_edit" ? "Captação + edição" : "Somente edição"} />
          <Detail label="Conteúdo" value={contentSummary(props.request)} />
          <Detail label="Entrada" value={formatDateTime(props.request.createdAt)} />
          <Detail label="Status" value={statusLabels[props.request.status]} />
          {props.request.preferredCaptureAt && <Detail label="Data solicitada" value={formatDateTime(props.request.preferredCaptureAt)} />}
          {props.request.captureLocation && <Detail label="Local" value={props.request.captureLocation} />}
          {props.request.assetLink && <div className="marketing-detail"><span>Arquivos</span><button className="marketing-link-button" type="button" onClick={() => safeOpen(props.request.assetLink!)}>Abrir link</button></div>}
          <Detail label="Tráfego pago" value={props.request.paidTraffic ? "Sim" : "Não"} />
        </div>
        {props.request.requesterNotes && <div className="marketing-note-box"><strong>Observação do pedido</strong><p>{props.request.requesterNotes}</p></div>}
        {props.request.urgencyRequested && <div className={`marketing-urgency-box ${props.request.urgencyApproved ? "approved" : ""}`}><strong>Urgência solicitada</strong><p>{props.request.urgencyReason}</p><small>{props.request.urgencyDecidedAt ? `${props.request.urgencyApproved ? "Aprovada" : "Mantida na fila normal"} por ${props.request.urgencyDecidedByName || "Admin"}` : "Aguardando decisão do Tezzei"}</small>{props.role === "admin" && !props.request.urgencyDecidedAt && <div><button type="button" disabled={busy} onClick={() => void run("approve_urgency")}>APROVAR PRIORIDADE</button><button type="button" disabled={busy} onClick={() => void run("reject_urgency")}>MANTER FILA</button></div>}</div>}
        {canManage && <form className="marketing-management-form" onSubmit={(event) => { event.preventDefault(); void run("save_management", { status, confirmedCaptureAt: confirmed ? new Date(confirmed).toISOString() : "", promisedAt: promised ? new Date(promised).toISOString() : "", assignedMarketingName: assigned, marketingNotes: notes }); }}>
          <h3>Controle do Marketing</h3>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as MarketingRequestStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Captação confirmada<input type="datetime-local" value={confirmed} onChange={(event) => setConfirmed(event.target.value)} /></label>
          <label>Previsão de entrega<input type="datetime-local" value={promised} onChange={(event) => setPromised(event.target.value)} /></label>
          <label>Responsável no Marketing<input value={assigned} onChange={(event) => setAssigned(event.target.value)} placeholder="Maria, Arthur..." /></label>
          <label className="span-2">Observação interna<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bloqueio, retorno do corretor, ajuste solicitado..." /></label>
          <button className="span-2" type="submit" disabled={busy}>{busy ? "Salvando..." : "SALVAR CONTROLE"}</button>
        </form>}
        {!canManage && !["pronto", "cancelado"].includes(props.request.status) && <button type="button" className="marketing-cancel-request" disabled={busy} onClick={() => void run("cancel")}>Cancelar pedido</button>}
      </section>
    </div>,
    document.body,
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <article className={danger ? "danger" : ""}><span>{label}</span><strong>{value}</strong></article>;
}

function RequestCard({ request, onClick }: { request: MarketingRequest; onClick: () => void }) {
  return (
    <button type="button" className={`marketing-request-card ${request.urgencyApproved ? "priority" : ""}`} onClick={onClick}>
      <div><small>#{request.requestNumber} · {request.managerName}</small>{request.urgencyApproved && <em>PRIORIDADE</em>}</div>
      <strong>{request.brokerName}</strong>
      <span>{request.propertyReference}</span>
      <p>{contentSummary(request)}</p>
      <footer><span>{request.assignedMarketingName || "Não atribuído"}</span><time>{request.promisedAt ? `Entrega ${formatShortDate(request.promisedAt)}` : request.confirmedCaptureAt ? `Captação ${formatShortDate(request.confirmedCaptureAt)}` : "Sem previsão"}</time></footer>
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="marketing-detail"><span>{label}</span><strong>{value}</strong></div>;
}

function availableTabs(role: MarketingRole): Array<{ id: MarketingTab; label: string }> {
  if (role === "sales_manager") return [{ id: "request", label: "Novo pedido" }, { id: "mine", label: "Minha equipe" }];
  if (role === "marketing") return [{ id: "central", label: "Central do Marketing" }, { id: "agenda", label: "Agenda" }];
  return [{ id: "central", label: "Central do Marketing" }, { id: "agenda", label: "Agenda" }, { id: "request", label: "Novo pedido" }, { id: "access", label: "Equipes e acessos" }];
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
