import { useMemo, useState } from "react";
import {
  addDaysToDateKey,
  formatDuration,
  getDateKeyInTimeZone,
  getTimeKeyInTimeZone,
  isoWeekday,
  MarketingCaptureSelection,
  MarketingOccupiedCaptureSlot,
  MarketingScheduleConfig,
  minutesFromTime,
  timeFromMinutes,
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
const TIME_STEP_MINUTES = 30;
const MAX_BOOKINGS_PER_DAY = 2;

export function CaptureSchedulePicker(props: CaptureSchedulePickerProps) {
  const initialDuration = props.value?.durationMinutes || props.config.durationOptionsMinutes[0];
  const initialDate = props.value?.startAt
    ? getDateKeyInTimeZone(props.value.startAt, props.config.timezone)
    : firstWorkingDate(props.config);
  const initialTime = props.value?.startAt ? getTimeKeyInTimeZone(props.value.startAt, props.config.timezone) : "";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [selectedTime, setSelectedTime] = useState(initialTime);

  const dates = useMemo(() => buildWorkingDates(props.config), [props.config]);
  const filteredOccupied = useMemo(
    () => props.occupiedSlots.filter((slot) => {
      if (props.excludedCaptureGroupId && slot.captureGroupId === props.excludedCaptureGroupId) return false;
      return !props.excludedRequestId || slot.requestId !== props.excludedRequestId;
    }),
    [props.excludedCaptureGroupId, props.excludedRequestId, props.occupiedSlots],
  );

  const timeOptions = useMemo(
    () => buildTimeOptions(selectedDate, durationMinutes, props.config, filteredOccupied),
    [durationMinutes, filteredOccupied, props.config, selectedDate],
  );
  const selectedTimeIsAvailable = Boolean(selectedTime && timeOptions.includes(selectedTime));

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedTime("");
  }

  function chooseDuration(duration: number) {
    setDurationMinutes(duration);
    if (selectedTime && !isTimeAvailable(selectedDate, selectedTime, duration, props.config, filteredOccupied)) {
      setSelectedTime("");
    }
  }

  function confirm() {
    if (!selectedTimeIsAvailable) return;
    props.onConfirm({
      startAt: zonedLocalToIso(selectedDate, selectedTime, props.config.timezone),
      durationMinutes,
    });
  }

  return (
    <section className="marketing-schedule-picker" aria-label="Escolher data e horário da captação">
      <div className="marketing-picker-step">
        <strong>1. Escolha a data</strong>
        <div className="marketing-date-legend" aria-label="Legenda de disponibilidade">
          <span><i className="free" /> Livre</span>
          <span><i className="partial" /> 1 agendamento</span>
          <span><i className="full" /> Lotado</span>
        </div>
        <div className="marketing-date-grid">
          {dates.map((dateKey) => {
            const availability = dayAvailability(dateKey, durationMinutes, props.config, filteredOccupied);
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
        <small>Limite de 2 agendamentos por dia.</small>
      </div>

      <div className="marketing-picker-step">
        <strong>2. Informe a duração estimada</strong>
        <div className="marketing-duration-options">
          {props.config.durationOptionsMinutes.map((duration) => (
            <button
              type="button"
              key={duration}
              className={durationMinutes === duration ? "selected" : ""}
              onClick={() => chooseDuration(duration)}
            >
              {formatDuration(duration)}
            </button>
          ))}
        </div>
      </div>

      <div className="marketing-picker-step">
        <strong>3. Escolha o horário</strong>
        <div className="marketing-period-grid">
          {timeOptions.length > 0 ? timeOptions.map((time) => (
            <button
              type="button"
              key={time}
              className={`available ${selectedTime === time ? "selected" : ""}`}
              onClick={() => setSelectedTime(time)}
            >
              <strong>{time}</strong>
            </button>
          )) : (
            <p>Não há horário disponível para essa duração neste dia.</p>
          )}
        </div>
        <small>Horários disponíveis entre {props.config.workdayStart} e {props.config.workdayEnd}, em intervalos de 30 minutos.</small>
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
  durationMinutes: number,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  const daySlots = occupiedForDate(dateKey, config, occupied);
  if (daySlots.length >= MAX_BOOKINGS_PER_DAY) return "full";
  if (buildTimeOptions(dateKey, durationMinutes, config, occupied).length === 0) return "full";
  return daySlots.length === 0 ? "free" : "partial";
}

function buildTimeOptions(
  dateKey: string,
  durationMinutes: number,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  if (occupiedForDate(dateKey, config, occupied).length >= MAX_BOOKINGS_PER_DAY) return [];

  const startMinutes = minutesFromTime(config.workdayStart);
  const endMinutes = minutesFromTime(config.workdayEnd);
  const latestStart = endMinutes - durationMinutes;
  const result: string[] = [];

  for (let minutes = startMinutes; minutes <= latestStart; minutes += TIME_STEP_MINUTES) {
    const time = timeFromMinutes(minutes);
    if (isTimeAvailable(dateKey, time, durationMinutes, config, occupied)) result.push(time);
  }
  return result;
}

function isTimeAvailable(
  dateKey: string,
  time: string,
  durationMinutes: number,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  const daySlots = occupiedForDate(dateKey, config, occupied);
  if (daySlots.length >= MAX_BOOKINGS_PER_DAY) return false;

  const startAt = new Date(zonedLocalToIso(dateKey, time, config.timezone)).getTime();
  const endAt = startAt + durationMinutes * 60000;
  return !daySlots.some((slot) => {
    const occupiedStart = new Date(slot.startAt).getTime();
    const occupiedEnd = occupiedStart + slot.durationMinutes * 60000;
    return startAt < occupiedEnd && endAt > occupiedStart;
  });
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
