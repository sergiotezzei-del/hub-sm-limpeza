import type { GuardId } from "../../../types";
import type {
  GuardRoundCheckin,
  GuardRoundCheckinStatus,
  GuardRoundCurrentState,
  GuardRoundLoadState,
  GuardRoundPoint,
  GuardRoundPointReport,
  GuardRoundReportEntry,
  GuardRoundReportStatus,
  GuardRoundCheckinSource,
  GuardRoundSchedule,
  RegisterGuardRoundPointResult,
} from "../types/round.types";
import type { GuardShiftLocation, GuardShiftSession } from "../types/shift.types";
import { getGuardSupabaseUserBinding } from "./guardSupabaseConfig";
import {
  getStoredSupabaseSessionSnapshot,
  getSupabaseAccessToken,
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "./supabaseClient";

const ROUND_CHECKINS_KEY = "hub-sm-guard-round-checkins";
const ROUND_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_TOLERANCE_MINUTES = 10;

export const DEFAULT_GUARD_ROUND_POINTS: GuardRoundPoint[] = [
  { id: "local-point-entrada-principal", name: "Entrada principal", sequenceOrder: 1, qrToken: "round-point-entrada-principal", active: true },
  { id: "local-point-subsolo", name: "Subsolo", sequenceOrder: 2, qrToken: "round-point-subsolo", active: true },
  { id: "local-point-gourmet", name: "Gourmet", sequenceOrder: 3, qrToken: "round-point-gourmet", active: true },
  { id: "local-point-porta-patio", name: "Porta pátio", sequenceOrder: 4, qrToken: "round-point-porta-patio", active: true },
  { id: "local-point-portas-laje-tecnica", name: "Portas laje técnica", sequenceOrder: 5, qrToken: "round-point-portas-laje-tecnica", active: true },
  { id: "local-point-recepcao", name: "Recepção", sequenceOrder: 6, qrToken: "round-point-recepcao", active: true },
];

export const DEFAULT_GUARD_ROUND_SCHEDULES: GuardRoundSchedule[] = [
  { id: "local-schedule-0000", scheduledTime: "00:00", sequenceOrder: 1, toleranceMinutes: 10, pointIntervalToleranceMinutes: 10, active: true },
  { id: "local-schedule-0130", scheduledTime: "01:30", sequenceOrder: 2, toleranceMinutes: 10, pointIntervalToleranceMinutes: 10, active: true },
  { id: "local-schedule-0300", scheduledTime: "03:00", sequenceOrder: 3, toleranceMinutes: 10, pointIntervalToleranceMinutes: 10, active: true },
  { id: "local-schedule-0430", scheduledTime: "04:30", sequenceOrder: 4, toleranceMinutes: 10, pointIntervalToleranceMinutes: 10, active: true },
  { id: "local-schedule-0600", scheduledTime: "06:00", sequenceOrder: 5, toleranceMinutes: 10, pointIntervalToleranceMinutes: 10, active: true },
];

type RoundPointRow = {
  id: string;
  name: string;
  sequence_order: number;
  qr_token: string;
  active: boolean;
};

type RoundScheduleRow = {
  id: string;
  scheduled_time: string;
  sequence_order: number;
  tolerance_minutes: number | null;
  point_interval_tolerance_minutes: number | null;
  active: boolean;
};

type RoundCheckinRow = {
  id: string;
  shift_session_id: string;
  guard_id: string | null;
  scheduled_date: string;
  round_schedule_id: string;
  round_point_id: string;
  point_sequence_order: number;
  scheduled_time: string;
  checked_at: string;
  latitude: number | string | null;
  longitude: number | string | null;
  accuracy: number | string | null;
  status: GuardRoundCheckinStatus;
  source: "manual" | "qr";
  qr_token: string | null;
};

type RoundRemoteData = {
  points: GuardRoundPoint[];
  schedules: GuardRoundSchedule[];
  checkins: GuardRoundCheckin[];
  remoteReadable: boolean;
  remoteProtected: boolean;
  message?: string;
};

class RoundRemoteError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super(details || `ROUND_REMOTE_ERROR_${status}`);
    this.name = "RoundRemoteError";
  }
}

export async function loadGuardRoundReport(): Promise<GuardRoundLoadState> {
  const data = await loadRoundData();
  return {
    points: data.points,
    schedules: data.schedules,
    entries: buildReportEntries(data.points, data.schedules, data.checkins),
    remoteReadable: data.remoteReadable,
    remoteProtected: data.remoteProtected,
    message: data.message,
  };
}

export async function loadCurrentGuardRoundState(input: {
  guardLocalId: GuardId;
  guardName: string;
  session: GuardShiftSession;
}): Promise<GuardRoundCurrentState> {
  const data = await loadRoundData();
  return buildCurrentState(input.session, data.points, data.schedules, data.checkins, data.remoteReadable ? "Supabase" : "Local", data.message);
}

export async function registerGuardRoundPoint(input: {
  guardLocalId: GuardId;
  guardName: string;
  session: GuardShiftSession;
  location?: GuardShiftLocation;
  point?: GuardRoundPoint;
  checkinSource?: GuardRoundCheckinSource;
}): Promise<RegisterGuardRoundPointResult> {
  const data = await loadRoundData();
  const currentState = buildCurrentState(input.session, data.points, data.schedules, data.checkins, data.remoteReadable ? "Supabase" : "Local", data.message);

  if (!currentState.schedule || (!currentState.expectedPoint && !input.point)) {
    throw new Error("ROUND_SEQUENCE_COMPLETE");
  }

  const schedule = currentState.schedule;
  const point = input.point ?? currentState.expectedPoint;
  if (!point) throw new Error("ROUND_SEQUENCE_COMPLETE");
  const status = getCheckinStatus(input.session, schedule, point, currentState.checkins, new Date());
  const guardId = input.session.guardId ?? getGuardSupabaseUserBinding(input.guardLocalId).userId;
  const checkinSource = input.checkinSource ?? "manual";

  if (data.remoteReadable && isRoundRemoteSyncReady(guardId, input.session)) {
    try {
      const checkin = await insertCloudRoundCheckin({
        guardId: guardId as string,
        guardLocalId: input.guardLocalId,
        guardName: input.guardName,
        session: input.session,
        schedule,
        point,
        status,
        checkinSource,
        location: input.location,
      });
      upsertLocalRoundCheckin(checkin);
      try {
        await insertCloudRoundAuditLog(checkin, point, input.location);
      } catch (error) {
        console.error(error);
      }
      const nextData = await loadRoundData();
      return {
        checkin,
        state: buildCurrentState(input.session, nextData.points, nextData.schedules, nextData.checkins, nextData.remoteReadable ? "Supabase" : "Local", nextData.message),
        message: "Ponto registrado e sincronizado.",
      };
    } catch (error) {
      console.error(error);
    }
  }

  const localCheckin = createLocalRoundCheckin({
    guardLocalId: input.guardLocalId,
    guardName: input.guardName,
    guardId,
    session: input.session,
    schedule,
    point,
    status,
    checkinSource,
    location: input.location,
  });
  upsertLocalRoundCheckin(localCheckin);
  const localData = getLocalRoundData("Ponto registrado neste aparelho.");

  return {
    checkin: localCheckin,
    state: buildCurrentState(input.session, localData.points, localData.schedules, localData.checkins, "Local", localData.message),
    message: "Ponto registrado neste aparelho.",
  };
}

async function loadRoundData(): Promise<RoundRemoteData> {
  if (!supabaseConfigured) {
    return getLocalRoundData("Supabase não configurado. Exibindo rondas salvas neste aparelho.");
  }

  try {
    const [pointsResponse, schedulesResponse, checkinsResponse] = await Promise.all([
      roundRequest("guard_round_points?select=id,name,sequence_order,qr_token,active&order=sequence_order.asc"),
      roundRequest("guard_round_schedules?select=id,scheduled_time,sequence_order,tolerance_minutes,point_interval_tolerance_minutes,active&order=sequence_order.asc"),
      roundRequest("guard_round_checkins?select=id,shift_session_id,guard_id,scheduled_date,round_schedule_id,round_point_id,point_sequence_order,scheduled_time,checked_at,latitude,longitude,accuracy,status,source,qr_token&order=checked_at.desc&limit=300"),
    ]);
    const points = ((await pointsResponse.json()) as RoundPointRow[]).map(mapRoundPointRow).filter((point) => point.active);
    const schedules = ((await schedulesResponse.json()) as RoundScheduleRow[]).map(mapRoundScheduleRow).filter((schedule) => schedule.active);
    const checkins = ((await checkinsResponse.json()) as RoundCheckinRow[]).map(mapRoundCheckinRow);

    return {
      points: points.length > 0 ? points : DEFAULT_GUARD_ROUND_POINTS,
      schedules: schedules.length > 0 ? schedules : DEFAULT_GUARD_ROUND_SCHEDULES,
      checkins,
      remoteReadable: true,
      remoteProtected: false,
      message: checkins.length > 0 ? "Rondas carregadas do Supabase." : "Estrutura de rondas carregada. Nenhuma batida registrada ainda.",
    };
  } catch (error) {
    const localData = getLocalRoundData(
      isRoundRemoteProtectedError(error)
        ? "Histórico remoto de rondas protegido por RLS. Exibindo registros deste aparelho."
        : "Não foi possível consultar rondas online agora. Exibindo registros deste aparelho.",
    );
    return {
      ...localData,
      remoteProtected: isRoundRemoteProtectedError(error),
    };
  }
}

function getLocalRoundData(message?: string): RoundRemoteData {
  return {
    points: DEFAULT_GUARD_ROUND_POINTS,
    schedules: DEFAULT_GUARD_ROUND_SCHEDULES,
    checkins: getLocalRoundCheckins(),
    remoteReadable: false,
    remoteProtected: false,
    message,
  };
}

function buildCurrentState(
  session: GuardShiftSession,
  points: GuardRoundPoint[],
  schedules: GuardRoundSchedule[],
  checkins: GuardRoundCheckin[],
  source: "Supabase" | "Local",
  message?: string,
): GuardRoundCurrentState {
  const sessionCheckins = checkins
    .filter((checkin) => checkin.shiftSessionId === session.id)
    .sort((first, second) => first.pointSequenceOrder - second.pointSequenceOrder || new Date(first.checkedAt).getTime() - new Date(second.checkedAt).getTime());
  const sortedPoints = sortPoints(points);
  const sortedSchedules = sortSchedules(schedules);
  const schedule = sortedSchedules.find((current) => {
    const scheduleCheckins = sessionCheckins.filter((checkin) => checkin.roundScheduleId === current.id || checkin.scheduledTime === current.scheduledTime);
    return getCompletedPointCount(sortedPoints, scheduleCheckins) < sortedPoints.length;
  });
  const checkinsForSchedule = schedule
    ? sessionCheckins.filter((checkin) => checkin.roundScheduleId === schedule.id || checkin.scheduledTime === schedule.scheduledTime)
    : [];
  const expectedPoint = schedule
    ? sortedPoints.find((point) => !checkinsForSchedule.some((checkin) => checkin.roundPointId === point.id || checkin.pointSequenceOrder === point.sequenceOrder))
    : undefined;

  return {
    session,
    points: sortedPoints,
    schedules: sortedSchedules,
    schedule,
    expectedPoint,
    checkins: checkinsForSchedule,
    completedPoints: getCompletedPointCount(sortedPoints, checkinsForSchedule),
    pendingPoints: Math.max(0, sortedPoints.length - getCompletedPointCount(sortedPoints, checkinsForSchedule)),
    source: checkinsForSchedule.some((checkin) => checkin.source === "Supabase") ? "Supabase" : source,
    message,
  };
}

function buildReportEntries(points: GuardRoundPoint[], schedules: GuardRoundSchedule[], checkins: GuardRoundCheckin[]): GuardRoundReportEntry[] {
  const sortedPoints = sortPoints(points);
  const sortedSchedules = sortSchedules(schedules);
  const grouped = new Map<string, GuardRoundCheckin[]>();

  checkins.forEach((checkin) => {
    const key = `${checkin.shiftSessionId}:${checkin.roundScheduleId}:${checkin.scheduledTime}`;
    grouped.set(key, [...(grouped.get(key) ?? []), checkin]);
  });

  const entries = Array.from(grouped.values()).map((group) => {
    const first = group[0];
    const schedule = sortedSchedules.find((current) => current.id === first.roundScheduleId || current.scheduledTime === first.scheduledTime) ?? {
      id: first.roundScheduleId,
      scheduledTime: first.scheduledTime,
      sequenceOrder: 999,
      toleranceMinutes: DEFAULT_TOLERANCE_MINUTES,
      pointIntervalToleranceMinutes: DEFAULT_TOLERANCE_MINUTES,
      active: true,
    };
    const pointReports = sortedPoints.map((point) => ({
      point,
      checkin: group.find((checkin) => checkin.roundPointId === point.id || checkin.pointSequenceOrder === point.sequenceOrder),
    }));
    const completedPoints = getCompletedPointCount(sortedPoints, group);

    return {
      id: `${first.shiftSessionId}-${schedule.id}`,
      shiftSessionId: first.shiftSessionId,
      guardName: first.guardName,
      guardLocalId: first.guardLocalId,
      guardId: first.guardId,
      scheduledDate: first.scheduledDate,
      schedule,
      points: pointReports,
      completedPoints,
      pendingPoints: Math.max(0, sortedPoints.length - completedPoints),
      status: getRoundReportStatus(pointReports),
      source: group.some((checkin) => checkin.source === "Supabase") ? "Supabase" : "Local",
    } satisfies GuardRoundReportEntry;
  });

  return entries.sort((first, second) => {
    const firstTime = new Date(`${first.scheduledDate}T${first.schedule.scheduledTime}:00`).getTime();
    const secondTime = new Date(`${second.scheduledDate}T${second.schedule.scheduledTime}:00`).getTime();
    return secondTime - firstTime || first.guardName.localeCompare(second.guardName);
  });
}

function getRoundReportStatus(points: GuardRoundPointReport[]): GuardRoundReportStatus {
  const checkins = points.map((point) => point.checkin).filter((checkin): checkin is GuardRoundCheckin => Boolean(checkin));
  if (checkins.length === 0) return "pending";
  if (checkins.some((checkin) => checkin.status === "out_of_sequence")) return "out_of_sequence";
  if (checkins.length === points.length) return checkins.some((checkin) => checkin.status === "late") ? "late" : "completed";
  if (checkins.some((checkin) => checkin.status === "late")) return "late";
  return "in_progress";
}

function getCheckinStatus(
  session: GuardShiftSession,
  schedule: GuardRoundSchedule,
  point: GuardRoundPoint,
  previousCheckins: GuardRoundCheckin[],
  checkedAt: Date,
): GuardRoundCheckinStatus {
  const completedSequences = new Set(previousCheckins.map((checkin) => checkin.pointSequenceOrder));
  let expectedSequence = 1;
  while (completedSequences.has(expectedSequence)) expectedSequence += 1;
  if (point.sequenceOrder !== expectedSequence) return "out_of_sequence";

  if (!isWithinRoundToleranceWindow(session, schedule, checkedAt)) return "late";

  if (previousCheckins.length > 0) {
    const previous = [...previousCheckins].sort((first, second) => second.pointSequenceOrder - first.pointSequenceOrder)[0];
    const previousAt = new Date(previous.checkedAt);
    const toleranceMs = schedule.pointIntervalToleranceMinutes * 60000;
    if (Number.isFinite(previousAt.getTime()) && checkedAt.getTime() - previousAt.getTime() > toleranceMs) return "late";
  }

  return "on_time";
}

function isWithinRoundToleranceWindow(session: GuardShiftSession, schedule: GuardRoundSchedule, checkedAt: Date) {
  const checkedAtMs = checkedAt.getTime();
  if (!Number.isFinite(checkedAtMs)) return false;

  const scheduledAt = getRoundScheduledDateTime(session, schedule);
  const scheduledAtMs = scheduledAt.getTime();
  if (!Number.isFinite(scheduledAtMs)) return false;

  const toleranceMs = schedule.toleranceMinutes * 60000;
  return checkedAtMs >= scheduledAtMs - toleranceMs && checkedAtMs <= scheduledAtMs + toleranceMs;
}

async function insertCloudRoundCheckin(input: {
  guardId: string;
  guardLocalId: GuardId;
  guardName: string;
  session: GuardShiftSession;
  schedule: GuardRoundSchedule;
  point: GuardRoundPoint;
  status: GuardRoundCheckinStatus;
  checkinSource: GuardRoundCheckinSource;
  location?: GuardShiftLocation;
}) {
  const response = await roundRequest("guard_round_checkins", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      shift_session_id: input.session.id,
      guard_id: input.guardId,
      scheduled_date: getRoundScheduledDateIso(input.session, input.schedule),
      round_schedule_id: input.schedule.id,
      round_point_id: input.point.id,
      point_sequence_order: input.point.sequenceOrder,
      scheduled_time: input.schedule.scheduledTime,
      latitude: input.location?.latitude,
      longitude: input.location?.longitude,
      accuracy: input.location?.accuracy,
      status: input.status,
      source: input.checkinSource,
      qr_token: input.point.qrToken,
    }]),
  });
  const rows = (await response.json()) as RoundCheckinRow[];
  if (!rows[0]?.id) throw new Error("Batida online criada sem ID");
  return {
    ...mapRoundCheckinRow(rows[0]),
    guardLocalId: input.guardLocalId,
    guardName: input.guardName,
  };
}

async function insertCloudRoundAuditLog(checkin: GuardRoundCheckin, point: GuardRoundPoint, location?: GuardShiftLocation) {
  if (!checkin.guardId) return;

  await roundRequest("audit_logs", {
    method: "POST",
    body: JSON.stringify([{
      user_id: checkin.guardId,
      action: "round_point_checked",
      entity_type: "guard_round_checkins",
      entity_id: checkin.id,
      details: {
        guardName: checkin.guardName,
        scheduledDate: checkin.scheduledDate,
        scheduledTime: checkin.scheduledTime,
        pointName: point.name,
        pointSequenceOrder: point.sequenceOrder,
        status: checkin.status,
        source: checkin.checkinSource,
        location,
      },
    }]),
  });
}

function createLocalRoundCheckin(input: {
  guardLocalId: GuardId;
  guardName: string;
  guardId?: string;
  session: GuardShiftSession;
  schedule: GuardRoundSchedule;
  point: GuardRoundPoint;
  status: GuardRoundCheckinStatus;
  checkinSource: GuardRoundCheckinSource;
  location?: GuardShiftLocation;
}): GuardRoundCheckin {
  return {
    id: createId(),
    shiftSessionId: input.session.id,
    guardLocalId: input.guardLocalId,
    guardName: input.guardName,
    guardId: input.guardId,
    scheduledDate: getRoundScheduledDateIso(input.session, input.schedule),
    roundScheduleId: input.schedule.id,
    roundPointId: input.point.id,
    pointSequenceOrder: input.point.sequenceOrder,
    scheduledTime: input.schedule.scheduledTime,
    checkedAt: new Date().toISOString(),
    status: input.status,
    checkinSource: input.checkinSource,
    source: "Local",
    location: input.location ? {
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy: input.location.accuracy,
    } : undefined,
    qrToken: input.point.qrToken,
  };
}

function roundRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ROUND_REQUEST_TIMEOUT_MS);
  const accessToken = getSupabaseAccessToken();
  const method = (init.method ?? "GET").toUpperCase();

  if (method !== "GET" && !accessToken) {
    window.clearTimeout(timeout);
    throw new Error("MISSING_SUPABASE_AUTH_SESSION");
  }

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) throw new RoundRemoteError(response.status, await response.text());
    return response;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function isRoundRemoteSyncReady(guardId: string | undefined, session: GuardShiftSession) {
  const snapshot = getStoredSupabaseSessionSnapshot();
  return Boolean(
    supabaseConfigured
    && guardId
    && session.syncStatus === "supabase"
    && snapshot.accessToken
    && snapshot.userId === guardId,
  );
}

function mapRoundPointRow(row: RoundPointRow): GuardRoundPoint {
  return {
    id: row.id,
    name: row.name,
    sequenceOrder: row.sequence_order,
    qrToken: row.qr_token,
    active: row.active,
  };
}

function mapRoundScheduleRow(row: RoundScheduleRow): GuardRoundSchedule {
  return {
    id: row.id,
    scheduledTime: normalizeTime(row.scheduled_time),
    sequenceOrder: row.sequence_order,
    toleranceMinutes: row.tolerance_minutes ?? DEFAULT_TOLERANCE_MINUTES,
    pointIntervalToleranceMinutes: row.point_interval_tolerance_minutes ?? DEFAULT_TOLERANCE_MINUTES,
    active: row.active,
  };
}

function mapRoundCheckinRow(row: RoundCheckinRow): GuardRoundCheckin {
  return {
    id: row.id,
    shiftSessionId: row.shift_session_id,
    guardLocalId: getGuardLocalIdFromSupabaseUserId(row.guard_id),
    guardName: getGuardNameFromSupabaseUserId(row.guard_id) ?? "Guarda não identificado",
    guardId: row.guard_id ?? undefined,
    scheduledDate: row.scheduled_date,
    roundScheduleId: row.round_schedule_id,
    roundPointId: row.round_point_id,
    pointSequenceOrder: row.point_sequence_order,
    scheduledTime: normalizeTime(row.scheduled_time),
    checkedAt: row.checked_at,
    status: row.status,
    checkinSource: row.source,
    source: "Supabase",
    location: getMonitoringLocation(row.latitude, row.longitude, row.accuracy),
    qrToken: row.qr_token ?? undefined,
  };
}

function getLocalRoundCheckins(): GuardRoundCheckin[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(ROUND_CHECKINS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isGuardRoundCheckinLike) : [];
  } catch {
    return [];
  }
}

function upsertLocalRoundCheckin(checkin: GuardRoundCheckin) {
  if (typeof window === "undefined") return;
  const checkins = getLocalRoundCheckins();
  const nextCheckins = checkins.some((current) => current.id === checkin.id || (
    current.shiftSessionId === checkin.shiftSessionId
    && current.roundScheduleId === checkin.roundScheduleId
    && current.roundPointId === checkin.roundPointId
  ))
    ? checkins.map((current) => (
      current.id === checkin.id
      || (
        current.shiftSessionId === checkin.shiftSessionId
        && current.roundScheduleId === checkin.roundScheduleId
        && current.roundPointId === checkin.roundPointId
      )
        ? checkin
        : current
    ))
    : [checkin, ...checkins];
  window.localStorage.setItem(ROUND_CHECKINS_KEY, JSON.stringify(nextCheckins));
}

function isGuardRoundCheckinLike(value: unknown): value is GuardRoundCheckin {
  if (!value || typeof value !== "object") return false;
  const checkin = value as Partial<GuardRoundCheckin>;
  return typeof checkin.id === "string"
    && typeof checkin.shiftSessionId === "string"
    && typeof checkin.roundScheduleId === "string"
    && typeof checkin.roundPointId === "string"
    && typeof checkin.scheduledTime === "string";
}

function getCompletedPointCount(points: GuardRoundPoint[], checkins: GuardRoundCheckin[]) {
  return points.filter((point) => checkins.some((checkin) => checkin.roundPointId === point.id || checkin.pointSequenceOrder === point.sequenceOrder)).length;
}

function sortPoints(points: GuardRoundPoint[]) {
  return [...points].sort((first, second) => first.sequenceOrder - second.sequenceOrder);
}

function sortSchedules(schedules: GuardRoundSchedule[]) {
  return [...schedules].sort((first, second) => first.sequenceOrder - second.sequenceOrder);
}

function getRoundScheduledDateTime(session: GuardShiftSession, schedule: GuardRoundSchedule) {
  const date = new Date(`${session.scheduledDate}T${schedule.scheduledTime}:00-03:00`);
  if (schedule.scheduledTime < session.scheduledStart) date.setDate(date.getDate() + 1);
  return date;
}

function getRoundScheduledDateIso(session: GuardShiftSession, schedule: GuardRoundSchedule) {
  const date = getRoundScheduledDateTime(session, schedule);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getGuardNameFromSupabaseUserId(userId: string | null) {
  if (!userId) return undefined;
  if (getGuardSupabaseUserBinding("carlos-clemente").userId === userId) return "Carlos Clemente";
  if (getGuardSupabaseUserBinding("salomao").userId === userId) return "Salomão";
  return undefined;
}

function getGuardLocalIdFromSupabaseUserId(userId: string | null): GuardId | undefined {
  if (!userId) return undefined;
  if (getGuardSupabaseUserBinding("carlos-clemente").userId === userId) return "carlos-clemente";
  if (getGuardSupabaseUserBinding("salomao").userId === userId) return "salomao";
  return undefined;
}

function getMonitoringLocation(latitude: number | string | null | undefined, longitude: number | string | null | undefined, accuracy?: number | string | null) {
  const parsedLatitude = toOptionalNumber(latitude ?? null);
  const parsedLongitude = toOptionalNumber(longitude ?? null);
  if (parsedLatitude === undefined || parsedLongitude === undefined) return undefined;
  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude,
    accuracy: toOptionalNumber(accuracy ?? null),
  };
}

function toOptionalNumber(value: number | string | null) {
  if (value === null || value === undefined) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function isRoundRemoteProtectedError(error: unknown) {
  return error instanceof RoundRemoteError && [401, 403].includes(error.status);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
