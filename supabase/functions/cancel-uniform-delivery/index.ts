// Admin-only cancellation endpoint. The password is verified by Supabase Auth
// against the CURRENT authenticated user's email and is never logged or stored.
const allowedHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function respond(status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), { status, headers: allowedHeaders });
}

async function apiFetch(url: string, key: string, jwt: string, body?: unknown) {
  return fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: allowedHeaders });
  if (req.method !== "POST") return respond(405, { error: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond(503, { error: "Serviço de cancelamento indisponível." });
  const authorization = req.headers.get("Authorization") ?? "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!jwt) return respond(401, { error: "Entre novamente no HUB." });

  try {
    // Never trust a user ID, email, role, or password-verification flag sent by the browser.
    const userResponse = await apiFetch(`${url}/auth/v1/user`, anonKey, jwt);
    if (!userResponse.ok) return respond(401, { error: "Sessão inválida. Entre novamente no HUB." });
    const user = await userResponse.json() as { id?: string; email?: string };
    if (!user.id || !user.email) return respond(403, { error: "É necessário entrar com uma conta que tenha e-mail e senha." });

    const adminResponse = await apiFetch(`${url}/rest/v1/rpc/is_hub_admin`, anonKey, jwt, {});
    if (!adminResponse.ok || (await adminResponse.json()) !== true) return respond(403, { error: "Somente administradores podem excluir entregas." });

    const body = await req.json() as Record<string, unknown>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const batchId = typeof body.batchId === "string" ? body.batchId : "";
    const operationId = typeof body.operationId === "string" ? body.operationId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const actorName = typeof body.actorName === "string" ? body.actorName.trim().slice(0, 90) : "";
    if (!uuid.test(batchId) || !uuid.test(operationId) || reason.length < 5 || reason.length > 1000 || !password || body.physicalConfirmed !== true) {
      return respond(400, { error: "Selecione a entrega, informe motivo e senha e confirme a disponibilidade física das peças." });
    }

    // Separate GoTrue token request only: do NOT replace the user's current session.
    // Authentication attempts are subject to Supabase Auth's normal rate limits.
    const passwordResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    });
    if (!passwordResponse.ok) return respond(403, { error: "Senha incorreta ou autenticação indisponível. Nenhum item foi alterado." });
    const passwordIdentity = await passwordResponse.json() as { user?: { id?: string } };
    if (passwordIdentity.user?.id !== user.id) return respond(403, { error: "A senha não corresponde à conta conectada. Nenhum item foi alterado." });

    // This RPC is NOT executable by ordinary authenticated users: only this
    // server-side, credential-protected service-role invocation can reach it.
    const cancellation = await apiFetch(`${url}/rest/v1/rpc/cancel_uniform_delivery_batch`, serviceKey, serviceKey, {
      p_operation_id: operationId,
      p_batch_id: batchId,
      p_actor_user_id: user.id,
      p_actor_name: `${actorName || user.email} (${user.email})`,
      p_reason: reason,
      p_physical_confirmed: true,
    });
    if (!cancellation.ok) {
      const failure = await cancellation.json().catch(() => ({})) as { message?: string };
      // Database errors contain no credentials. Surface business-rule errors only.
      return respond(409, { error: failure.message || "Não foi possível cancelar. Os saldos permaneceram inalterados." });
    }
    const rows = await cancellation.json() as Array<{ cancelled_batch_id: string; restored_quantity: number | string }>;
    return respond(200, { batchId: rows[0]?.cancelled_batch_id, restoredQuantity: Number(rows[0]?.restored_quantity ?? 0) });
  } catch {
    return respond(500, { error: "Não foi possível concluir a operação. Consulte o histórico antes de tentar novamente." });
  }
});
