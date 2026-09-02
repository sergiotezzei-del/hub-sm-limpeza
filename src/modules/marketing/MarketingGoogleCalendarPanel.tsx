import { useEffect, useRef, useState } from "react";
import {
  clearMarketingGoogleCalendarCallbackFromUrl,
  completeMarketingGoogleCalendarAuthorization,
  disconnectMarketingGoogleCalendar,
  loadMarketingGoogleCalendarStatus,
  MarketingGoogleCalendarApiError,
  type MarketingGoogleCalendarStatus,
  readMarketingGoogleCalendarCallback,
  startMarketingGoogleCalendarAuthorization,
} from "./marketingGoogleCalendarService";
import "./marketingGoogleCalendar.css";

type BridgeProps = {
  sessionToken: string;
  currentUserId: string;
  onConnected: (message: string) => void;
  onError: (message: string) => void;
};

export function MarketingGoogleCalendarBridge(props: BridgeProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    const callback = readMarketingGoogleCalendarCallback();
    if (!callback) return;
    startedRef.current = true;

    void (async () => {
      try {
        if (!props.sessionToken) throw new Error("Sua sessão do Marketing não está disponível.");
        const status = await completeMarketingGoogleCalendarAuthorization(
          props.sessionToken,
          callback.code,
          callback.state,
          callback.error,
        );
        clearMarketingGoogleCalendarCallbackFromUrl();
        const own = status.users.find((item) => item.userId === props.currentUserId);
        props.onConnected(`Google Agenda conectada${own?.googleEmail ? `: ${own.googleEmail}` : ""}.`);
      } catch (error) {
        clearMarketingGoogleCalendarCallbackFromUrl();
        props.onError(getCalendarErrorMessage(error));
      }
    })();
  }, [props]);

  return null;
}

type PanelProps = {
  sessionToken: string;
  currentUserId: string;
  role: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function MarketingGoogleCalendarPanel(props: PanelProps) {
  const [status, setStatus] = useState<MarketingGoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await loadMarketingGoogleCalendarStatus(props.sessionToken);
        if (active) setStatus(next);
      } catch (error) {
        if (active) props.onError(getCalendarErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [props.sessionToken]);

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    props.onError("");
    try {
      const result = await startMarketingGoogleCalendarAuthorization(props.sessionToken);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      props.onError(getCalendarErrorMessage(error));
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (disconnecting) return;
    if (!window.confirm("Desconectar sua Agenda Google do Marketing? Os compromissos já criados no Google não serão apagados.")) return;
    setDisconnecting(true);
    props.onError("");
    try {
      const next = await disconnectMarketingGoogleCalendar(props.sessionToken);
      setStatus(next);
      props.onNotice("Google Agenda desconectada do Marketing.");
    } catch (error) {
      props.onError(getCalendarErrorMessage(error));
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading && !status) {
    return <section className="marketing-google-card loading"><strong>Google Agenda</strong><span>Carregando integração...</span></section>;
  }
  if (!status) return null;

  const isAdmin = props.currentUserId === "tezzei" || props.role === "admin";
  const own = status.users.find((item) => item.userId === props.currentUserId);

  if (!isAdmin && !status.canConnect && !own) return null;

  return (
    <section className="marketing-google-panel">
      <header>
        <div>
          <small>INTEGRAÇÃO</small>
          <h2>Google Agenda</h2>
          <p>Captações confirmadas são enviadas automaticamente para a agenda do responsável.</p>
        </div>
        <span className="marketing-google-badge">GOOGLE</span>
      </header>

      {isAdmin ? (
        <div className="marketing-google-users">
          {status.users.map((user) => (
            <article key={user.userId} className={user.connected ? "connected" : "disconnected"}>
              <div>
                <span className="marketing-google-dot" aria-hidden="true" />
                <div><strong>{user.userName}</strong><small>{user.connected ? user.googleEmail || "Agenda conectada" : "Ainda não conectou a agenda"}</small></div>
              </div>
              <em>{user.connected ? "CONECTADA" : "AGUARDANDO"}</em>
              {user.lastError && <p className="marketing-google-error">{user.lastError}</p>}
              {user.connected && <small className="marketing-google-sync">{user.lastSyncedAt ? `Última sincronização: ${formatDateTime(user.lastSyncedAt)}` : "Pronta para sincronizar os próximos agendamentos."}</small>}
            </article>
          ))}
          <p className="marketing-google-admin-note">Maria e Arthur conectam a própria conta pelo login deles. Você acompanha aqui se cada agenda está ativa.</p>
        </div>
      ) : own ? (
        <div className={`marketing-google-own ${own.connected ? "connected" : "disconnected"}`}>
          {own.connected ? (
            <>
              <div className="marketing-google-connected-line"><span>✓</span><div><strong>Minha agenda está conectada</strong><small>{own.googleEmail || "Agenda principal do Google"}</small></div></div>
              <p>Quando um pedido confirmado estiver atribuído a <b>{own.userName}</b>, o HUB cria ou atualiza o compromisso automaticamente no Google Agenda. Reagendamento, troca de responsável e cancelamento também são sincronizados.</p>
              {own.lastError && <p className="marketing-google-error">{own.lastError}</p>}
              <div className="marketing-google-actions">
                <button type="button" onClick={() => window.open("https://calendar.google.com/calendar/u/0/r", "_blank", "noopener,noreferrer")}>ABRIR GOOGLE AGENDA</button>
                <button type="button" className="secondary" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? "Desconectando..." : "DESCONECTAR"}</button>
              </div>
            </>
          ) : (
            <>
              <strong>Conecte sua Agenda Google</strong>
              <p>Você fará login diretamente no Google e autorizará o HUB a criar e atualizar somente os compromissos do Marketing.</p>
              {!status.configured && <p className="marketing-google-error">A credencial Google do HUB ainda precisa ser configurada pelo Tezzei.</p>}
              <button type="button" disabled={!status.configured || connecting} onClick={() => void connect()}>{connecting ? "Abrindo Google..." : "CONECTAR MINHA AGENDA GOOGLE"}</button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function getCalendarErrorMessage(error: unknown) {
  if (error instanceof MarketingGoogleCalendarApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível acessar a integração com o Google Agenda.";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
