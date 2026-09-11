import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  activateAdminPush,
  getAdminPushErrorMessage,
  isAdminPushSupported,
  isIosDevice as isAdminPushIosDevice,
  isStandaloneDisplay as isAdminPushStandalone,
  loadAdminPushStatus,
  type AdminPushStatus,
} from "./adminPushService";
import {
  loadEmailInboxStatus,
  saveEmailInboxConfig,
  type EmailInboxStatus,
} from "./emailInboxService";
import {
  getHubNotificationPermission,
  requestHubNotificationPermission,
  type HubNotificationPermission,
} from "./windowsNotifications";
import "./windowsNotifications.css";

const SESSION_KEY = "hub-sm-active-session";

export function WindowsNotificationControl() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permission, setPermission] = useState<HubNotificationPermission>(() => getHubNotificationPermission());
  const [requesting, setRequesting] = useState(false);
  const [emailInbox, setEmailInbox] = useState<EmailInboxStatus | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [adminPushStatus, setAdminPushStatus] = useState<AdminPushStatus | null>(null);
  const [adminPushBusy, setAdminPushBusy] = useState(false);
  const [adminPushMessage, setAdminPushMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  useEffect(() => {
    const sync = () => {
      setHost(document.querySelector<HTMLElement>(".profile-notification-settings-slot"));
      setIsAdmin(readIsAdminSession());
    };
    sync();
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!settingsOpen || !isAdmin) return;
    let active = true;

    const refresh = async () => {
      const [emailResult, pushResult] = await Promise.allSettled([
        loadEmailInboxStatus(),
        loadAdminPushStatus(),
      ]);
      if (!active) return;

      if (emailResult.status === "fulfilled") {
        setEmailInbox(emailResult.value);
        setEmailAddress((current) => current || emailResult.value.emailAddress);
      }
      if (pushResult.status === "fulfilled") setAdminPushStatus(pushResult.value);
      if (emailResult.status === "rejected" || pushResult.status === "rejected") {
        setSettingsMessage("Parte das configurações está temporariamente indisponível.");
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [settingsOpen, isAdmin]);

  if (!host) return null;

  async function enableBrowserNotifications() {
    if (requesting || permission === "granted" || permission === "denied") return;
    setRequesting(true);
    try {
      setPermission(await requestHubNotificationPermission());
    } finally {
      setRequesting(false);
    }
  }

  function openSettings() {
    host.closest("details")?.removeAttribute("open");
    setSettingsMessage("");
    setSettingsOpen(true);
  }

  async function activatePushForThisDevice() {
    if (adminPushBusy) return;
    setAdminPushBusy(true);
    setAdminPushMessage("");
    try {
      await activateAdminPush();
      const status = await loadAdminPushStatus();
      setAdminPushStatus(status);
      setAdminPushMessage("Notificações ativadas neste aparelho.");
      setPermission(getHubNotificationPermission());
    } catch (error) {
      setAdminPushMessage(getAdminPushErrorMessage(error));
    } finally {
      setAdminPushBusy(false);
    }
  }

  async function saveEmailConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = emailAddress.trim();
    if (!email || !email.includes("@")) {
      setSettingsMessage("Informe o e-mail completo da Locaweb.");
      return;
    }
    if (!emailPassword) {
      setSettingsMessage("Informe a senha da caixa de e-mail para salvar a configuração.");
      return;
    }

    setEmailSaving(true);
    setSettingsMessage("");
    try {
      await saveEmailInboxConfig(email, emailPassword);
      setEmailPassword("");
      const status = await loadEmailInboxStatus();
      setEmailInbox(status);
      setEmailAddress(status.emailAddress || email);
      setSettingsMessage("Configuração do e-mail atualizada e salva.");
    } catch {
      setSettingsMessage("Não foi possível salvar a configuração do e-mail.");
    } finally {
      setEmailSaving(false);
    }
  }

  if (!isAdmin) {
    if (permission === "unsupported") return null;
    const label = browserNotificationLabel(permission, requesting);
    return createPortal(
      <button
        className={`hub-windows-notification-button permission-${permission}`}
        type="button"
        disabled={requesting || permission === "granted" || permission === "denied"}
        onClick={() => { void enableBrowserNotifications(); }}
        title={permission === "denied" ? "Libere as notificações deste site nas configurações do navegador." : undefined}
      >
        {label}
      </button>,
      host,
    );
  }

  const browserLabel = browserNotificationLabel(permission, requesting);

  return createPortal(
    <>
      <button className="hub-profile-notification-settings-button" type="button" onClick={openSettings}>
        <span aria-hidden="true">⚙️</span>
        <span>Notificações e e-mail</span>
      </button>

      {settingsOpen && createPortal(
        <div className="hub-notification-settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="hub-notification-settings-modal" role="dialog" aria-modal="true" aria-labelledby="hub-notification-settings-title">
            <header className="hub-notification-settings-head">
              <div>
                <p>CONFIGURAÇÕES</p>
                <h2 id="hub-notification-settings-title">Notificações e e-mail</h2>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setSettingsOpen(false)}>×</button>
            </header>

            {settingsMessage && <p className="hub-notification-settings-message" role="status">{settingsMessage}</p>}

            <section className="hub-notification-settings-card">
              <div className="hub-notification-settings-card-head">
                <div>
                  <small>CAIXA DE ENTRADA</small>
                  <h3>E-mail Locaweb</h3>
                </div>
                <span className={emailInbox?.configured ? "is-connected" : ""}>
                  {emailInbox?.configured ? "MONITOR ATIVO" : "NÃO CONFIGURADO"}
                </span>
              </div>

              <p>O HUB verifica a cada 5 minutos somente se chegou mensagem nova. Não lê assunto, remetente, conteúdo nem anexos.</p>

              <div className="hub-notification-device-row">
                <div>
                  <strong>🔔 Notificações nos seus aparelhos</strong>
                  <small>{adminPushStatus ? `${adminPushStatus.activeCount} aparelho(s) ativo(s)` : "Verificando aparelhos..."}</small>
                </div>
                <button type="button" disabled={adminPushBusy || !isAdminPushSupported()} onClick={() => { void activatePushForThisDevice(); }}>
                  {adminPushBusy ? "ATIVANDO..." : "ATIVAR NESTE APARELHO"}
                </button>
              </div>

              {isAdminPushIosDevice() && !isAdminPushStandalone() && (
                <small className="hub-notification-settings-help">No iPhone: abra no Safari, use “Adicionar à Tela de Início”, abra o HUB pelo ícone e ative por lá.</small>
              )}
              {adminPushMessage && <small className="hub-notification-settings-status">{adminPushMessage}</small>}

              {permission !== "unsupported" && (
                <div className="hub-notification-browser-row">
                  <span>Avisos neste navegador</span>
                  <button
                    className={`permission-${permission}`}
                    type="button"
                    disabled={requesting || permission === "granted" || permission === "denied"}
                    onClick={() => { void enableBrowserNotifications(); }}
                  >
                    {browserLabel}
                  </button>
                </div>
              )}

              <div className="hub-notification-settings-public-push-host" />

              <form className="hub-notification-email-form" onSubmit={saveEmailConfiguration}>
                <label>
                  E-mail
                  <input
                    type="email"
                    autoComplete="username"
                    value={emailAddress}
                    placeholder="seuemail@santamariatem.com.br"
                    onChange={(event) => setEmailAddress(event.target.value)}
                  />
                </label>
                <label>
                  Senha da caixa de e-mail
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={emailPassword}
                    placeholder={emailInbox?.configured ? "Digite apenas para atualizar a senha" : "Senha do e-mail"}
                    onChange={(event) => setEmailPassword(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={emailSaving}>
                  {emailSaving ? "SALVANDO..." : emailInbox?.configured ? "ATUALIZAR E TESTAR" : "SALVAR E TESTAR"}
                </button>
              </form>

              {emailInbox?.configured && <small>Conta monitorada: <strong>{emailInbox.emailAddress}</strong></small>}
              {emailInbox?.lastCheckedAt && <small>Última verificação: {new Date(emailInbox.lastCheckedAt).toLocaleString("pt-BR")}</small>}
              {emailInbox?.lastError && <p className="hub-notification-settings-error">{emailInbox.lastError}</p>}
            </section>
          </section>
        </div>,
        document.body,
      )}
    </>,
    host,
  );
}

function browserNotificationLabel(permission: HubNotificationPermission, requesting: boolean) {
  if (permission === "granted") return "✓ Avisos ativos";
  if (permission === "denied") return "Avisos bloqueados";
  if (requesting) return "Ativando...";
  return "ATIVAR AVISOS";
}

function readIsAdminSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw) as {
      currentUser?: {
        userType?: string;
        permissions?: string[];
      } | null;
    };
    return session.currentUser?.userType === "Admin"
      || Boolean(session.currentUser?.permissions?.includes("painel-admin"));
  } catch {
    return false;
  }
}
