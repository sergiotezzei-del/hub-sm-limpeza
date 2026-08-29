import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

export type AttentionEvent = {
  id: string;
  sourceType: "order" | "stock_check";
  sourceId: string;
  title: string;
  description?: string;
  createdAt: string;
};

type AttentionEventRow = {
  id: string;
  source_type: "order" | "stock_check";
  source_id: string;
  title: string;
  description: string | null;
  created_at: string;
};

export async function loadAttentionEvents(): Promise<AttentionEvent[]> {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/hub_attention_events_get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const rows = await readRowsOrThrow<AttentionEventRow>(response, "attention-events-get");
  return rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function acknowledgeAttentionEvent(eventId: string, actorName: string) {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/hub_attention_event_ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: eventId, p_actor_name: actorName }),
  });
  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw new Error(
      `SUPABASE_REST_attention-event-ack:${diagnostic.status}:${diagnostic.code ?? "unknown"}:${diagnostic.message ?? "unknown"}`,
    );
  }
}

async function readRowsOrThrow<T>(response: Response, context: string): Promise<T[]> {
  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw new Error(
      `SUPABASE_REST_${context}:${diagnostic.status}:${diagnostic.code ?? "unknown"}:${diagnostic.message ?? "unknown"}`,
    );
  }
  const text = await response.text();
  if (!text) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
}
