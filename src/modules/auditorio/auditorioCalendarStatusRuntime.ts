import "./auditorioCalendarStatusRuntime.css";

const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  março: 2,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseMonthHeading(value: string) {
  const normalized = normalize(value);
  const yearMatch = normalized.match(/(20\d{2})/);
  const monthEntry = Object.entries(MONTHS).find(([name]) => normalized.includes(name));
  if (!yearMatch || !monthEntry) return null;
  return { year: Number(yearMatch[1]), month: monthEntry[1] };
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  return toIsoDate(year, month, day);
}

function syncAuditorioCalendarStatus() {
  const panels = document.querySelectorAll<HTMLElement>(".auditorio-admin-panel");
  for (const panel of panels) {
    const calendar = panel.querySelector<HTMLElement>(".auditorio-admin-calendar");
    if (!calendar) continue;

    const heading = panel.querySelector<HTMLElement>(".auditorio-panel-head h2")?.textContent ?? "";
    const parsed = parseMonthHeading(heading);
    if (!parsed) continue;

    const today = todayIso();
    const days = calendar.querySelectorAll<HTMLElement>(".auditorio-admin-day:not(.muted)");
    for (const day of days) {
      const dayNumber = Number(day.querySelector<HTMLElement>(":scope > strong")?.textContent ?? "");
      if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) continue;
      const dateValue = toIsoDate(parsed.year, parsed.month, dayNumber);
      const futureOrToday = dateValue >= today;

      day.querySelectorAll<HTMLElement>(".auditorio-calendar-event.status-pendente").forEach((event) => {
        event.classList.toggle("is-future-pending", futureOrToday);
      });
    }
  }
}

if (typeof document !== "undefined") {
  const start = () => {
    const syncIfVisible = () => {
      if (!document.querySelector(".auditorio-admin-panel")) return;
      syncAuditorioCalendarStatus();
    };

    syncIfVisible();
    window.setInterval(syncIfVisible, 1500);
    window.addEventListener("focus", syncIfVisible);
    window.addEventListener("pageshow", syncIfVisible);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
