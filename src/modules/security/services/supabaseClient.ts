import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_DB_URL ?? "";
export const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
export const SUPABASE_KEY_HEADER = ["api", "key"].join("");
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;
let activeSessionSnapshot: SupabaseSessionSnapshot = {};

export type SupabaseSessionSnapshot = {
  accessToken?: string;
  userId?: string;
};

type SessionLike = {
  access_token?: string | null;
  user?: { id?: string | null } | null;
} | null | undefined;

export async function getSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      const client = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
        },
        global: {
          fetch: createHubSupabaseFetch(),
        },
      });

      const storedSnapshot = getStoredSupabaseSessionSnapshot();
      if (storedSnapshot.accessToken || storedSnapshot.userId) activeSessionSnapshot = storedSnapshot;

      client.auth.onAuthStateChange((_event, session) => {
        rememberSupabaseSession(session);
      });

      void client.auth.getSession().then(({ data, error }) => {
        if (!error) rememberSupabaseSession(data.session);
      }).catch(() => undefined);

      return client;
    }).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export function rememberSupabaseSession(session: SessionLike) {
  const accessToken = readString(session?.access_token);
  const userId = readString(session?.user?.id);
  activeSessionSnapshot = accessToken || userId ? { accessToken, userId } : {};
}

export function getStoredSupabaseSessionSnapshot(): SupabaseSessionSnapshot {
  if (typeof window === "undefined") return {};
  const storageKey = getHubSupabaseAuthStorageKey();
  if (!storageKey) return {};
  return parseSupabaseSessionSnapshot(window.localStorage.getItem(storageKey));
}

export function getSupabaseAccessToken() {
  return activeSessionSnapshot.accessToken ?? getStoredSupabaseSessionSnapshot().accessToken;
}

export async function getFreshSupabaseAccessToken() {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return undefined;
    const { data, error } = await supabase.auth.getSession();
    if (error) return undefined;
    rememberSupabaseSession(data.session);
    return data.session?.access_token || undefined;
  } catch {
    return undefined;
  }
}

export async function signOutSupabaseAuth() {
  activeSessionSnapshot = {};
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  } catch {
    // O logout local do app nao deve depender da disponibilidade do Supabase.
  }
}

function getHubSupabaseAuthStorageKey() {
  try {
    const hostname = new URL(SUPABASE_URL).hostname;
    const projectRef = hostname.split(".")[0]?.trim();
    return projectRef ? `sb-${projectRef}-auth-token` : "";
  } catch {
    return "";
  }
}

function createHubSupabaseFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);
    if (!url.includes("/rest/v1/")) return window.fetch(input, init);

    const accessToken = getSupabaseAccessToken();
    if (!accessToken) return window.fetch(input, init);

    const inputHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(inputHeaders);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set("Authorization", `Bearer ${accessToken}`);

    return window.fetch(input, { ...init, headers });
  };
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
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
