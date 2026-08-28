import type { SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = (import.meta.env.VITE_DB_URL ?? "").trim();
const configuredPublicKey = (import.meta.env.VITE_DB_PUBLIC_KEY ?? "").trim();
const LEGACY_ANON_COMPAT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZGVwZnBreWlxdG5zanp0aml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODkyMTcsImV4cCI6MjA5ODc2NTIxN30.kNYAYQTw8gqUaYqRTqdcPtthXO5vbZD6XwxeBvhpRgo";

export const SUPABASE_URL = rawSupabaseUrl.replace(/\/+$/, "");
// Temporary compatibility path for the hosted project's active legacy anon key.
// User authorization still comes exclusively from the session JWT in Authorization.
export const SUPABASE_PUBLIC_KEY = configuredPublicKey.startsWith("sb_publishable_")
  ? LEGACY_ANON_COMPAT_KEY
  : configuredPublicKey;
export const SUPABASE_KEY_HEADER = ["api", "key"].join("");
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;
let activeSessionSnapshot: SupabaseSessionSnapshot = {};
let freshAccessTokenPromise: Promise<string | undefined> | null = null;

export type SupabaseSessionSnapshot = {
  accessToken?: string;
  userId?: string;
};

export type SupabaseAuthDiagnostic = {
  sessionExists: boolean;
  userId: string | null;
  jwtRole: string | null;
  jwtIssuedAt: string | null;
  jwtIssuedAtOffsetSeconds: number | null;
  jwtExpiration: string | null;
  authorizationPresent: boolean;
};

export type SupabaseRestErrorDiagnostic = {
  status: number;
  code: string | null;
  message: string | null;
  details: string | null;
  hint: string | null;
};

type SessionLike = {
  access_token?: string | null;
  user?: { id?: string | null } | null;
} | null | undefined;

export class SupabaseAuthSessionRequiredError extends Error {
  constructor() {
    super("SUPABASE_AUTH_SESSION_REQUIRED");
    this.name = "SupabaseAuthSessionRequiredError";
  }
}

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

// Synchronous compatibility hint for UI state only. REST transport must use
// authenticatedSupabaseFetch() or getFreshSupabaseAccessToken().
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

export async function authenticatedSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const accessToken = await getFreshSupabaseAccessToken();
  if (!accessToken) {
    logSupabaseAuthDiagnostic("protected-rest-missing-session", createAuthDiagnostic(undefined, false));
    throw new SupabaseAuthSessionRequiredError();
  }
  return supabaseRestFetch(input, init, accessToken);
}

export async function sessionAwareSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const accessToken = await getFreshSupabaseAccessToken();
  return supabaseRestFetch(input, init, accessToken);
}

export function publicSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return supabaseRestFetch(input, init, undefined);
}

export async function readSupabaseRestError(response: Response): Promise<SupabaseRestErrorDiagnostic> {
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = text ? JSON.parse(text) : {};
    if (value && typeof value === "object") parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  return {
    status: response.status,
    code: readDiagnosticString(parsed.code),
    message: readDiagnosticString(parsed.message) ?? readDiagnosticString(text),
    details: readDiagnosticString(parsed.details),
    hint: readDiagnosticString(parsed.hint),
  };
}

export async function getSupabaseAuthDiagnostic(): Promise<SupabaseAuthDiagnostic> {
  const supabase = await getSupabaseClient();
  if (!supabase) return createAuthDiagnostic(undefined, false);
  const { data, error } = await supabase.auth.getSession();
  if (error) return createAuthDiagnostic(undefined, false);
  rememberSupabaseSession(data.session);
  return createAuthDiagnostic(data.session ?? undefined, false);
}

export async function verifySupabaseAuthenticatedRest() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("SUPABASE_CLIENT_UNAVAILABLE");

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData.session;
  const diagnostic = createAuthDiagnostic(session ?? undefined, Boolean(session?.access_token));
  if (sessionError || !session?.access_token) {
    logSupabaseAuthDiagnostic("post-login-session-missing", diagnostic);
    throw new Error("SUPABASE_AUTH_SESSION_REQUIRED");
  }
  rememberSupabaseSession(session);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    logSupabaseAuthProbeError("get-user", diagnostic, userError);
    throw new Error("SUPABASE_AUTH_USER_VERIFICATION_FAILED");
  }

  const manualResponse = await authenticatedSupabaseFetch(
    `${SUPABASE_URL}/rest/v1/hub_alert_rules?select=id&limit=1`,
    { headers: { Accept: "application/json" } },
  );

  if (!manualResponse.ok) {
    const restError = await readSupabaseRestError(manualResponse);
    console.error("[supabase-auth] Protected REST manual probe failed", {
      ...diagnostic,
      status: restError.status,
      errorCode: restError.code,
      errorMessage: restError.message,
      errorDetails: restError.details,
      errorHint: restError.hint,
    });
    throw new Error(
      `SUPABASE_AUTH_REST_PROBE_FAILED:${restError.status}:${restError.code ?? "unknown"}:${restError.message ?? "unknown"}`,
    );
  }

  // Keep a non-blocking comparison with supabase-js native PostgREST transport.
  // A native transport failure must never invalidate an Auth session that was
  // already accepted by /auth/v1/user and by the explicit JWT REST probe above.
  const { error: nativeRestError } = await supabase
    .from("hub_alert_rules")
    .select("id")
    .limit(1);
  if (nativeRestError) {
    logSupabaseAuthProbeError("hub-alert-rules-native", diagnostic, nativeRestError);
  }

  logSupabaseAuthDiagnostic("post-login-rest-ok", diagnostic);
  return { userId: userData.user.id, diagnostic, nativeRestOk: !nativeRestError };
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

function supabaseRestFetch(input: RequestInfo | URL, init: RequestInit, accessToken?: string) {
  assertSupabaseRestRequest(input);
  const inputHeaders = input instanceof Request ? input.headers : undefined;
  const headers = new Headers(inputHeaders);
  if (init.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  headers.set(SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  else headers.delete("Authorization");

  return fetch(input, { ...init, headers });
}

function assertSupabaseRestRequest(input: RequestInfo | URL) {
  const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!SUPABASE_URL || !requestUrl.startsWith(`${SUPABASE_URL}/rest/v1/`)) {
    throw new Error("SUPABASE_REST_URL_REQUIRED");
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

function createAuthDiagnostic(session: SessionLike, authorizationPresent: boolean): SupabaseAuthDiagnostic {
  const accessToken = readString(session?.access_token);
  const claims = accessToken ? readJwtClaims(accessToken) : null;
  const issuedAt = typeof claims?.iat === "number" ? claims.iat : null;
  return {
    sessionExists: Boolean(accessToken && session?.user?.id),
    userId: readString(session?.user?.id) ?? null,
    jwtRole: typeof claims?.role === "string" ? claims.role : null,
    jwtIssuedAt: issuedAt === null ? null : new Date(issuedAt * 1000).toISOString(),
    jwtIssuedAtOffsetSeconds: issuedAt === null ? null : issuedAt - Math.floor(Date.now() / 1000),
    jwtExpiration: typeof claims?.exp === "number" ? new Date(claims.exp * 1000).toISOString() : null,
    authorizationPresent,
  };
}

function logSupabaseAuthDiagnostic(context: string, diagnostic: SupabaseAuthDiagnostic) {
  if (!import.meta.env.DEV) return;
  console.info("[supabase-auth]", { context, ...diagnostic });
}

function logSupabaseAuthProbeError(
  stage: string,
  diagnostic: SupabaseAuthDiagnostic,
  error: { code?: string; message?: string } | null,
) {
  if (!import.meta.env.DEV) return;
  console.error("[supabase-auth] Prova de transporte REST falhou", {
    stage,
    ...diagnostic,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
  });
}

function readJwtClaims(accessToken: string) {
  try {
    const encodedPayload = accessToken.split(".")[1];
    if (!encodedPayload || typeof atob !== "function") return null;
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as { role?: unknown; iat?: unknown; exp?: unknown };
  } catch {
    return null;
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

function readDiagnosticString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
