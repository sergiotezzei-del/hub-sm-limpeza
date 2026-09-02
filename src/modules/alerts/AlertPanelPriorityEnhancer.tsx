import { useEffect } from "react";
import "./alertPanelPriority.css";

const DISMISSED_STORAGE_KEY = "hub-sm-cleaning-stock-check-dismissed";
const CLEANING_CARD_SELECTOR = ".hub-cleaning-activity-card";
const DISMISSED_CLASS = "hub-cleaning-stock-check-dismissed";

export function AlertPanelPriorityEnhancer() {
  useEffect(() => {
    const dismissed = readDismissed();

    const enhance = () => {
      document.querySelectorAll<HTMLElement>(CLEANING_CARD_SELECTOR).forEach((card) => {
        if (!isStockCheckCard(card)) return;

        const signature = getCardSignature(card);
        if (dismissed.has(signature)) {
          hideCard(card);
          return;
        }

        card.classList.add("hub-cleaning-stock-check-enhanced");
        if (card.querySelector(".hub-cleaning-stock-check-done")) return;

        const doneButton = document.createElement("button");
        doneButton.type = "button";
        doneButton.className = "hub-alert-done-button hub-cleaning-stock-check-done";
        doneButton.textContent = "FEITO";
        doneButton.setAttribute("aria-label", "Retirar alerta da conferência do painel");
        doneButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dismissed.add(signature);
          saveDismissed(dismissed);
          hideCard(card);
        });
        card.appendChild(doneButton);
      });
    };

    enhance();

    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}

function isStockCheckCard(card: HTMLElement) {
  const status = card.querySelector<HTMLElement>(".hub-alert-card-status span")?.textContent?.trim().toUpperCase();
  return status === "CONFERÊNCIA";
}

function getCardSignature(card: HTMLElement) {
  const status = card.querySelector<HTMLElement>(".hub-alert-card-status span")?.textContent?.trim() ?? "";
  const time = card.querySelector<HTMLElement>(".hub-alert-card-status time")?.textContent?.trim() ?? "";
  const title = card.querySelector<HTMLElement>("h3")?.textContent?.trim() ?? "";
  const description = card.querySelector<HTMLElement>("p")?.textContent?.trim() ?? "";
  const day = new Date().toLocaleDateString("pt-BR");
  return [day, status, time, title, description].join("|");
}

function hideCard(card: HTMLElement) {
  card.classList.add(DISMISSED_CLASS);
  card.setAttribute("aria-hidden", "true");
  card.style.setProperty("display", "none", "important");
}

function readDismissed() {
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveDismissed(dismissed: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(dismissed).slice(-100)));
  } catch {
    // A remoção visual continua funcionando mesmo sem persistência local.
  }
}
