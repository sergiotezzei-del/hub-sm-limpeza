import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import webpush from "npm:web-push@3.6.7";

const PUBLIC_ORIGIN = "https://hubsantamariatem.vercel.app";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-push-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type SecretsRow = {
  webhook_secret?: string | null;
  vapid_public_key?: string | null;
  vapid_private_key?: string | null;
};
type PushTarget = {
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getServiceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      // erro explícito abaixo
    }
  }
  throw new Error("SUPABASE_SERVICE_ROLE_KEY_UNAVAILABLE");
}

function getAnonKey() {
  return Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
if (!supabaseUrl) throw new Error("SUPABASE_URL_UNAVAILABLE");
const serviceSupabase = createClient(supabaseUrl, getServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await readJson(req);
    const action = readString(body.action);
    const secrets = await getSecrets();

    if (action === "config") {
      return json(200, { publicKey: secrets.vapidPublicKey });
    }

    if (action === "subscribe") {
      const subscription = readSubscription(body.subscription);
      const claimToken = readString(body.claimToken);
      const sourceType = readString(body.sourceType).toLowerCase();
      const sourceReference = readString(body.sourceReference);
      const pairCode = readString(body.pairCode);
      if (!claimToken && (!sourceType || !sourceReference || !pairCode)) {
        return json(400, { error: "claim_required" });
      }

      const { data: deviceId, error } = await serviceSupabase.rpc("hub_public_push_register_server", {
        p_claim_token: claimToken || null,
        p_source_type: sourceType || null,
        p_source_reference: sourceReference || null,
        p_pair_code: pairCode || null,
        p_endpoint: subscription.endpoint,
        p_p256dh: subscription.p256dh,
        p_auth: subscription.auth,
        p_user_agent: readString(body.userAgent) || null,
      });
      if (error || !deviceId) throw new Error(error?.message || "HUB_PUBLIC_PUSH_REGISTER_FAILED");
      return json(200, { ok: true, deviceId });
    }

    if (action === "request_update") {
      if (!secrets.webhookSecret || req.headers.get("x-hub-push-secret") !== secrets.webhookSecret) {
        return json(403, { error: "forbidden" });
      }
      const sourceType = readString(body.sourceType).toLowerCase();
      const sourceId = readUuid(body.sourceId);
      if (!sourceType || !sourceId) return json(400, { error: "source_required" });

      const result = await dispatch({
        sourceType,
        sourceId,
        title: readString(body.title) || "Atualização do HUB",
        body: readString(body.body) || "Abra o HUB para conferir.",
        url: safeUrl(readString(body.url)),
        kind: readString(body.kind) || sourceType,
        tag: readString(body.tag) || `hub-${sourceType}-${sourceId}`,
        actionTitle: readString(body.actionTitle) || "ABRIR",
        requireInteraction: true,
        vapid: secrets,
      });
      return json(200, { ok: true, ...result });
    }

    if (action === "broadcast") {
      if (!await isAdminRequest(req)) return json(403, { error: "admin_required" });
      const title = readString(body.title).slice(0, 160);
      const message = readString(body.body).slice(0, 1000);
      if (!title || !message) return json(400, { error: "message_required" });
      const target = readString(body.targetSourceType).toLowerCase();
      const allowedTargets = new Set(["", "auditorio", "service_request", "marketing"]);
      if (!allowedTargets.has(target)) return json(400, { error: "target_invalid" });

      const result = await dispatch({
        sourceType: target || null,
        sourceId: null,
        title,
        body: message,
        url: safeUrl(readString(body.url)),
        kind: "broadcast",
        tag: `hub-broadcast-${Date.now()}`,
        actionTitle: "ABRIR HUB",
        requireInteraction: false,
        vapid: secrets,
      });
      return json(200, { ok: true, target: target || "all", ...result });
    }

    return json(404, { error: "unknown_action" });
  } catch (error) {
    console.error("hub-public-push", error instanceof Error ? error.message : String(error));
    return json(500, { error: "internal_error" });
  }
});

async function getSecrets() {
  const { data, error } = await serviceSupabase.rpc("marketing_push_get_server_secrets");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) && data[0] ? data[0] as SecretsRow : {};
  if (!row.vapid_public_key || !row.vapid_private_key) throw new Error("VAPID_NOT_CONFIGURED");
  return {
    webhookSecret: row.webhook_secret || "",
    vapidPublicKey: row.vapid_public_key,
    vapidPrivateKey: row.vapid_private_key,
  };
}

async function isAdminRequest(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const anonKey = getAnonKey();
  if (!token || !anonKey) return false;

  const userClient = createClient(supabaseUrl!, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.rpc("is_hub_admin");
  return !error && data === true;
}

async function dispatch(input: {
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  body: string;
  url: string;
  kind: string;
  tag: string;
  actionTitle: string;
  requireInteraction: boolean;
  vapid: { vapidPublicKey: string; vapidPrivateKey: string };
}) {
  const { data, error } = await serviceSupabase.rpc("hub_public_push_get_targets_server", {
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
  });
  if (error) throw new Error(error.message);
  const targets = (Array.isArray(data) ? data : []) as PushTarget[];
  if (targets.length === 0) return { sent: 0, failed: 0, devices: 0 };

  webpush.setVapidDetails(PUBLIC_ORIGIN, input.vapid.vapidPublicKey, input.vapid.vapidPrivateKey);
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    tag: input.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    requireInteraction: input.requireInteraction,
    renotify: true,
    silent: false,
    data: {
      url: input.url,
      kind: input.kind,
      actionTitle: input.actionTitle,
    },
  });

  let sent = 0;
  let failed = 0;
  for (const target of targets) {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { TTL: 86400, urgency: "high" },
      );
      sent += 1;
      await recordDevice(target.device_id, true, false, null);
    } catch (sendError) {
      failed += 1;
      const statusCode = Number((sendError as { statusCode?: number }).statusCode || 0);
      const terminal = statusCode === 404 || statusCode === 410;
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      await recordDevice(target.device_id, false, terminal, message);
    }
  }
  return { sent, failed, devices: targets.length };
}

async function recordDevice(deviceId: string, success: boolean, terminal: boolean, errorMessage: string | null) {
  const { error } = await serviceSupabase.rpc("hub_public_push_record_device_server", {
    p_device_id: deviceId,
    p_success: success,
    p_terminal: terminal,
    p_error: errorMessage,
  });
  if (error) console.error("hub_public_push_record_device_server", error.message);
}

function readSubscription(value: unknown) {
  const item = value && typeof value === "object" ? value as JsonRecord : {};
  const keys = item.keys && typeof item.keys === "object" ? item.keys as JsonRecord : {};
  const endpoint = readString(item.endpoint);
  const p256dh = readString(keys.p256dh);
  const auth = readString(keys.auth);
  if (!endpoint || !p256dh || !auth) throw new Error("HUB_PUBLIC_PUSH_SUBSCRIPTION_INVALID");
  return { endpoint, p256dh, auth };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readUuid(value: unknown) {
  const text = readString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function safeUrl(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 500);
}

async function readJson(req: Request): Promise<JsonRecord> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
