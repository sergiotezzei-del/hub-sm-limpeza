import {
  authenticatedSupabaseFetch,
  getFreshSupabaseAccessToken,
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

const PUSH_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/hub-public-push`;

export type PublicPushBroadcastTarget = "all" | "auditorio" | "service_request" | "marketing";

export type HubPublicPushStats = {
  activeDevices: number;
  auditorio: number;
  serviceRequest: number;
  marketing: number;
};

export async function loadHubPublicPushStats(): Promise<HubPublicPushStats> {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/hub_public_push_admin_stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(await response.text() || "HUB_PUBLIC_PUSH_STATS_FAILED");
  const data = await response.json() as Partial<HubPublicPushStats> | null;
  return {
    activeDevices: Number(data?.activeDevices || 0),
    auditorio: Number(data?.auditorio || 0),
    serviceRequest: Number(data?.serviceRequest || 0),
    marketing: Number(data?.marketing || 0),
  };
}

export async function broadcastHubPublicPush(input: {
  target: PublicPushBroadcastTarget;
  title: string;
  body: string;
  url?: string;
}) {
  const token = await getFreshSupabaseAccessToken();
  if (!token) throw new Error("HUB_ADMIN_SESSION_REQUIRED");

  const response = await fetch(PUSH_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
    },
    body: JSON.stringify({
      action: "broadcast",
      targetSourceType: input.target === "all" ? "" : input.target,
      title: input.title.trim(),
      body: input.body.trim(),
      url: input.url || "/",
    }),
  });
  const result = await response.json().catch(() => ({})) as {
    ok?: boolean;
    sent?: number;
    failed?: number;
    devices?: number;
    error?: string;
  };
  if (!response.ok || !result.ok) throw new Error(result.error || "HUB_PUBLIC_PUSH_BROADCAST_FAILED");
  return {
    sent: Number(result.sent || 0),
    failed: Number(result.failed || 0),
    devices: Number(result.devices || 0),
  };
}
