import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

export type AlertServiceRequest = {
  id: string;
  protocolNumber: number;
  requesterName: string;
  department: string;
  requestText: string;
  status: string;
  openedAt: string;
};

type AlertServiceRequestRow = {
  id: string;
  protocol_number: number | string;
  requester_name: string;
  department: string;
  request_text: string;
  status: string;
  opened_at: string;
};

const SELECT = "id,protocol_number,requester_name,department,request_text,status,opened_at";

export async function loadAlertServiceRequests(): Promise<AlertServiceRequest[]> {
  const response = await authenticatedSupabaseFetch(createUrl({
    select: SELECT,
    show_in_alerts: "eq.true",
    status: "not.in.(concluido,cancelado)",
    order: "opened_at.desc",
  }), { headers: { Accept: "application/json" } });
  const rows = await readRowsOrThrow<AlertServiceRequestRow>(response, "select-alert-service-requests");
  return rows.map((row) => ({
    id: row.id,
    protocolNumber: Number(row.protocol_number),
    requesterName: row.requester_name,
    department: row.department,
    requestText: row.request_text,
    status: row.status,
    openedAt: row.opened_at,
  }));
}

export async function loadAlertServiceRequestIds(): Promise<string[]> {
  const response = await authenticatedSupabaseFetch(createUrl({
    select: "id",
    show_in_alerts: "eq.true",
    status: "not.in.(concluido,cancelado)",
  }), { headers: { Accept: "application/json" } });
  const rows = await readRowsOrThrow<{ id: string }>(response, "select-alert-service-request-ids");
  return rows.map((row) => String(row.id));
}

export async function setServiceRequestAlertVisibility(requestId: string, visible: boolean, actorName: string) {
  const response = await authenticatedSupabaseFetch(createUrl({ id: `eq.${requestId}` }), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      show_in_alerts: visible,
      last_actor_name: actorName,
      updated_at: new Date().toISOString(),
    }),
  });
  await ensureRestSuccess(response, "set-service-request-alert-visibility");
}

export async function completeAlertServiceRequest(requestId: string) {
  const response = await authenticatedSupabaseFetch(createUrl({ id: `eq.${requestId}` }), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await ensureRestSuccess(response, "complete-alert-service-request");
}

function createUrl(query: Record<string, string>) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/service_requests`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function readRowsOrThrow<T>(response: Response, context: string): Promise<T[]> {
  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw createRestError(context, diagnostic);
  }
  const text = await response.text();
  if (!text) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
}

async function ensureRestSuccess(response: Response, context: string) {
  if (response.ok) return;
  const diagnostic = await readSupabaseRestError(response);
  throw createRestError(context, diagnostic);
}

function createRestError(
  context: string,
  diagnostic: { status: number; code: string | null; message: string | null },
) {
  return new Error(
    `SUPABASE_REST_${context}:${diagnostic.status}:${diagnostic.code ?? "unknown"}:${diagnostic.message ?? "unknown"}`,
  );
}
