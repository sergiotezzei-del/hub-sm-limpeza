import { getSupabaseClient } from "../security/services/supabaseClient";

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string;
  calendarId: string;
  redirectUri: string;
  javascriptOrigin: string;
  scope: string;
};

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  location: string;
  htmlLink: string;
  allDay: boolean;
  start: string;
  end: string;
};

export type GoogleCalendarDay = {
  date: string;
  timeZone: string;
  googleEmail: string;
  events: GoogleCalendarEvent[];
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export class GoogleCalendarApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function loadGoogleCalendarStatus() {
  return googleCalendarRequest<GoogleCalendarStatus>("/api/google-calendar?action=status");
}

export async function saveGoogleCalendarOAuthConfig(clientId: string, clientSecret: string) {
  return googleCalendarRequest<GoogleCalendarStatus>("/api/google-calendar", {
    method: "POST",
    body: JSON.stringify({ action: "save_config", clientId, clientSecret }),
  });
}

export async function startGoogleCalendarAuthorization() {
  return googleCalendarRequest<{ authorizationUrl: string; redirectUri: string }>("/api/google-calendar", {
    method: "POST",
    body: JSON.stringify({ action: "authorize" }),
  });
}

export async function completeGoogleCalendarAuthorization(code: string, state: string) {
  return googleCalendarRequest<GoogleCalendarStatus>("/api/google-calendar", {
    method: "POST",
    body: JSON.stringify({ action: "callback", code, state }),
  });
}

export async function disconnectGoogleCalendar() {
  return googleCalendarRequest<GoogleCalendarStatus>("/api/google-calendar", {
    method: "POST",
    body: JSON.stringify({ action: "disconnect" }),
  });
}

export async function loadGoogleCalendarDay(date = getTodayIso()) {
  return googleCalendarRequest<GoogleCalendarDay>(`/api/google-calendar?action=events&date=${encodeURIComponent(date)}`);
}

export function readGoogleCalendarCallback() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state")?.trim() ?? "";
  const code = params.get("code")?.trim() ?? "";
  const error = params.get("error")?.trim() ?? "";
  if (!state || (!code && !error)) return null;
  return { code, state, error };
}

export function clearGoogleCalendarCallbackFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  ["code", "state", "scope", "authuser", "prompt", "hd", "error", "error_description"].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function googleCalendarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new GoogleCalendarApiError(0, "network_error", "Não foi possível acessar o serviço da Agenda Google.");
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    throw new GoogleCalendarApiError(response.status, error.error ?? "google_calendar_error", error.message ?? "Falha na integração com a Agenda Google.");
  }
  return payload as T;
}

async function getAccessToken() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new GoogleCalendarApiError(503, "supabase_unavailable", "Sessão segura do HUB indisponível.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new GoogleCalendarApiError(401, "session_required", "Entre novamente no HUB para acessar sua Agenda Google.");
  }
  return data.session.access_token;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function getTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
