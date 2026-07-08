import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_DB_URL ?? "";
export const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
export const SUPABASE_KEY_HEADER = ["api", "key"].join("");
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;

export type SupabaseSessionSnapshot = {
  accessToken?: string;
  userId?: string;
};

export async function getSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
      },
    })).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export function getStoredSupabaseSessionSnapshot(): SupabaseSessionSnapshot {
  if (typeof window === "undefined") return {};

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
    const snapshot = parseSupabaseSessionSnapshot(window.localStorage.getItem(key));
    if (snapshot.accessToken || snapshot.userId) return snapshot;
  }

  return {};
}

export function getSupabaseAccessToken() {
  return getStoredSupabaseSessionSnapshot().accessToken;
}

export async function signOutSupabaseAuth() {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  } catch {
    // O logout local do app nao deve depender da disponibilidade do Supabase.
  }
}

function parseSupabaseSessionSnapshot(raw: string | null): SupabaseSessionSnapshot {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as {
      access_token?: unknown;
      currentSession?: { access_token?: unknown; user?: { id?: unknown } };
      user?: { id?: unknown };
    };
    const accessToken = readString(parsed.access_token) ?? readString(parsed.currentSession?.access_token);
    const userId = readString(parsed.user?.id) ?? readString(parsed.currentSession?.user?.id);
    return { accessToken, userId };
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
