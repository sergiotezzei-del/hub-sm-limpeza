import { showHubWindowsNotification } from "./windowsNotifications";

const APP_TITLE = "HUB Santa Maria";
const ALERT_TITLE = "🔴 NOVO ALERTA · HUB Santa Maria";
const CARD_SELECTOR = ".hub-alert-panel .hub-alert-card";
const ATTENTION_ATTRIBUTE = "data-hub-alert-attention";
const NEW_CARD_CLASS = "is-new-alert-attention";
const WARMUP_MS = 4000;
const VISIBLE_FLASH_MS = 12000;
const RETURN_FLASH_MS = 8000;
const BLINK_MS = 900;
const EXTERNAL_REFRESH_SUPPRESS_MS = 6000;

let observedPanel: HTMLElement | null = null;
let knownCards = new Set<string>();
let initialized = false;
let warmupTimer = 0;
let visibleStopTimer = 0;
let blinkTimer = 0;
let blinkOn = false;
let attentionActive = false;
let suppressGenericDetectionUntil = 0;
const pendingTaskTitles = new Set<string>();

const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
const originalFavicon = favicon?.getAttribute("href") ?? "/icons/icon-192.png";
const originalFaviconType = favicon?.getAttribute("type") ?? "image/png";

const inverseFavicon = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
    <rect width="192" height="192" rx="36" fill="#ffffff"/>
    <rect x="24" y="24" width="144" height="144" rx="28" fill="#f97316" opacity="0.12"/>
    <path fill="#f97316" d="M42 48h108v28h-39v76H81V76H42V48z"/>
  </svg>
`)}`;

const badgeNavigator = navigator as Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

type NewAlertTaskEvent = CustomEvent<{
  tasks?: Array<{ id?: string; title?: string }>;
}>;

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cardTitle(card: Element) {
  return normalize(card.querySelector("h3")?.textContent ?? "");
}

function cardDescription(card: Element) {
  return normalize(card.querySelector("p")?.textContent ?? "") || "Abra o HUB para conferir.";
}

function fingerprint(card: Element) {
  const title = cardTitle(card);
  const description = normalize(card.querySelector("p")?.textContent ?? "");
  const detail = normalize(card.querySelector("small")?.textContent ?? "");
  const time = normalize(card.querySelector("time")?.textContent ?? "");
  return [title, description, detail, time].join("|");
}

function cardsInPanel(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(".hub-alert-card"));
}

function currentCards(panel: HTMLElement) {
  return new Set(cardsInPanel(panel).map(fingerprint).filter(Boolean));
}

function setFavicon(inverse: boolean) {
  if (!favicon) return;
  if (inverse) {
    favicon.setAttribute("type", "image/svg+xml");
    favicon.setAttribute("href", inverseFavicon);
    return;
  }
  favicon.setAttribute("type", originalFaviconType);
  favicon.setAttribute("href", originalFavicon);
}

function setAppBadge(on: boolean) {
  const promise = on ? badgeNavigator.setAppBadge?.(1) : badgeNavigator.clearAppBadge?.();
  promise?.catch(() => undefined);
}

function applyBlinkFrame() {
  blinkOn = !blinkOn;
  document.title = blinkOn ? ALERT_TITLE : APP_TITLE;
  setFavicon(blinkOn);
}

function clearNewCardClasses() {
  document.querySelectorAll<HTMLElement>(`${CARD_SELECTOR}.${NEW_CARD_CLASS}`)
    .forEach((card) => card.classList.remove(NEW_CARD_CLASS));
}

function stopVisualAttention() {
  if (blinkTimer) window.clearInterval(blinkTimer);
  if (visibleStopTimer) window.clearTimeout(visibleStopTimer);
  blinkTimer = 0;
  visibleStopTimer = 0;
  blinkOn = false;
  attentionActive = false;
  document.documentElement.removeAttribute(ATTENTION_ATTRIBUTE);
  document.title = APP_TITLE;
  setFavicon(false);
  clearNewCardClasses();
}

function acknowledgeAttention() {
  stopVisualAttention();
  setAppBadge(false);
}

function scheduleVisibleStop(delay = VISIBLE_FLASH_MS) {
  if (visibleStopTimer) window.clearTimeout(visibleStopTimer);
  visibleStopTimer = window.setTimeout(stopVisualAttention, delay);
}

function startAttention() {
  if (blinkTimer) window.clearInterval(blinkTimer);
  if (visibleStopTimer) window.clearTimeout(visibleStopTimer);
  blinkTimer = 0;
  visibleStopTimer = 0;
  attentionActive = true;
  document.documentElement.setAttribute(ATTENTION_ATTRIBUTE, "1");
  setAppBadge(true);
  blinkOn = false;
  applyBlinkFrame();
  blinkTimer = window.setInterval(applyBlinkFrame, BLINK_MS);

  if (document.visibilityState === "visible") scheduleVisibleStop();
}

function armInitialPanel(panel: HTMLElement) {
  if (warmupTimer) window.clearTimeout(warmupTimer);
  warmupTimer = window.setTimeout(() => {
    if (observedPanel !== panel || !panel.isConnected) return;
    knownCards = currentCards(panel);
    initialized = true;
  }, WARMUP_MS);
}

function markNewCards(panel: HTMLElement, fingerprints: Set<string>) {
  const marked: HTMLElement[] = [];
  cardsInPanel(panel).forEach((card) => {
    if (!fingerprints.has(fingerprint(card))) return;
    card.classList.add(NEW_CARD_CLASS);
    marked.push(card);
  });
  return marked;
}

function markPendingTaskCards(panel: HTMLElement) {
  if (pendingTaskTitles.size === 0) return false;
  let marked = false;

  cardsInPanel(panel).forEach((card) => {
    const title = cardTitle(card);
    if (!title || !pendingTaskTitles.has(title)) return;
    card.classList.add(NEW_CARD_CLASS);
    pendingTaskTitles.delete(title);
    marked = true;
  });

  return marked;
}

function notifyNewCard(card: HTMLElement) {
  const title = cardTitle(card) || "Novo alerta no HUB";
  const description = cardDescription(card);
  void showHubWindowsNotification(title, description, `hub-card-${fingerprint(card)}`);
}

function sync() {
  const panel = document.querySelector<HTMLElement>(".hub-alert-panel");

  if (panel !== observedPanel) {
    observedPanel = panel;
    if (!panel) return;
    if (!initialized) {
      armInitialPanel(panel);
      return;
    }
  }

  if (!panel || !initialized) return;

  const nextCards = currentCards(panel);
  const markedPendingTask = markPendingTaskCards(panel);

  if (Date.now() < suppressGenericDetectionUntil) {
    knownCards = nextCards;
    if (markedPendingTask && !attentionActive) startAttention();
    return;
  }

  const newFingerprints = new Set(Array.from(nextCards).filter((card) => !knownCards.has(card)));
  knownCards = nextCards;

  if (newFingerprints.size > 0) {
    const marked = markNewCards(panel, newFingerprints);
    if (marked[0]) notifyNewCard(marked[0]);
    startAttention();
  } else if (markedPendingTask && !attentionActive) {
    startAttention();
  }
}

function acknowledgeWhenUserReturns() {
  if (document.visibilityState === "visible" && attentionActive) {
    scheduleVisibleStop(RETURN_FLASH_MS);
  }
}

const root = document.getElementById("root");
if (root) {
  const observer = new MutationObserver(sync);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  setAppBadge(false);
  sync();
}

document.addEventListener("hub:new-alert-tasks", (event) => {
  const detail = (event as NewAlertTaskEvent).detail;
  const tasks = detail?.tasks ?? [];
  tasks.forEach((task) => {
    const title = normalize(task.title ?? "");
    if (title) pendingTaskTitles.add(title);
  });

  if (tasks.length > 0) {
    const single = tasks.length === 1;
    void showHubWindowsNotification(
      single ? "Novo chamado no HUB" : `${tasks.length} novos chamados no HUB`,
      single ? normalize(tasks[0].title ?? "Abra o HUB para conferir.") : "Abra o HUB para conferir.",
      single ? `hub-task-${tasks[0].id ?? tasks[0].title ?? Date.now()}` : `hub-tasks-${Date.now()}`,
    );
  }

  suppressGenericDetectionUntil = Date.now() + EXTERNAL_REFRESH_SUPPRESS_MS;
  startAttention();
  if (observedPanel) markPendingTaskCards(observedPanel);
});

document.addEventListener("visibilitychange", acknowledgeWhenUserReturns);
window.addEventListener("focus", acknowledgeWhenUserReturns);
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest(CARD_SELECTOR)) acknowledgeAttention();
});
