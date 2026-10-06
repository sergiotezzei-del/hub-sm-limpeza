import { closeHubWindowsNotification, showHubWindowsNotification } from "./windowsNotifications";

const APP_TITLE = "HUB Santa Maria";
const ALERT_TITLE = "🔴 NOVO ALERTA · HUB Santa Maria";
const CARD_SELECTOR = ".hub-alert-panel .hub-alert-card";
const ATTENTION_ATTRIBUTE = "data-hub-alert-attention";
const NEW_CARD_CLASS = "is-new-alert-attention";
const LEGACY_STORAGE_KEY = "hub-sm-unseen-alerts-v1";
const SESSION_KEY = "hub-sm-active-session";
const REMINDER_TAG = "hub-unseen-alert-reminder";
const WARMUP_MS = 4000;
const VISIBLE_FLASH_MS = 12000;
const RETURN_FLASH_MS = 8000;
const BLINK_MS = 900;
const BADGE_KEEPALIVE_MS = 5000;
const REMINDER_MS = 120000;
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
// Badge = pendências do painel atual; "não visto" só controla a atenção visual.
const unseenAlerts = new Map<string, StoredAlert>();
let sessionUser = readSessionUser();
let pendingCount = 0;
let badgeWrite = Promise.resolve();
const pendingTaskKeysByTitle = new Map<string, string[]>();

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

type StoredAlert = {
  key: string;
  title: string;
  body: string;
  firstSeenAt: string;
};

type NewAlertTaskEvent = CustomEvent<{
  tasks?: Array<{ id?: string; title?: string }>;
}>;

type OpenAlertEvent = CustomEvent<{ key?: string }>;

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

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function notificationTagForKey(key: string) {
  return `hub-alert-${hashString(key)}`;
}

function explicitCardKey(card: HTMLElement) {
  const manual = normalize(card.dataset.hubAlertKey ?? "");
  if (manual) return manual;
  const marketingRequestId = normalize(card.dataset.marketingRequestId ?? "");
  if (marketingRequestId) return `marketing:${marketingRequestId}`;
  const marketingOverrideId = normalize(card.dataset.marketingOverrideId ?? "");
  if (marketingOverrideId) return `marketing-override:${marketingOverrideId}`;
  return "";
}

function rememberPendingTaskKey(title: string, key: string) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return;
  const queue = pendingTaskKeysByTitle.get(normalizedTitle) ?? [];
  if (!queue.includes(key)) queue.push(key);
  pendingTaskKeysByTitle.set(normalizedTitle, queue);
}

function assignPendingTaskKeys(panel: HTMLElement) {
  cardsInPanel(panel).forEach((card) => {
    if (explicitCardKey(card)) return;
    const title = cardTitle(card);
    const queue = pendingTaskKeysByTitle.get(title);
    if (!queue?.length) return;
    const key = queue.shift();
    if (key) card.dataset.hubAlertKey = key;
    if (queue.length === 0) pendingTaskKeysByTitle.delete(title);
  });
}

function matchStoredKey(card: HTMLElement) {
  const explicit = explicitCardKey(card);
  if (explicit) return explicit;

  const title = cardTitle(card);
  const body = cardDescription(card);
  if (!title) return "";
  const matches = Array.from(unseenAlerts.values()).filter((alert) => {
    if (alert.title !== title && alert.body !== title) return false;
    return alert.body === body || alert.title === title || alert.body.includes(title) || body.includes(alert.title);
  });
  if (matches.length === 1) {
    card.dataset.hubAlertKey = matches[0].key;
    return matches[0].key;
  }
  return "";
}

function storageKeyForCard(card: HTMLElement) {
  return explicitCardKey(card) || matchStoredKey(card) || `card:${hashString(fingerprint(card))}`;
}

function identityForCard(card: HTMLElement) {
  return explicitCardKey(card) || matchStoredKey(card) || fingerprint(card);
}

function cardsInPanel(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(".hub-alert-card")).filter((card) => {
    // Respeita as dispensas e a deduplicação já aplicadas pelo próprio painel.
    if (card.closest('[hidden], [aria-hidden="true"]') || getComputedStyle(card).display === "none") return false;
    // Entregas/saídas já realizadas são histórico, não pendências de análise.
    if (card.classList.contains("hub-cleaning-activity-card")) {
      const status = normalize(card.querySelector(".hub-alert-card-status span")?.textContent ?? "");
      return status === "CONFERÊNCIA" || card.classList.contains("is-divergence");
    }
    return true;
  });
}

function currentCards(panel: HTMLElement) {
  return new Set(cardsInPanel(panel).map(identityForCard).filter(Boolean));
}

function readSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const user = raw ? JSON.parse(raw)?.currentUser : null;
    return typeof user === "string" ? user : String(user?.id ?? "");
  } catch {
    return "";
  }
}

function syncSession() {
  const nextUser = readSessionUser();
  if (nextUser === sessionUser) return;
  sessionUser = nextUser;
  Array.from(unseenAlerts.keys()).forEach(acknowledgeAlert);
  pendingTaskKeysByTitle.clear();
  knownCards.clear();
  initialized = false;
  suppressGenericDetectionUntil = 0;
  if (warmupTimer) window.clearTimeout(warmupTimer);
  observedPanel = null;
  pendingCount = 0;
  stopVisualAttention();
  syncAppBadge(true);
}

function reconcilePendingCards(panel: HTMLElement) {
  const cards = cardsInPanel(panel);
  pendingCount = cards.length;
  const pendingKeys = new Set(cards.map(storageKeyForCard));
  Array.from(unseenAlerts.keys()).forEach((key) => {
    if (!pendingKeys.has(key)) acknowledgeAlert(key);
  });
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

function syncAppBadge(force = false) {
  const count = sessionUser ? pendingCount : 0;
  if (!force && document.documentElement.dataset.hubUnseenAlerts === String(count)) return;
  // Serializa as escritas para um set antigo não terminar depois do clear do logout.
  badgeWrite = badgeWrite.catch(() => undefined).then(async () => {
    if (count > 0) await badgeNavigator.setAppBadge?.(count);
    else await badgeNavigator.clearAppBadge?.();
  });
  void badgeWrite.catch(() => undefined);
  document.documentElement.dataset.hubUnseenAlerts = String(count);
  document.dispatchEvent(new CustomEvent("hub:unseen-alert-count", { detail: { count } }));
}

function dispatchToast(alert: StoredAlert) {
  document.dispatchEvent(new CustomEvent("hub:show-alert-toast", {
    detail: { key: alert.key, title: alert.title, body: alert.body },
  }));
}

function registerUnseenAlert(key: string, title: string, body: string, notify = true) {
  const normalizedKey = normalize(key);
  if (!normalizedKey || unseenAlerts.has(normalizedKey)) return false;

  const alert: StoredAlert = {
    key: normalizedKey,
    title: normalize(title) || "Novo alerta no HUB",
    body: normalize(body) || "Abra o HUB para conferir.",
    firstSeenAt: new Date().toISOString(),
  };
  unseenAlerts.set(normalizedKey, alert);
  syncAppBadge();
  dispatchToast(alert);
  if (notify) void showHubWindowsNotification(alert.title, alert.body, notificationTagForKey(alert.key));
  startAttention();
  return true;
}

function acknowledgeAlert(key: string) {
  const normalizedKey = normalize(key);
  if (!normalizedKey || !unseenAlerts.has(normalizedKey)) return;
  unseenAlerts.delete(normalizedKey);
  syncAppBadge();
  void closeHubWindowsNotification(notificationTagForKey(normalizedKey));

  document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
    if (storageKeyForCard(card) === normalizedKey) card.classList.remove(NEW_CARD_CLASS);
  });

  if (unseenAlerts.size === 0) {
    void closeHubWindowsNotification(REMINDER_TAG);
    stopVisualAttention();
  }
}

function applyBlinkFrame() {
  blinkOn = !blinkOn;
  document.title = blinkOn ? ALERT_TITLE : APP_TITLE;
  setFavicon(blinkOn);
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
}

function scheduleVisibleStop(delay = VISIBLE_FLASH_MS) {
  if (visibleStopTimer) window.clearTimeout(visibleStopTimer);
  visibleStopTimer = window.setTimeout(stopVisualAttention, delay);
}

function startAttention() {
  if (!sessionUser || pendingCount === 0 || unseenAlerts.size === 0) return;
  if (blinkTimer) window.clearInterval(blinkTimer);
  if (visibleStopTimer) window.clearTimeout(visibleStopTimer);
  blinkTimer = 0;
  visibleStopTimer = 0;
  attentionActive = true;
  document.documentElement.setAttribute(ATTENTION_ATTRIBUTE, "1");
  syncAppBadge();
  blinkOn = false;
  applyBlinkFrame();
  blinkTimer = window.setInterval(applyBlinkFrame, BLINK_MS);

  if (document.visibilityState === "visible") scheduleVisibleStop();
}

function decorateUnseenCards(panel: HTMLElement) {
  assignPendingTaskKeys(panel);
  cardsInPanel(panel).forEach((card) => {
    const key = storageKeyForCard(card);
    const isUnseen = unseenAlerts.has(key);
    if (card.classList.contains(NEW_CARD_CLASS) !== isUnseen) card.classList.toggle(NEW_CARD_CLASS, isUnseen);
  });
}

function armInitialPanel(panel: HTMLElement) {
  if (warmupTimer) window.clearTimeout(warmupTimer);
  warmupTimer = window.setTimeout(() => {
    if (observedPanel !== panel || !panel.isConnected) return;
    decorateUnseenCards(panel);
    knownCards = currentCards(panel);
    initialized = true;
  }, WARMUP_MS);
}

function registerNewCards(panel: HTMLElement, identities: Set<string>) {
  cardsInPanel(panel).forEach((card) => {
    if (!identities.has(identityForCard(card))) return;
    const key = storageKeyForCard(card);
    card.dataset.hubAlertKey = key;
    card.classList.add(NEW_CARD_CLASS);
    registerUnseenAlert(key, cardTitle(card), cardDescription(card));
  });
}

function sync(forceBadge = false) {
  syncSession();
  const panel = document.querySelector<HTMLElement>(".hub-alert-panel");

  if (!sessionUser) {
    syncAppBadge(forceBadge);
    return;
  }
  if (panel) {
    assignPendingTaskKeys(panel);
    reconcilePendingCards(panel);
  }
  // Ao navegar para outro módulo, mantém apenas o último estado desta sessão em memória.
  syncAppBadge(forceBadge);

  if (panel !== observedPanel) {
    observedPanel = panel;
    if (!panel) return;
    if (!initialized) {
      armInitialPanel(panel);
      return;
    }
  }

  if (!panel || !initialized) return;
  decorateUnseenCards(panel);
  const nextCards = currentCards(panel);

  if (Date.now() < suppressGenericDetectionUntil) {
    knownCards = nextCards;
    return;
  }

  const newIdentities = new Set(Array.from(nextCards).filter((card) => !knownCards.has(card)));
  knownCards = nextCards;
  if (newIdentities.size > 0) registerNewCards(panel, newIdentities);
}

function remindUnseenAlerts() {
  const alerts = Array.from(unseenAlerts.values());
  if (alerts.length === 0) return;
  const count = alerts.length;
  const title = count === 1 ? "1 alerta ainda não visualizado" : `${count} alertas ainda não visualizados`;
  const body = count === 1
    ? alerts[0].title
    : `${alerts.slice(0, 2).map((alert) => alert.title).join(" · ")}${count > 2 ? ` · +${count - 2}` : ""}`;
  void showHubWindowsNotification(title, body, REMINDER_TAG);
  startAttention();
}

function acknowledgeWhenUserReturns() {
  if (document.visibilityState !== "visible") return;
  sync(true);
  if (attentionActive) scheduleVisibleStop(RETURN_FLASH_MS);
}

function findCardByKey(key: string) {
  const panel = document.querySelector<HTMLElement>(".hub-alert-panel");
  return panel ? cardsInPanel(panel).find((card) => storageKeyForCard(card) === key) ?? null : null;
}

const root = document.getElementById("root");
if (root) {
  const observer = new MutationObserver(() => sync());
  observer.observe(root, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  });
  // Descarta só o contador legado. Nenhuma pendência real é removida.
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* Armazenamento opcional. */ }
  void closeHubWindowsNotification(REMINDER_TAG);
  syncAppBadge(true);
  sync();
}

window.setInterval(() => sync(true), BADGE_KEEPALIVE_MS);
window.setInterval(remindUnseenAlerts, REMINDER_MS);

document.addEventListener("hub:new-alert-tasks", (event) => {
  syncSession();
  if (!sessionUser) return;
  const detail = (event as NewAlertTaskEvent).detail;
  const tasks = detail?.tasks ?? [];
  tasks.forEach((task) => {
    const taskTitle = normalize(task.title ?? "") || "Novo chamado no HUB";
    const key = `task:${normalize(task.id ?? "") || hashString(taskTitle)}`;
    rememberPendingTaskKey(taskTitle, key);
    if (observedPanel) assignPendingTaskKeys(observedPanel);
    sync();
    if (findCardByKey(key)) registerUnseenAlert(key, taskTitle, "Novo chamado/Afazer no HUB.");
  });
  suppressGenericDetectionUntil = Date.now() + EXTERNAL_REFRESH_SUPPRESS_MS;
  if (observedPanel) decorateUnseenCards(observedPanel);
});

document.addEventListener("hub:open-alert", (event) => {
  const key = normalize((event as OpenAlertEvent).detail?.key ?? "");
  if (!key) return;
  const card = findCardByKey(key);
  acknowledgeAlert(key);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  const marketingButton = card.querySelector<HTMLButtonElement>(".marketing-alert-open");
  if (marketingButton) window.setTimeout(() => marketingButton.click(), 180);
});

document.addEventListener("visibilitychange", acknowledgeWhenUserReturns);
window.addEventListener("focus", acknowledgeWhenUserReturns);
document.addEventListener("hub:alert-session-change", () => sync());
navigator.serviceWorker?.addEventListener("controllerchange", () => sync(true));
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "hub:refresh-alert-badge") sync(true);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest<HTMLElement>(CARD_SELECTOR);
  if (!card) return;
  acknowledgeAlert(storageKeyForCard(card));
});
