const APP_TITLE = "HUB Santa Maria";
const ALERT_TITLE = "🔴 NOVO ALERTA · HUB Santa Maria";
const CARD_SELECTOR = ".hub-alert-panel .hub-alert-card";
const ATTENTION_ATTRIBUTE = "data-hub-alert-attention";
const WARMUP_MS = 4000;
const VISIBLE_FLASH_MS = 9000;

let observedPanel: HTMLElement | null = null;
let knownCards = new Set<string>();
let armed = false;
let warmupTimer = 0;
let visibleStopTimer = 0;
let blinkTimer = 0;
let blinkOn = false;

const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
const originalFavicon = favicon?.getAttribute("href") ?? "/icons/icon-192.png";
const alertFavicon = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill="#dc2626"/>
    <rect x="29" y="14" width="6" height="28" rx="3" fill="white"/>
    <circle cx="32" cy="50" r="4" fill="white"/>
  </svg>
`)}`;

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function fingerprint(card: Element) {
  const title = normalize(card.querySelector("h3")?.textContent ?? "");
  const description = normalize(card.querySelector("p")?.textContent ?? "");
  const detail = normalize(card.querySelector("small")?.textContent ?? "");
  const time = normalize(card.querySelector("time")?.textContent ?? "");
  return [title, description, detail, time].join("|");
}

function currentCards(panel: HTMLElement) {
  return new Set(
    Array.from(panel.querySelectorAll<HTMLElement>(".hub-alert-card"))
      .map(fingerprint)
      .filter(Boolean),
  );
}

function applyBlinkFrame() {
  blinkOn = !blinkOn;
  document.title = blinkOn ? ALERT_TITLE : APP_TITLE;
  if (favicon) favicon.setAttribute("href", blinkOn ? alertFavicon : originalFavicon);
}

function stopAttention() {
  if (blinkTimer) window.clearInterval(blinkTimer);
  if (visibleStopTimer) window.clearTimeout(visibleStopTimer);
  blinkTimer = 0;
  visibleStopTimer = 0;
  blinkOn = false;
  document.documentElement.removeAttribute(ATTENTION_ATTRIBUTE);
  document.title = APP_TITLE;
  if (favicon) favicon.setAttribute("href", originalFavicon);
}

function startAttention() {
  stopAttention();
  document.documentElement.setAttribute(ATTENTION_ATTRIBUTE, "1");
  blinkOn = false;
  applyBlinkFrame();
  blinkTimer = window.setInterval(applyBlinkFrame, 900);

  if (document.visibilityState === "visible") {
    visibleStopTimer = window.setTimeout(stopAttention, VISIBLE_FLASH_MS);
  }
}

function armPanel(panel: HTMLElement) {
  if (warmupTimer) window.clearTimeout(warmupTimer);
  armed = false;
  knownCards.clear();
  warmupTimer = window.setTimeout(() => {
    if (observedPanel !== panel || !panel.isConnected) return;
    knownCards = currentCards(panel);
    armed = true;
  }, WARMUP_MS);
}

function sync() {
  const panel = document.querySelector<HTMLElement>(".hub-alert-panel");
  if (panel !== observedPanel) {
    observedPanel = panel;
    if (!panel) {
      if (warmupTimer) window.clearTimeout(warmupTimer);
      armed = false;
      knownCards.clear();
      return;
    }
    armPanel(panel);
    return;
  }

  if (!panel || !armed) return;
  const nextCards = currentCards(panel);
  const hasNewCard = Array.from(nextCards).some((card) => !knownCards.has(card));
  knownCards = nextCards;
  if (hasNewCard) startAttention();
}

function acknowledgeWhenUserReturns() {
  if (document.visibilityState === "visible" && document.documentElement.hasAttribute(ATTENTION_ATTRIBUTE)) {
    stopAttention();
  }
}

const root = document.getElementById("root");
if (root) {
  const observer = new MutationObserver(sync);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  sync();
}

document.addEventListener("visibilitychange", acknowledgeWhenUserReturns);
window.addEventListener("focus", acknowledgeWhenUserReturns);
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest(CARD_SELECTOR)) stopAttention();
});
