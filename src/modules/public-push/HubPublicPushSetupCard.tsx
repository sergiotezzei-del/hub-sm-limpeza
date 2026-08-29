import { useEffect, useMemo, useState } from "react";
import { canPromptPwaInstall, isPwaStandalone, promptPwaInstall } from "../../pwaInstall";
import {
  formatHubPublicPairCode,
  getHubPublicPushErrorMessage,
  isHubPublicPushSupported,
  isIosDevice,
  sourceLabel,
  subscribeHubPublicPush,
  type HubPublicPushSetup,
} from "./hubPublicPushClient";
import "./hubPublicPush.css";

type Props = {
  setup: HubPublicPushSetup | null;
  preparing?: boolean;
  prepareFailed?: boolean;
  contextLabel?: string;
};

type Status = "idle" | "installing" | "activating" | "active" | "error";

export function HubPublicPushSetupCard({ setup, preparing = false, prepareFailed = false, contextLabel }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(() => canPromptPwaInstall());
  const [standalone, setStandalone] = useState(() => isPwaStandalone());
  const ios = useMemo(() => isIosDevice(), []);
  const permissionBlocked = typeof Notification !== "undefined" && Notification.permission === "denied";
  const unsupported = !isHubPublicPushSupported();

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
    if (!setup || status !== "idle") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (ios && !standalone) return;
    setStatus("activating");
    void subscribeHubPublicPush(setup)
      .then(() => {
        setStatus("active");
        setMessage("Este aparelho já está vinculado às atualizações desta solicitação.");
      })
      .catch(() => {
        setStatus("idle");
      });
  }, [ios, setup, standalone, status]);

  async function installApp() {
    if (status === "installing") return;
    setStatus("installing");
    setMessage("");
    try {
      const accepted = await promptPwaInstall();
      setStatus("idle");
      if (accepted) {
        setInstallAvailable(false);
        setMessage("Aplicativo instalado. Agora ative as notificações.");
      } else {
        setMessage("A instalação não foi concluída. Use o passo a passo abaixo se precisar.");
      }
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
      await subscribeHubPublicPush(setup);
      setStatus("active");
      setMessage("Pronto. Este aparelho receberá as atualizações desta solicitação e os avisos enviados pelo HUB.");
    } catch (error) {
      setStatus("error");
      setMessage(getHubPublicPushErrorMessage(error));
      if (ios && !standalone) setGuideOpen(true);
    }
  }

  const label = contextLabel || (setup ? sourceLabel(setup.sourceType) : "solicitação");
  const canActivate = Boolean(setup) && !unsupported && !permissionBlocked && (!ios || standalone);

  return (
    <section className={`hub-public-push-card status-${status}`} aria-label="Instalar HUB e receber notificações">
      <div className="hub-public-push-icon" aria-hidden="true">🔔</div>
      <div className="hub-public-push-content">
        <p className="hub-public-push-kicker">RECEBA AS ATUALIZAÇÕES</p>
        <h2>Instale o HUB e ative as notificações.</h2>
        {status === "active" ? (
          <div className="hub-public-push-active">
            <strong>✓ NOTIFICAÇÕES ATIVAS</strong>
            <p>{message}</p>
          </div>
        ) : (
          <>
            <p className="hub-public-push-lead">
              Assim você recebe no celular ou computador a confirmação, alteração ou retorno do seu {label.toLowerCase()} — mesmo com o navegador fechado.
            </p>
            <p className="hub-public-push-lead small">
              Também poderemos enviar avisos importantes do HUB para os aparelhos cadastrados. Não precisa criar usuário nem senha.
            </p>

            {preparing && <p className="hub-public-push-info">Preparando o vínculo das notificações...</p>}
            {prepareFailed && <p className="hub-public-push-error">Sua solicitação foi enviada, mas não foi possível preparar as notificações agora.</p>}
            {permissionBlocked && <p className="hub-public-push-error">As notificações estão bloqueadas neste navegador. Libere a permissão nas configurações do aparelho.</p>}

            {setup && (
              <div className="hub-public-push-actions">
                {installAvailable && !standalone && !ios && (
                  <button type="button" className="hub-public-push-primary" onClick={() => { void installApp(); }} disabled={status === "installing"}>
                    {status === "installing" ? "ABRINDO INSTALAÇÃO..." : "1. INSTALAR O HUB"}
                  </button>
                )}
                {canActivate && (
                  <button type="button" className="hub-public-push-primary activate" onClick={() => { void activateNotifications(); }} disabled={status === "activating"}>
                    {status === "activating" ? "ATIVANDO..." : installAvailable && !standalone ? "2. ATIVAR NOTIFICAÇÕES" : "ATIVAR NOTIFICAÇÕES"}
                  </button>
                )}
                <button type="button" className="hub-public-push-guide-button" onClick={() => setGuideOpen((value) => !value)}>
                  {guideOpen ? "FECHAR PASSO A PASSO" : "COMO INSTALAR"}
                </button>
              </div>
            )}

            {message && <p className={status === "error" ? "hub-public-push-error" : "hub-public-push-info"} role="status">{message}</p>}

            {guideOpen && setup && (
              <div className="hub-public-push-guide">
                <h3>Como fazer</h3>
                {ios ? (
                  <ol>
                    <li>Abra esta página no <strong>Safari</strong>.</li>
                    <li>Toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.</li>
                    <li>Abra o ícone <strong>HUB Santa Maria</strong>.</li>
                    <li>Toque em <strong>Ativar notificações</strong> e permita os avisos.</li>
                  </ol>
                ) : (
                  <ol>
                    <li>No celular use o <strong>Chrome</strong>. No computador use <strong>Chrome ou Edge</strong>.</li>
                    <li>Toque/clique em <strong>Instalar o HUB</strong>. Se o botão não aparecer, use o menu do navegador e escolha instalar aplicativo.</li>
                    <li>Depois toque em <strong>Ativar notificações</strong> e permita os avisos.</li>
                  </ol>
                )}
                <div className="hub-public-push-code">
                  <span>Vínculo desta solicitação</span>
                  <strong>{sourceLabel(setup.sourceType)} #{setup.sourceReference}</strong>
                  <code>{formatHubPublicPairCode(setup.pairCode)}</code>
                </div>
              </div>
            )}

            {unsupported && setup && (
              <p className="hub-public-push-error">Este navegador não suporta notificações do HUB. Abra no Chrome/Edge ou instale o HUB pela Tela de Início.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
