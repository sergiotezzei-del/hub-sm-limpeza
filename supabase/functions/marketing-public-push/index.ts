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
type DispatchRow = {
  delivery_id: string;
  lease_token: string;
  event_id: string;
  request_id: string;
  request_number: number | string;
  broker_name: string;
  property_reference: string;
  capture_location: string;
  confirmed_capture_at: string;
  confirmed_duration_minutes?: number | null;
  event_kind: "confirmed" | "updated";
  endpoint: string;
  p256dh: string;
  auth: string;
  ack_token: string;
  sent_count: number;
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
      // segue para erro explícito abaixo
    }
  }
  throw new Error("SUPABASE_SERVICE_ROLE_KEY_UNAVAILABLE");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
if (!supabaseUrl) throw new Error("SUPABASE_URL_UNAVAILABLE");
const supabase = createClient(supabaseUrl, getServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await readJson(req);
    const action = readString(body.action);

    if (action === "config") {
      const secrets = await ensureVapidSecrets();
      return json(200, { publicKey: secrets.vapidPublicKey });
    }

    if (action === "subscribe") {
      const subscription = readSubscription(body.subscription);
      const claimToken = readString(body.claimToken);
      const pairCode = readString(body.pairCode);
      const requestNumber = readPositiveInteger(body.requestNumber);
      if (!claimToken && (!pairCode || !requestNumber)) {
        return json(400, { error: "claim_required" });
      }

      const { data: requestId, error } = await supabase.rpc("marketing_push_register_server", {
        p_claim_token: claimToken || null,
        p_request_number: requestNumber || null,
        p_pair_code: pairCode || null,
        p_endpoint: subscription.endpoint,
        p_p256dh: subscription.p256dh,
        p_auth: subscription.auth,
        p_user_agent: readString(body.userAgent) || null,
      });
      if (error || !requestId) throw new Error(error?.message || "MARKETING_PUSH_REGISTER_FAILED");

      const secrets = await ensureVapidSecrets();
      const result = await dispatchPushes(String(requestId), false, secrets);
      return json(200, { ok: true, dispatched: result.sent });
    }

    if (action === "ack") {
      const ackToken = readString(body.ackToken);
      if (!ackToken || ackToken.length < 32) return json(400, { error: "ack_invalid" });
      const { data, error } = await supabase.rpc("marketing_push_ack_server", { p_ack_token: ackToken });
      if (error) throw new Error(error.message);
      return json(200, { ok: Boolean(data) });
    }

    if (action === "dispatch" || action === "remind") {
      const secrets = await ensureVapidSecrets();
      const supplied = req.headers.get("x-hub-push-secret") || "";
      if (!secrets.webhookSecret || supplied !== secrets.webhookSecret) {
        return json(403, { error: "forbidden" });
      }
      const requestId = action === "dispatch" ? readString(body.requestId) : "";
      const result = await dispatchPushes(requestId || null, action === "remind", secrets);
      return json(200, { ok: true, ...result });
    }

    return json(404, { error: "unknown_action" });
  } catch (error) {
    console.error("marketing-public-push", error);
    return json(500, { error: "internal_error" });
  }
});

async function ensureVapidSecrets() {
  let row = await getSecrets();
  if (!row.vapid_public_key || !row.vapid_private_key) {
    const generated = webpush.generateVAPIDKeys();
    const { error } = await supabase.rpc("marketing_push_store_vapid_keys_server", {
      p_public_key: generated.publicKey,
      p_private_key: generated.privateKey,
    });
    if (error) throw new Error(error.message);
    row = await getSecrets();
  }

  if (!row.vapid_public_key || !row.vapid_private_key) {
    throw new Error("MARKETING_PUSH_VAPID_NOT_CONFIGURED");
  }

  return {
    webhookSecret: row.webhook_secret || "",
    vapidPublicKey: row.vapid_public_key,
    vapidPrivateKey: row.vapid_private_key,
  };
}

async function getSecrets(): Promise<SecretsRow> {
  const { data, error } = await supabase.rpc("marketing_push_get_server_secrets");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data[0] ? data[0] as SecretsRow : {};
}

async function dispatchPushes(
  requestId: string | null,
  reminders: boolean,
  secrets: { webhookSecret: string; vapidPublicKey: string; vapidPrivateKey: string },
) {
  const { data, error } = await supabase.rpc("marketing_push_get_dispatch_batch", {
    p_request_id: requestId,
    p_reminders: reminders,
  });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as DispatchRow[];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  webpush.setVapidDetails(PUBLIC_ORIGIN, secrets.vapidPublicKey, secrets.vapidPrivateKey);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const isReminder = Number(row.sent_count || 0) > 0;
    const payload = buildPayload(row, isReminder);
    const ttlSeconds = pushTtlSeconds(row.confirmed_capture_at);
    if (ttlSeconds <= 0) {
      failed += 1;
      await recordDelivery(
        row.delivery_id,
        row.lease_token,
        false,
        false,
        "capture_time_passed_before_dispatch",
      );
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(payload),
        { TTL: ttlSeconds, urgency: "high" },
      );
      sent += 1;
      await recordDelivery(row.delivery_id, row.lease_token, true, false, null);
    } catch (sendError) {
      failed += 1;
      const statusCode = Number((sendError as { statusCode?: number }).statusCode || 0);
      const terminal = statusCode === 404 || statusCode === 410;
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      await recordDelivery(row.delivery_id, row.lease_token, false, terminal, message);
    }
  }

  return { sent, failed };
}

function pushTtlSeconds(captureAt: string) {
  const remainingSeconds = Math.floor((Date.parse(captureAt) - Date.now()) / 1000);
  if (!Number.isFinite(remainingSeconds)) return 0;
  return Math.max(0, Math.min(5 * 60, remainingSeconds));
}

function buildPayload(row: DispatchRow, isReminder: boolean) {
  const start = new Date(row.confirmed_capture_at);
  const duration = Number(row.confirmed_duration_minutes || 0);
  const end = duration > 0 ? new Date(start.getTime() + duration * 60000) : null;
  const date = formatDate(start);
  const startTime = formatTime(start);
  const endTime = end ? formatTime(end) : "";
  const schedule = endTime ? `${date} · ${startTime} às ${endTime}` : `${date} · ${startTime}`;
  const prefix = isReminder ? "🔔 Lembrete" : row.event_kind === "updated" ? "🔄 Agendamento atualizado" : "✅ Agendamento confirmado";
  const title = isReminder ? `${prefix}: pedido #${row.request_number}` : `${prefix} · Pedido #${row.request_number}`;
  const body = [
    `Imóvel: ${row.property_reference}`,
    schedule,
    `Local: ${row.capture_location}`,
  ].join("\n");

  return {
    title,
    body,
    tag: `marketing-request-${row.request_number}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    requireInteraction: true,
    renotify: true,
    silent: false,
    data: {
      url: "/marketing/notificacoes",
      ackToken: row.ack_token,
      requestNumber: Number(row.request_number),
      title,
      body,
      eventKind: row.event_kind,
      isReminder,
    },
  };
}

async function recordDelivery(deliveryId: string, leaseToken: string, success: boolean, terminal: boolean, errorMessage: string | null) {
  const { data, error } = await supabase.rpc("marketing_push_record_delivery_leased_server", {
    p_delivery_id: deliveryId,
    p_lease_token: leaseToken,
    p_success: success,
    p_terminal: terminal,
    p_error: errorMessage,
  });
  if (error || data !== true) console.error("marketing_push_record_delivery_leased_server", error?.message || "lease_not_owned");
}

function readSubscription(value: unknown) {
  const item = value && typeof value === "object" ? value as JsonRecord : {};
  const keys = item.keys && typeof item.keys === "object" ? item.keys as JsonRecord : {};
  const endpoint = readString(item.endpoint);
  const p256dh = readString(keys.p256dh);
  const auth = readString(keys.auth);
  if (!endpoint || !p256dh || !auth) throw new Error("MARKETING_PUSH_SUBSCRIPTION_INVALID");
  return { endpoint, p256dh, auth };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

async function readJson(req: Request): Promise<JsonRecord> {
  const parsed = await req.json();
  return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
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
