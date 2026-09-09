import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
} from "../../security/services/supabaseClient";

const REQUEST_TIMEOUT_MS = 10000;

type ActiveNotebookAssignmentRow = {
  id: string;
  item_id: string;
  person_id: string;
  quantity: number | string;
  returned_quantity: number | string;
  assigned_at: string;
  offsite_use: boolean | null;
};

export type ActiveNotebookUsage = {
  assignmentId: string;
  itemId: string;
  personId: string;
  offsiteUse: boolean;
};

class NotebookAssignmentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "NotebookAssignmentError";
  }
}

export async function registerNotebookAssignment(input: {
  operationId?: string;
  itemId: string;
  personId: string;
  quantity?: number;
  destinationSpaceId?: string;
  actorName: string;
  notes?: string;
  offsiteUse: boolean;
}) {
  return requestJson<Array<{ assignment_id: string; item_status: string; available_quantity: number | string }>>(
    "rpc/register_notebook_assignment",
    {
      method: "POST",
      body: JSON.stringify({
        p_assignment_id: input.operationId ?? crypto.randomUUID(),
        p_item_id: input.itemId,
        p_person_id: input.personId,
        p_quantity: input.quantity ?? 1,
        p_destination_space_id: input.destinationSpaceId || null,
        p_actor_name: input.actorName.trim(),
        p_notes: input.notes?.trim() || null,
        p_offsite_use: input.offsiteUse,
      }),
    },
  );
}

export async function loadActiveNotebookUsage() {
  const rows = await requestJson<ActiveNotebookAssignmentRow[]>(
    "patrimony_assignments?select=id,item_id,person_id,quantity,returned_quantity,assigned_at,offsite_use&order=assigned_at.desc",
  );
  const byItem = new Map<string, ActiveNotebookUsage>();
  rows.forEach((row) => {
    if (Number(row.quantity) - Number(row.returned_quantity) <= 0 || byItem.has(row.item_id)) return;
    byItem.set(row.item_id, {
      assignmentId: row.id,
      itemId: row.item_id,
      personId: row.person_id,
      offsiteUse: Boolean(row.offsite_use),
    });
  });
  return byItem;
}

export function getNotebookAssignmentErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível salvar o vínculo do notebook.";
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalized.includes("SEM PERMISSAO")) return "A sessão de administrador não está válida. Entre novamente.";
  if (normalized.includes("PESSOA NAO ENCONTRADA")) return "A pessoa não existe ou está inativa.";
  if (normalized.includes("ITEM NAO ENCONTRADO")) return "O notebook não existe ou está inativo.";
  return message || "Não foi possível salvar o vínculo do notebook.";
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
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
      throw new NotebookAssignmentError(response.status, parseMessage(details) || `Erro online: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof NotebookAssignmentError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new NotebookAssignmentError(401, "Sessão de administrador não encontrada.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NotebookAssignmentError(408, "Tempo esgotado ao conectar com o Supabase.");
    }
    throw new NotebookAssignmentError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseMessage(details: string) {
  if (!details) return "";
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    return [parsed.message, parsed.details, parsed.hint]
      .filter((value): value is string => typeof value === "string" && Boolean(value))
      .join(" ");
  } catch {
    return details;
  }
}
