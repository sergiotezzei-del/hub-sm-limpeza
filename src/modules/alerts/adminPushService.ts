import {
  authenticatedSupabaseFetch,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

const ADMIN_PUSH_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/hub-admin-push`;

type AdminPushStatusRow = {
  active_count?: number | string | null;
  last_sent_at?: string | null;
  last_error?: string | null;
};

export type AdminPushStatus = {
  activeCount: number;
  lastSentAt: string;
  lastError: string;
};

export function isAdminPushSupported() {
  return "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function isIosDevice() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export async function loadAdminPushStatus(): Promise<AdminPushStatus> {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/hub_admin_push_get_status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("ADMIN_PUSH_STATUS_FAILED");
  const rows = await response.json() as AdminPushStatusRow[];
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return {
    activeCount: Math.max(0, Number(row?.active_count || 0)),
    lastSentAt: row?.last_sent_at || "",
    lastError: row?.last_error || "",
  };
}

export async function activateAdminPush() {
  if (!isAdminPushSupported()) throw new Error("ADMIN_PUSH_UNSUPPORTED");
  if (isIosDevice() && !isStandaloneDisplay()) throw new Error("ADMIN_PUSH_IOS_INSTALL_REQUIRED");

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "ADMIN_PUSH_PERMISSION_DENIED" : "ADMIN_PUSH_PERMISSION_REQUIRED");
  }

  const publicKey = await loadVapidPublicKey();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !sameApplicationServerKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new Error("ADMIN_PUSH_SUBSCRIPTION_INVALID");
  }

  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/hub_admin_push_register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_endpoint: payload.endpoint,
      p_p256dh: payload.keys.p256dh,
      p_auth: payload.keys.auth,
      p_user_agent: navigator.userAgent,
    }),
  });
  if (!response.ok) throw new Error("ADMIN_PUSH_REGISTER_FAILED");
  return subscription;
}

export function getAdminPushErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (text.includes("ADMIN_PUSH_IOS_INSTALL_REQUIRED")) {
    return "No iPhone, adicione o HUB à Tela de Início, abra pelo ícone e ative as notificações por lá.";
  }
  if (text.includes("ADMIN_PUSH_PERMISSION_DENIED")) {
    return "As notificações estão bloqueadas neste aparelho. Libere as notificações do HUB nas configurações e tente novamente.";
  }
  if (text.includes("ADMIN_PUSH_PERMISSION_REQUIRED")) {
    return "É necessário permitir as notificações para receber os alertas do HUB.";
  }
  if (text.includes("ADMIN_PUSH_UNSUPPORTED")) {
    return "Este navegador não suporta Push do HUB. No Android use Chrome; no iPhone use o HUB adicionado à Tela de Início.";
  }
  return "Não foi possível ativar as notificações neste aparelho.";
}

async function loadVapidPublicKey() {
  const response = await fetch(ADMIN_PUSH_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "config" }),
  });
  if (!response.ok) throw new Error("ADMIN_PUSH_CONFIG_FAILED");
  const data = await response.json() as { publicKey?: string };
  if (!data.publicKey) throw new Error("ADMIN_PUSH_CONFIG_EMPTY");
  return data.publicKey;
}

function sameApplicationServerKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = urlBase64ToUint8Array(publicKey);
  const actual = new Uint8Array(current);
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) outputArray[index] = rawData.charCodeAt(index);
  return outputArray;
}
