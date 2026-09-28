import {
  getFreshSupabaseAccessToken,
  readSupabaseRestError,
  SUPABASE_URL,
  SupabaseAuthSessionRequiredError,
} from "../security/services/supabaseClient";

const BRIDGE_ORIGIN = SUPABASE_URL;
const SESSION_PATH = "/recovery-marketing/v1/session";
const REQUEST_TIMEOUT_MS = 12_000;

export type RecoveryMarketingSession = {
  session_token: string;
  user_id: string;
  expires_at: string;
};

export async function startRecoveryMarketingSession(accessCode: string) {
  return request<RecoveryMarketingSession>("POST", SESSION_PATH, { accessCode });
}

export async function refreshRecoveryMarketingSession(sessionToken: string) {
  await request<void>("POST", `${SESSION_PATH}/refresh`, { sessionToken });
}

export async function endRecoveryMarketingSession(sessionToken: string) {
  await request<void>("DELETE", SESSION_PATH, { sessionToken });
}

async function request<T>(method: "POST" | "DELETE", path: string, body: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const accessToken = await getFreshSupabaseAccessToken();
    if (!accessToken) throw new SupabaseAuthSessionRequiredError();
    const response = await fetch(`${BRIDGE_ORIGIN}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      const diagnostic = await readSupabaseRestError(response);
      throw new Error(diagnostic.message ?? diagnostic.code ?? "MARKETING_SESSION_UNAVAILABLE");
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
