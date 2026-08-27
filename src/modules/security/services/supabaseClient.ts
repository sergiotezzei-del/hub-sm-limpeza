import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_DB_URL ?? "";
export const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
export const SUPABASE_KEY_HEADER = ["api", "key"].join("");
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;
let activeSessionSnapshot: SupabaseSessionSnapshot = {};
let freshAccessTokenPromise: Promise<string | undefined> | null = null;
let nativeWindowFetch: typeof window.fetch | null = null;

const HUB_FETCH_GUARD_VERSION = 2;

type GuardedWindowFetch = typeof window.fetch & {
  __hubSupabaseBaseFetch?: typeof window.fetch;
  __hubSupabaseGuardVersion?: number;
};

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
      const baseFetch = getNativeWindowFetch();
      installHubSupabaseFetchGuard(baseFetch);

      const client = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
        },
        global: {
          fetch: createHubSupabaseFetch(baseFetch),
        },
      });

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
  if (!freshAccessTokenPromise) {
    freshAccessTokenPromise = (async () => {
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
    })().finally(() => {
      freshAccessTokenPromise = null;
    });
  }

  return freshAccessTokenPromise;
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

function getNativeWindowFetch() {
  if (typeof window === "undefined") return fetch;
  if (!nativeWindowFetch) {
    const currentFetch = window.fetch as GuardedWindowFetch;
    nativeWindowFetch = currentFetch.__hubSupabaseBaseFetch ?? currentFetch.bind(window);
  }
  return nativeWindowFetch;
}

function installHubSupabaseFetchGuard(baseFetch: typeof fetch) {
  if (typeof window === "undefined") return;
  const currentFetch = window.fetch as GuardedWindowFetch;
  if (currentFetch.__hubSupabaseGuardVersion === HUB_FETCH_GUARD_VERSION) return;

  const guardedFetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    hubSupabaseFetch(baseFetch, input, init, "window")
  )) as GuardedWindowFetch;
  guardedFetch.__hubSupabaseBaseFetch = baseFetch;
  guardedFetch.__hubSupabaseGuardVersion = HUB_FETCH_GUARD_VERSION;
  window.fetch = guardedFetch;
}

function createHubSupabaseFetch(baseFetch: typeof fetch) {
  return (input: RequestInfo | URL, init?: RequestInit) => hubSupabaseFetch(baseFetch, input, init, "client");
}

async function hubSupabaseFetch(
  baseFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  source: "client" | "window",
) {
  const url = getRequestUrl(input);
  if (!isHubRestRequest(url)) return baseFetch(input, init);

  const inputHeaders = input instanceof Request ? input.headers : undefined;
  const headers = new Headers(inputHeaders);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (!headers.has(SUPABASE_KEY_HEADER)) headers.set(SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY);

  if (source === "client") {
    // supabase-js resolves the current session immediately before this call.
    // Preserve its user JWT instead of replacing it with a possibly stale snapshot.
    if (isPublishableKeyBearer(headers.get("Authorization"))) headers.delete("Authorization");
  } else {
    const accessToken = await getFreshSupabaseAccessToken();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    else headers.delete("Authorization");
  }

  if (isPublishableKeyBearer(headers.get("Authorization"))) {
    headers.delete("Authorization");
  }

  return baseFetch(input, { ...init, headers });
}

function isHubRestRequest(url: string) {
  return Boolean(SUPABASE_URL) && url.startsWith(`${SUPABASE_URL}/rest/v1/`);
}

function isPublishableKeyBearer(authorization: string | null) {
  if (!authorization) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  return Boolean(token && (token === SUPABASE_PUBLIC_KEY || token.startsWith("sb_publishable_")));
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

if (typeof window !== "undefined" && supabaseConfigured) {
  installHubSupabaseFetchGuard(getNativeWindowFetch());
}
