import { useEffect, useMemo, useRef, useState } from "react";
import { canPromptPwaInstall, isPwaStandalone, promptPwaInstall } from "../../pwaInstall";
import {
  formatMarketingPairCode,
  getMarketingPushErrorMessage,
  isIosDevice,
  isMarketingNotificationReceiver,
  isWebPushSupported,
  subscribeMarketingPush,
  type MarketingPushSetup,
} from "./marketingPushClient";
import "./marketingPushPublic.css";

type MarketingPushSetupCardProps = {
  setup: MarketingPushSetup | null;
  preparing: boolean;
  prepareFailed: boolean;
  onRefreshSetup?: () => Promise<void>;
};

type SetupStatus = "idle" | "installing" | "activating" | "refreshing" | "active" | "error";

export function MarketingPushSetupCard({ setup, preparing, prepareFailed, onRefreshSetup }: MarketingPushSetupCardProps) {
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [message, setMessage] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(() => canPromptPwaInstall());
  const [standalone, setStandalone] = useState(() => isPwaStandalone());
  const [copyDone, setCopyDone] = useState(false);
  const ios = useMemo(() => isIosDevice(), []);
  const refreshedExpiredSetup = useRef("");
  const permissionBlocked = typeof Notification !== "undefined" && Notification.permission === "denied";
  const setupExpired = Boolean(setup?.expiresAt && new Date(setup.expiresAt).getTime() <= Date.now());

  useEffect(() => {
    const sync = () => {
      setInstallAvailable(canPromptPwaInstall());
      setStandalone(isPwaStandalone());
    };
    window.addEventListener("hub-pwa-install-available", sync);
    window.addEventListener("hub-pwa-install-changed", sync);
    window.matchMedia("(display-mode: standalone)").addEventListener?.("change", sync);
    sync();
    return () => {
      window.removeEventListener("hub-pwa-install-available", sync);
      window.removeEventListener("hub-pwa-install-changed", sync);
      window.matchMedia("(display-mode: standalone)").removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!setup || !setupExpired || !onRefreshSetup) return;
    const setupKey = `${setup.requestNumber}:${setup.expiresAt}`;
    if (refreshedExpiredSetup.current === setupKey) return;
    refreshedExpiredSetup.current = setupKey;
    setStatus("refreshing");
    setMessage("Atualizando o código de notificações...");
    void onRefreshSetup()
      .then(() => {
        setStatus("idle");
        setMessage("Código de notificações atualizado.");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Não foi possível renovar o código de notificações. Atualize a página e tente novamente.");
      });
  }, [onRefreshSetup, setup, setupExpired]);

  useEffect(() => {
    if (!setup || status !== "idle" || !isMarketingNotificationReceiver()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    setStatus("activating");
    void subscribeMarketingPush(setup)
      .then(() => {
        setStatus("active");
        setMessage("Este pedido já está vinculado às notificações deste aparelho.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(getMarketingPushErrorMessage(error));
      });
  }, [setup, status]);

  async function installApp() {
    if (!setup || status === "installing") return;
    setStatus("installing");
    setMessage("");
    try {
      const accepted = await promptPwaInstall();
      if (accepted) {
        setInstallAvailable(false);
        setMessage("Aplicativo instalado. Agora ative as notificações abaixo.");
      } else {
        setMessage("A instalação não foi concluída. Você pode tentar novamente ou abrir o passo a passo.");
      }
      setStatus("idle");
    } catch {
      setStatus("error");
      setMessage("Não foi possível abrir a instalação. Use o passo a passo abaixo.");
      setGuideOpen(true);
    }
  }

  async function activateNotifications() {
    if (!setup || status === "activating") return;
    setStatus("activating");
    setMessage("");
    try {
      await subscribeMarketingPush(setup);
      setStatus("active");
      setMessage("Pronto. Este aparelho receberá a confirmação e os lembretes deste agendamento.");
    } catch (error) {
      setStatus("error");
      setMessage(getMarketingPushErrorMessage(error));
      if (isIosDevice() && !isPwaStandalone()) setGuideOpen(true);
    }
  }

  async function copyCode() {
    if (!setup) return;
    const text = `Pedido #${setup.requestNumber} · Código ${formatMarketingPairCode(setup.pairCode)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1800);
    } catch {
      setMessage(text);
    }
  }

  const unsupported = !isWebPushSupported();
  const canActivateHere = Boolean(setup) && !unsupported && !permissionBlocked && !setupExpired && (!ios || standalone);

  return (
    <section className={`marketing-push-setup-card status-${status}`} aria-label="Receber confirmação do agendamento">
      <div className="marketing-push-warning-icon" aria-hidden="true">!</div>
      <div className="marketing-push-setup-content">
        <p className="marketing-push-kicker">ATENÇÃO</p>
        <h2>Não perca a confirmação do seu agendamento.</h2>
        {status === "active" ? (
          <div className="marketing-push-active-box">
            <strong>✓ NOTIFICAÇÕES ATIVAS</strong>
            <p>{message || "Este aparelho está vinculado ao seu pedido."}</p>
            <small>Quando o Marketing confirmar ou alterar o horário, o HUB avisará este aparelho. Os lembretes continuam até você abrir a notificação.</small>
          </div>
        ) : (
          <>
            <p className="marketing-push-lead">
              Instale o <strong>HUB Santa Maria</strong> neste celular ou computador e permita as notificações. <strong>Não precisa criar usuário nem senha.</strong>
            </p>

            {preparing && <p className="marketing-push-preparing">Preparando a notificação do seu pedido...</p>}
            {prepareFailed && (
              <p className="marketing-push-error">Seu pedido foi enviado, mas não conseguimos preparar a notificação. Chame a Infraestrutura e informe o número do pedido.</p>
            )}

            {setup && !prepareFailed && (
              <div className="marketing-push-actions">
                {permissionBlocked && (
                  <p className="marketing-push-error">As notificações estão bloqueadas neste navegador. Libere a permissão de notificações do HUB nas configurações do navegador/aparelho e depois volte a esta tela.</p>
                )}
                {setupExpired && status === "refreshing" && (
                  <p className="marketing-push-preparing">O código anterior venceu. Gerando um novo código automaticamente...</p>
                )}
                {installAvailable && !standalone && !ios && (
                  <button type="button" className="marketing-push-primary" disabled={status === "installing"} onClick={() => { void installApp(); }}>
                    {status === "installing" ? "ABRINDO INSTALAÇÃO..." : "1. INSTALAR O APLICATIVO"}
                  </button>
                )}

                {canActivateHere && (
                  <button type="button" className="marketing-push-primary marketing-push-activate" disabled={status === "activating"} onClick={() => { void activateNotifications(); }}>
                    {status === "activating" ? "ATIVANDO..." : installAvailable && !standalone ? "2. ATIVAR NOTIFICAÇÕES" : "ATIVAR NOTIFICAÇÕES NESTE APARELHO"}
                  </button>
                )}

                <button type="button" className="marketing-push-guide-button" onClick={() => setGuideOpen((current) => !current)}>
                  {guideOpen ? "FECHAR PASSO A PASSO" : "VER COMO INSTALAR"}
                </button>
              </div>
            )}

            {message && <p className={status === "error" ? "marketing-push-error" : "marketing-push-message"} role="status">{message}</p>}

            {guideOpen && setup && (
              <div className="marketing-push-guide">
                <h3>Como fazer</h3>
                {ios ? (
                  <ol>
                    <li>Abra esta página no <strong>Safari</strong>.</li>
                    <li>Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</li>
                    <li>Abra o ícone <strong>HUB Santa Maria</strong> que apareceu na sua tela.</li>
                    <li>No HUB instalado, toque em <strong>Ativar notificações</strong> e depois em <strong>Permitir</strong>.</li>
                  </ol>
                ) : (
                  <ol>
                    <li>No celular, use o <strong>Chrome</strong>. No computador, use <strong>Edge ou Chrome</strong>.</li>
                    <li>Toque/clique em <strong>Instalar aplicativo</strong>. Se o botão não aparecer, abra o menu do navegador e escolha <strong>Instalar HUB Santa Maria</strong>.</li>
                    <li>Abra o HUB instalado e permita as notificações quando solicitado.</li>
                  </ol>
                )}
                {!setupExpired && <div className="marketing-push-code-box">
                  <span>Se o HUB instalado pedir o vínculo:</span>
                  <strong>Pedido #{setup.requestNumber}</strong>
                  <code>{formatMarketingPairCode(setup.pairCode)}</code>
                  <button type="button" onClick={() => { void copyCode(); }}>{copyDone ? "COPIADO ✓" : "COPIAR CÓDIGO"}</button>
                </div>}
                <p className="marketing-push-support"><strong>Não conseguiu?</strong> Chame a Infraestrutura / Tezzei e informe o pedido <strong>#{setup.requestNumber}</strong> e o código acima.</p>
              </div>
            )}

            {unsupported && setup && (
              <p className="marketing-push-error">Este navegador não suporta as notificações do HUB. Abra o pedido no Chrome/Edge ou siga o passo a passo acima.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
