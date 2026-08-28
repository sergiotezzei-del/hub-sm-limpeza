import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

export type EmailInboxStatus = {
  emailAddress: string;
  configured: boolean;
  pendingNewCount: number;
  lastCheckedAt?: string;
  lastNewMailAt?: string;
  lastError?: string;
};

type EmailInboxStatusRow = {
  email_address: string | null;
  configured: boolean;
  pending_new_count: number | string | null;
  last_checked_at: string | null;
  last_new_mail_at: string | null;
  last_error: string | null;
};

export async function loadEmailInboxStatus(): Promise<EmailInboxStatus> {
  const rows = await rpc<EmailInboxStatusRow[]>("hub_email_inbox_get_status", {});
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return {
    emailAddress: row?.email_address ?? "",
    configured: Boolean(row?.configured),
    pendingNewCount: Math.max(0, Number(row?.pending_new_count ?? 0) || 0),
    lastCheckedAt: row?.last_checked_at ?? undefined,
    lastNewMailAt: row?.last_new_mail_at ?? undefined,
    lastError: row?.last_error ?? undefined,
  };
}

export async function saveEmailInboxConfig(emailAddress: string, password: string) {
  await rpc("hub_email_inbox_save_config", {
    p_email: emailAddress.trim(),
    p_password: password,
  });
}

export async function acknowledgeEmailInbox() {
  await rpc("hub_email_inbox_acknowledge", {});
}

async function rpc<T = unknown>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw new Error(`EMAIL_INBOX_RPC_${functionName}:${diagnostic.status}:${diagnostic.code ?? "unknown"}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
