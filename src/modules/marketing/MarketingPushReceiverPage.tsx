import { FormEvent, useEffect, useMemo, useState } from "react";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import {
  acknowledgeMarketingPush,
  formatMarketingPairCode,
  getMarketingPushErrorMessage,
  isMarketingNotificationReceiver,
  isWebPushSupported,
  readLastMarketingPush,
  readPendingMarketingPushSetup,
  subscribeMarketingPush,
  type MarketingPushManualSetup,
  type MarketingPushNotificationPayload,
  type MarketingPushSetup,
} from "./marketingPushClient";
import "./marketingPushReceiver.css";

type ReceiverStatus = "idle" | "activating" | "active" | "error";

type ServiceWorkerPushEvent = MessageEvent<{
  type?: string;
  payload?: MarketingPushNotificationPayload;
}>;

export function MarketingPushReceiverPage() {
  const [pendingSetup, setPendingSetup] = useState<MarketingPushSetup | null>(() => readPendingMarketingPushSetup());
  const [requestNumber, setRequestNumber] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [status, setStatus] = useState<ReceiverStatus>(() => isMarketingNotificationReceiver() ? "active" : "idle");
  const [message, setMessage] = useState("");
  const [lastPush, setLastPush] = useState<MarketingPushNotificationPayload | null>(null);
  const supported = useMemo(() => isWebPushSupported(), []);

  useEffect(() => {
    document.title = "Notificações do Marketing | Santa Maria";
    void readLastMarketingPush().then((payload) => {
      if (!payload) return;
      setLastPush(payload);
      void acknowledgeVisiblePayload(payload);
    });

    const onMessage = (event: Event) => {
      const messageEvent = event as ServiceWorkerPushEvent;
      if (messageEvent.data?.type !== "hub:marketing-push" || !messageEvent.data.payload) return;
      setLastPush(messageEvent.data.payload);
      void acknowledgeVisiblePayload(messageEvent.data.payload);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!pendingSetup) setPendingSetup(readPendingMarketingPushSetup());
  }, [pendingSetup]);

  async function activate(setup: MarketingPushSetup | MarketingPushManualSetup) {
    if (status === "activating") return;
    setStatus("activating");
    setMessage("");
    try {
      await subscribeMarketingPush(setup);
      setPendingSetup(null);
      setStatus("active");
      setMessage("Pronto. Este aparelho receberá a confirmação do Marketing e os lembretes até você abrir a notificação.");
    } catch (error) {
      setStatus("error");
      setMessage(getMarketingPushErrorMessage(error));
    }
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = Number(requestNumber);
    const normalizedCode = pairCode.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
    if (!Number.isInteger(number) || number <= 0 || normalizedCode.length !== 12) {
      setStatus("error");
      setMessage("Informe o número do pedido e o código de 12 caracteres mostrado após o envio.");
      return;
    }
    void activate({ requestNumber: number, pairCode: normalizedCode });
  }

  function openInternalHub() {
    try {
      window.sessionStorage.setItem("hub-internal-bypass", "1");
    } catch {
      // O parâmetro da URL também funciona como bypass.
    }
    window.location.href = "/?hub=interno";
  }

  return (
    <main className="marketing-push-receiver-page">
      <section className="marketing-push-receiver-shell">
        <header className="marketing-push-receiver-brand">
          <SantaMariaBrand className="marketing-push-receiver-logo" />
          <div><strong>SANTA MARIA</strong><span>NOTIFICAÇÕES DO MARKETING</span></div>
        </header>

        <section className="marketing-push-receiver-card">
          <div className="marketing-push-receiver-bell" aria-hidden="true">🔔</div>
          <p className="marketing-push-receiver-kicker">HUB SANTA MARIA</p>
          <h1>Receba aqui a confirmação do seu agendamento.</h1>
          <p className="marketing-push-receiver-intro">Não precisa criar usuário nem senha. Este aparelho fica vinculado somente aos pedidos que você autorizar.</p>

          {lastPush && (
            <article className="marketing-push-receiver-latest" aria-live="assertive">
              <span>ÚLTIMA NOTIFICAÇÃO</span>
              <strong>{lastPush.title || "Atualização do Marketing"}</strong>
              <p>{lastPush.body || "Abra o HUB para conferir seu agendamento."}</p>
              <small>Esta mensagem foi visualizada neste aparelho. Os lembretes deste aviso serão interrompidos.</small>
            </article>
          )}

          {pendingSetup ? (
            <section className="marketing-push-receiver-pending">
              <span>PEDIDO</span>
              <strong>#{pendingSetup.requestNumber}</strong>
              <p>Seu pedido está pronto para ser vinculado a este aparelho.</p>
              <button type="button" disabled={status === "activating" || !supported} onClick={() => { void activate(pendingSetup); }}>
                {status === "activating" ? "ATIVANDO..." : "ATIVAR NOTIFICAÇÕES DESTE PEDIDO"}
              </button>
            </section>
          ) : status === "active" ? (
            <section className="marketing-push-receiver-active">
              <strong>✓ NOTIFICAÇÕES ATIVAS</strong>
              <p>{message || "Este aparelho está preparado para receber avisos do Marketing."}</p>
              <small>Ao fazer um novo pedido neste aparelho, o HUB poderá vinculá-lo às notificações sem criar uma conta.</small>
            </section>
          ) : (
            <section className="marketing-push-receiver-manual">
              <h2>Vincular um pedido</h2>
              <p>Use os dados mostrados na tela depois que você enviou o pedido.</p>
              <form onSubmit={submitManual}>
                <label>
                  Número do pedido
                  <input inputMode="numeric" value={requestNumber} onChange={(event) => setRequestNumber(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ex.: 185" />
                </label>
                <label>
                  Código de vinculação
                  <input value={pairCode} onChange={(event) => setPairCode(formatMarketingPairCode(event.target.value))} placeholder="ABCD-1234-EF56" autoCapitalize="characters" />
                </label>
                <button type="submit" disabled={status === "activating" || !supported}>{status === "activating" ? "ATIVANDO..." : "ATIVAR NOTIFICAÇÕES"}</button>
              </form>
            </section>
          )}

          {!supported && <p className="marketing-push-receiver-error">Este navegador não oferece suporte a Web Push. No Android use Chrome; no computador use Edge/Chrome; no iPhone abra o HUB adicionado à Tela de Início.</p>}
          {message && status === "error" && <p className="marketing-push-receiver-error" role="alert">{message}</p>}

          <section className="marketing-push-receiver-help">
            <h2>Importante</h2>
            <p>Quando chegar uma confirmação, o HUB usa notificação do próprio celular/computador. Som, vibração, tela bloqueada e destaque dependem também das permissões do aparelho e do modo Não Perturbe.</p>
            <p><strong>Se não conseguir ativar, chame a Infraestrutura / Tezzei.</strong></p>
          </section>

          <button className="marketing-push-internal-link" type="button" onClick={openInternalHub}>Acessar o HUB interno</button>
        </section>
      </section>
    </main>
  );
}

async function acknowledgeVisiblePayload(payload: MarketingPushNotificationPayload) {
  const ackToken = payload.data?.ackToken;
  if (ackToken) await acknowledgeMarketingPush(ackToken);
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  try {
    await nav.clearAppBadge?.();
  } catch {
    // Badge é complementar; a confirmação visual continua válida.
  }
}
