export type MarketingGoogleCalendarUserStatus = {
  userId: string;
  userName: string;
  connected: boolean;
  googleEmail: string;
  calendarId: string;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type MarketingGoogleCalendarStatus = {
  configured: boolean;
  canConnect: boolean;
  currentUserId: string;
  currentUserName: string;
  users: MarketingGoogleCalendarUserStatus[];
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export class MarketingGoogleCalendarApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function loadMarketingGoogleCalendarStatus(sessionToken: string) {
  return marketingGoogleCalendarRequest<MarketingGoogleCalendarStatus>(sessionToken, {
    action: "status",
  });
}

export async function startMarketingGoogleCalendarAuthorization(sessionToken: string) {
  return marketingGoogleCalendarRequest<{ authorizationUrl: string; redirectUri: string }>(sessionToken, {
    action: "authorize",
  });
}

export async function completeMarketingGoogleCalendarAuthorization(
  sessionToken: string,
  code: string,
  state: string,
  error = "",
) {
  return marketingGoogleCalendarRequest<MarketingGoogleCalendarStatus>(sessionToken, {
    action: "callback",
    code,
    state,
    error,
  });
}

export async function disconnectMarketingGoogleCalendar(sessionToken: string) {
  return marketingGoogleCalendarRequest<MarketingGoogleCalendarStatus>(sessionToken, {
    action: "disconnect",
  });
}

export function readMarketingGoogleCalendarCallback() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state")?.trim() ?? "";
  if (!state.startsWith("mkt_")) return null;
  const code = params.get("code")?.trim() ?? "";
  const error = params.get("error")?.trim() ?? "";
  if (!code && !error) return null;
  return { state, code, error };
}

export function clearMarketingGoogleCalendarCallbackFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  ["code", "state", "scope", "authuser", "prompt", "hd", "error", "error_description"].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function marketingGoogleCalendarRequest<T>(sessionToken: string, body: Record<string, unknown>): Promise<T> {
  if (!sessionToken.trim()) {
    throw new MarketingGoogleCalendarApiError(401, "marketing_session_required", "Sua sessão do Marketing não está disponível.");
  }

  let response: Response;
  try {
    response = await fetch("/api/marketing-google-calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketing-session": sessionToken,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new MarketingGoogleCalendarApiError(0, "network_error", "Não foi possível acessar a integração com o Google Agenda.");
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    throw new MarketingGoogleCalendarApiError(
      response.status,
      error.error ?? "marketing_google_calendar_error",
      error.message ?? "Falha na integração com o Google Agenda.",
    );
  }
  return payload as T;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}
