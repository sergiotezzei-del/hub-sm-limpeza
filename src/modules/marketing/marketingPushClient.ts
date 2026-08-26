import {
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "../security/services/supabaseClient";

const PUSH_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/marketing-public-push`;
const PENDING_COOKIE = "hub_mkt_push_setup";
const PENDING_STORAGE = "hub-marketing-push-setup";
const RECEIVER_STORAGE = "hub-marketing-notification-receiver";
const RECEIVER_COOKIE = "hub_mkt_push_receiver";
const LAST_PUSH_CACHE = "hub-marketing-push-state";
const LAST_PUSH_KEY = "/__hub_last_marketing_push";

export type MarketingPushSetup = {
  claimToken: string;
  pairCode: string;
  requestNumber: number;
  expiresAt: string;
};

export type MarketingPushManualSetup = {
  requestNumber: number;
  pairCode: string;
};

export type MarketingPushNotificationPayload = {
  title?: string;
  body?: string;
  tag?: string;
  data?: {
    url?: string;
    ackToken?: string;
    requestNumber?: number;
    eventKind?: string;
    isReminder?: boolean;
  };
};

type PreparePushRow = {
  claim_token: string;
  pair_code: string;
  request_number: number | string;
  expires_at: string;
};

export async function prepareMarketingPush(submissionId: string): Promise<MarketingPushSetup> {
  if (!supabaseConfigured) throw new Error("PUSH_SUPABASE_NOT_CONFIGURED");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_public_prepare_push`, {
    method: "POST",
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_submission_id: submissionId }),
  });
  if (!response.ok) throw new Error(await response.text() || "PUSH_PREPARE_FAILED");
  const rows = await response.json() as PreparePushRow[];
  const row = rows?.[0];
  if (!row?.claim_token || !row.pair_code) throw new Error("PUSH_PREPARE_EMPTY");
  const setup: MarketingPushSetup = {
    claimToken: row.claim_token,
    pairCode: row.pair_code,
    requestNumber: Number(row.request_number),
    expiresAt: row.expires_at,
  };
  rememberPendingMarketingPushSetup(setup);
  return setup;
}

export function rememberPendingMarketingPushSetup(setup: MarketingPushSetup) {
  const serialized = JSON.stringify(setup);
  try {
    window.localStorage.setItem(PENDING_STORAGE, serialized);
  } catch {
    // Cookie abaixo continua como fallback e também atravessa o Add to Home Screen no iOS.
  }
  setCookie(PENDING_COOKIE, serialized, 45 * 24 * 60 * 60);
}

export function readPendingMarketingPushSetup(): MarketingPushSetup | null {
  const cookieValue = readCookie(PENDING_COOKIE);
  if (cookieValue) {
    const parsed = safeSetup(cookieValue);
    if (parsed) return parsed;
  }
  try {
    const stored = window.localStorage.getItem(PENDING_STORAGE);
    if (stored) return safeSetup(stored);
  } catch {
    // sem armazenamento local
  }
  return null;
}

export function clearPendingMarketingPushSetup() {
  try {
    window.localStorage.removeItem(PENDING_STORAGE);
  } catch {
    // sem armazenamento local
  }
  setCookie(PENDING_COOKIE, "", 0);
}

export function markMarketingNotificationReceiver() {
  try {
    window.localStorage.setItem(RECEIVER_STORAGE, "1");
  } catch {
    // Cookie mantém o estado no aparelho.
  }
  setCookie(RECEIVER_COOKIE, "1", 365 * 24 * 60 * 60);
}

export function isMarketingNotificationReceiver() {
  try {
    if (window.localStorage.getItem(RECEIVER_STORAGE) === "1") return true;
  } catch {
    // segue para cookie
  }
  return readCookie(RECEIVER_COOKIE) === "1";
}

export function isWebPushSupported() {
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

export async function subscribeMarketingPush(setup: MarketingPushSetup | MarketingPushManualSetup) {
  if (!isWebPushSupported()) throw new Error("PUSH_UNSUPPORTED");
  if (isIosDevice() && !isStandaloneDisplay()) throw new Error("PUSH_IOS_INSTALL_REQUIRED");

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "PUSH_PERMISSION_DENIED" : "PUSH_PERMISSION_REQUIRED");

  const publicKey = await loadVapidPublicKey();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new Error("PUSH_SUBSCRIPTION_INVALID");
  }

  const response = await fetch(PUSH_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "subscribe",
      claimToken: "claimToken" in setup ? setup.claimToken : null,
      requestNumber: setup.requestNumber,
      pairCode: setup.pairCode,
      userAgent: navigator.userAgent,
      subscription: {
        endpoint: payload.endpoint,
        keys: payload.keys,
      },
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "PUSH_REGISTER_FAILED");
  }

  markMarketingNotificationReceiver();
  clearPendingMarketingPushSetup();
  return subscription;
}

export async function acknowledgeMarketingPush(ackToken: string) {
  if (!ackToken) return false;
  try {
    const response = await fetch(PUSH_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack", ackToken }),
    });
    if (!response.ok) return false;
    const data = await response.json() as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function readLastMarketingPush(): Promise<MarketingPushNotificationPayload | null> {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(LAST_PUSH_CACHE);
    const response = await cache.match(LAST_PUSH_KEY);
    if (!response) return null;
    return await response.json() as MarketingPushNotificationPayload;
  } catch {
    return null;
  }
}

export function formatMarketingPairCode(value: string) {
  const normalized = value.replace(/[^A-Fa-f0-9]/g, "").toUpperCase().slice(0, 12);
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

export function getMarketingPushErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toUpperCase();
  if (normalized.includes("PUSH_IOS_INSTALL_REQUIRED")) return "No iPhone, abra primeiro o HUB pela Tela de Início e ative as notificações dentro do aplicativo.";
  if (normalized.includes("PUSH_PERMISSION_DENIED")) return "As notificações foram bloqueadas. Libere as notificações do HUB nas configurações do aparelho/navegador.";
  if (normalized.includes("PUSH_PERMISSION_REQUIRED")) return "É necessário permitir as notificações para receber a confirmação do Marketing.";
  if (normalized.includes("PUSH_UNSUPPORTED")) return "Este navegador não oferece suporte às notificações do HUB. Use Chrome, Edge ou o aplicativo adicionado à Tela de Início.";
  if (normalized.includes("MARKETING_PUSH_CLAIM_INVALID") || normalized.includes("CLAIM_REQUIRED")) return "O código deste pedido expirou ou não é válido. Gere um novo pedido ou chame a Infraestrutura.";
  return "Não foi possível ativar as notificações neste aparelho. Veja o passo a passo ou chame a Infraestrutura.";
}

async function loadVapidPublicKey() {
  const response = await fetch(PUSH_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "config" }),
  });
  if (!response.ok) throw new Error("PUSH_CONFIG_FAILED");
  const data = await response.json() as { publicKey?: string };
  if (!data.publicKey) throw new Error("PUSH_CONFIG_EMPTY");
  return data.publicKey;
}

function safeSetup(value: string): MarketingPushSetup | null {
  try {
    const parsed = JSON.parse(value) as Partial<MarketingPushSetup>;
    const requestNumber = Number(parsed.requestNumber);
    if (!parsed.claimToken || !parsed.pairCode || !Number.isInteger(requestNumber) || requestNumber <= 0) return null;
    return {
      claimToken: parsed.claimToken,
      pairCode: parsed.pairCode,
      requestNumber,
      expiresAt: parsed.expiresAt || "",
    };
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) outputArray[index] = rawData.charCodeAt(index);
  return outputArray;
}
