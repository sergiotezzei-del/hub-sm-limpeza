import type { GuardId } from "../../../types";
import type { GuardMonitoringLocation, GuardShiftSession } from "./shift.types";

export type GuardRoundCheckinStatus = "on_time" | "late" | "out_of_sequence";
export type GuardRoundCheckinSource = "manual" | "qr";
export type GuardRoundSource = "Supabase" | "Local";
export type GuardRoundReportStatus = "pending" | "in_progress" | "completed" | "late" | "out_of_sequence";

export type GuardRoundPoint = {
  id: string;
  name: string;
  sequenceOrder: number;
  qrToken: string;
  active: boolean;
};

export type GuardRoundSchedule = {
  id: string;
  scheduledTime: string;
  sequenceOrder: number;
  toleranceMinutes: number;
  pointIntervalToleranceMinutes: number;
  active: boolean;
};

export type GuardRoundCheckin = {
  id: string;
  shiftSessionId: string;
  guardLocalId?: GuardId;
  guardName: string;
  guardId?: string;
  scheduledDate: string;
  roundScheduleId: string;
  roundPointId: string;
  pointSequenceOrder: number;
  scheduledTime: string;
  checkedAt: string;
  status: GuardRoundCheckinStatus;
  checkinSource: GuardRoundCheckinSource;
  source: GuardRoundSource;
  location?: GuardMonitoringLocation;
  qrToken?: string;
};

export type GuardRoundPointReport = {
  point: GuardRoundPoint;
  checkin?: GuardRoundCheckin;
};

export type GuardRoundReportEntry = {
  id: string;
  shiftSessionId: string;
  guardName: string;
  guardLocalId?: GuardId;
  guardId?: string;
  scheduledDate: string;
  schedule: GuardRoundSchedule;
  points: GuardRoundPointReport[];
  completedPoints: number;
  pendingPoints: number;
  status: GuardRoundReportStatus;
  source: GuardRoundSource;
};

export type GuardRoundLoadState = {
  points: GuardRoundPoint[];
  schedules: GuardRoundSchedule[];
  entries: GuardRoundReportEntry[];
  remoteReadable: boolean;
  remoteProtected: boolean;
  message?: string;
};

export type GuardRoundCurrentState = {
  session: GuardShiftSession;
  points: GuardRoundPoint[];
  schedules: GuardRoundSchedule[];
  schedule?: GuardRoundSchedule;
  expectedPoint?: GuardRoundPoint;
  checkins: GuardRoundCheckin[];
  completedPoints: number;
  pendingPoints: number;
  source: GuardRoundSource;
  message?: string;
};

export type RegisterGuardRoundPointResult = {
  checkin: GuardRoundCheckin;
  state: GuardRoundCurrentState;
  message: string;
};
