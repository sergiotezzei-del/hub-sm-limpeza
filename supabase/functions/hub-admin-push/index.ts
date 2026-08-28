import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import webpush from "npm:web-push@3.6.7";

const PUBLIC_ORIGIN = "https://hubsantamariatem.vercel.app";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-email-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type VapidRow = { vapid_public_key?: string | null; vapid_private_key?: string | null };
type PushRow = { id: string; endpoint: string; p256dh: string; auth: string };

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
if (!databaseUrl) throw new Error("SUPABASE_DB_URL_UNAVAILABLE");
const db = postgres(databaseUrl, { prepare: false, max: 1, idle_timeout: 20 });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await readJson(req);
    const action = readString(body.action);
    const vapid = await getVapid();

    if (action === "config") return json(200, { publicKey: vapid.publicKey });
    if (action !== "dispatch_email") return json(404, { error: "unknown_action" });

    const secret = (req.headers.get("x-hub-email-secret") || "").trim();
    const validRows = await db`select private.hub_email_inbox_server_secret_valid(${secret}) as valid`;
    if (validRows[0]?.valid !== true) return json(403, { error: "forbidden" });

    const count = Math.max(1, Math.min(1000, Number(body.count) || 1));
    const uidNext = Number(body.uidNext) || 0;
    const rows = await db<PushRow[]>`
      select id::text, endpoint, p256dh, auth
      from private.hub_admin_push_subscriptions
      where active = true
      order by created_at asc
    `;

    if (rows.length === 0) return json(200, { ok: true, sent: 0, failed: 0, noDevices: true });

    webpush.setVapidDetails(PUBLIC_ORIGIN, vapid.publicKey, vapid.privateKey);
    const title = "📧 Novo e-mail";
    const bodyText = count === 1
      ? "Você recebeu 1 novo e-mail na caixa de entrada."
      : `Você recebeu ${count} novos e-mails na caixa de entrada.`;
    const payload = JSON.stringify({
      title,
      body: bodyText,
      tag: "hub-email-inbox",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      requireInteraction: false,
      renotify: true,
      silent: false,
      data: { url: "/", kind: "email", actionTitle: "ABRIR HUB" },
    });

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          { TTL: 3600, urgency: "high" },
        );
        sent += 1;
        await db`
          update private.hub_admin_push_subscriptions
          set last_sent_at = clock_timestamp(), last_success_at = clock_timestamp(),
              last_error = null, updated_at = clock_timestamp()
          where id = ${row.id}::uuid
        `;
      } catch (error) {
        failed += 1;
        const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
        const terminal = statusCode === 404 || statusCode === 410;
        const message = error instanceof Error ? error.message.slice(0, 500) : "push_send_failed";
        await db`
          update private.hub_admin_push_subscriptions
          set active = case when ${terminal} then false else active end,
              last_sent_at = clock_timestamp(), last_error = ${message}, updated_at = clock_timestamp()
          where id = ${row.id}::uuid
        `;
      }
    }

    if (sent > 0 && Number.isSafeInteger(uidNext) && uidNext > 0) {
      await db`
        update private.hub_email_inbox_state
        set last_push_uidnext = greatest(coalesce(last_push_uidnext, 0), ${uidNext}),
            updated_at = clock_timestamp()
        where id = 1
      `;
    }

    return json(200, { ok: true, sent, failed });
  } catch (error) {
    console.error("hub-admin-push", error instanceof Error ? error.name : "unknown");
    return json(500, { error: "internal_error" });
  }
});

async function getVapid() {
  const rows = await db<VapidRow[]>`select vapid_public_key, vapid_private_key from public.marketing_push_get_server_secrets()`;
  const row = rows[0] || {};
  if (!row.vapid_public_key || !row.vapid_private_key) throw new Error("VAPID_NOT_CONFIGURED");
  return { publicKey: row.vapid_public_key, privateKey: row.vapid_private_key };
}

async function readJson(req: Request): Promise<JsonRecord> {
  try {
    const value = await req.json();
    return value && typeof value === "object" ? value as JsonRecord : {};
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
