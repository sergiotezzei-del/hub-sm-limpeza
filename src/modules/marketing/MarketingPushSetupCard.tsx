import { useEffect, useMemo, useState } from "react";
import { canPromptPwaInstall, isPwaStandalone, promptPwaInstall } from "../../pwaInstall";
import {
  formatMarketingPairCode,
  getMarketingPushErrorMessage,
  isIosDevice,
  isMarketingNotificationReceiver,
  isMarketingPushSetupExpired,
  isWebPushSupported,
  renewMarketingPushSetup,
  subscribeMarketingPush,
  type MarketingPushSetup,
} from "./marketingPushClient";
import "./marketingPushPublic.css";

type MarketingPushSetupCardProps = {
  setup: MarketingPushSetup | null;
  preparing: boolean;
  prepareFailed: boolean;
};

type SetupStatus = "idle" | "installing" | "activating" | "active" | "error";

export function MarketingPushSetupCard({ setup, preparing, prepareFailed }: MarketingPushSetupCardProps) {
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [message, setMessage] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(() => canPromptPwaInstall());
  const [standalone, setStandalone] = useState(() => isPwaStandalone());
  const [copyDone, setCopyDone] = useState(false);
  const [currentSetup, setCurrentSetup] = useState<MarketingPushSetup | null>(setup);
  const [permission, setPermission] = useState<NotificationPermission>(() => ("Notification" in window ? Notification.permission : "default"));
  const ios = useMemo(() => isIosDevice(), []);

  useEffect(() => {
    setCurrentSetup(setup);
  }, [setup]);

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
    const syncPermission = () => {
      if (!("Notification" in window)) return;
      const next = Notification.permission;
      setPermission(next);
      if (next !== "denied" && status === "error") {
        setStatus("idle");
        setMessage("");
      }
    };
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, [status]);

  useEffect(() => {
    if (!currentSetup || preparing || status !== "idle" || !isMarketingPushSetupExpired(currentSetup)) return;
    let active = true;
    setStatus("activating");
    setMessage("Atualizando o código de vinculação...");
    void renewMarketingPushSetup(currentSetup)
      .then((next) => {
        if (!active) return;
        setCurrentSetup(next);
        setStatus("idle");
        setMessage("Código de vinculação atualizado automaticamente.");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setMessage(getMarketingPushErrorMessage(error));
      });
    return () => { active = false; };
  }, [currentSetup, preparing, status]);

  useEffect(() => {
    if (!currentSetup || status !== "idle" || !isMarketingNotificationReceiver()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    setStatus("activating");
    void subscribeMarketingPush(currentSetup)
      .then(() => {
        setStatus("active");
        setMessage("Este pedido já está vinculado às notificações deste aparelho.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(getMarketingPushErrorMessage(error));
      });
  }, [currentSetup, status]);

  async function installApp() {
    if (!currentSetup || status === "installing") return;
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
    if (!currentSetup || status === "activating") return;
    if (permission === "denied") {
      setStatus("error");
      setMessage("As notificações estão bloqueadas neste navegador. Libere a permissão nas configurações do site e volte a esta tela.");
      setGuideOpen(true);
      return;
    }
    setStatus("activating");
    setMessage("");
    try {
      const freshSetup = await renewMarketingPushSetup(currentSetup);
      setCurrentSetup(freshSetup);
      await subscribeMarketingPush(freshSetup);
      setStatus("active");
      setMessage("Pronto. Este aparelho receberá a confirmação e os lembretes deste agendamento.");
    } catch (error) {
      setStatus("error");
      setMessage(getMarketingPushErrorMessage(error));
      if (isIosDevice() && !isPwaStandalone()) setGuideOpen(true);
    }
  }

  async function copyCode() {
    if (!currentSetup) return;
    const text = `Pedido #${currentSetup.requestNumber} · Código ${formatMarketingPairCode(currentSetup.pairCode)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1800);
    } catch {
      setMessage(text);
    }
  }

  function recheckPermission() {
    if (!("Notification" in window)) return;
    const next = Notification.permission;
    setPermission(next);
    if (next !== "denied") {
      setStatus("idle");
      setMessage("");
    } else {
      setStatus("error");
      setMessage("A permissão ainda está bloqueada. Altere Notificações para Permitir nas configurações deste site.");
    }
  }

  const unsupported = !isWebPushSupported();
  const canActivateHere = Boolean(currentSetup) && permission !== "denied" && !unsupported && (!ios || standalone);

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

            {currentSetup && !prepareFailed && (
              <div className="marketing-push-actions">
                {installAvailable && !standalone && !ios && (
                  <button type="button" className="marketing-push-primary" disabled={status === "installing"} onClick={() => { void installApp(); }}>
                    {status === "installing" ? "ABRINDO INSTALAÇÃO..." : "1. INSTALAR O APLICATIVO"}
                  </button>
                )}

                {permission === "denied" && (
                  <button type="button" className="marketing-push-guide-button" onClick={() => setGuideOpen(true)}>
                    NOTIFICAÇÕES BLOQUEADAS — COMO LIBERAR
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

            {guideOpen && currentSetup && (
              <div className="marketing-push-guide">
                <h3>Como fazer</h3>
                {permission === "denied" && (
                  <div className="marketing-push-error">
                    <strong>As notificações estão bloqueadas neste navegador.</strong>
                    <p>Abra as configurações deste site no Chrome/Edge, altere <strong>Notificações</strong> para <strong>Permitir</strong>, volte para esta tela e clique abaixo.</p>
                    <button type="button" className="marketing-push-guide-button" onClick={recheckPermission}>JÁ LIBEREI NAS CONFIGURAÇÕES</button>
                  </div>
                )}
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
                <div className="marketing-push-code-box">
                  <span>Se o HUB instalado pedir o vínculo:</span>
                  <strong>Pedido #{currentSetup.requestNumber}</strong>
                  <code>{formatMarketingPairCode(currentSetup.pairCode)}</code>
                  <button type="button" onClick={() => { void copyCode(); }}>{copyDone ? "COPIADO ✓" : "COPIAR CÓDIGO"}</button>
                </div>
                <p className="marketing-push-support"><strong>Não conseguiu?</strong> Chame a Infraestrutura / Tezzei e informe o pedido <strong>#{currentSetup.requestNumber}</strong> e o código acima.</p>
              </div>
            )}

            {unsupported && currentSetup && (
              <p className="marketing-push-error">Este navegador não suporta as notificações do HUB. Abra o pedido no Chrome/Edge ou siga o passo a passo acima.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
