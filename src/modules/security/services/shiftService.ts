import type { GuardId } from "../../../types";
import {
  GuardShiftDuplicateActiveError,
  GuardShiftNoTodayError,
  type GuardScheduleShift,
  type GuardShiftActionResult,
  type GuardShiftLocation,
  type GuardShiftSession,
  type GuardShiftState,
  type GuardShiftStatus,
} from "../types/shift.types";

const SHIFT_SESSIONS_KEY = "hub-sm-shift-sessions";
const AUDIT_LOGS_KEY = "hub-sm-audit-logs";
const CLOUD_URL = import.meta.env.VITE_DB_URL ?? "";
const PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
const KEY_HEADER = ["api", "key"].join("");
const cloudEnabled = Boolean(CLOUD_URL && PUBLIC_KEY);

type ShiftSessionRow = {
  id: string;
  guard_id: string | null;
  scheduled_date: string;
  scheduled_start: string;
  scheduled_end: string;
  status: GuardShiftStatus;
  started_at: string | null;
  start_latitude: number | string | null;
  start_longitude: number | string | null;
  start_accuracy: number | string | null;
  ended_at: string | null;
  end_latitude: number | string | null;
  end_longitude: number | string | null;
  end_accuracy: number | string | null;
  created_at: string;
};

type LocalAuditLog = {
  id: string;
  userId: GuardId;
  action: "shift_activated" | "shift_ended";
  entityType: "shift_session";
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export async function loadGuardShiftState(input: {
  guardLocalId: GuardId;
  guardName: string;
  todayShift: GuardScheduleShift | null;
  nextShift: GuardScheduleShift | null;
}): Promise<GuardShiftState> {
  const guardId = getGuardSupabaseUserId(input.guardLocalId);
  const localSession = input.todayShift ? getOrCreateLocalTodaySession(input.guardLocalId, input.guardName, input.todayShift, guardId) : null;

  if (!input.todayShift || !cloudEnabled || !guardId) {
    return {
      todaySession: localSession,
      nextShift: input.nextShift,
      syncMessage: !guardId ? "Registro local: vincule um UUID de auth.users para sincronizar no Supabase." : undefined,
    };
  }

  try {
    const rows = await fetchShiftRows(`guard_id=eq.${guardId}&scheduled_date=eq.${input.todayShift.startDate}&order=created_at.desc&limit=1`);
    if (rows[0]) {
      const cloudSession = mapShiftRow(rows[0], input.guardLocalId, input.guardName);
      upsertLocalShiftSession(cloudSession);
      return { todaySession: cloudSession, nextShift: input.nextShift };
    }
  } catch (error) {
    console.error(error);
    return {
      todaySession: localSession,
      nextShift: input.nextShift,
      syncMessage: "Sem sincronização online agora. O turno segue salvo neste aparelho.",
    };
  }

  return { todaySession: localSession, nextShift: input.nextShift };
}

export async function activateGuardShift(input: {
  guardLocalId: GuardId;
  guardName: string;
  todayShift: GuardScheduleShift | null;
  location: GuardShiftLocation;
}): Promise<GuardShiftActionResult> {
  if (!input.todayShift) throw new GuardShiftNoTodayError();

  const guardId = getGuardSupabaseUserId(input.guardLocalId);
  const currentSession = getOrCreateLocalTodaySession(input.guardLocalId, input.guardName, input.todayShift, guardId);
  ensureNoLocalActiveDuplicate(input.guardLocalId, currentSession.id);

  if (cloudEnabled && guardId) {
    try {
      await ensureNoCloudActiveDuplicate(guardId, currentSession.id);
      const cloudSession = await upsertCloudActivation(currentSession, input.location);
      upsertLocalShiftSession(cloudSession);
      await insertCloudAuditLog(guardId, "shift_activated", cloudSession, input.location);
      insertLocalAuditLog(input.guardLocalId, "shift_activated", cloudSession, input.location);
      return { session: cloudSession, message: `Serviço ativo desde ${formatTime(cloudSession.startedAt)}.` };
    } catch (error) {
      console.error(error);
    }
  }

  const localSession: GuardShiftSession = {
    ...currentSession,
    status: "active",
    startedAt: currentSession.startedAt ?? new Date().toISOString(),
    startLatitude: input.location.latitude,
    startLongitude: input.location.longitude,
    startAccuracy: input.location.accuracy,
    syncStatus: "local",
  };
  upsertLocalShiftSession(localSession);
  insertLocalAuditLog(input.guardLocalId, "shift_activated", localSession, input.location);
  return {
    session: localSession,
    message: `Serviço ativo desde ${formatTime(localSession.startedAt)}. Registro local aguardando sincronização Supabase.`,
  };
}

export async function endGuardShift(input: {
  guardLocalId: GuardId;
  guardName: string;
  session: GuardShiftSession;
  location: GuardShiftLocation;
}): Promise<GuardShiftActionResult> {
  const guardId = input.session.guardId ?? getGuardSupabaseUserId(input.guardLocalId);

  if (cloudEnabled && guardId && input.session.syncStatus === "supabase") {
    try {
      const cloudSession = await updateCloudShift(input.session.id, {
        status: "ended",
        end_latitude: input.location.latitude,
        end_longitude: input.location.longitude,
        end_accuracy: input.location.accuracy,
      }, input.guardLocalId, input.guardName);
      upsertLocalShiftSession(cloudSession);
      await insertCloudAuditLog(guardId, "shift_ended", cloudSession, input.location);
      insertLocalAuditLog(input.guardLocalId, "shift_ended", cloudSession, input.location);
      return { session: cloudSession, message: "Serviço encerrado com localização final." };
    } catch (error) {
      console.error(error);
    }
  }

  const localSession: GuardShiftSession = {
    ...input.session,
    status: "ended",
    endedAt: input.session.endedAt ?? new Date().toISOString(),
    endLatitude: input.location.latitude,
    endLongitude: input.location.longitude,
    endAccuracy: input.location.accuracy,
    syncStatus: "local",
  };
  upsertLocalShiftSession(localSession);
  insertLocalAuditLog(input.guardLocalId, "shift_ended", localSession, input.location);
  return { session: localSession, message: "Serviço encerrado neste aparelho. Registro local aguardando sincronização Supabase." };
}

export function getGuardSupabaseUserId(guardLocalId: GuardId) {
  const env = import.meta.env as Record<string, string | undefined>;
  const ids: Record<GuardId, string | undefined> = {
    "carlos-clemente": env.VITE_GUARD_CARLOS_USER_ID ?? env.VITE_CARLOS_CLEMENTE_USER_ID,
    salomao: env.VITE_GUARD_SALOMAO_USER_ID ?? env.VITE_SALOMAO_USER_ID,
  };
  return ids[guardLocalId]?.trim() || undefined;
}

function getOrCreateLocalTodaySession(guardLocalId: GuardId, guardName: string, shift: GuardScheduleShift, guardId?: string): GuardShiftSession {
  const existing = getLocalShiftSessions().find((session) => (
    session.guardLocalId === guardLocalId
    && session.scheduledDate === shift.startDate
    && session.scheduledStart === shift.startTime
  ));

  if (existing) return { ...existing, guardId: existing.guardId ?? guardId };

  const session: GuardShiftSession = {
    id: createId(),
    guardLocalId,
    guardName,
    guardId,
    scheduledDate: shift.startDate,
    scheduledStart: shift.startTime,
    scheduledEnd: shift.endTime,
    status: "pending",
    createdAt: new Date().toISOString(),
    syncStatus: "local",
  };
  upsertLocalShiftSession(session);
  return session;
}

function ensureNoLocalActiveDuplicate(guardLocalId: GuardId, currentSessionId: string) {
  const duplicate = getLocalShiftSessions().find((session) => (
    session.guardLocalId === guardLocalId
    && session.status === "active"
    && session.id !== currentSessionId
  ));
  if (duplicate) throw new GuardShiftDuplicateActiveError();
}

async function ensureNoCloudActiveDuplicate(guardId: string, currentSessionId: string) {
  const rows = await fetchShiftRows(`guard_id=eq.${guardId}&status=eq.active&limit=1`);
  const duplicate = rows.find((row) => row.id !== currentSessionId);
  if (duplicate) throw new GuardShiftDuplicateActiveError();
}

async function upsertCloudActivation(session: GuardShiftSession, location: GuardShiftLocation) {
  if (session.syncStatus === "supabase") {
    return updateCloudShift(session.id, {
      status: "active",
      start_latitude: location.latitude,
      start_longitude: location.longitude,
      start_accuracy: location.accuracy,
    }, session.guardLocalId, session.guardName);
  }

  const response = await request(`${CLOUD_URL}/rest/v1/shift_sessions`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      guard_id: session.guardId,
      scheduled_date: session.scheduledDate,
      scheduled_start: session.scheduledStart,
      scheduled_end: session.scheduledEnd,
      status: "active",
      start_latitude: location.latitude,
      start_longitude: location.longitude,
      start_accuracy: location.accuracy,
    }]),
  });
  const rows = (await response.json()) as ShiftSessionRow[];
  if (!rows[0]?.id) throw new Error("Turno online criado sem ID");
  return mapShiftRow(rows[0], session.guardLocalId, session.guardName);
}

async function updateCloudShift(id: string, payload: Partial<ShiftSessionRow>, guardLocalId: GuardId, guardName: string) {
  const response = await request(`${CLOUD_URL}/rest/v1/shift_sessions?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = (await response.json()) as ShiftSessionRow[];
  if (!rows[0]?.id) throw new Error("Turno online não retornou registro atualizado");
  return mapShiftRow(rows[0], guardLocalId, guardName);
}

async function insertCloudAuditLog(userId: string, action: LocalAuditLog["action"], session: GuardShiftSession, location: GuardShiftLocation) {
  await request(`${CLOUD_URL}/rest/v1/audit_logs`, {
    method: "POST",
    body: JSON.stringify([{
      user_id: userId,
      action,
      entity_type: "shift_session",
      entity_id: session.id,
      details: {
        guardName: session.guardName,
        scheduledDate: session.scheduledDate,
        location,
      },
    }]),
  });
}

async function fetchShiftRows(query: string) {
  const response = await request(`${CLOUD_URL}/rest/v1/shift_sessions?select=*&${query}`);
  return (await response.json()) as ShiftSessionRow[];
}

function request(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      [KEY_HEADER]: PUBLIC_KEY,
      Authorization: `Bearer ${PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || `Erro online: ${response.status}`);
    }
    return response;
  });
}

function mapShiftRow(row: ShiftSessionRow, guardLocalId: GuardId, guardName: string): GuardShiftSession {
  return {
    id: row.id,
    guardLocalId,
    guardName,
    guardId: row.guard_id ?? undefined,
    scheduledDate: row.scheduled_date,
    scheduledStart: normalizeTime(row.scheduled_start),
    scheduledEnd: normalizeTime(row.scheduled_end),
    status: row.status,
    startedAt: row.started_at ?? undefined,
    startLatitude: toOptionalNumber(row.start_latitude),
    startLongitude: toOptionalNumber(row.start_longitude),
    startAccuracy: toOptionalNumber(row.start_accuracy),
    endedAt: row.ended_at ?? undefined,
    endLatitude: toOptionalNumber(row.end_latitude),
    endLongitude: toOptionalNumber(row.end_longitude),
    endAccuracy: toOptionalNumber(row.end_accuracy),
    createdAt: row.created_at,
    syncStatus: "supabase",
  };
}

function getLocalShiftSessions(): GuardShiftSession[] {
  const raw = window.localStorage.getItem(SHIFT_SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isGuardShiftSessionLike) : [];
  } catch {
    return [];
  }
}

function upsertLocalShiftSession(session: GuardShiftSession) {
  const sessions = getLocalShiftSessions();
  const nextSessions = sessions.some((current) => current.id === session.id)
    ? sessions.map((current) => (current.id === session.id ? session : current))
    : [session, ...sessions];
  window.localStorage.setItem(SHIFT_SESSIONS_KEY, JSON.stringify(nextSessions));
}

function insertLocalAuditLog(userId: GuardId, action: LocalAuditLog["action"], session: GuardShiftSession, location: GuardShiftLocation) {
  const log: LocalAuditLog = {
    id: createId(),
    userId,
    action,
    entityType: "shift_session",
    entityId: session.id,
    details: {
      guardName: session.guardName,
      scheduledDate: session.scheduledDate,
      syncStatus: session.syncStatus,
      location,
    },
    createdAt: new Date().toISOString(),
  };
  const logs = getLocalAuditLogs();
  window.localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify([log, ...logs]));
}

function getLocalAuditLogs(): LocalAuditLog[] {
  const raw = window.localStorage.getItem(AUDIT_LOGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isGuardShiftSessionLike(value: unknown): value is GuardShiftSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<GuardShiftSession>;
  return typeof session.id === "string" && typeof session.guardLocalId === "string" && typeof session.scheduledDate === "string";
}

function toOptionalNumber(value: number | string | null) {
  if (value === null || value === undefined) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function formatTime(value: string | undefined) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
