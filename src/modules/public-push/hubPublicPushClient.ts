import {
  publicSupabaseFetch,
  SUPABASE_URL,
  supabaseConfigured,
} from "../security/services/supabaseClient";

const PUSH_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/hub-public-push`;
const PENDING_COOKIE = "hub_public_push_setup";
const PENDING_STORAGE = "hub-public-push-setup";
const RECEIVER_COOKIE = "hub_public_push_receiver";
const RECEIVER_STORAGE = "hub-public-push-receiver";

export type HubPublicPushSourceType = "auditorio" | "service_request";

export type HubPublicPushSetup = {
  claimToken: string;
  pairCode: string;
  sourceType: HubPublicPushSourceType;
  sourceReference: string;
  expiresAt: string;
};

type PrepareRow = {
  claim_token: string;
  pair_code: string;
  source_type: HubPublicPushSourceType;
  source_reference: string;
  expires_at: string;
};

export async function prepareHubPublicPushBySubmission(
  sourceType: HubPublicPushSourceType,
  submissionId: string,
): Promise<HubPublicPushSetup> {
  if (!supabaseConfigured) throw new Error("HUB_PUBLIC_PUSH_SUPABASE_NOT_CONFIGURED");
  const rpc = sourceType === "auditorio"
    ? "auditorio_public_prepare_push"
    : "service_request_public_prepare_push";
  return prepareFromRpc(rpc, { p_submission_id: submissionId });
}

export async function prepareAuditorioPushByAccess(
  protocolNumber: number,
  accessCode: string,
): Promise<HubPublicPushSetup> {
  if (!supabaseConfigured) throw new Error("HUB_PUBLIC_PUSH_SUPABASE_NOT_CONFIGURED");
  return prepareFromRpc("auditorio_public_prepare_push_by_access", {
    p_protocolo: protocolNumber,
    p_codigo_consulta: accessCode,
  });
}

async function prepareFromRpc(name: string, body: Record<string, unknown>): Promise<HubPublicPushSetup> {
  const response = await publicSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text() || "HUB_PUBLIC_PUSH_PREPARE_FAILED");
  const rows = await response.json() as PrepareRow[];
  const row = rows?.[0];
  if (!row?.claim_token || !row.pair_code || !row.source_type || !row.source_reference) {
    throw new Error("HUB_PUBLIC_PUSH_PREPARE_EMPTY");
  }
  const setup: HubPublicPushSetup = {
    claimToken: row.claim_token,
    pairCode: row.pair_code,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    expiresAt: row.expires_at,
  };
  rememberPendingHubPublicPushSetup(setup);
  return setup;
}

export async function subscribeHubPublicPush(setup: HubPublicPushSetup) {
  if (!isHubPublicPushSupported()) throw new Error("HUB_PUBLIC_PUSH_UNSUPPORTED");
  if (isIosDevice() && !isStandaloneDisplay()) throw new Error("HUB_PUBLIC_PUSH_IOS_INSTALL_REQUIRED");
  if (setup.expiresAt && new Date(setup.expiresAt).getTime() <= Date.now()) {
    throw new Error("HUB_PUBLIC_PUSH_CLAIM_EXPIRED");
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "HUB_PUBLIC_PUSH_PERMISSION_DENIED" : "HUB_PUBLIC_PUSH_PERMISSION_REQUIRED");
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
    throw new Error("HUB_PUBLIC_PUSH_SUBSCRIPTION_INVALID");
  }

  const response = await fetch(PUSH_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "subscribe",
      claimToken: setup.claimToken,
      sourceType: setup.sourceType,
      sourceReference: setup.sourceReference,
      pairCode: setup.pairCode,
      userAgent: navigator.userAgent,
      subscription: {
        endpoint: payload.endpoint,
        keys: payload.keys,
      },
    }),
  });
  if (!response.ok) throw new Error(await response.text() || "HUB_PUBLIC_PUSH_REGISTER_FAILED");

  markHubPublicPushReceiver();
  clearPendingHubPublicPushSetup();
  return subscription;
}

export function rememberPendingHubPublicPushSetup(setup: HubPublicPushSetup) {
  const serialized = JSON.stringify(setup);
  try {
    window.localStorage.setItem(PENDING_STORAGE, serialized);
  } catch {
    // Cookie mantém o vínculo para PWA/iOS.
  }
  setCookie(PENDING_COOKIE, serialized, 90 * 24 * 60 * 60);
}

export function readPendingHubPublicPushSetup(): HubPublicPushSetup | null {
  const cookie = readCookie(PENDING_COOKIE);
  if (cookie) {
    const parsed = safeSetup(cookie);
    if (parsed) return parsed;
  }
  try {
    const stored = window.localStorage.getItem(PENDING_STORAGE);
    return stored ? safeSetup(stored) : null;
  } catch {
    return null;
  }
}

export function clearPendingHubPublicPushSetup() {
  try {
    window.localStorage.removeItem(PENDING_STORAGE);
  } catch {
    // sem armazenamento local
  }
  setCookie(PENDING_COOKIE, "", 0);
}

export function markHubPublicPushReceiver() {
  try {
    window.localStorage.setItem(RECEIVER_STORAGE, "1");
  } catch {
    // Cookie mantém o estado.
  }
  setCookie(RECEIVER_COOKIE, "1", 365 * 24 * 60 * 60);
}

export function isHubPublicPushReceiver() {
  try {
    if (window.localStorage.getItem(RECEIVER_STORAGE) === "1") return true;
  } catch {
    // segue para cookie
  }
  return readCookie(RECEIVER_COOKIE) === "1";
}

export function isHubPublicPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
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

export function formatHubPublicPairCode(value: string) {
  const normalized = value.replace(/[^A-Fa-f0-9]/g, "").toUpperCase().slice(0, 12);
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

export function getHubPublicPushErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toUpperCase();
  if (normalized.includes("IOS_INSTALL_REQUIRED")) return "No iPhone, adicione o HUB à Tela de Início, abra pelo ícone e ative as notificações por lá.";
  if (normalized.includes("PERMISSION_DENIED")) return "As notificações estão bloqueadas. Libere as notificações do HUB nas configurações do aparelho/navegador.";
  if (normalized.includes("PERMISSION_REQUIRED")) return "É necessário permitir as notificações para receber as atualizações.";
  if (normalized.includes("UNSUPPORTED")) return "Este navegador não suporta as notificações do HUB. Use Chrome/Edge ou o aplicativo adicionado à Tela de Início.";
  if (normalized.includes("CLAIM_EXPIRED") || normalized.includes("CLAIM_INVALID")) return "O vínculo desta solicitação expirou. Atualize a página e tente novamente.";
  return "Não foi possível ativar as notificações neste aparelho. Tente novamente ou chame a Infraestrutura.";
}

export function sourceLabel(sourceType: HubPublicPushSourceType) {
  return sourceType === "auditorio" ? "Auditório" : "Chamado";
}

export function sourceUrl(sourceType: HubPublicPushSourceType) {
  return sourceType === "auditorio" ? "/auditorio/consulta" : "/chamados";
}

async function loadVapidPublicKey() {
  const response = await fetch(PUSH_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "config" }),
  });
  if (!response.ok) throw new Error("HUB_PUBLIC_PUSH_CONFIG_FAILED");
  const data = await response.json() as { publicKey?: string };
  if (!data.publicKey) throw new Error("HUB_PUBLIC_PUSH_CONFIG_EMPTY");
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

function safeSetup(value: string): HubPublicPushSetup | null {
  try {
    const parsed = JSON.parse(value) as Partial<HubPublicPushSetup>;
    if (!parsed.claimToken || !parsed.pairCode || !parsed.sourceReference) return null;
    if (parsed.sourceType !== "auditorio" && parsed.sourceType !== "service_request") return null;
    return {
      claimToken: parsed.claimToken,
      pairCode: parsed.pairCode,
      sourceType: parsed.sourceType,
      sourceReference: parsed.sourceReference,
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
