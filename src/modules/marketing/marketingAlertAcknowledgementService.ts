import {
  publicSupabaseFetch,
  SUPABASE_URL,
  supabaseConfigured,
} from "../security/services/supabaseClient";

export type MarketingAlertKind = "request" | "urgency";

export type MarketingAlertAcknowledgement = {
  request_id: string;
  alert_kind: MarketingAlertKind;
};

const REQUEST_TIMEOUT_MS = 12000;

export async function loadAcknowledgedMarketingAlerts(
  sessionToken: string,
): Promise<MarketingAlertAcknowledgement[]> {
  if (!sessionToken || !supabaseConfigured) return [];
  return rpc<MarketingAlertAcknowledgement[]>(
    "marketing_v2_get_acknowledged_request_alerts",
    { p_session_token: sessionToken },
  );
}

export async function acknowledgeMarketingRequestAlert(
  sessionToken: string,
  requestId: string,
  alertKind: MarketingAlertKind,
) {
  if (!sessionToken) throw new Error("MARKETING_SESSION_REQUIRED");
  await rpc<unknown>("marketing_v2_acknowledge_request_alert", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_alert_kind: alertKind,
  });
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseConfigured) throw new Error("SUPABASE_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await publicSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || `Falha no reconhecimento do alerta (${response.status}).`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
