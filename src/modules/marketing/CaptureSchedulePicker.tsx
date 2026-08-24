import { useMemo, useState } from "react";
import {
  addDaysToDateKey,
  formatDuration,
  getMarketingCaptureWindows,
  getDateKeyInTimeZone,
  getTimeKeyInTimeZone,
  isoWeekday,
  MarketingCaptureSelection,
  MarketingCaptureWindow,
  MarketingOccupiedCaptureSlot,
  MarketingScheduleConfig,
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

export function CaptureSchedulePicker(props: CaptureSchedulePickerProps) {
  const windows = useMemo(() => getMarketingCaptureWindows(props.config), [props.config]);
  const initialDuration = props.value?.durationMinutes || props.config.durationOptionsMinutes[0];
  const initialDate = props.value?.startAt
    ? getDateKeyInTimeZone(props.value.startAt, props.config.timezone)
    : firstWorkingDate(props.config);
  const initialTime = props.value?.startAt ? getTimeKeyInTimeZone(props.value.startAt, props.config.timezone) : "";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedWindowId, setSelectedWindowId] = useState(
    windows.find((window) => window.start === initialTime)?.id || "",
  );
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);

  const dates = useMemo(() => buildWorkingDates(props.config), [props.config]);
  const filteredOccupied = useMemo(
    () => props.occupiedSlots.filter((slot) => {
      if (props.excludedCaptureGroupId && slot.captureGroupId === props.excludedCaptureGroupId) return false;
      return !props.excludedRequestId || slot.requestId !== props.excludedRequestId;
    }),
    [props.excludedCaptureGroupId, props.excludedRequestId, props.occupiedSlots],
  );

  const selectedWindow = windows.find((window) => window.id === selectedWindowId);
  const selectedWindowIsAvailable = selectedWindow
    ? isWindowAvailable(selectedDate, selectedWindow, props.config, filteredOccupied)
    : false;

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedWindowId("");
  }

  function confirm() {
    if (!selectedWindow || !selectedWindowIsAvailable) return;
    props.onConfirm({
      startAt: zonedLocalToIso(selectedDate, selectedWindow.start, props.config.timezone),
      durationMinutes,
    });
  }

  return (
    <section className="marketing-schedule-picker" aria-label="Escolher data e período da captação">
      <div className="marketing-picker-step">
        <strong>1. Escolha a data</strong>
        <div className="marketing-date-legend" aria-label="Legenda de disponibilidade">
          <span><i className="free" /> Livre</span>
          <span><i className="partial" /> Parcial</span>
          <span><i className="full" /> Sem espaço</span>
        </div>
        <div className="marketing-date-grid">
          {dates.map((dateKey) => {
            const availability = dayAvailability(dateKey, props.config, windows, filteredOccupied);
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
        <strong>2. Escolha o período</strong>
        <div className="marketing-period-grid">
          {windows.map((window) => {
            const available = isWindowAvailable(selectedDate, window, props.config, filteredOccupied);
            return (
              <button
                type="button"
                key={window.id}
                className={`${available ? "available" : "occupied"} ${selectedWindowId === window.id ? "selected" : ""}`}
                disabled={!available}
                onClick={() => setSelectedWindowId(window.id)}
              >
                <strong>{window.label}</strong>
                <span>{window.start} às {window.end}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="marketing-picker-step">
        <strong>3. Informe a duração estimada</strong>
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
        <small>A duração fica registrada no pedido; a agenda reserva o período completo.</small>
      </div>

      <footer>
        {props.onCancel && <button type="button" className="secondary" onClick={props.onCancel}>CANCELAR</button>}
        <button type="button" onClick={confirm} disabled={!selectedWindowIsAvailable}>OK</button>
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
  windows: MarketingCaptureWindow[],
  occupied: MarketingOccupiedCaptureSlot[],
) {
  const availableCount = windows.filter((window) => isWindowAvailable(dateKey, window, config, occupied)).length;
  if (availableCount === 0) return "full";
  if (availableCount === windows.length) return "free";
  return "partial";
}

function isWindowAvailable(
  dateKey: string,
  window: MarketingCaptureWindow,
  config: MarketingScheduleConfig,
  occupied: MarketingOccupiedCaptureSlot[],
) {
  const startAt = new Date(zonedLocalToIso(dateKey, window.start, config.timezone)).getTime();
  const endAt = new Date(zonedLocalToIso(dateKey, window.end, config.timezone)).getTime();
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
