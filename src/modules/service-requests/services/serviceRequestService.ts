import {
  authenticatedSupabaseFetch,
  getSupabaseClient,
  publicSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";
import type {
  PublicServiceRequestDraft,
  PublicServiceRequestReceipt,
  ServiceRequest,
  ServiceRequestDataset,
  ServiceRequestEvent,
  ServiceRequestStatus,
} from "../types/serviceRequest.types";

const REQUEST_TIMEOUT_MS = 12000;

type ServiceRequestRow = {
  id: string;
  protocol_number: number | string;
  requester_name: string;
  department: string;
  request_text: string;
  status: ServiceRequestStatus;
  admin_notes: string | null;
  last_actor_name: string;
  opened_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

type ServiceRequestEventRow = {
  id: string;
  request_id: string;
  event_type: "criado" | "status_alterado" | "anotacao";
  from_status: ServiceRequestStatus | null;
  to_status: ServiceRequestStatus | null;
  actor_name: string;
  note: string | null;
  created_at: string;
};

type PublicReceiptRow = {
  request_id: string;
  protocol_number: number | string;
  opened_at: string;
};

export class ServiceRequestRemoteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details = "",
  ) {
    super(message);
    this.name = "ServiceRequestRemoteError";
  }
}

export async function submitPublicServiceRequest(
  draft: PublicServiceRequestDraft,
): Promise<PublicServiceRequestReceipt> {
  ensureReady();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await publicSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_service_request`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_submission_id: draft.submissionId,
        p_requester_name: draft.requesterName,
        p_department: draft.department,
        p_request_text: draft.requestText,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new ServiceRequestRemoteError(response.status, extractRemoteMessage(details), details);
    }

    const rows = await response.json() as PublicReceiptRow[];
    const row = rows[0];
    if (!row) throw new ServiceRequestRemoteError(500, "Não foi possível confirmar o chamado enviado.");

    return {
      requestId: row.request_id,
      protocolNumber: Number(row.protocol_number),
      openedAt: row.opened_at,
    };
  } catch (error) {
    if (error instanceof ServiceRequestRemoteError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ServiceRequestRemoteError(408, "A conexão demorou demais.");
    }
    throw new ServiceRequestRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadServiceRequestDataset(): Promise<ServiceRequestDataset> {
  const [requests, events] = await Promise.all([
    adminRequestJson<ServiceRequestRow[]>("service_requests?select=*&status=neq.concluido&order=opened_at.desc&limit=500"),
    adminRequestJson<ServiceRequestEventRow[]>("service_request_events?select=*&order=created_at.desc&limit=1000"),
  ]);

  return {
    requests: requests.map(mapServiceRequest),
    events: events.map(mapServiceRequestEvent),
  };
}

export async function updateServiceRequest(
  requestId: string,
  input: {
    status?: ServiceRequestStatus;
    adminNotes?: string;
    actorName: string;
  },
): Promise<ServiceRequest> {
  if (input.status === "concluido") {
    const rows = await adminRequestJson<ServiceRequestRow[]>(
      `service_requests?id=eq.${encodeURIComponent(requestId)}&select=*`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
    );

    if (!rows[0]) throw new ServiceRequestRemoteError(404, "Chamado não encontrado.");
    return {
      ...mapServiceRequest(rows[0]),
      status: "concluido",
      lastActorName: input.actorName,
      completedAt: new Date().toISOString(),
    };
  }

  const payload: Record<string, unknown> = {
    last_actor_name: input.actorName,
  };
  if (input.status) payload.status = input.status;
  if (input.adminNotes !== undefined) payload.admin_notes = input.adminNotes.trim() || null;

  const rows = await adminRequestJson<ServiceRequestRow[]>(
    `service_requests?id=eq.${encodeURIComponent(requestId)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
  );

  if (!rows[0]) throw new ServiceRequestRemoteError(404, "Chamado não encontrado.");
  return mapServiceRequest(rows[0]);
}

export function getPublicServiceRequestErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  const normalized = normalize(message);

  if (normalized.includes("INFORME SEU NOME")) return message;
  if (normalized.includes("SELECIONE UM SETOR")) return message;
  if (normalized.includes("DESCREVA O QUE PRECISA")) return message;
  if (error instanceof ServiceRequestRemoteError && error.status === 408) {
    return "A conexão demorou demais. Verifique a internet e tente novamente.";
  }
  if (error instanceof ServiceRequestRemoteError && error.status >= 500) {
    return "O sistema está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  if (error instanceof ServiceRequestRemoteError && error.status === 0) {
    return "Não foi possível conectar. Verifique a internet e tente novamente.";
  }
  return message || "Não foi possível enviar o chamado.";
}

export function getAdminServiceRequestErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  const normalized = normalize(message);

  if (normalized.includes("JWT EXPIRED") || normalized.includes("PGRST303")) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (normalized.includes("ROW-LEVEL SECURITY") || normalized.includes("SEM PERMISSAO")) {
    return "Você não tem permissão para acessar os chamados.";
  }
  if (error instanceof ServiceRequestRemoteError && (error.status === 401 || error.status === 403)) {
    return "Sua sessão de administrador expirou. Entre novamente.";
  }
  if (error instanceof ServiceRequestRemoteError && error.status === 408) {
    return "A conexão demorou demais. Verifique a internet e tente novamente.";
  }
  if (error instanceof ServiceRequestRemoteError && error.status >= 500) {
    return "O Supabase apresentou uma falha temporária. Tente novamente.";
  }
  return message || "Não foi possível concluir a operação.";
}

async function adminRequestJson<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  ensureReady();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      const details = await response.text();
      if (allowRefresh && shouldRefresh(response.status, details)) {
        await refreshSupabaseSession();
        return adminRequestJson<T>(path, init, false);
      }
      throw new ServiceRequestRemoteError(response.status, extractRemoteMessage(details), details);
    }

    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ServiceRequestRemoteError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new ServiceRequestRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ServiceRequestRemoteError(408, "Tempo limite da conexão excedido.");
    }
    throw new ServiceRequestRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function refreshSupabaseSession() {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.refreshSession();
  if (error) throw new ServiceRequestRemoteError(401, "Não foi possível renovar a sessão.", error.message);
}

function shouldRefresh(status: number, details: string) {
  const normalized = normalize(details);
  return status === 401 || normalized.includes("JWT EXPIRED") || normalized.includes("PGRST303");
}

function mapServiceRequest(row: ServiceRequestRow): ServiceRequest {
  return {
    id: row.id,
    protocolNumber: Number(row.protocol_number),
    requesterName: row.requester_name,
    department: row.department,
    requestText: row.request_text,
    status: row.status,
    adminNotes: row.admin_notes || undefined,
    lastActorName: row.last_actor_name,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
  };
}

function mapServiceRequestEvent(row: ServiceRequestEventRow): ServiceRequestEvent {
  return {
    id: row.id,
    requestId: row.request_id,
    eventType: row.event_type,
    fromStatus: row.from_status || undefined,
    toStatus: row.to_status || undefined,
    actorName: row.actor_name,
    note: row.note || undefined,
    createdAt: row.created_at,
  };
}

function ensureReady() {
  if (!supabaseConfigured) throw new ServiceRequestRemoteError(503, "Supabase não configurado.");
}

function extractRemoteMessage(details: string) {
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const extra = typeof parsed.details === "string"
      ? parsed.details
      : typeof parsed.hint === "string"
        ? parsed.hint
        : "";
    return [message, extra].filter(Boolean).join(" — ") || details;
  } catch {
    return details;
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
