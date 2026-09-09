import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";

const REQUEST_TIMEOUT_MS = 10000;

class OrganizationDirectoryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "OrganizationDirectoryError";
  }
}

export async function updatePersonPlacement(input: {
  personId: string;
  department: string;
  teamName?: string;
}) {
  if (!input.personId) throw new OrganizationDirectoryError(400, "Selecione a pessoa.");
  const department = input.department.trim();
  if (!department) throw new OrganizationDirectoryError(400, "Selecione o setor da pessoa.");
  if (!supabaseConfigured) throw new OrganizationDirectoryError(0, "Supabase não configurado.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await authenticatedSupabaseFetch(
      `${SUPABASE_URL}/rest/v1/organization_people?id=eq.${encodeURIComponent(input.personId)}`,
      {
        method: "PATCH",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          department,
          team_name: input.teamName?.trim() || null,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!response.ok) {
      const details = await response.text();
      throw new OrganizationDirectoryError(response.status, details || "Não foi possível atualizar equipe e setor.");
    }
    const rows = await response.json() as Array<{ id: string }>;
    if (!rows[0]) throw new OrganizationDirectoryError(404, "Pessoa não encontrada.");
    return rows[0];
  } catch (error) {
    if (error instanceof OrganizationDirectoryError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new OrganizationDirectoryError(401, "A sessão de administrador expirou. Entre novamente.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OrganizationDirectoryError(408, "Tempo esgotado ao atualizar a pessoa.");
    }
    throw new OrganizationDirectoryError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getOrganizationDirectoryErrorMessage(error: unknown) {
  if (error instanceof OrganizationDirectoryError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível atualizar o diretório.";
}
