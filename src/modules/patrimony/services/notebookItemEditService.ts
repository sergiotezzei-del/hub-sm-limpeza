import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
} from "../../security/services/supabaseClient";

const REQUEST_TIMEOUT_MS = 10000;

export type NotebookItemAuditEntry = {
  id: string;
  actorName: string;
  reason: string;
  changeSummary: string;
  createdAt: string;
};

type AuditRow = {
  id: string;
  actor_name: string;
  reason: string;
  change_summary: string;
  created_at: string;
};

class NotebookItemEditError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "NotebookItemEditError";
  }
}

export async function updateInventoryNotebookWithAudit(input: {
  itemId: string;
  equipmentModelId: string;
  serialNumber?: string;
  observation?: string;
  actorName: string;
  reason: string;
}) {
  return requestJson<Array<{ item_id: string; audit_id: string }>>(
    "rpc/update_inventory_notebook_with_audit",
    {
      method: "POST",
      body: JSON.stringify({
        p_item_id: input.itemId,
        p_equipment_model_id: input.equipmentModelId,
        p_serial_number: input.serialNumber?.trim() || null,
        p_observation: input.observation?.trim() || null,
        p_actor_name: input.actorName.trim(),
        p_reason: input.reason.trim(),
      }),
    },
  );
}

export async function loadNotebookItemAudit(itemId: string) {
  const rows = await requestJson<AuditRow[]>(
    `patrimony_audit_log?select=id,actor_name,reason,change_summary,created_at&action=eq.notebook_item_update&item_id=eq.${encodeURIComponent(itemId)}&order=created_at.desc&limit=50`,
  );
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    reason: row.reason,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  }));
}

export function getNotebookItemEditErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a alteração.";
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalized.includes("SEM PERMISSAO")) return "A sessão de administrador não está válida. Entre novamente.";
  if (normalized.includes("MOTIVO")) return "Informe o motivo da alteração.";
  if (normalized.includes("NENHUMA ALTERACAO")) return "Nenhuma alteração foi feita no notebook.";
  if (normalized.includes("MODELO") && normalized.includes("NAO ENCONTRADO")) return "O modelo selecionado não está mais disponível.";
  if (normalized.includes("DUPLICATE") || normalized.includes("UNIQUE")) return "Este número de série já está cadastrado em outro equipamento.";
  return message || "Não foi possível concluir a alteração.";
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
      throw new NotebookItemEditError(response.status, parseMessage(details) || `Erro online: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof NotebookItemEditError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) throw new NotebookItemEditError(401, "Sessão de administrador não encontrada.");
    if (error instanceof DOMException && error.name === "AbortError") throw new NotebookItemEditError(408, "Tempo esgotado ao conectar com o Supabase.");
    throw new NotebookItemEditError(0, error instanceof Error ? error.message : "Falha de rede.");
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
