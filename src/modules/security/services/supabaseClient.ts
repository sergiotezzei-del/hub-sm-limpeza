import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_DB_URL ?? "";
export const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
export const SUPABASE_KEY_HEADER = ["api", "key"].join("");
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;
let activeSessionSnapshot: SupabaseSessionSnapshot = {};
let nativeWindowFetch: typeof window.fetch | null = null;
let globalFetchGuardInstalled = false;

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

function getNativeWindowFetch() {
  if (typeof window === "undefined") return fetch;
  if (!nativeWindowFetch) nativeWindowFetch = window.fetch.bind(window);
  return nativeWindowFetch;
}

function installHubSupabaseFetchGuard(baseFetch: typeof fetch) {
  if (typeof window === "undefined" || globalFetchGuardInstalled) return;
  globalFetchGuardInstalled = true;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => hubSupabaseFetch(baseFetch, input, init)) as typeof window.fetch;
}

function createHubSupabaseFetch(baseFetch: typeof fetch) {
  return (input: RequestInfo | URL, init?: RequestInit) => hubSupabaseFetch(baseFetch, input, init);
}

async function hubSupabaseFetch(baseFetch: typeof fetch, input: RequestInfo | URL, init?: RequestInit) {
  const url = getRequestUrl(input);
  if (!isHubRestRequest(url)) return baseFetch(input, init);

  const inputHeaders = input instanceof Request ? input.headers : undefined;
  const headers = new Headers(inputHeaders);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  const accessToken = getSupabaseAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else if (isPublishableKeyBearer(headers.get("Authorization"))) {
    // Publishable keys belong only in the apikey header. They are not user JWTs.
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
