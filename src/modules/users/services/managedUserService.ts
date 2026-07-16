import type { ManagedUser } from "../../../types";
import { getSupabaseAccessToken, SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseConfigured } from "../../security/services/supabaseClient";

const MANAGED_USERS_REQUEST_TIMEOUT_MS = 8000;
const MANAGED_USERS_LOGIN_RPC_PATH = "rpc/login_managed_user";

type ManagedUsersRequestMode = "admin" | "public";

type ManagedUserRow = {
  id: string;
  name: string;
  access_code: string;
  user_type: string | null;
  job_title: string | null;
  department: string | null;
  photo_data: string | null;
  permissions: string[] | null;
  active: boolean | null;
  protected: boolean | null;
  system: boolean | null;
  linked_employee_id: string | null;
  linked_guard_id: string | null;
  created_at: string;
  updated_at: string;
};

type ManagedUserLoginRow = Omit<ManagedUserRow, "access_code">;

export class ManagedUsersRemoteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedUsersRemoteUnavailableError";
  }
}

class ManagedUsersRemoteError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
    public readonly path: string,
    public readonly requestMode: ManagedUsersRequestMode,
  ) {
    super(details || `MANAGED_USERS_REMOTE_ERROR_${status}`);
    this.name = "ManagedUsersRemoteError";
  }
}

export async function loadManagedUsersRemote() {
  ensureManagedUsersRemoteReady();

  const response = await managedUsersRequest("managed_users?select=*&order=name.asc");
  const rows = (await response.json()) as ManagedUserRow[];
  return rows.map(mapManagedUserRow);
}

export async function loginManagedUserRemoteByAccessCode(accessCode: string): Promise<ManagedUser | null> {
  const cleanAccessCode = accessCode.trim();
  if (!cleanAccessCode) return null;

  if (!supabaseConfigured) {
    const details = "Supabase nao configurado para login remoto.";
    logManagedUsersRequestError({
      path: MANAGED_USERS_LOGIN_RPC_PATH,
      requestMode: "public",
      status: 0,
      details,
    });
    throw new ManagedUsersRemoteError(0, details, MANAGED_USERS_LOGIN_RPC_PATH, "public");
  }

  const response = await managedUsersPublicRequest(MANAGED_USERS_LOGIN_RPC_PATH, {
    method: "POST",
    body: JSON.stringify({ p_access_code: cleanAccessCode }),
  });
  const rows = await response.json() as ManagedUserLoginRow[];
  const row = rows[0];

  return row ? mapManagedUserLoginRow(row, cleanAccessCode) : null;
}

export async function saveManagedUserRemote(user: ManagedUser) {
  ensureManagedUsersRemoteReady();

  const response = await managedUsersRequest("managed_users?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([managedUserToRow(user)]),
  });
  const rows = (await response.json()) as ManagedUserRow[];
  const row = rows[0];
  if (!row?.id) throw new Error("Nao foi possivel confirmar o usuario salvo no Supabase.");
  return mapManagedUserRow(row);
}

export async function deleteManagedUserRemote(userId: string) {
  ensureManagedUsersRemoteReady();

  await managedUsersRequest(`managed_users?id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function syncLocalManagedUsersToCloud(users: ManagedUser[]) {
  ensureManagedUsersRemoteReady();

  const response = await managedUsersRequest("managed_users?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(users.map(managedUserToRow)),
  });
  const rows = (await response.json()) as ManagedUserRow[];
  return rows.map(mapManagedUserRow);
}

export function isManagedUsersRemoteProtectedError(error: unknown) {
  return error instanceof ManagedUsersRemoteError && (error.status === 401 || error.status === 403);
}

export function getManagedUserRemoteLoginErrorMessage(error: unknown) {
  if (!(error instanceof ManagedUsersRemoteError)) {
    return "Não foi possível conectar ao Supabase. Verifique a internet e tente novamente.";
  }

  if (error.status === 400 || error.status === 404) {
    return "Erro na função de login remoto. Atualize o sistema e tente novamente.";
  }

  if (error.status === 401 || error.status === 403) {
    return "Acesso remoto bloqueado. Verifique a configuração do Supabase.";
  }

  return "Não foi possível conectar ao Supabase. Verifique a internet e tente novamente.";
}

function ensureManagedUsersRemoteReady() {
  if (!supabaseConfigured) {
    throw new ManagedUsersRemoteUnavailableError("Supabase nao configurado.");
  }

  if (!getSupabaseAccessToken()) {
    throw new ManagedUsersRemoteUnavailableError("Sessao Supabase Auth de Admin nao encontrada.");
  }
}

function managedUsersRequest(path: string, init: RequestInit = {}) {
  const accessToken = getSupabaseAccessToken();
  return managedUsersRemoteRequest(path, init, "admin", accessToken ?? SUPABASE_PUBLIC_KEY);
}

function managedUsersPublicRequest(path: string, init: RequestInit = {}) {
  return managedUsersRemoteRequest(path, init, "public", SUPABASE_PUBLIC_KEY);
}

function managedUsersRemoteRequest(path: string, init: RequestInit, requestMode: ManagedUsersRequestMode, authorizationToken: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MANAGED_USERS_REQUEST_TIMEOUT_MS);

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${authorizationToken}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) {
      const details = await response.text();
      logManagedUsersRequestError({
        path,
        requestMode,
        status: response.status,
        details,
      });
      throw new ManagedUsersRemoteError(response.status, details, path, requestMode);
    }
    return response;
  }).catch((error: unknown) => {
    if (error instanceof ManagedUsersRemoteError) throw error;

    const details = error instanceof DOMException && error.name === "AbortError"
      ? `Timeout depois de ${MANAGED_USERS_REQUEST_TIMEOUT_MS}ms.`
      : error instanceof Error ? error.message : "Falha de rede.";
    logManagedUsersRequestError({
      path,
      requestMode,
      status: 0,
      details,
    });
    throw new ManagedUsersRemoteError(0, details, path, requestMode);
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function logManagedUsersRequestError(details: { path: string; requestMode: ManagedUsersRequestMode; status: number; details: string }) {
  if (!import.meta.env.DEV) return;
  console.error("[managed_users] Falha na chamada remota", details);
}

function managedUserToRow(user: ManagedUser) {
  return {
    id: user.id,
    name: user.name,
    access_code: user.accessCode,
    user_type: user.userType,
    job_title: user.jobTitle,
    department: user.department,
    photo_data: user.photoData ?? null,
    permissions: user.permissions,
    active: user.active,
    protected: Boolean(user.protected),
    system: Boolean(user.system),
    linked_employee_id: user.linkedEmployeeId ?? null,
    linked_guard_id: user.linkedGuardId ?? null,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

function mapManagedUserRow(row: ManagedUserRow): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    accessCode: row.access_code,
    userType: (row.user_type || "Consulta") as ManagedUser["userType"],
    jobTitle: row.job_title || row.user_type || "Consulta",
    department: (row.department || "Administração") as ManagedUser["department"],
    photoData: row.photo_data || undefined,
    permissions: Array.isArray(row.permissions) ? row.permissions as ManagedUser["permissions"] : [],
    active: row.active ?? true,
    protected: row.protected ?? false,
    system: row.system ?? false,
    linkedEmployeeId: row.linked_employee_id as ManagedUser["linkedEmployeeId"] | undefined,
    linkedGuardId: row.linked_guard_id as ManagedUser["linkedGuardId"] | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapManagedUserLoginRow(row: ManagedUserLoginRow, accessCode: string): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    accessCode,
    userType: (row.user_type || "Consulta") as ManagedUser["userType"],
    jobTitle: row.job_title || row.user_type || "Consulta",
    department: (row.department || "Administração") as ManagedUser["department"],
    photoData: row.photo_data || undefined,
    permissions: Array.isArray(row.permissions) ? row.permissions as ManagedUser["permissions"] : [],
    active: row.active ?? true,
    protected: row.protected ?? false,
    system: row.system ?? false,
    linkedEmployeeId: row.linked_employee_id as ManagedUser["linkedEmployeeId"] | undefined,
    linkedGuardId: row.linked_guard_id as ManagedUser["linkedGuardId"] | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
