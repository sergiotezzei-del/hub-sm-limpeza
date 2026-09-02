import { useMemo, useState } from "react";
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  getTimeKeyInTimeZone,
  isoWeekday,
  MarketingCaptureSelection,
  MarketingOccupiedCaptureSlot,
  MarketingScheduleConfig,
  zonedLocalToIso,
} from "./marketingConfig";

type MarketingPeriod = "morning" | "afternoon";

type CaptureSchedulePickerProps = {
  config: MarketingScheduleConfig;
  occupiedSlots: MarketingOccupiedCaptureSlot[];
  value?: MarketingCaptureSelection | null;
  excludedRequestId?: string;
  excludedCaptureGroupId?: string | null;
  onConfirm: (value: MarketingCaptureSelection) => void;
  onCancel?: () => void;
  onRequestException?: (context: { dateKey: string; period: MarketingPeriod }) => void;
};

const DATE_WINDOW_DAYS = 28;
const STANDARD_TIMES = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"] as const;
const MORNING_TIMES = STANDARD_TIMES.slice(0, 4);
const AFTERNOON_TIMES = STANDARD_TIMES.slice(4);
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
      <header className="marketing-schedule-picker-head">
        <div>
          <strong>Agendamento da captação</strong>
          <small>Um agendamento por período: manhã ou tarde.</small>
        </div>
      </header>

      <div className="marketing-picker-step">
        <strong>1. Escolha o dia</strong>
        <div className="marketing-date-grid">
          {dates.map((dateKey) => {
            const availability = dayAvailability(dateKey, props.config, filteredOccupied);
            const fullWithoutException = availability === "full" && !props.onRequestException;
            return (
              <button
                type="button"
                key={dateKey}
                className={`${availability} ${selectedDate === dateKey ? "selected" : ""}`}
                disabled={fullWithoutException}
                onClick={() => chooseDate(dateKey)}
                title={availability === "full" ? "Manhã e tarde já reservadas" : undefined}
              >
                <small>{formatWeekday(dateKey)}</small>
                <strong>{formatDay(dateKey)}</strong>
              </button>
            );
          })}
        </div>
        <div className="marketing-date-legend" aria-label="Legenda de disponibilidade">
          <span><i className="free" /> livre</span>
          <span><i className="partial" /> um período ocupado</span>
          <span><i className="full" /> manhã e tarde ocupadas</span>
        </div>
      </div>

      <div className="marketing-picker-step">
        <strong>2. Escolha o período e o horário</strong>
        <div className="marketing-period-cards">
          <PeriodCard
            title="MANHÃ"
            subtitle="08:00 · 09:00 · 10:00 · 11:00"
            period="morning"
            dateKey={selectedDate}
            times={MORNING_TIMES}
            reserved={morningReserved}
            selectedTime={selectedTime}
            config={props.config}
            occupied={filteredOccupied}
            onTime={setSelectedTime}
            onRequestException={props.onRequestException}
          />
          <PeriodCard
            title="TARDE"
            subtitle="14:00 · 15:00 · 16:00 · 17:00"
            period="afternoon"
            dateKey={selectedDate}
            times={AFTERNOON_TIMES}
            reserved={afternoonReserved}
            selectedTime={selectedTime}
            config={props.config}
            occupied={filteredOccupied}
            onTime={setSelectedTime}
            onRequestException={props.onRequestException}
          />
        </div>
        <small className="marketing-lunch-note">Almoço protegido: não há agenda padrão entre 12:00 e 13:59.</small>
      </div>

      <footer>
        <div className="marketing-selected-slot">
          {selectedTimeIsAvailable ? <><span>Selecionado</span><strong>{formatSelected(selectedDate, selectedTime)}</strong></> : <span>Escolha um horário livre.</span>}
        </div>
        <div className="marketing-schedule-footer-actions">
          {props.onCancel && <button type="button" className="secondary" onClick={props.onCancel}>VOLTAR</button>}
          <button type="button" onClick={confirm} disabled={!selectedTimeIsAvailable}>CONFIRMAR HORÁRIO</button>
        </div>
      </footer>
    </section>
  );
}

function PeriodCard(props: {
  title: string;
  subtitle: string;
  period: MarketingPeriod;
  dateKey: string;
  times: readonly string[];
  reserved: boolean;
  selectedTime: string;
  config: MarketingScheduleConfig;
  occupied: MarketingOccupiedCaptureSlot[];
  onTime: (time: string) => void;
  onRequestException?: (context: { dateKey: string; period: MarketingPeriod }) => void;
}) {
  const occupiedTimes = occupiedTimesForPeriod(props.dateKey, props.period, props.config, props.occupied);
  return (
    <section className={`marketing-period-card ${props.reserved ? "reserved" : "free"}`}>
      <header>
        <div><strong>{props.title}</strong><small>{props.subtitle}</small></div>
        <span>{props.reserved ? "RESERVADA" : "LIVRE"}</span>
      </header>

      {props.reserved ? (
        <div className="marketing-period-reserved-message">
          <p>Já existe agendamento neste período{occupiedTimes.length ? `: ${occupiedTimes.join(", ")}` : "."}</p>
          {props.onRequestException && (
            <button type="button" onClick={() => props.onRequestException?.({ dateKey: props.dateKey, period: props.period })}>
              PRECISO DE ENCAIXE
            </button>
          )}
        </div>
      ) : (
        <div className="marketing-time-buttons">
          {props.times.map((time) => {
            const available = isTimeAvailable(props.dateKey, time, props.config, props.occupied);
            return (
              <button
                type="button"
                key={time}
                className={`${available ? "available" : "unavailable"} ${props.selectedTime === time ? "selected" : ""}`}
                disabled={!available}
                onClick={() => props.onTime(time)}
              >
                <strong>{time}</strong>
                {!available && <small>OCUPADO</small>}
              </button>
            );
          })}
        </div>
      )}
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

function dayAvailability(dateKey: string, config: MarketingScheduleConfig, occupied: MarketingOccupiedCaptureSlot[]) {
  const morning = periodIsOccupied(dateKey, "morning", config, occupied);
  const afternoon = periodIsOccupied(dateKey, "afternoon", config, occupied);
  if (morning && afternoon) return "full";
  if (morning || afternoon) return "partial";
  return "free";
}

function isTimeAvailable(dateKey: string, time: string, config: MarketingScheduleConfig, occupied: MarketingOccupiedCaptureSlot[]) {
  if (!STANDARD_TIMES.includes(time as (typeof STANDARD_TIMES)[number])) return false;
  const period = standardPeriodForTime(time);
  if (!period || periodIsOccupied(dateKey, period, config, occupied)) return false;

  const start = new Date(zonedLocalToIso(dateKey, time, config.timezone)).getTime();
  const end = start + DEFAULT_DURATION_MINUTES * 60000;
  return !occupied.some((slot) => {
    const occupiedStart = new Date(slot.startAt).getTime();
    const occupiedEnd = occupiedStart + (slot.durationMinutes || DEFAULT_DURATION_MINUTES) * 60000;
    return start < occupiedEnd && end > occupiedStart;
  });
}

function periodIsOccupied(dateKey: string, period: MarketingPeriod, config: MarketingScheduleConfig, occupied: MarketingOccupiedCaptureSlot[]) {
  return occupiedForDate(dateKey, config, occupied).some((slot) => standardPeriodForTime(getTimeKeyInTimeZone(slot.startAt, config.timezone)) === period);
}

function occupiedTimesForPeriod(dateKey: string, period: MarketingPeriod, config: MarketingScheduleConfig, occupied: MarketingOccupiedCaptureSlot[]) {
  return occupiedForDate(dateKey, config, occupied)
    .map((slot) => getTimeKeyInTimeZone(slot.startAt, config.timezone))
    .filter((time) => standardPeriodForTime(time) === period)
    .sort();
}

function standardPeriodForTime(time: string): MarketingPeriod | null {
  if (MORNING_TIMES.includes(time as (typeof MORNING_TIMES)[number])) return "morning";
  if (AFTERNOON_TIMES.includes(time as (typeof AFTERNOON_TIMES)[number])) return "afternoon";
  return null;
}

function occupiedForDate(dateKey: string, config: MarketingScheduleConfig, occupied: MarketingOccupiedCaptureSlot[]) {
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

function formatSelected(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
  return `${date} · ${time}`;
}
