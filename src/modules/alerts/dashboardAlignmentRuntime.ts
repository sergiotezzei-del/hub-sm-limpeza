const DESKTOP_QUERY = "(min-width: 901px)";
const OFFSET_VAR = "--hub-alert-panel-offset";

let scheduledFrame = 0;

function findCleaningCard(host: HTMLElement) {
  const firstMenuSection = host.querySelector<HTMLElement>(":scope > .alerts-home-menu-section");
  if (!firstMenuSection) return null;

  const cards = Array.from(firstMenuSection.querySelectorAll<HTMLElement>(".module-grid > *"));
  return cards.find((card) => (card.textContent ?? "").includes("Limpeza")) ?? cards[0] ?? null;
}

function alignDashboard() {
  const host = document.querySelector<HTMLElement>(".alerts-admin-home-screen");
  if (!host) return;

  if (!window.matchMedia(DESKTOP_QUERY).matches) {
    host.style.removeProperty(OFFSET_VAR);
    return;
  }

  const panel = host.querySelector<HTMLElement>(":scope > .hub-alert-panel");
  const cleaningCard = findCleaningCard(host);
  if (!panel || !cleaningCard) return;

  const currentMargin = Number.parseFloat(window.getComputedStyle(panel).marginTop) || 0;
  const panelTopWithoutOffset = panel.getBoundingClientRect().top - currentMargin;
  const cleaningTop = cleaningCard.getBoundingClientRect().top;
  const exactOffset = Math.max(0, Math.round((cleaningTop - panelTopWithoutOffset) * 100) / 100);

  host.style.setProperty(OFFSET_VAR, `${exactOffset}px`);
}

function scheduleAlignment() {
  if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame);
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0;
    alignDashboard();
  });
}

function startDashboardAlignment() {
  const root = document.getElementById("root");
  if (!root) return;

  const observer = new MutationObserver(scheduleAlignment);
  observer.observe(root, { childList: true, subtree: true });

  window.addEventListener("resize", scheduleAlignment, { passive: true });
  window.addEventListener("load", scheduleAlignment, { once: true });

  scheduleAlignment();
}

startDashboardAlignment();
