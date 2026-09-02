export const MARKETING_ASSIGNEES = ["Maria", "Arthur"] as const;

export const MARKETING_CONTENT_OPTIONS = [
  { value: "video", label: "Vídeo" },
  { value: "fotos", label: "Fotos" },
  { value: "carrossel", label: "Carrossel" },
  { value: "post_estatico", label: "Post estático" },
  { value: "outro", label: "Outro" },
] as const;

export const MARKETING_REVIEW_REASONS = [
  { value: "property_code_divergent", label: "Imóvel/código divergente" },
  { value: "incomplete_request", label: "Solicitação incompleta" },
  { value: "incorrect_service", label: "Serviço solicitado incorretamente" },
  { value: "capture_confirmation", label: "Data/local precisa confirmação" },
  { value: "content_validation", label: "Conteúdo precisa validação" },
  { value: "other", label: "Outra divergência" },
] as const;

export const DEFAULT_MARKETING_CAPTURE_WINDOWS = [
  { id: "morning", label: "Manhã", start: "08:00", end: "12:00" },
  { id: "afternoon", label: "Tarde", start: "14:00", end: "18:00" },
] as const;

export type MarketingCaptureWindow = {
  id: string;
  label: string;
  start: string;
  end: string;
};

export type MarketingScheduleConfig = {
  timezone: string;
  workingDays: number[];
  workdayStart: string;
  workdayEnd: string;
  durationOptionsMinutes: number[];
  captureWindows?: MarketingCaptureWindow[];
};

export type MarketingOccupiedCaptureSlot = {
  requestId?: string;
  captureGroupId?: string | null;
  startAt: string;
  durationMinutes: number;
};

export type MarketingCaptureSelection = {
  startAt: string;
  durationMinutes: number;
};

export function getMarketingCaptureWindows(config: MarketingScheduleConfig): MarketingCaptureWindow[] {
  return config.captureWindows?.length
    ? config.captureWindows
    : DEFAULT_MARKETING_CAPTURE_WINDOWS.map((window) => ({ ...window }));
}

export function formatDuration(minutes?: number | null) {
  if (!minutes) return "Não informada";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h${String(remainder).padStart(2, "0")}` : `${hours} ${hours === 1 ? "hora" : "horas"}`;
}

export function formatMarketingDateTime(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCaptureRange(startAt: string, _durationMinutes: number, timezone: string) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "Data não informada";
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  return `${date} · ${time}`;
}

export function getDateKeyInTimeZone(value: Date | string, timezone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getTimeKeyInTimeZone(value: Date | string, timezone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("hour")}:${get("minute")}`;
}

export function zonedLocalToIso(dateKey: string, timeKey: string, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = targetAsUtc;

  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const difference = targetAsUtc - actualAsUtc;
    guess += difference;
    if (difference === 0) break;
  }

  return new Date(guess).toISOString();
}

export function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function addDaysToDateKey(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function isoWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function zonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
