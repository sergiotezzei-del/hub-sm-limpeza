import { useMemo, useState } from "react";
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  getTimeKeyInTimeZone,
  isoWeekday,
  MarketingCaptureSelection,
  MarketingOccupiedCaptureSlot,
  MarketingScheduleConfig,
  minutesFromTime,
  zonedLocalToIso,
} from "./marketingConfig";

type CaptureSchedulePickerProps = {
  config: MarketingScheduleConfig;
  occupiedSlots: MarketingOccupiedCaptureSlot[];
  value?: MarketingCaptureSelection | null;
  excludedRequestId?: string;
  excludedCaptureGroupId?: string | null;
  onConfirm: (value: MarketingCaptureSelection) => void;
  onCancel?: () => void;
};

const DATE_WINDOW_DAYS = 28;
const STANDARD_TIMES = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"] as const;
const AFTERNOON_START_MINUTES = 14 * 60;
const DEFAULT_DURATION_MINUTES = 60;

export function CaptureSchedulePicker(props: CaptureSchedulePickerProps) {
  const durationMinutes = props.config.durationOptionsMinutes[0] || DEFAULT_DURATION_MINUTES;
  const initialDate = props.value?.startAt
    ? getDateKeyInTimeZone(props.value.startAt, props.config.timezone)
    : firstWorkingDate(props.config);
  const initialTime = props.value?.startAt ? getTimeKeyInTimeZone(props.value.startAt, props.config.timezone) : "";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);

  const dates = useMemo(() => buildWorkingDates(props.config), [props.config]);
  const filteredOccupied = useMemo(
    () => props.occupiedSlots.filter((slot) => {
      if (props.excludedCaptureGroupId && slot.captureGroupId === props.excludedCaptureGroupId) return false;
      return !props.excludedRequestId || slot.requestId !== props.excludedRequestId;
    }),
    [props.excludedCaptureGroupId, props.excludedRequestId, props.occupiedSlots],
  );

  const selectedTimeIsAvailable = Boolean(
    selectedTime && isTimeAvailable(selectedDate, selectedTime, props.config, filteredOccupied),
  );

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedTime("");
  }

  function confirm() {
    if (!selectedTimeIsAvailable) return;
    props.onConfirm({
      startAt: zonedLocalToIso(selectedDate, selectedTime, props.config.timezone),
      durationMinutes,
    });
  }

  const morningReserved = periodIsOccupied(selectedDate, "morning", props.config, filteredOccupied);
  const afternoonReserved = periodIsOccupied(selectedDate, "afternoon", props.config, filteredOccupied);

  return (
    <section className="marketing-schedule-picker" aria-label="Escolher data e horário da captação">
      <div className="marketing-picker-step">
        <strong>1. Escolha a data</strong>
        <div className="marketing-date-legend" aria-label="Legenda de disponibilidade">
          <span><i className="free" /> Livre</span>
          <span><i className="partial" /> Um período reservado</span>
          <span><i className="full" /> Dia reservado</span>
        </div>
        <div className="marketing-date-grid">
          {dates.map((dateKey) => {
            const availability = dayAvailability(dateKey, props.config, filteredOccupied);
            return (
              <button
                type="button"
                key={dateKey}
                className={`${availability} ${selectedDate === dateKey ? "selected" : ""}`}
                disabled={availability === "full"}
                onClick={() => chooseDate(dateKey)}
              >
                <small>{formatWeekday(dateKey)}</small>
                <strong>{formatDay(dateKey)}</strong>
              </button>
            );
          })}
        </div>
        <small>Regra: 1 agendamento pela manhã e 1 à tarde. Ao reservar um horário, todo o período fica bloqueado.</small>
      </div>

      <div className="marketing-picker-step">
        <strong>2. Escolha o horário</strong>
        <div className="marketing-period-status">
          <span className={morningReserved ? "reserved" : "available"}>Manhã · {morningReserved ? "RESERVADA" : "LIVRE"}</span>
          <span className={afternoonReserved ? "reserved" : "available"}>Tarde · {afternoonReserved ? "RESERVADA" : "LIVRE"}</span>
        </div>
        <div className="marketing-period-grid">
          {STANDARD_TIMES.map((time) => {
            const available = isTimeAvailable(selectedDate, time, props.config, filteredOccupied);
            const period = periodForTime(time);
            return (
              <button
                type="button"
                key={time}
                className={`${available ? "available" : "unavailable"} ${selectedTime === time ? "selected" : ""}`}
                disabled={!available}
                title={!available ? `${period === "morning" ? "Manhã" : "Tarde"} já reservada` : undefined}
                onClick={() => setSelectedTime(time)}
              >
                <strong>{time}</strong>
                {!available && <small>RESERVADO</small>}
              </button>
            );
          })}
        </div>
        <small>Manhã: 08:00, 09:00, 10:00 e 11:00. Tarde: 14:00, 15:00, 16:00 e 17:00. O horário de almoço fica protegido.</small>
      </div>

      <footer>
        {props.onCancel && <button type="button" className="secondary" onClick={props.onCancel}>CANCELAR</button>}
        <button type="button" onClick={confirm} disabled={!selectedTimeIsAvailable}>OK</button>
      </footer>
    </section>
  );
}

function buildWorkingDates(config: MarketingScheduleConfig) {
  const today = getDateKeyInTimeZone(new Date(), config.timezone);
  const dates: string[] = [];
  for (let offset = 0; offset < DATE_WINDOW_DAYS; offset += 1) {
    const dateKey = addDaysToDateKey(today, offset);
    if (config.workingDays.includes(isoWeekday(dateKey))) dates.push(dateKey);
  }
  return dates;
}

function firstWorkingDate(config: MarketingScheduleConfig) {
  return buildWorkingDates(config)[0] || getDateKeyInTimeZone(new Date(), config.timezone);
}

function dayAvailability(
  dateKey: string,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  const morning = periodIsOccupied(dateKey, "morning", config, occupied);
  const afternoon = periodIsOccupied(dateKey, "afternoon", config, occupied);
  if (morning && afternoon) return "full";
  if (morning || afternoon) return "partial";
  return "free";
}

function isTimeAvailable(
  dateKey: string,
  time: string,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  if (!STANDARD_TIMES.includes(time as (typeof STANDARD_TIMES)[number])) return false;
  return !periodIsOccupied(dateKey, periodForTime(time), config, occupied);
}

function periodIsOccupied(
  dateKey: string,
  period: "morning" | "afternoon",
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  return occupiedForDate(dateKey, config, occupied).some((slot) => {
    const slotTime = getTimeKeyInTimeZone(slot.startAt, config.timezone);
    return periodForTime(slotTime) === period;
  });
}

function periodForTime(time: string): "morning" | "afternoon" {
  return minutesFromTime(time) < AFTERNOON_START_MINUTES ? "morning" : "afternoon";
}

function occupiedForDate(
  dateKey: string,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  return occupied.filter((slot) => getDateKeyInTimeZone(slot.startAt, config.timezone) === dateKey);
}

function formatWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "");
}

function formatDay(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "");
}
