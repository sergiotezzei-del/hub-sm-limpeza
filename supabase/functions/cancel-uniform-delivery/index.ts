// Password-verified, admin-only logical exclusion: preserve original records and stock audit.
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
    headers: { apikey: key, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: allowedHeaders });
  if (req.method !== "POST") return respond(405, { error: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond(503, { error: "Serviço de exclusão indisponível." });
  const authorization = req.headers.get("Authorization") ?? "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!jwt) return respond(401, { error: "Entre novamente no HUB." });

  try {
    const userResponse = await apiFetch(`${url}/auth/v1/user`, anonKey, jwt);
    if (!userResponse.ok) return respond(401, { error: "Sessão inválida. Entre novamente no HUB." });
    const user = await userResponse.json() as { id?: string; email?: string };
    if (!user.id || !user.email) return respond(403, { error: "É necessário entrar com uma conta que tenha e-mail e senha." });
    const adminResponse = await apiFetch(`${url}/rest/v1/rpc/is_hub_admin`, anonKey, jwt, {});
    if (!adminResponse.ok || (await adminResponse.json()) !== true) return respond(403, { error: "Somente administradores podem excluir entregas ou termos." });

    const body = await req.json() as Record<string, unknown>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const action = body.action === "term" ? "term" : body.action === undefined || body.action === "delivery" ? "delivery" : "invalid";
    const batchId = typeof body.batchId === "string" ? body.batchId : "";
    const termId = typeof body.termId === "string" ? body.termId : "";
    const operationId = typeof body.operationId === "string" ? body.operationId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const actorName = typeof body.actorName === "string" ? body.actorName.trim().slice(0, 90) : "";
    const isTerm = action === "term";
    if (action === "invalid" || !uuid.test(operationId) || !(isTerm ? uuid.test(termId) : uuid.test(batchId))
      || reason.length < 5 || reason.length > 1000 || !password || (!isTerm && body.physicalConfirmed !== true)) {
      return respond(400, { error: "Selecione o registro, informe motivo e senha e confirme as peças físicas ao cancelar entrega." });
    }

    // Verify password with GoTrue in a separate request, without replacing user's session.
    // Password is never stored or included in logs or RPC arguments.
    const passwordResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    });
    if (!passwordResponse.ok) return respond(403, { error: "Senha incorreta ou autenticação indisponível. Nenhum registro foi alterado." });
    const passwordIdentity = await passwordResponse.json() as { user?: { id?: string } };
    if (passwordIdentity.user?.id !== user.id) return respond(403, { error: "A senha não corresponde à conta conectada. Nenhum registro foi alterado." });

    const common = {
      p_operation_id: operationId,
      p_actor_user_id: user.id,
      p_actor_name: `${actorName || user.email} (${user.email})`,
      p_reason: reason,
    };
    const resultResponse = isTerm
      ? await apiFetch(`${url}/rest/v1/rpc/exclude_uniform_delivery_term`, serviceKey, serviceKey, {
          ...common, p_term_id: termId,
        })
      : await apiFetch(`${url}/rest/v1/rpc/cancel_uniform_delivery_with_term_choice`, serviceKey, serviceKey, {
          ...common, p_batch_id: batchId, p_physical_confirmed: true, p_hide_term: body.hideTerm === true,
        });
    if (!resultResponse.ok) {
      const failure = await resultResponse.json().catch(() => ({})) as { message?: string };
      return respond(409, { error: failure.message || "Não foi possível concluir a exclusão. O estoque não foi alterado." });
    }
    if (isTerm) {
      const rows = await resultResponse.json() as Array<{ excluded_term_id: string }>;
      return respond(200, { termId: rows[0]?.excluded_term_id, excluded: true, restoredQuantity: 0 });
    }
    const rows = await resultResponse.json() as Array<{
      cancelled_batch_id: string; restored_quantity: number | string; term_excluded: boolean;
    }>;
    return respond(200, {
      batchId: rows[0]?.cancelled_batch_id,
      restoredQuantity: Number(rows[0]?.restored_quantity ?? 0),
      termExcluded: rows[0]?.term_excluded === true,
    });
  } catch {
    return respond(500, { error: "Não foi possível concluir a operação. Consulte o histórico antes de tentar novamente." });
  }
});
