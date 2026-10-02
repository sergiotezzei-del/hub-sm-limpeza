import {
  installAndVerifyRecoveryAuthSession,
  signOutSupabaseAuth,
  SUPABASE_URL,
  type RecoveryAuthSessionTokens,
} from "./supabaseClient";

const RECOVERY_MANAGED_USER_ID = "recovery-ui-test";
const RECOVERY_AUTH_SESSION_URL = `${SUPABASE_URL}/recovery-auth/v1/session`;
const REQUEST_TIMEOUT_MS = 15_000;

export async function signInRecoverySupabaseAuth(managedUserId: string, accessCode: string) {
  if (managedUserId !== RECOVERY_MANAGED_USER_ID) throw new Error("RECOVERY_AUTH_USER_REJECTED");
  const cleanAccessCode = accessCode.trim();
  if (!cleanAccessCode || cleanAccessCode.length > 128) throw new Error("RECOVERY_AUTH_REQUEST_REJECTED");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(RECOVERY_AUTH_SESSION_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessCode: cleanAccessCode }),
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("RECOVERY_AUTH_BRIDGE_REJECTED");
    const payload: unknown = await response.json();
    if (!isRecoveryAuthSessionTokens(payload)) throw new Error("RECOVERY_AUTH_RESPONSE_INVALID");
    return await installAndVerifyRecoveryAuthSession(payload);
  } catch {
    await signOutSupabaseAuth();
    throw new Error("RECOVERY_AUTH_LOGIN_FAILED");
  } finally {
    window.clearTimeout(timeout);
  }
}

function isRecoveryAuthSessionTokens(value: unknown): value is RecoveryAuthSessionTokens {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<RecoveryAuthSessionTokens>;
  return typeof session.access_token === "string"
    && session.access_token.length > 0
    && session.access_token.length <= 32_768
    && typeof session.refresh_token === "string"
    && session.refresh_token.length > 0
    && session.refresh_token.length <= 8_192;
}
