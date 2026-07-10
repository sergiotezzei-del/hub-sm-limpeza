import type { GuardId } from "../../../types";

const GUARD_SUPABASE_USER_ENV: Record<GuardId, string> = {
  "carlos-clemente": "VITE_GUARD_CARLOS_USER_ID",
  salomao: "VITE_GUARD_SALOMAO_USER_ID",
};

const GUARD_SUPABASE_AUTH_EMAIL_ENV: Record<GuardId, string> = {
  "carlos-clemente": "VITE_GUARD_CARLOS_AUTH_EMAIL",
  salomao: "VITE_GUARD_SALOMAO_AUTH_EMAIL",
};

const ADMIN_SUPABASE_USER_ENV = "VITE_ADMIN_USER_ID";
const ADMIN_SUPABASE_AUTH_EMAIL_ENV = "VITE_ADMIN_AUTH_EMAIL";

const LEGACY_GUARD_USER_ENV: Record<GuardId, string[]> = {
  "carlos-clemente": ["VITE_CARLOS_CLEMENTE_USER_ID"],
  salomao: ["VITE_SALOMAO_USER_ID"],
};

export type GuardSupabaseUserBinding = {
  envName: string;
  userId?: string;
};

export type GuardSupabaseAuthEmailBinding = {
  envName: string;
  email?: string;
};

export type AdminSupabaseUserBinding = {
  envName: string;
  userId?: string;
};

export type AdminSupabaseAuthEmailBinding = {
  envName: string;
  email?: string;
};

export function getGuardSupabaseUserBinding(guardLocalId: GuardId): GuardSupabaseUserBinding {
  const env = import.meta.env as Record<string, string | undefined>;
  const envName = GUARD_SUPABASE_USER_ENV[guardLocalId];
  const userId = env[envName] ?? LEGACY_GUARD_USER_ENV[guardLocalId].map((name) => env[name]).find(Boolean);
  return { envName, userId: userId?.trim() || undefined };
}

export function getGuardSupabaseAuthEmailBinding(guardLocalId: GuardId): GuardSupabaseAuthEmailBinding {
  const env = import.meta.env as Record<string, string | undefined>;
  const envName = GUARD_SUPABASE_AUTH_EMAIL_ENV[guardLocalId];
  const email = env[envName]?.trim();
  return { envName, email: email || undefined };
}

export function getAdminSupabaseUserBinding(): AdminSupabaseUserBinding {
  const env = import.meta.env as Record<string, string | undefined>;
  const userId = env[ADMIN_SUPABASE_USER_ENV]?.trim();
  return { envName: ADMIN_SUPABASE_USER_ENV, userId: userId || undefined };
}

export function getAdminSupabaseAuthEmailBinding(): AdminSupabaseAuthEmailBinding {
  const env = import.meta.env as Record<string, string | undefined>;
  const email = env[ADMIN_SUPABASE_AUTH_EMAIL_ENV]?.trim();
  return { envName: ADMIN_SUPABASE_AUTH_EMAIL_ENV, email: email || undefined };
}
