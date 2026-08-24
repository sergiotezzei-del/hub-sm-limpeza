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
  onConfirm: (value: MarketingCaptureSelection) => void;
  onCancel?: () => void;
};

const DATE_WINDOW_DAYS = 28;

export function CaptureSchedulePicker(props: CaptureSchedulePickerProps) {
  const initialDuration = props.value?.durationMinutes || props.config.durationOptionsMinutes[0];
  const initialDate = props.value?.startAt
    ? getDateKeyInTimeZone(props.value.startAt, props.config.timezone)
    : firstWorkingDate(props.config);
  const initialTime = props.value?.startAt ? getTimeKeyInTimeZone(props.value.startAt, props.config.timezone) : "";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);

  const dates = useMemo(() => buildWorkingDates(props.config), [props.config]);
  const times = useMemo(() => buildTimeOptions(props.config), [props.config]);
  const filteredOccupied = useMemo(
    () => props.excludedRequestId
      ? props.occupiedSlots.filter((slot) => slot.requestId !== props.excludedRequestId)
      : props.occupiedSlots,
    [props.excludedRequestId, props.occupiedSlots],
  );

  const selectedTimeIsAvailable = selectedTime
    ? isAvailable(selectedDate, selectedTime, durationMinutes, props.config, filteredOccupied)
    : false;

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedTime("");
  }

  function confirm() {
    if (!selectedTime || !selectedTimeIsAvailable) return;
    props.onConfirm({
      startAt: zonedLocalToIso(selectedDate, selectedTime, props.config.timezone),
      durationMinutes,
    });
  }

  return (
    <section className="marketing-schedule-picker" aria-label="Escolher data, horário e duração">
      <div className="marketing-picker-step">
        <strong>1. Escolha a data</strong>
        <div className="marketing-date-legend" aria-label="Legenda de disponibilidade">
          <span><i className="free" /> Livre</span>
          <span><i className="partial" /> Parcial</span>
          <span><i className="full" /> Sem espaço</span>
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
      </div>

      <div className="marketing-picker-step">
        <strong>2. Escolha o horário</strong>
        <div className="marketing-time-grid">
          {times.map((time) => {
            const available = isAvailable(selectedDate, time, durationMinutes, props.config, filteredOccupied);
            return (
              <button
                type="button"
                key={time}
                className={`${available ? "available" : "occupied"} ${selectedTime === time ? "selected" : ""}`}
                disabled={!available}
                onClick={() => setSelectedTime(time)}
              >
                {time}
              </button>
            );
          })}
        </div>
      </div>

      <div className="marketing-picker-step">
        <strong>3. Escolha a duração</strong>
        <div className="marketing-duration-options">
          {props.config.durationOptionsMinutes.map((duration) => (
            <button
              type="button"
              key={duration}
              className={durationMinutes === duration ? "selected" : ""}
              onClick={() => setDurationMinutes(duration)}
            >
              {formatDuration(duration)}
            </button>
          ))}
        </div>
        {selectedTime && !selectedTimeIsAvailable && <small className="marketing-picker-warning">A duração escolhida não cabe neste horário. Selecione outro horário.</small>}
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

function buildTimeOptions(config: MarketingScheduleConfig) {
  const start = minutesFromTime(config.workdayStart);
  const end = minutesFromTime(config.workdayEnd);
  const options: string[] = [];
  for (let minute = start; minute < end; minute += 30) options.push(timeFromMinutes(minute));
  return options;
}

function dayAvailability(dateKey: string, config: MarketingScheduleConfig, occupied: MarketingOccupiedCaptureSlot[]) {
  const times = buildTimeOptions(config);
  const minimumDuration = Math.min(...config.durationOptionsMinutes);
  const availableCount = times.filter((time) => isAvailable(dateKey, time, minimumDuration, config, occupied)).length;
  if (availableCount === 0) return "full";
  if (availableCount === times.length) return "free";
  return "partial";
}

function isAvailable(
  dateKey: string,
  time: string,
  durationMinutes: number,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  const startMinute = minutesFromTime(time);
  if (startMinute + durationMinutes > minutesFromTime(config.workdayEnd)) return false;
  const startAt = new Date(zonedLocalToIso(dateKey, time, config.timezone)).getTime();
  const endAt = startAt + durationMinutes * 60000;
  return !occupied.some((slot) => {
    const occupiedStart = new Date(slot.startAt).getTime();
    const occupiedEnd = occupiedStart + slot.durationMinutes * 60000;
    return startAt < occupiedEnd && endAt > occupiedStart;
  });
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
