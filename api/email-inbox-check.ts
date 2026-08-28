import { ImapFlow } from "imapflow";

const SUPABASE_URL = "https://dtdepfpkyiqtnsjztjit.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_ahFq0EsMxM-zGaqM7WJKig_2ikkb6NX";

type ServerCredentials = {
  email_address?: string | null;
  mailbox_password?: string | null;
  imap_host?: string | null;
  imap_port?: number | string | null;
};

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }

    const secret = (request.headers.get("x-hub-email-secret") ?? "").trim();
    if (secret.length < 40) {
      return jsonResponse(403, { ok: false, error: "forbidden" });
    }

    let client: ImapFlow | null = null;

    try {
      const rows = await supabaseRpc<ServerCredentials[]>(
        "hub_email_inbox_server_credentials",
        { p_secret: secret },
      );
      const credentials = Array.isArray(rows) ? rows[0] : undefined;

      if (!credentials?.email_address || !credentials.mailbox_password) {
        return jsonResponse(200, { ok: true, configured: false });
      }

      client = new ImapFlow({
        host: credentials.imap_host || "email-ssl.com.br",
        port: Number(credentials.imap_port || 993),
        secure: true,
        auth: {
          user: credentials.email_address,
          pass: credentials.mailbox_password,
        },
        logger: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });

      await client.connect();
      const status = await client.status("INBOX", {
        uidNext: true,
        uidValidity: true,
      });

      const uidNext = Number(status.uidNext);
      const uidValidity = Number(status.uidValidity);
      if (!Number.isSafeInteger(uidNext) || uidNext < 1 || !Number.isSafeInteger(uidValidity) || uidValidity < 1) {
        throw new Error("invalid_imap_status");
      }

      await supabaseRpc("hub_email_inbox_server_record_check", {
        p_secret: secret,
        p_uidnext: uidNext,
        p_uidvalidity: uidValidity,
      });

      return jsonResponse(200, { ok: true, configured: true });
    } catch (error) {
      console.error("[email-inbox-check] IMAP check failed", {
        kind: error instanceof Error ? error.name : "unknown",
      });

      try {
        await supabaseRpc("hub_email_inbox_server_record_error", {
          p_secret: secret,
          p_error: "Não foi possível conectar à caixa de entrada da Locaweb.",
        });
      } catch {
        // Não expõe detalhes nem credenciais em uma falha secundária.
      }

      return jsonResponse(502, { ok: false, error: "imap_check_failed" });
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Conexão pode já ter sido encerrada pelo servidor IMAP.
        }
      }
    }
  },
};

async function supabaseRpc<T = unknown>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`supabase_rpc_${response.status}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
