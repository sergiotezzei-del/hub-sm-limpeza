import type { ManagedUser } from "../../../types";
import { getSupabaseAccessToken, SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseConfigured } from "../../security/services/supabaseClient";

const MANAGED_USERS_REQUEST_TIMEOUT_MS = 8000;

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

function ensureManagedUsersRemoteReady() {
  if (!supabaseConfigured) {
    throw new ManagedUsersRemoteUnavailableError("Supabase nao configurado.");
  }

  if (!getSupabaseAccessToken()) {
    throw new ManagedUsersRemoteUnavailableError("Sessao Supabase Auth de Admin nao encontrada.");
  }
}

function managedUsersRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MANAGED_USERS_REQUEST_TIMEOUT_MS);
  const accessToken = getSupabaseAccessToken();

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) throw new ManagedUsersRemoteError(response.status, await response.text());
    return response;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
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
