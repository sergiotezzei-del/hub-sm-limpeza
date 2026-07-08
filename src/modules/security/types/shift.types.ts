import type { GuardId } from "../../../types";

export type GuardShiftStatus = "pending" | "active" | "ended" | "auto_ended";

export type GuardScheduleShift = {
  startDate: string;
  startText: string;
  startTime: string;
  endDate: string;
  endText: string;
  endTime: string;
  shiftType: string;
  observation?: string;
};

export type GuardShiftLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type GuardShiftSession = {
  id: string;
  guardLocalId: GuardId;
  guardName: string;
  guardId?: string;
  scheduledDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: GuardShiftStatus;
  startedAt?: string;
  startLatitude?: number;
  startLongitude?: number;
  startAccuracy?: number;
  endedAt?: string;
  endLatitude?: number;
  endLongitude?: number;
  endAccuracy?: number;
  createdAt: string;
  syncStatus: "local" | "supabase";
};

export type GuardShiftState = {
  todaySession: GuardShiftSession | null;
  nextShift: GuardScheduleShift | null;
  syncMessage?: string;
  technicalSyncMessage?: string;
};

export type GuardSyncDiagnosticItem = {
  label: string;
  ok: boolean;
  detail?: string;
};

export type GuardSyncDiagnostic = {
  supabaseConfigured: boolean;
  carlosUuidConfigured: boolean;
  salomaoUuidConfigured: boolean;
  carlosAuthEmailConfigured: boolean;
  salomaoAuthEmailConfigured: boolean;
  authSessionActive: boolean;
  remoteSyncActive: boolean;
  fallbackReason: string;
  items: GuardSyncDiagnosticItem[];
};

export type GuardShiftActionResult = {
  session: GuardShiftSession;
  message: string;
};

export class GuardShiftDuplicateActiveError extends Error {
  constructor() {
    super("DUPLICATE_ACTIVE_SHIFT");
    this.name = "GuardShiftDuplicateActiveError";
  }
}

export class GuardShiftNoTodayError extends Error {
  constructor() {
    super("NO_TODAY_SHIFT");
    this.name = "GuardShiftNoTodayError";
  }
}
