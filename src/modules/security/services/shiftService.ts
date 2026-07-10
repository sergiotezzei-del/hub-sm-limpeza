import type { GuardId } from "../../../types";
import {
  GuardShiftDuplicateActiveError,
  GuardShiftNoTodayError,
  type GuardScheduleShift,
  type GuardRemoteSyncDiagnostic,
  type GuardShiftActionResult,
  type GuardShiftLocation,
  type GuardShiftSession,
  type GuardShiftState,
  type GuardShiftStatus,
  type GuardSyncDiagnostic,
} from "../types/shift.types";
import { getGuardAuthBridgeStatus, type GuardAuthBridgeStatus } from "./guardAuthBridge";
import {
  getGuardSupabaseAuthEmailBinding,
  getGuardSupabaseUserBinding,
  type GuardSupabaseUserBinding,
} from "./guardSupabaseConfig";
import {
  getStoredSupabaseSessionSnapshot,
  getSupabaseAccessToken,
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "./supabaseClient";

const SHIFT_SESSIONS_KEY = "hub-sm-shift-sessions";
const AUDIT_LOGS_KEY = "hub-sm-audit-logs";
const LOCAL_SYNC_MESSAGE = "Registro salvo neste aparelho.";
const CENTRAL_SYNC_PENDING_MESSAGE = "Registro salvo. Sincronização central ainda não ativada.";
const NO_AUTH_SESSION_REASON = "UUIDs configurados, mas falta uma sessão real do Supabase Auth; o RLS bloqueia gravações sem auth.uid().";
const REMOTE_HISTORY_TIMEOUT_MS = 8000;

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

type AuditLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type RemoteHistoryRead<T> = {
  rows: T[];
  count: number | null;
};

type RemoteHistoryReadResult<T> =
  | { ok: true; data: RemoteHistoryRead<T> }
  | { ok: false; error: unknown };

class RemoteHistoryError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super(details || `REMOTE_HISTORY_ERROR_${status}`);
    this.name = "RemoteHistoryError";
  }
}

export async function loadGuardShiftState(input: {
  guardLocalId: GuardId;
  guardName: string;
  todayShift: GuardScheduleShift | null;
  nextShift: GuardScheduleShift | null;
}): Promise<GuardShiftState> {
  const binding = getGuardSupabaseUserBinding(input.guardLocalId);
  const guardId = binding.userId;
  const localSession = input.todayShift ? getOrCreateLocalTodaySession(input.guardLocalId, input.guardName, input.todayShift, guardId) : null;
  const remoteReady = isGuardRemoteSyncReady(binding);
  const syncMessages = getSyncSetupMessages(input.guardName, binding, Boolean(input.todayShift), remoteReady);

  if (!input.todayShift || !remoteReady || !guardId) {
    return {
      todaySession: localSession,
      nextShift: input.nextShift,
      ...syncMessages,
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
      technicalSyncMessage: `Falha ao consultar shift_sessions para ${input.guardName}. Mantido fallback local.`,
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

  const binding = getGuardSupabaseUserBinding(input.guardLocalId);
  const guardId = binding.userId;
  const currentSession = getOrCreateLocalTodaySession(input.guardLocalId, input.guardName, input.todayShift, guardId);
  ensureNoLocalActiveDuplicate(input.guardLocalId, currentSession.id);

  if (isGuardRemoteSyncReady(binding) && guardId) {
    try {
      await ensureNoCloudActiveDuplicate(guardId, currentSession.id);
      const cloudSession = await upsertCloudActivation(currentSession, input.location);
      upsertLocalShiftSession(cloudSession);
      await insertCloudAuditLog(guardId, "shift_activated", cloudSession, input.location);
      insertLocalAuditLog(input.guardLocalId, "shift_activated", cloudSession, input.location);
      return { session: cloudSession, message: "Registro sincronizado." };
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
    message: LOCAL_SYNC_MESSAGE,
  };
}

export async function endGuardShift(input: {
  guardLocalId: GuardId;
  guardName: string;
  session: GuardShiftSession;
  location: GuardShiftLocation;
}): Promise<GuardShiftActionResult> {
  const binding = getGuardSupabaseUserBinding(input.guardLocalId);
  const guardId = input.session.guardId ?? binding.userId;

  if (isGuardRemoteSyncReady(binding) && guardId && input.session.syncStatus === "supabase") {
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
      return { session: cloudSession, message: "Registro sincronizado." };
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
  return { session: localSession, message: LOCAL_SYNC_MESSAGE };
}

export function getGuardSyncDiagnostic(): GuardSyncDiagnostic {
  const carlos = getGuardSupabaseUserBinding("carlos-clemente");
  const salomao = getGuardSupabaseUserBinding("salomao");
  const carlosEmail = getGuardSupabaseAuthEmailBinding("carlos-clemente");
  const salomaoEmail = getGuardSupabaseAuthEmailBinding("salomao");
  const session = getStoredSupabaseSessionSnapshot();
  const hasAuthSession = Boolean(session.accessToken && session.userId);
  const sessionMatchesGuard = Boolean(session.userId && [carlos.userId, salomao.userId].includes(session.userId));
  const currentGuardSessionReady = Boolean(
    supabaseConfigured
    && carlos.userId
    && salomao.userId
    && carlosEmail.email
    && salomaoEmail.email
    && hasAuthSession
    && sessionMatchesGuard,
  );

  return {
    supabaseConfigured,
    carlosUuidConfigured: Boolean(carlos.userId),
    salomaoUuidConfigured: Boolean(salomao.userId),
    carlosAuthEmailConfigured: Boolean(carlosEmail.email),
    salomaoAuthEmailConfigured: Boolean(salomaoEmail.email),
    authSessionActive: hasAuthSession,
    remoteSyncActive: currentGuardSessionReady,
    fallbackReason: getFallbackReason(carlos, salomao, carlosEmail.email, salomaoEmail.email, session.userId),
    items: [
      {
        label: "Supabase configurado",
        ok: supabaseConfigured,
        detail: supabaseConfigured ? "VITE_DB_URL e VITE_DB_PUBLIC_KEY presentes." : "Configure VITE_DB_URL e VITE_DB_PUBLIC_KEY.",
      },
      {
        label: "Email Auth Carlos configurado",
        ok: Boolean(carlosEmail.email),
        detail: carlosEmail.email ? carlosEmail.envName : "Defina VITE_GUARD_CARLOS_AUTH_EMAIL no Vercel.",
      },
      {
        label: "Email Auth Salomão configurado",
        ok: Boolean(salomaoEmail.email),
        detail: salomaoEmail.email ? salomaoEmail.envName : "Defina VITE_GUARD_SALOMAO_AUTH_EMAIL no Vercel.",
      },
      {
        label: "UUID Carlos configurado",
        ok: Boolean(carlos.userId),
        detail: carlos.userId ? carlos.envName : "Defina VITE_GUARD_CARLOS_USER_ID no Vercel.",
      },
      {
        label: "UUID Salomão configurado",
        ok: Boolean(salomao.userId),
        detail: salomao.userId ? salomao.envName : "Defina VITE_GUARD_SALOMAO_USER_ID no Vercel.",
      },
      {
        label: "Sessão Supabase Auth atual",
        ok: hasAuthSession,
        detail: hasAuthSession ? `JWT Auth disponível para ${session.userId}.` : "Admin local pode não ter sessão Auth. Isso não impede que guardas sincronizem.",
      },
    ],
  };
}

export function getPendingGuardRemoteSyncDiagnostic(): GuardRemoteSyncDiagnostic {
  return buildRemoteSyncDiagnostic({
    validated: false,
    remoteReadable: false,
    remoteProtected: false,
    message: "Consultando histórico remoto dos guardas...",
    statusDetail: "Consultando shift_sessions e audit_logs com a chave pública.",
    tone: "neutral",
    value: "Consultando",
  });
}

export async function loadGuardRemoteSyncDiagnostic(): Promise<GuardRemoteSyncDiagnostic> {
  if (!supabaseConfigured) {
    return buildRemoteSyncDiagnostic({
      validated: false,
      remoteReadable: false,
      remoteProtected: false,
      message: "Supabase não configurado para consultar histórico remoto.",
      statusDetail: "Configure VITE_DB_URL e VITE_DB_PUBLIC_KEY.",
    });
  }

  const [shiftResult, auditResult] = await Promise.all([
    readRemoteHistory<ShiftSessionRow>("shift_sessions", "id,guard_id,status,created_at,started_at,ended_at"),
    readRemoteHistory<AuditLogRow>("audit_logs", "id,user_id,action,entity_type,entity_id,details,created_at"),
  ]);
  const successfulReads = [shiftResult, auditResult].filter((result) => result.ok);
  const protectedReads = [shiftResult, auditResult].filter((result) => !result.ok && isRemoteHistoryProtectedError(result.error));

  if (successfulReads.length > 0) {
    const shiftData = shiftResult.ok ? shiftResult.data : null;
    const auditData = auditResult.ok ? auditResult.data : null;
    const remoteSummary = getRemoteSummaryFromRows(shiftData, auditData);
    const validated = (remoteSummary.totalShiftSessions ?? 0) > 0 || (remoteSummary.totalAuditLogs ?? 0) > 0;
    const localProof = getLocalRemoteSyncProof();
    const protectedDetail = protectedReads.length > 0 ? " Parte do histórico remoto está protegida por RLS." : "";

    if (!validated && localProof.validated) {
      return buildRemoteSyncDiagnostic({
        ...localProof,
        validated: true,
        remoteReadable: false,
        remoteProtected: true,
        message: "Histórico remoto não está visível para o admin local. Há sincronização confirmada neste aparelho.",
        statusDetail: "Histórico remoto protegido por RLS.",
      });
    }

    return buildRemoteSyncDiagnostic({
      ...remoteSummary,
      validated,
      remoteReadable: protectedReads.length === 0,
      remoteProtected: protectedReads.length > 0,
      message: validated
        ? `Sincronização remota validada.${protectedDetail}`
        : `Nenhum turno remoto encontrado ainda.${protectedDetail}`,
      statusDetail: validated ? "Dados lidos diretamente do Supabase." : "Consulta remota concluída sem registros.",
    });
  }

  const localProof = getLocalRemoteSyncProof();
  if (protectedReads.length > 0) {
    return buildRemoteSyncDiagnostic({
      ...localProof,
      validated: localProof.validated,
      remoteReadable: false,
      remoteProtected: true,
      message: localProof.validated
        ? "Histórico remoto protegido por RLS. Há sincronização confirmada neste aparelho."
        : "Histórico remoto protegido por RLS. Consulte Supabase.",
      statusDetail: "Histórico remoto protegido por RLS.",
    });
  }

  return buildRemoteSyncDiagnostic({
    ...localProof,
    validated: localProof.validated,
    remoteReadable: false,
    remoteProtected: false,
    message: localProof.validated
      ? "Não foi possível consultar o histórico remoto agora. Há sincronização confirmada neste aparelho."
      : "Não foi possível consultar o histórico remoto agora.",
    statusDetail: "Falha ao consultar shift_sessions e audit_logs.",
  });
}

export function getGuardSupabaseUserId(guardLocalId: GuardId) {
  return getGuardSupabaseUserBinding(guardLocalId).userId;
}

function isGuardRemoteSyncReady(binding: GuardSupabaseUserBinding) {
  const session = getStoredSupabaseSessionSnapshot();
  return Boolean(supabaseConfigured && binding.userId && session.accessToken && session.userId === binding.userId);
}

function getSyncSetupMessages(guardName: string, binding: GuardSupabaseUserBinding, hasTodayShift: boolean, remoteReady: boolean) {
  if (remoteReady) return {};

  const simpleMessage = hasTodayShift ? CENTRAL_SYNC_PENDING_MESSAGE : "Sincronização central ainda não ativada.";

  return {
    syncMessage: simpleMessage,
    technicalSyncMessage: getTechnicalFallbackReason(guardName, binding),
  };
}

function getTechnicalFallbackReason(guardName: string, binding: GuardSupabaseUserBinding) {
  if (!binding.userId) return `${binding.envName} não configurada para ${guardName}; vincule este guarda ao UUID do Supabase Auth para sincronizar.`;
  if (!supabaseConfigured) return "Banco online configurado parcialmente; confira VITE_DB_URL e VITE_DB_PUBLIC_KEY.";
  const session = getStoredSupabaseSessionSnapshot();
  if (session.userId && session.userId !== binding.userId) return "Sessão Supabase Auth ativa não confere com o UUID configurado deste guarda.";
  return NO_AUTH_SESSION_REASON;
}

function getFallbackReason(carlos: GuardSupabaseUserBinding, salomao: GuardSupabaseUserBinding, carlosEmail?: string, salomaoEmail?: string, sessionUserId?: string) {
  const bridgeStatuses = [
    getGuardAuthBridgeStatus("carlos-clemente"),
    getGuardAuthBridgeStatus("salomao"),
  ].filter((status): status is GuardAuthBridgeStatus => Boolean(status && !status.ok));
  const pending = [
    !supabaseConfigured ? "configure VITE_DB_URL e VITE_DB_PUBLIC_KEY" : "",
    !carlosEmail ? "configure VITE_GUARD_CARLOS_AUTH_EMAIL" : "",
    !salomaoEmail ? "configure VITE_GUARD_SALOMAO_AUTH_EMAIL" : "",
    !carlos.userId ? "configure VITE_GUARD_CARLOS_USER_ID" : "",
    !salomao.userId ? "configure VITE_GUARD_SALOMAO_USER_ID" : "",
    !sessionUserId ? "crie uma sessão Supabase Auth real para assinar as requisições" : "",
    sessionUserId && ![carlos.userId, salomao.userId].includes(sessionUserId) ? "sessão Auth atual não confere com os UUIDs dos guardas" : "",
    ...bridgeStatuses.map((status) => status.reason),
  ].filter(Boolean);

  if (pending.length === 0) return "Pronto para testar gravação remota em shift_sessions e audit_logs com RLS ativo.";
  return `Fallback local ativo: ${pending.join("; ")}.`;
}

async function readRemoteHistory<T>(tableName: "shift_sessions" | "audit_logs", select: string): Promise<RemoteHistoryReadResult<T>> {
  try {
    const response = await publicHistoryRequest(`${tableName}?select=${select}&order=created_at.desc&limit=1`, {
      headers: { Prefer: "count=exact" },
    });
    return {
      ok: true,
      data: {
        rows: (await response.json()) as T[],
        count: parseContentRangeCount(response.headers.get("content-range")),
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}

function publicHistoryRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REMOTE_HISTORY_TIMEOUT_MS);

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new RemoteHistoryError(response.status, await response.text());
    }
    return response;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function getRemoteSummaryFromRows(shiftData: RemoteHistoryRead<ShiftSessionRow> | null, auditData: RemoteHistoryRead<AuditLogRow> | null) {
  const latestShift = shiftData?.rows[0];
  const latestAudit = auditData?.rows[0];
  const latestEvents = [
    latestShift
      ? {
        at: latestShift.ended_at ?? latestShift.started_at ?? latestShift.created_at,
        guardName: getGuardNameFromSupabaseUserId(latestShift.guard_id),
      }
      : null,
    latestAudit
      ? {
        at: latestAudit.created_at,
        guardName: getAuditGuardName(latestAudit),
      }
      : null,
  ].filter((event): event is { at: string; guardName: string | undefined } => Boolean(event?.at));
  latestEvents.sort((first, second) => new Date(second.at).getTime() - new Date(first.at).getTime());

  return {
    lastSyncedAt: latestEvents[0]?.at,
    lastGuardName: latestEvents[0]?.guardName,
    totalShiftSessions: shiftData ? shiftData.count ?? shiftData.rows.length : undefined,
    totalAuditLogs: auditData ? auditData.count ?? auditData.rows.length : undefined,
  };
}

function getLocalRemoteSyncProof() {
  const remoteSessions = getLocalShiftSessions().filter((session) => session.syncStatus === "supabase");
  const remoteLogs = getLocalAuditLogs().filter((log) => log.details.syncStatus === "supabase");
  const latestEvents = [
    ...remoteSessions.map((session) => ({
      at: session.endedAt ?? session.startedAt ?? session.createdAt,
      guardName: session.guardName,
    })),
    ...remoteLogs.map((log) => ({
      at: log.createdAt,
      guardName: readString(log.details.guardName) ?? getGuardNameFromLocalId(log.userId),
    })),
  ].filter((event) => Boolean(event.at));
  latestEvents.sort((first, second) => new Date(second.at).getTime() - new Date(first.at).getTime());

  return {
    validated: remoteSessions.length > 0 || remoteLogs.length > 0,
    lastSyncedAt: latestEvents[0]?.at,
    lastGuardName: latestEvents[0]?.guardName,
    totalShiftSessions: remoteSessions.length || undefined,
    totalAuditLogs: remoteLogs.length || undefined,
  };
}

function buildRemoteSyncDiagnostic(input: {
  validated: boolean;
  remoteReadable: boolean;
  remoteProtected: boolean;
  message: string;
  statusDetail: string;
  lastSyncedAt?: string;
  lastGuardName?: string;
  totalShiftSessions?: number;
  totalAuditLogs?: number;
  value?: string;
  tone?: "ok" | "warn" | "neutral";
}): GuardRemoteSyncDiagnostic {
  const metricDetail = input.remoteReadable
    ? "Total lido do Supabase."
    : input.remoteProtected
      ? "Histórico remoto protegido por RLS."
      : "Total remoto indisponível.";
  const localProofDetail = input.remoteProtected && input.validated
    ? " Confirmado pelo cache local deste aparelho."
    : "";

  return {
    validated: input.validated,
    remoteReadable: input.remoteReadable,
    remoteProtected: input.remoteProtected,
    message: input.message,
    items: [
      {
        label: "Sincronização remota validada",
        ok: input.validated,
        value: input.value ?? (input.validated ? "Sim" : "Não"),
        tone: input.tone ?? (input.validated ? "ok" : "warn"),
        detail: `${input.statusDetail}${localProofDetail}`,
      },
      {
        label: "Última sincronização remota",
        ok: Boolean(input.lastSyncedAt),
        value: formatDateTimeShort(input.lastSyncedAt),
        tone: input.lastSyncedAt ? "ok" : "neutral",
        detail: input.lastSyncedAt ? metricDetail : "Ainda sem data disponível.",
      },
      {
        label: "Último guarda sincronizado",
        ok: Boolean(input.lastGuardName),
        value: input.lastGuardName ?? "--",
        tone: input.lastGuardName ? "ok" : "neutral",
        detail: input.lastGuardName ? metricDetail : "Ainda sem guarda disponível.",
      },
      {
        label: "Total de turnos sincronizados",
        ok: typeof input.totalShiftSessions === "number" && input.totalShiftSessions > 0,
        value: formatMetric(input.totalShiftSessions),
        tone: typeof input.totalShiftSessions === "number" ? "ok" : "neutral",
        detail: metricDetail,
      },
      {
        label: "Total de audit_logs",
        ok: typeof input.totalAuditLogs === "number" && input.totalAuditLogs > 0,
        value: formatMetric(input.totalAuditLogs),
        tone: typeof input.totalAuditLogs === "number" ? "ok" : "neutral",
        detail: metricDetail,
      },
    ],
  };
}

function parseContentRangeCount(value: string | null) {
  const count = value?.split("/")[1];
  if (!count || count === "*") return null;
  const parsed = Number(count);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRemoteHistoryProtectedError(error: unknown) {
  if (!(error instanceof RemoteHistoryError)) return false;
  const details = error.details.toLowerCase();
  return [401, 403].includes(error.status)
    || details.includes("42501")
    || details.includes("permission denied")
    || details.includes("row-level security")
    || details.includes("rls");
}

function getAuditGuardName(row: AuditLogRow) {
  return readString(row.details?.guardName) ?? getGuardNameFromSupabaseUserId(row.user_id);
}

function getGuardNameFromSupabaseUserId(userId: string | null) {
  if (!userId) return undefined;
  if (getGuardSupabaseUserBinding("carlos-clemente").userId === userId) return "Carlos Clemente";
  if (getGuardSupabaseUserBinding("salomao").userId === userId) return "Salomão";
  return "Guarda não identificado";
}

function getGuardNameFromLocalId(guardLocalId: GuardId) {
  return guardLocalId === "carlos-clemente" ? "Carlos Clemente" : "Salomão";
}

function formatDateTimeShort(value: string | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetric(value: number | undefined) {
  return typeof value === "number" ? String(value) : "--";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

  const response = await request(`${SUPABASE_URL}/rest/v1/shift_sessions`, {
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
  const response = await request(`${SUPABASE_URL}/rest/v1/shift_sessions?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = (await response.json()) as ShiftSessionRow[];
  if (!rows[0]?.id) throw new Error("Turno online não retornou registro atualizado");
  return mapShiftRow(rows[0], guardLocalId, guardName);
}

async function insertCloudAuditLog(userId: string, action: LocalAuditLog["action"], session: GuardShiftSession, location: GuardShiftLocation) {
  await request(`${SUPABASE_URL}/rest/v1/audit_logs`, {
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
  const response = await request(`${SUPABASE_URL}/rest/v1/shift_sessions?select=*&${query}`);
  return (await response.json()) as ShiftSessionRow[];
}

function request(url: string, init: RequestInit = {}) {
  const accessToken = getSupabaseAccessToken();
  if (!accessToken) throw new Error("MISSING_SUPABASE_AUTH_SESSION");

  return fetch(url, {
    ...init,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken}`,
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
