import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";
import type { PatrimonyPersonType } from "../types/patrimony.types";

const REQUEST_TIMEOUT_MS = 12000;

export type InventoryPersonAuditEntry = {
  id: string;
  personId?: string;
  itemId?: string;
  assignmentId?: string;
  actorName: string;
  reason: string;
  changeSummary: string;
  createdAt: string;
};

type AuditRow = {
  id: string;
  person_id: string | null;
  item_id: string | null;
  assignment_id: string | null;
  actor_name: string;
  reason: string;
  change_summary: string;
  created_at: string;
};

export type UpdateInventoryPersonInput = {
  personId: string;
  name: string;
  personType: PatrimonyPersonType;
  department: string;
  teamName?: string;
  jobTitle?: string;
  notebookItemId?: string;
  actorName: string;
  reason: string;
};

class InventoryEditRemoteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "InventoryEditRemoteError";
  }
}

export async function updateInventoryPersonWithAudit(input: UpdateInventoryPersonInput) {
  return requestJson<Array<{ person_id: string; notebook_item_id: string | null; audit_id: string }>>(
    "rpc/update_inventory_person_with_audit",
    {
      method: "POST",
      body: JSON.stringify({
        p_person_id: input.personId,
        p_name: input.name.trim(),
        p_person_type: input.personType,
        p_department: input.department.trim(),
        p_team_name: input.teamName?.trim() || null,
        p_job_title: input.jobTitle?.trim() || null,
        p_notebook_item_id: input.notebookItemId || null,
        p_actor_name: input.actorName.trim(),
        p_reason: input.reason.trim(),
      }),
    },
  );
}

export async function loadInventoryPersonAudit(personId: string): Promise<InventoryPersonAuditEntry[]> {
  const rows = await requestJson<AuditRow[]>(
    `patrimony_audit_log?person_id=eq.${encodeURIComponent(personId)}&select=id,person_id,item_id,assignment_id,actor_name,reason,change_summary,created_at&order=created_at.desc&limit=20`,
  );
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id ?? undefined,
    itemId: row.item_id ?? undefined,
    assignmentId: row.assignment_id ?? undefined,
    actorName: row.actor_name,
    reason: row.reason,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  }));
}

export function getInventoryEditErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível salvar a alteração.";
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("nenhuma alteracao")) return "Nenhuma alteração foi identificada.";
  if (normalized.includes("motivo da alteracao")) return "Informe o motivo da alteração.";
  if (normalized.includes("mais de um notebook")) return message;
  if (normalized.includes("notebook possui mais de um vinculo")) return message;
  if (normalized.includes("notebook selecionado")) return message;
  if (normalized.includes("sem permissao")) return "A sessão de administrador não está válida. Entre novamente.";
  if (error instanceof InventoryEditRemoteError && (error.status === 401 || error.status === 403)) {
    return "A sessão de administrador expirou. Entre novamente.";
  }
  return message;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseConfigured) throw new InventoryEditRemoteError(0, "Supabase não configurado.");
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
      throw new InventoryEditRemoteError(response.status, parseRemoteMessage(details) || `Erro online: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof InventoryEditRemoteError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new InventoryEditRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new InventoryEditRemoteError(408, "Tempo esgotado ao conectar com o Supabase.");
    }
    throw new InventoryEditRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseRemoteMessage(details: string) {
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
