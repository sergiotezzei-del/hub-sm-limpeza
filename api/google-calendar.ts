type JsonRecord = Record<string, unknown>;

type GoogleCalendarCredentials = {
  client_id?: string | null;
  client_secret?: string | null;
  refresh_token?: string | null;
  google_email?: string | null;
  calendar_id?: string | null;
  connected?: boolean | null;
};

type GoogleEvent = {
  id?: string;
  summary?: string;
  status?: string;
  htmlLink?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

type GoogleCalendarListItem = {
  id?: string;
  primary?: boolean;
};

const env = ((globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {});

const SUPABASE_URL = (env.VITE_DB_URL ?? env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_PUBLIC_KEY = env.VITE_DB_PUBLIC_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? "";
const ADMIN_USER_ID = env.VITE_ADMIN_SUPABASE_USER_ID ?? "";
const PUBLIC_ORIGIN = (env.HUB_PUBLIC_URL ?? "https://hubsantamariatem.vercel.app").replace(/\/+$/, "");
const REDIRECT_URI = `${PUBLIC_ORIGIN}/`;
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const TIME_ZONE = "America/Sao_Paulo";
const SAO_PAULO_OFFSET = "-03:00";

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
      if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !ADMIN_USER_ID) {
        throw new ApiError(503, "server_not_configured", "Integração segura do HUB indisponível.");
      }

      const token = readBearerToken(request);
      const user = await verifyAdmin(token);
      const url = new URL(request.url);

      if (request.method === "GET") {
        const action = url.searchParams.get("action") ?? "status";
        if (action === "status") return jsonResponse(200, await getStatus(token));
        if (action === "events") {
          const date = url.searchParams.get("date") ?? "";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new ApiError(400, "invalid_date", "Data inválida para consultar a Agenda Google.");
          }
          return jsonResponse(200, await getEvents(token, date));
        }
        throw new ApiError(404, "unknown_action", "Ação da Agenda Google não encontrada.");
      }

      if (request.method !== "POST") {
        throw new ApiError(405, "method_not_allowed", "Método não permitido.");
      }

      const body = await readJsonBody(request);
      const action = readString(body.action);

      if (action === "save_config") {
        const clientId = readString(body.clientId);
        const clientSecret = readString(body.clientSecret);
        if (!clientId || !clientSecret) {
          throw new ApiError(400, "missing_oauth_config", "Informe Client ID e Client Secret do Google.");
        }
        await supabaseRpc(token, "save_google_calendar_oauth_config", {
          p_client_id: clientId,
          p_client_secret: clientSecret,
        });
        return jsonResponse(200, await getStatus(token));
      }

      if (action === "authorize") {
        const credentials = await getCredentials(token);
        requireOAuthConfig(credentials);
        const state = createSecureState();
        await storeOAuthState(token, user.id, state);
        return jsonResponse(200, {
          authorizationUrl: buildAuthorizationUrl(credentials.client_id!, state),
          redirectUri: REDIRECT_URI,
        });
      }

      if (action === "callback") {
        const code = readString(body.code);
        const state = readString(body.state);
        if (!code || !state) throw new ApiError(400, "invalid_callback", "Retorno do Google incompleto.");
        await consumeOAuthState(token, user.id, state);
        const credentials = await getCredentials(token);
        requireOAuthConfig(credentials);
        await exchangeAuthorizationCode(token, credentials, code);
        return jsonResponse(200, await getStatus(token));
      }

      if (action === "disconnect") {
        await supabaseRpc(token, "disconnect_google_calendar", {});
        return jsonResponse(200, await getStatus(token));
      }

      throw new ApiError(404, "unknown_action", "Ação da Agenda Google não encontrada.");
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonResponse(error.status, { error: error.code, message: error.message });
      }
      console.error("Google Calendar API error", error);
      return jsonResponse(500, { error: "internal_error", message: "Não foi possível processar a Agenda Google." });
    }
  },
};

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

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? parsed as JsonRecord : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Dados enviados inválidos.");
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new ApiError(401, "missing_session", "Sessão segura do HUB não encontrada.");
  return match[1];
}

async function verifyAdmin(token: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new ApiError(401, "invalid_session", "Sua sessão do HUB expirou. Entre novamente.");
  const user = await response.json() as { id?: string };
  if (!user.id || user.id !== ADMIN_USER_ID) {
    throw new ApiError(403, "admin_only", "A Agenda Google está disponível somente para o Admin/Tezzei.");
  }
  return { id: user.id };
}

function supabaseHeaders(token: string, extra?: Record<string, string>) {
  return {
    apikey: SUPABASE_PUBLIC_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRpc<T = unknown>(token: string, functionName: string, body: JsonRecord): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: supabaseHeaders(token),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const parsed = safeJson(text) as { message?: string } | null;
    throw new ApiError(response.status === 401 ? 401 : 500, "supabase_rpc_failed", parsed?.message ?? "Falha na integração segura com o banco.");
  }
  return (text ? safeJson(text) : undefined) as T;
}

async function getCredentials(token: string): Promise<GoogleCalendarCredentials> {
  const rows = await supabaseRpc<GoogleCalendarCredentials[]>(token, "get_google_calendar_server_credentials", {});
  return Array.isArray(rows) && rows[0] ? rows[0] : {};
}

async function getStatus(token: string) {
  const credentials = await getCredentials(token);
  return {
    configured: Boolean(credentials.client_id && credentials.client_secret),
    connected: Boolean(credentials.connected && credentials.refresh_token),
    googleEmail: credentials.google_email ?? "",
    calendarId: credentials.calendar_id ?? "primary",
    redirectUri: REDIRECT_URI,
    javascriptOrigin: PUBLIC_ORIGIN,
    scope: CALENDAR_SCOPE,
  };
}

function requireOAuthConfig(credentials: GoogleCalendarCredentials) {
  if (!credentials.client_id || !credentials.client_secret) {
    throw new ApiError(409, "oauth_config_required", "Configure primeiro a credencial OAuth do Google.");
  }
}

function createSecureState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function storeOAuthState(token: string, userId: string, state: string) {
  const stateHash = await sha256Hex(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await fetch(`${SUPABASE_URL}/rest/v1/google_calendar_oauth_states?auth_user_id=eq.${encodeURIComponent(userId)}&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "DELETE",
    headers: supabaseHeaders(token),
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/google_calendar_oauth_states`, {
    method: "POST",
    headers: supabaseHeaders(token, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      state_hash: stateHash,
      auth_user_id: userId,
      expires_at: expiresAt,
    }),
  });
  if (!response.ok) throw new ApiError(500, "oauth_state_failed", "Não foi possível iniciar a conexão segura com o Google.");
}

async function consumeOAuthState(token: string, userId: string, state: string) {
  const stateHash = await sha256Hex(state);
  const selectUrl = `${SUPABASE_URL}/rest/v1/google_calendar_oauth_states?select=state_hash,expires_at&state_hash=eq.${stateHash}&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const response = await fetch(selectUrl, { headers: supabaseHeaders(token) });
  const rows = response.ok ? await response.json() as Array<{ state_hash: string; expires_at: string }> : [];
  const row = rows[0];
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new ApiError(400, "invalid_oauth_state", "A autorização do Google expirou. Inicie a conexão novamente.");
  }

  const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/google_calendar_oauth_states?state_hash=eq.${stateHash}&auth_user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: supabaseHeaders(token),
  });
  if (!deleteResponse.ok) throw new ApiError(500, "oauth_state_cleanup_failed", "Não foi possível concluir a autorização segura do Google.");
}

function buildAuthorizationUrl(clientId: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeAuthorizationCode(token: string, credentials: GoogleCalendarCredentials, code: string) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.client_id!,
      client_secret: credentials.client_secret!,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const tokenData = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new ApiError(400, "google_token_exchange_failed", tokenData.error_description ?? "O Google recusou a autorização.");
  }

  const primary = await getPrimaryCalendar(tokenData.access_token);
  const refreshToken = tokenData.refresh_token ?? credentials.refresh_token ?? "";
  if (!refreshToken) {
    throw new ApiError(409, "google_refresh_token_missing", "O Google não forneceu acesso permanente. Conecte novamente e aceite a permissão da Agenda.");
  }

  await supabaseRpc(token, "save_google_calendar_connection", {
    p_refresh_token: refreshToken,
    p_google_email: primary.email,
    p_calendar_id: primary.calendarId,
  });
}

async function getPrimaryCalendar(accessToken: string) {
  try {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return { calendarId: "primary", email: "" };
    const data = await response.json() as { items?: GoogleCalendarListItem[] };
    const primary = data.items?.find((item) => item.primary) ?? data.items?.[0];
    const calendarId = primary?.id || "primary";
    return { calendarId, email: calendarId.includes("@") ? calendarId : "" };
  } catch {
    return { calendarId: "primary", email: "" };
  }
}

async function refreshGoogleAccessToken(credentials: GoogleCalendarCredentials) {
  requireOAuthConfig(credentials);
  if (!credentials.refresh_token) {
    throw new ApiError(409, "google_not_connected", "Conecte sua Agenda Google ao HUB.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.client_id!,
      client_secret: credentials.client_secret!,
      refresh_token: credentials.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    const reconnect = data.error === "invalid_grant";
    throw new ApiError(reconnect ? 409 : 502, reconnect ? "google_reconnect_required" : "google_refresh_failed", reconnect ? "A autorização do Google expirou. Conecte a Agenda novamente." : data.error_description ?? "Não foi possível atualizar o acesso à Agenda Google.");
  }
  return data.access_token;
}

async function getEvents(token: string, date: string) {
  const credentials = await getCredentials(token);
  const accessToken = await refreshGoogleAccessToken(credentials);
  const calendarId = credentials.calendar_id || "primary";
  const events: GoogleEvent[] = [];
  let pageToken = "";
  const timeMin = `${date}T00:00:00${SAO_PAULO_OFFSET}`;
  const timeMax = `${addDaysIso(date, 1)}T00:00:00${SAO_PAULO_OFFSET}`;

  for (let page = 0; page < 3; page += 1) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("timeZone", TIME_ZONE);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json() as { items?: GoogleEvent[]; nextPageToken?: string; error?: { message?: string } };
    if (!response.ok) throw new ApiError(502, "google_events_failed", data.error?.message ?? "Não foi possível consultar seus compromissos do Google.");
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }

  return {
    date,
    timeZone: TIME_ZONE,
    googleEmail: credentials.google_email ?? "",
    events: events
      .filter((event) => event.status !== "cancelled")
      .map((event) => ({
        id: event.id ?? crypto.randomUUID(),
        title: event.summary?.trim() || "Compromisso sem título",
        location: event.location?.trim() || "",
        htmlLink: event.htmlLink ?? "",
        allDay: Boolean(event.start?.date && !event.start?.dateTime),
        start: event.start?.dateTime ?? event.start?.date ?? "",
        end: event.end?.dateTime ?? event.end?.date ?? "",
      })),
  };
}

function addDaysIso(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
