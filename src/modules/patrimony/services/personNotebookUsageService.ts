import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
} from "../../security/services/supabaseClient";

const REQUEST_TIMEOUT_MS = 10000;

type PersonUsageRow = {
  id: string;
  notebook_offsite_use: boolean | null;
};

class PersonNotebookUsageError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PersonNotebookUsageError";
  }
}

export async function loadPersonNotebookUsage() {
  const rows = await requestJson<PersonUsageRow[]>(
    "organization_people?select=id,notebook_offsite_use&active=eq.true",
  );
  return new Map(rows.map((row) => [row.id, Boolean(row.notebook_offsite_use)]));
}

export async function setPersonNotebookOffsiteUse(personId: string, offsiteUse: boolean) {
  const rows = await requestJson<PersonUsageRow[]>(
    `organization_people?id=eq.${encodeURIComponent(personId)}&select=id,notebook_offsite_use`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ notebook_offsite_use: offsiteUse }),
    },
  );
  if (!rows[0]) throw new PersonNotebookUsageError(404, "Pessoa não encontrada.");
  return Boolean(rows[0].notebook_offsite_use);
}

export async function updatePersonNotebookOffsiteUseWithAudit(input: {
  personId: string;
  offsiteUse: boolean;
  actorName: string;
  reason: string;
}) {
  return requestJson<Array<{ person_id: string; audit_id: string }>>(
    "rpc/update_person_notebook_offsite_with_audit",
    {
      method: "POST",
      body: JSON.stringify({
        p_person_id: input.personId,
        p_offsite_use: input.offsiteUse,
        p_actor_name: input.actorName.trim(),
        p_reason: input.reason.trim(),
      }),
    },
  );
}

export function getPersonNotebookUsageErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível salvar o uso externo do notebook.";
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalized.includes("SEM PERMISSAO")) return "A sessão de administrador não está válida. Entre novamente.";
  if (normalized.includes("MOTIVO")) return "Informe o motivo da alteração.";
  if (normalized.includes("NENHUMA ALTERACAO")) return "Nenhuma alteração foi feita no uso fora do prédio.";
  if (normalized.includes("PESSOA NAO ENCONTRADA")) return "A pessoa não existe ou está inativa.";
  return message || "Não foi possível salvar o uso externo do notebook.";
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
      throw new PersonNotebookUsageError(response.status, parseMessage(details) || `Erro online: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof PersonNotebookUsageError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new PersonNotebookUsageError(401, "Sessão de administrador não encontrada.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PersonNotebookUsageError(408, "Tempo esgotado ao conectar com o Supabase.");
    }
    throw new PersonNotebookUsageError(0, error instanceof Error ? error.message : "Falha de rede.");
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
