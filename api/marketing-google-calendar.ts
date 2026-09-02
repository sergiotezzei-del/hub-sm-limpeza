type JsonRecord = Record<string, unknown>;

type MarketingCalendarStatus = {
  configured?: boolean;
  canConnect?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  users?: Array<{
    userId?: string;
    userName?: string;
    connected?: boolean;
    googleEmail?: string;
    calendarId?: string;
    connectedAt?: string | null;
    lastSyncedAt?: string | null;
    lastError?: string | null;
  }>;
};

type OAuthContext = {
  client_id?: string;
  managed_user_id?: string;
};

type SyncConnection = {
  managedUserId: string;
  googleEmail?: string;
  calendarId?: string;
  refreshToken: string;
};

type SyncRequest = {
  id: string;
  requestNumber: number;
  requestKind: string;
  status: string;
  brokerName?: string;
  managerName?: string;
  propertyReference?: string;
  captureLocation?: string;
  confirmedCaptureAt?: string | null;
  assignedMarketingName?: string | null;
  captureGroupId?: string | null;
  contentTypes?: string[];
  deletedAt?: string | null;
};

type SyncBatch = {
  clientId?: string;
  queueRequestIds?: string[];
  requests?: SyncRequest[];
  connections?: SyncConnection[];
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
};

const SUPABASE_URL = "https://dtdepfpkyiqtnsjztjit.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_ahFq0EsMxM-zGaqM7WJKig_2ikkb6NX";
const PUBLIC_ORIGIN = "https://hubsantamariatem.vercel.app";
const REDIRECT_URI = `${PUBLIC_ORIGIN}/`;
const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";
const TIME_ZONE = "America/Sao_Paulo";
const SYNC_HEADER = "x-hub-marketing-calendar-secret";

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (request.method !== "POST") {
        throw new ApiError(405, "method_not_allowed", "Método não permitido.");
      }

      const body = await readJsonBody(request);
      const action = readString(body.action);

      if (action === "sync") {
        const secret = request.headers.get(SYNC_HEADER)?.trim() ?? "";
        if (!secret) throw new ApiError(401, "sync_secret_required", "Sincronização não autorizada.");
        return jsonResponse(200, await syncQueuedRequests(secret));
      }

      const sessionToken = request.headers.get("x-marketing-session")?.trim() ?? "";
      if (!sessionToken) throw new ApiError(401, "marketing_session_required", "Sessão do Marketing não encontrada.");

      if (action === "status") {
        return jsonResponse(200, await getStatus(sessionToken));
      }

      if (action === "authorize") {
        const state = `mkt_${createSecureRandomHex(32)}`;
        const stateHash = await sha256Hex(state);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const rows = await supabaseRpc<OAuthContext[]>("marketing_google_calendar_create_oauth_state", {
          p_session_token: sessionToken,
          p_state_hash: stateHash,
          p_expires_at: expiresAt,
        });
        const context = Array.isArray(rows) ? rows[0] : undefined;
        if (!context?.client_id) throw new ApiError(409, "google_not_configured", "A integração Google do HUB ainda não está configurada.");
        return jsonResponse(200, {
          authorizationUrl: buildAuthorizationUrl(context.client_id, state),
          redirectUri: REDIRECT_URI,
        });
      }

      if (action === "callback") {
        const code = readString(body.code);
        const state = readString(body.state);
        const googleError = readString(body.error);
        if (!state.startsWith("mkt_")) throw new ApiError(400, "invalid_oauth_state", "Retorno do Google inválido.");
        if (googleError) throw new ApiError(400, "google_authorization_cancelled", "A autorização do Google foi cancelada.");
        if (!code) throw new ApiError(400, "google_code_required", "Retorno do Google incompleto.");

        const stateHash = await sha256Hex(state);
        const rows = await supabaseRpc<OAuthContext[]>("marketing_google_calendar_oauth_state_context", {
          p_session_token: sessionToken,
          p_state_hash: stateHash,
        });
        const context = Array.isArray(rows) ? rows[0] : undefined;
        if (!context?.client_id) throw new ApiError(400, "invalid_oauth_state", "A autorização do Google expirou. Conecte novamente.");

        const tokens = await exchangeAuthorizationCode(context.client_id, code);
        if (!tokens.refresh_token) {
          throw new ApiError(409, "refresh_token_missing", "O Google não enviou autorização permanente. Tente conectar novamente e confirme o acesso.");
        }
        const googleEmail = tokens.access_token ? await loadGoogleEmail(tokens.access_token) : "";

        await supabaseRpc("marketing_google_calendar_save_connection", {
          p_session_token: sessionToken,
          p_state_hash: stateHash,
          p_refresh_token: tokens.refresh_token,
          p_google_email: googleEmail,
        });
        return jsonResponse(200, await getStatus(sessionToken));
      }

      if (action === "disconnect") {
        await supabaseRpc("marketing_google_calendar_disconnect", { p_session_token: sessionToken });
        return jsonResponse(200, await getStatus(sessionToken));
      }

      throw new ApiError(404, "unknown_action", "Ação da Agenda Google do Marketing não encontrada.");
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonResponse(error.status, { error: error.code, message: error.message });
      }
      console.error("[marketing-google-calendar] erro inesperado", safeError(error));
      return jsonResponse(500, { error: "internal_error", message: "Não foi possível processar a Agenda Google do Marketing." });
    }
  },
};

async function getStatus(sessionToken: string) {
  return supabaseRpc<MarketingCalendarStatus>("marketing_google_calendar_get_status", {
    p_session_token: sessionToken,
  });
}

function buildAuthorizationUrl(clientId: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeAuthorizationCode(clientId: string, code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const payload = await response.json() as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    console.error("[marketing-google-calendar] falha no OAuth", { status: response.status, error: payload.error });
    throw new ApiError(502, "google_token_exchange_failed", "O Google não concluiu a conexão da agenda.");
  }
  return payload;
}

async function loadGoogleEmail(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const payload = await response.json() as GoogleUserInfo;
  return typeof payload.email === "string" ? payload.email.trim() : "";
}

async function syncQueuedRequests(secret: string) {
  const batch = await supabaseRpc<SyncBatch>("marketing_google_calendar_server_batch", {
    p_secret: secret,
    p_limit: 50,
  });

  const queueIds = Array.isArray(batch.queueRequestIds) ? batch.queueRequestIds.filter(Boolean) : [];
  if (queueIds.length === 0) return { ok: true, processed: 0 };

  const requests = Array.isArray(batch.requests) ? batch.requests : [];
  const connections = Array.isArray(batch.connections) ? batch.connections : [];
  const clientId = typeof batch.clientId === "string" ? batch.clientId : "";
  if (!clientId) throw new ApiError(500, "google_client_missing", "Client ID do Google indisponível para sincronização.");

  const requestById = new Map(requests.map((request) => [request.id, request]));
  const access = new Map<string, { connection: SyncConnection; accessToken?: string; error?: string }>();

  for (const connection of connections) {
    try {
      const token = await refreshGoogleAccessToken(clientId, connection.refreshToken);
      access.set(connection.managedUserId, { connection, accessToken: token });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao renovar acesso ao Google.";
      access.set(connection.managedUserId, { connection, error: message });
      await recordConnection(secret, connection.managedUserId, message);
    }
  }

  const taskToQueueIds = new Map<string, string[]>();
  for (const queueId of queueIds) {
    const request = requestById.get(queueId);
    const taskKey = request?.captureGroupId ? `group:${request.captureGroupId}` : `request:${queueId}`;
    const ids = taskToQueueIds.get(taskKey) ?? [];
    ids.push(queueId);
    taskToQueueIds.set(taskKey, ids);
  }

  let processed = 0;
  let failed = 0;
  const successfulConnections = new Set<string>();
  const failedConnections = new Set<string>();

  for (const [taskKey, originalQueueIds] of taskToQueueIds) {
    try {
      const task = buildSyncTask(taskKey, requests);
      for (const state of access.values()) {
        if (!state.accessToken) {
          failedConnections.add(state.connection.managedUserId);
          throw new Error(state.error || `Google Agenda de ${state.connection.managedUserId} indisponível.`);
        }
        const shouldExist = task.active && task.targetUserId === state.connection.managedUserId;
        if (shouldExist) {
          await ensureGoogleEvent(state.accessToken, state.connection.calendarId || "primary", task);
        } else {
          await deleteGoogleEventIfPresent(state.accessToken, state.connection.calendarId || "primary", task.eventId);
        }
        successfulConnections.add(state.connection.managedUserId);
      }

      for (const queueId of originalQueueIds) {
        await markRequest(secret, queueId, true, "");
        processed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar Google Agenda.";
      for (const queueId of originalQueueIds) {
        await markRequest(secret, queueId, false, message);
        failed += 1;
      }
    }
  }

  for (const userId of successfulConnections) {
    if (!failedConnections.has(userId)) await recordConnection(secret, userId, "");
  }

  return { ok: failed === 0, processed, failed };
}

type SyncTask = {
  key: string;
  eventId: string;
  active: boolean;
  targetUserId: "maria" | "arthur" | null;
  startAt: string | null;
  requests: SyncRequest[];
};

function buildSyncTask(taskKey: string, requests: SyncRequest[]): SyncTask {
  const isGroup = taskKey.startsWith("group:");
  const rawId = taskKey.slice(taskKey.indexOf(":") + 1);
  const members = isGroup
    ? requests.filter((request) => request.captureGroupId === rawId)
    : requests.filter((request) => request.id === rawId);

  const activeMembers = members.filter((request) =>
    request.requestKind === "capture_edit"
    && !request.deletedAt
    && request.status !== "cancelado"
    && Boolean(request.confirmedCaptureAt));

  const assigned = Array.from(new Set(activeMembers.map((request) => normalizeAssignee(request.assignedMarketingName)).filter(Boolean))) as Array<"maria" | "arthur">;
  if (assigned.length > 1) throw new Error("Uma saída agrupada está com responsáveis diferentes no Marketing.");

  const startTimes = Array.from(new Set(activeMembers.map((request) => request.confirmedCaptureAt).filter(Boolean))) as string[];
  if (startTimes.length > 1) throw new Error("Uma saída agrupada está com horários confirmados diferentes.");

  const eventPrefix = isGroup ? "smg" : "smr";
  const eventId = `${eventPrefix}${rawId.replace(/-/g, "").toLowerCase()}`;
  return {
    key: taskKey,
    eventId,
    active: activeMembers.length > 0 && assigned.length === 1 && startTimes.length === 1,
    targetUserId: assigned[0] ?? null,
    startAt: startTimes[0] ?? null,
    requests: activeMembers.length > 0 ? activeMembers : members,
  };
}

function normalizeAssignee(value?: string | null): "maria" | "arthur" | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "maria") return "maria";
  if (normalized === "arthur") return "arthur";
  return null;
}

async function refreshGoogleAccessToken(clientId: string, refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json() as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    console.error("[marketing-google-calendar] refresh falhou", { status: response.status, error: payload.error });
    throw new Error(payload.error === "invalid_grant" ? "A conexão com o Google expirou. Conecte a agenda novamente." : "Não foi possível acessar o Google Agenda.");
  }
  return payload.access_token;
}

async function ensureGoogleEvent(accessToken: string, calendarId: string, task: SyncTask) {
  if (!task.startAt) return;
  const eventUrl = googleEventUrl(calendarId, task.eventId);
  const existing = await fetch(eventUrl, { headers: googleHeaders(accessToken) });
  const payload = buildGoogleEvent(task);

  if (existing.status === 404 || existing.status === 410) {
    const createResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
      method: "POST",
      headers: googleHeaders(accessToken),
      body: JSON.stringify({ id: task.eventId, ...payload }),
    });
    if (!createResponse.ok) throw await googleApiError(createResponse, "Não foi possível criar o compromisso no Google Agenda.");
    return;
  }

  if (!existing.ok) throw await googleApiError(existing, "Não foi possível consultar o compromisso no Google Agenda.");
  const updateResponse = await fetch(`${eventUrl}?sendUpdates=none`, {
    method: "PATCH",
    headers: googleHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  if (!updateResponse.ok) throw await googleApiError(updateResponse, "Não foi possível atualizar o compromisso no Google Agenda.");
}

async function deleteGoogleEventIfPresent(accessToken: string, calendarId: string, eventId: string) {
  const response = await fetch(`${googleEventUrl(calendarId, eventId)}?sendUpdates=none`, {
    method: "DELETE",
    headers: googleHeaders(accessToken),
  });
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw await googleApiError(response, "Não foi possível remover o compromisso antigo do Google Agenda.");
}

function buildGoogleEvent(task: SyncTask) {
  const start = new Date(task.startAt!);
  const end = new Date(start.getTime() + 60 * 1000);
  const members = [...task.requests].sort((a, b) => Number(a.requestNumber) - Number(b.requestNumber));
  const first = members[0];
  const numbers = members.map((request) => `#${request.requestNumber}`).join(", ");
  const properties = members.map((request) => request.propertyReference).filter(Boolean).join(", ");
  const brokers = Array.from(new Set(members.map((request) => request.brokerName).filter(Boolean))).join(", ");
  const responsible = task.targetUserId === "maria" ? "Maria" : task.targetUserId === "arthur" ? "Arthur" : "Marketing";
  const summary = members.length > 1
    ? `Marketing SM • ${numbers} • ${members.length} imóveis`
    : `Marketing SM • ${numbers} • ${first?.brokerName || "Captação"}`;

  return {
    summary,
    location: first?.captureLocation || undefined,
    description: [
      "Captação de Marketing — Santa Maria Imobiliária",
      `Pedido(s): ${numbers}`,
      brokers ? `Corretor(es): ${brokers}` : "",
      first?.managerName ? `Gerente: ${first.managerName}` : "",
      properties ? `Imóvel(is): ${properties}` : "",
      `Responsável: ${responsible}`,
      "",
      "O HUB registra o horário de início. A duração da captação não é definida pelo sistema.",
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    reminders: { useDefault: true },
    extendedProperties: {
      private: {
        hubSource: "marketing",
        hubEntityKey: task.key,
      },
    },
    source: {
      title: "HUB Santa Maria",
      url: PUBLIC_ORIGIN,
    },
  };
}

function googleEventUrl(calendarId: string, eventId: string) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
}

function googleHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function googleApiError(response: Response, fallback: string) {
  const text = await response.text();
  let message = fallback;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    // Mantém mensagem segura.
  }
  return new Error(message.slice(0, 500));
}

async function markRequest(secret: string, requestId: string, success: boolean, error: string) {
  await supabaseRpc("marketing_google_calendar_server_mark_request", {
    p_secret: secret,
    p_request_id: requestId,
    p_success: success,
    p_error: error || null,
  });
}

async function recordConnection(secret: string, userId: string, error: string) {
  await supabaseRpc("marketing_google_calendar_server_record_connection", {
    p_secret: secret,
    p_managed_user_id: userId,
    p_error: error || null,
  });
}

async function supabaseRpc<T = unknown>(functionName: string, body: JsonRecord): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const parsed = safeJson(text) as { message?: string; code?: string } | null;
    const message = parsed?.message || "Falha na integração segura do Marketing.";
    console.error(`[marketing-google-calendar] RPC ${functionName} falhou`, { status: response.status, code: parsed?.code, message: message.slice(0, 300) });
    const code = message.includes("MARKETING_SESSION_EXPIRED") ? "marketing_session_expired" : "supabase_rpc_failed";
    const status = message.includes("DENIED") ? 403 : message.includes("SESSION_EXPIRED") ? 401 : 500;
    throw new ApiError(status, code, translateDatabaseError(message));
  }
  return (text ? safeJson(text) : undefined) as T;
}

function translateDatabaseError(message: string) {
  if (message.includes("MARKETING_SESSION_EXPIRED")) return "Sua sessão do Marketing expirou. Entre novamente.";
  if (message.includes("MARKETING_GOOGLE_CONNECT_DENIED")) return "A conexão Google está disponível somente para Maria e Arthur.";
  if (message.includes("MARKETING_GOOGLE_NOT_CONFIGURED")) return "A credencial Google do HUB ainda não está configurada.";
  if (message.includes("MARKETING_GOOGLE_STATE_INVALID")) return "A autorização do Google expirou. Inicie a conexão novamente.";
  if (message.includes("MARKETING_GOOGLE_REFRESH_TOKEN_REQUIRED")) return "O Google não liberou acesso permanente. Conecte novamente.";
  if (message.includes("MARKETING_GOOGLE_SERVER_DENIED")) return "Sincronização do Google não autorizada.";
  return message.slice(0, 500);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value as JsonRecord : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Dados enviados inválidos.");
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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

function safeJson(text: string) {
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

function safeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : { message: String(error).slice(0, 500) };
}

function createSecureRandomHex(bytesLength: number) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
