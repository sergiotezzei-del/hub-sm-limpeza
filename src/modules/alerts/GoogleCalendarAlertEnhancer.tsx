import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clearGoogleCalendarCallbackFromUrl,
  completeGoogleCalendarAuthorization,
  disconnectGoogleCalendar,
  GoogleCalendarApiError,
  type GoogleCalendarEvent,
  type GoogleCalendarStatus,
  loadGoogleCalendarDay,
  loadGoogleCalendarStatus,
  readGoogleCalendarCallback,
  saveGoogleCalendarOAuthConfig,
  startGoogleCalendarAuthorization,
} from "./googleCalendarService";
import "./googleCalendarAlerts.css";

const EMPTY_STATUS: GoogleCalendarStatus = {
  configured: false,
  connected: false,
  googleEmail: "",
  calendarId: "primary",
  redirectUri: "https://hubsantamariatem.vercel.app/",
  javascriptOrigin: "https://hubsantamariatem.vercel.app",
  scope: "https://www.googleapis.com/auth/calendar.readonly",
};

export function GoogleCalendarAlertEnhancer() {
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [cardsHost, setCardsHost] = useState<HTMLElement | null>(null);
  const [headHost, setHeadHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const syncHosts = () => {
      const panel = document.querySelector<HTMLElement>(".hub-alert-panel");
      const cards = panel?.querySelector<HTMLElement>(".hub-google-calendar-slot") ?? null;
      const head = panel?.querySelector<HTMLElement>(".hub-alert-panel-head") ?? null;
      setPanelHost((current) => current === panel ? current : panel);
      setCardsHost((current) => current === cards ? current : cards);
      setHeadHost((current) => current === head ? current : head);
    };

    syncHosts();
    const root = document.getElementById("root");
    if (!root) return () => undefined;
    const observer = new MutationObserver(syncHosts);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!panelHost || !cardsHost || !headHost) return null;
  return <GoogleCalendarAlertPanel panelHost={panelHost} cardsHost={cardsHost} headHost={headHost} />;
}

function GoogleCalendarAlertPanel({ panelHost, cardsHost, headHost }: { panelHost: HTMLElement; cardsHost: HTMLElement; headHost: HTMLElement }) {
  const [status, setStatus] = useState<GoogleCalendarStatus>(EMPTY_STATUS);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const callbackStartedRef = useRef(false);

  const visibleEvents = useMemo(() => getRelevantEvents(events), [events]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);
      const callback = readGoogleCalendarCallback();
      if (callback && !callbackStartedRef.current) {
        callbackStartedRef.current = true;
        try {
          if (callback.error) throw new Error("A autorização da Agenda Google foi cancelada.");
          const connectedStatus = await completeGoogleCalendarAuthorization(callback.code, callback.state);
          clearGoogleCalendarCallbackFromUrl();
          if (!active) return;
          setStatus(connectedStatus);
          setMessage("Agenda Google conectada ao HUB.");
          const day = await loadGoogleCalendarDay();
          if (active) {
            setEvents(day.events);
            setLoading(false);
          }
          return;
        } catch (error) {
          clearGoogleCalendarCallbackFromUrl();
          if (active) setMessage(getErrorMessage(error));
        }
      }

      try {
        const currentStatus = await loadGoogleCalendarStatus();
        if (!active) return;
        setStatus(currentStatus);
        if (currentStatus.connected) {
          const day = await loadGoogleCalendarDay();
          if (active) setEvents(day.events);
        }
      } catch (error) {
        if (active) setMessage(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const emptyState = panelHost.querySelector<HTMLElement>(".hub-alert-empty");
    const kicker = panelHost.querySelector<HTMLElement>(".hub-alert-kicker");
    if (kicker) {
      if (!kicker.dataset.originalGoogleCalendarText) kicker.dataset.originalGoogleCalendarText = kicker.textContent ?? "";
      kicker.textContent = "PAINEL DO DIA";
    }
    if (emptyState) emptyState.style.display = visibleEvents.length > 0 ? "none" : "";
    return () => {
      if (emptyState) emptyState.style.display = "";
      if (kicker?.dataset.originalGoogleCalendarText) kicker.textContent = kicker.dataset.originalGoogleCalendarText;
    };
  }, [panelHost, visibleEvents.length]);

  async function refreshEvents() {
    setLoading(true);
    setMessage("");
    try {
      const currentStatus = await loadGoogleCalendarStatus();
      setStatus(currentStatus);
      if (!currentStatus.connected) {
        setEvents([]);
        return;
      }
      const day = await loadGoogleCalendarDay();
      setEvents(day.events);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveAndConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setMessage("Informe o Client ID e o Client Secret do Google.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const nextStatus = await saveGoogleCalendarOAuthConfig(clientId.trim(), clientSecret.trim());
      setStatus(nextStatus);
      setClientSecret("");
      await beginAuthorization();
    } catch (error) {
      setMessage(getErrorMessage(error));
      setSaving(false);
    }
  }

  async function beginAuthorization() {
    if (connecting) return;
    setConnecting(true);
    setMessage("");
    try {
      const result = await startGoogleCalendarAuthorization();
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage(getErrorMessage(error));
      setConnecting(false);
      setSaving(false);
    }
  }

  async function disconnect() {
    if (disconnecting || !window.confirm("Desconectar sua Agenda Google do HUB?")) return;
    setDisconnecting(true);
    setMessage("");
    try {
      const nextStatus = await disconnectGoogleCalendar();
      setStatus(nextStatus);
      setEvents([]);
      setMessage("Agenda Google desconectada.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setDisconnecting(false);
    }
  }

  const chip = (
    <button className={`google-calendar-chip ${status.connected ? "is-connected" : ""}`} type="button" onClick={() => setSettingsOpen(true)}>
      <span aria-hidden="true">📅</span>
      <span>{loading ? "Agenda..." : status.connected ? "Agenda Google" : status.configured ? "Conectar Agenda" : "Configurar Agenda"}</span>
    </button>
  );

  const cards = (
    <>
      {status.connected && (
        <div className="google-calendar-day-strip">
          <span>📅</span>
          <strong>Google Agenda</strong>
          <small>{loading ? "Atualizando..." : visibleEvents.length === 0 ? "Nenhum compromisso restante hoje" : `${visibleEvents.length} compromisso(s) restante(s) hoje`}</small>
          <button type="button" onClick={() => { void refreshEvents(); }} disabled={loading}>Atualizar</button>
        </div>
      )}

      {visibleEvents.map((calendarEvent) => (
        <article className={`hub-alert-card google-calendar-alert-card ${isEventHappeningNow(calendarEvent) ? "is-happening" : ""}`} key={`google-${calendarEvent.id}`}>
          <div className="hub-alert-card-status google-calendar-card-status">
            <span>{isEventHappeningNow(calendarEvent) ? "AGORA" : "AGENDA"}</span>
            <time>{formatCalendarEventTime(calendarEvent)}</time>
          </div>
          <h3>{calendarEvent.title}</h3>
          {calendarEvent.location && <p>📍 {calendarEvent.location}</p>}
          <small>{calendarEvent.allDay ? "Compromisso de dia inteiro" : formatCalendarEventRange(calendarEvent)}</small>
          {calendarEvent.htmlLink && (
            <button className="google-calendar-open-button" type="button" onClick={() => window.open(calendarEvent.htmlLink, "_blank", "noopener,noreferrer")}>ABRIR AGENDA</button>
          )}
        </article>
      ))}
    </>
  );

  return (
    <>
      {createPortal(chip, headHost)}
      {createPortal(cards, cardsHost)}
      {settingsOpen && createPortal(
        <div className="google-calendar-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="google-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="google-calendar-modal-title">
            <header>
              <div>
                <p>INTEGRAÇÃO</p>
                <h2 id="google-calendar-modal-title">Google Agenda</h2>
              </div>
              <button className="google-calendar-close" type="button" onClick={() => setSettingsOpen(false)} aria-label="Fechar">×</button>
            </header>

            {message && <p className="google-calendar-message" role="status">{message}</p>}

            {status.connected ? (
              <section className="google-calendar-connected-box">
                <strong>✓ Agenda conectada</strong>
                <span>{status.googleEmail || "Agenda principal do Google"}</span>
                <p>Os compromissos do dia aparecem automaticamente junto dos Alertas do HUB. O acesso é somente leitura.</p>
                <div>
                  <button type="button" className="google-calendar-primary" disabled={loading} onClick={() => { void refreshEvents(); }}>Atualizar agora</button>
                  <button type="button" className="google-calendar-danger" disabled={disconnecting} onClick={() => { void disconnect(); }}>{disconnecting ? "Desconectando..." : "Desconectar"}</button>
                </div>
              </section>
            ) : status.configured ? (
              <section className="google-calendar-connect-box">
                <strong>Credencial do Google configurada.</strong>
                <p>Agora falta somente você autorizar a leitura da sua agenda. O Google abrirá a tela de consentimento.</p>
                <button type="button" className="google-calendar-primary" disabled={connecting} onClick={() => { void beginAuthorization(); }}>{connecting ? "Abrindo Google..." : "Conectar minha Agenda Google"}</button>
                <button type="button" className="google-calendar-secondary" onClick={() => setStatus({ ...status, configured: false })}>Alterar credenciais</button>
              </section>
            ) : (
              <form className="google-calendar-config-form" onSubmit={saveAndConnect}>
                <p className="google-calendar-explainer">O Google exige uma credencial OAuth do tipo <strong>Aplicativo da Web</strong>. Ela é cadastrada uma única vez e fica protegida no Supabase Vault.</p>
                <a className="google-calendar-cloud-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Abrir Google Cloud → Credenciais</a>

                <div className="google-calendar-copy-box">
                  <small>Origem JavaScript autorizada</small>
                  <code>{status.javascriptOrigin}</code>
                  <button type="button" onClick={() => copyText(status.javascriptOrigin)}>Copiar</button>
                </div>
                <div className="google-calendar-copy-box">
                  <small>URI de redirecionamento autorizada</small>
                  <code>{status.redirectUri}</code>
                  <button type="button" onClick={() => copyText(status.redirectUri)}>Copiar</button>
                </div>

                <label>
                  Client ID
                  <input type="text" value={clientId} autoComplete="off" placeholder="...apps.googleusercontent.com" onChange={(event) => setClientId(event.target.value)} />
                </label>
                <label>
                  Client Secret
                  <input type="password" value={clientSecret} autoComplete="new-password" placeholder="Client Secret do Google" onChange={(event) => setClientSecret(event.target.value)} />
                </label>
                <button type="submit" className="google-calendar-primary" disabled={saving || connecting}>{saving || connecting ? "Preparando conexão..." : "Salvar e conectar Google"}</button>
                <small className="google-calendar-security-note">O HUB solicita apenas leitura da agenda. Ele não poderá criar, alterar ou excluir seus compromissos.</small>
              </form>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

function getRelevantEvents(events: GoogleCalendarEvent[]) {
  const now = Date.now();
  return events.filter((event) => {
    if (event.allDay) return true;
    const end = new Date(event.end).getTime();
    return !Number.isFinite(end) || end > now;
  });
}

function isEventHappeningNow(event: GoogleCalendarEvent) {
  if (event.allDay) return false;
  const now = Date.now();
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now;
}

function formatCalendarEventTime(event: GoogleCalendarEvent) {
  if (event.allDay) return "DIA TODO";
  const date = new Date(event.start);
  if (Number.isNaN(date.getTime())) return "HORÁRIO";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatCalendarEventRange(event: GoogleCalendarEvent) {
  if (event.allDay) return "Dia todo";
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime())) return "Horário não informado";
  const format = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (Number.isNaN(end.getTime())) return format.format(start);
  return `${format.format(start)} às ${format.format(end)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof GoogleCalendarApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível acessar a Agenda Google.";
}

function copyText(value: string) {
  if (!navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
