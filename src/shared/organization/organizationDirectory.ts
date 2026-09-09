import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../modules/security/services/supabaseClient";

const REQUEST_TIMEOUT_MS = 10000;

export type OrganizationDirectoryPerson = {
  id: string;
  name: string;
  personType: string;
  department: string;
  teamName?: string;
  managerTeam?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  managedUserId?: string;
  ihomeUserId?: number;
  directorySource: string;
  active: boolean;
};

type DirectoryRow = {
  id: string;
  name: string;
  person_type: string;
  department: string;
  team_name: string | null;
  manager_team: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  managed_user_id: string | null;
  ihome_user_id: number | null;
  directory_source: string;
  active: boolean;
};

export class OrganizationDirectoryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "OrganizationDirectoryError";
  }
}

export const ORGANIZATION_DIRECTORY_UPDATED_EVENT = "hub:organization-directory-updated";

export async function loadOrganizationDirectory(activeOnly = true): Promise<OrganizationDirectoryPerson[]> {
  if (!supabaseConfigured) throw new OrganizationDirectoryError(0, "Supabase não configurado.");
  const filter = activeOnly ? "&active=eq.true" : "";
  const rows = await requestJson<DirectoryRow[]>(
    `organization_directory?select=*&order=name.asc${filter}`,
  );
  return rows.map(mapDirectoryPerson);
}

export function searchOrganizationDirectory(
  people: OrganizationDirectoryPerson[],
  term: string,
) {
  const needle = normalize(term);
  if (!needle) return people;
  return people.filter((person) => normalize(person.name).includes(needle));
}

export function findOrganizationDirectoryPerson(
  people: OrganizationDirectoryPerson[],
  personId: string,
) {
  return people.find((person) => person.id === personId);
}

export async function updatePersonPlacement(input: {
  personId: string;
  department: string;
  teamName?: string;
}) {
  if (!input.personId) throw new OrganizationDirectoryError(400, "Selecione a pessoa.");
  const department = input.department.trim();
  if (!department) throw new OrganizationDirectoryError(400, "Selecione o setor da pessoa.");

  const rows = await requestJson<Array<{ id: string }>>(
    `organization_people?id=eq.${encodeURIComponent(input.personId)}`,
    {
      method: "PATCH",
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

  if (!rows[0]) throw new OrganizationDirectoryError(404, "Pessoa não encontrada.");
  window.dispatchEvent(new CustomEvent(ORGANIZATION_DIRECTORY_UPDATED_EVENT, {
    detail: { personId: input.personId },
  }));
  return rows[0];
}

export function getOrganizationDirectoryErrorMessage(error: unknown) {
  if (error instanceof OrganizationDirectoryError) return error.message;
  return error instanceof Error ? error.message : "Não foi possível atualizar o diretório.";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabaseConfigured) throw new OrganizationDirectoryError(0, "Supabase não configurado.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await response.text();
      throw new OrganizationDirectoryError(response.status, parseRemoteMessage(details) || `Erro online: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof OrganizationDirectoryError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new OrganizationDirectoryError(401, "A sessão de administrador expirou. Entre novamente.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OrganizationDirectoryError(408, "Tempo esgotado ao acessar o diretório de pessoas.");
    }
    throw new OrganizationDirectoryError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function mapDirectoryPerson(row: DirectoryRow): OrganizationDirectoryPerson {
  return {
    id: row.id,
    name: row.name,
    personType: row.person_type,
    department: row.department,
    teamName: row.team_name ?? undefined,
    managerTeam: row.manager_team ?? undefined,
    jobTitle: row.job_title ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    managedUserId: row.managed_user_id ?? undefined,
    ihomeUserId: row.ihome_user_id ?? undefined,
    directorySource: row.directory_source,
    active: row.active,
  };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
