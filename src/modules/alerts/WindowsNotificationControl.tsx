import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  getHubNotificationPermission,
  requestHubNotificationPermission,
  type HubNotificationPermission,
} from "./windowsNotifications";
import "./windowsNotifications.css";

export function WindowsNotificationControl() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [permission, setPermission] = useState<HubNotificationPermission>(() => getHubNotificationPermission());
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const sync = () => setHost(document.querySelector<HTMLElement>(".hub-alert-panel-head"));
    sync();
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host || permission === "unsupported") return null;

  async function enableNotifications() {
    if (requesting || permission === "granted" || permission === "denied") return;
    setRequesting(true);
    try {
      setPermission(await requestHubNotificationPermission());
    } finally {
      setRequesting(false);
    }
  }

  const label = permission === "granted"
    ? "✓ Avisos do Windows ativos"
    : permission === "denied"
      ? "Avisos bloqueados no navegador"
      : requesting
        ? "Ativando..."
        : "Ativar avisos do Windows";

  return createPortal(
    <button
      className={`hub-windows-notification-button permission-${permission}`}
      type="button"
      disabled={requesting || permission === "granted" || permission === "denied"}
      onClick={() => { void enableNotifications(); }}
      title={permission === "denied" ? "Libere as notificações deste site nas configurações do Edge/Windows." : undefined}
    >
      {label}
    </button>,
    host,
  );
}
