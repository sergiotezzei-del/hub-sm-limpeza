const HUB_NOTIFICATION_ICON = "/icons/icon-192.png";

export type HubNotificationPermission = "unsupported" | NotificationPermission;

export function getHubNotificationPermission(): HubNotificationPermission {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

export async function requestHubNotificationPermission(): Promise<HubNotificationPermission> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await showHubWindowsNotification(
      "Avisos do HUB ativados",
      "Você receberá um aviso do Windows quando chegar um novo alerta.",
      "hub-notification-enabled",
    );
  }
  return permission;
}

export async function showHubWindowsNotification(title: string, body: string, tag?: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: HUB_NOTIFICATION_ICON,
      badge: HUB_NOTIFICATION_ICON,
      tag: tag ?? `hub-alert-${Date.now()}`,
      requireInteraction: true,
      data: { url: "/" },
    });
    return true;
  } catch {
    return false;
  }
}
