import { useEffect } from "react";
import "./alertPanelPriority.css";

const CLEANING_DISMISSED_STORAGE_KEY = "hub-sm-cleaning-stock-check-dismissed";
const AUDITORIO_DISMISSED_STORAGE_KEY = "hub-sm-auditorio-today-dismissed";
const CLEANING_CARD_SELECTOR = ".hub-cleaning-activity-card";
const AUDITORIO_CARD_SELECTOR = ".hub-alert-card.is-auditorio:not(.is-auditorio-pending)";
const CLEANING_DISMISSED_CLASS = "hub-cleaning-stock-check-dismissed";
const AUDITORIO_DISMISSED_CLASS = "hub-auditorio-today-dismissed";
const AUDITORIO_OUTSIDE_TODAY_CLASS = "hub-auditorio-outside-today-hidden";

export function AlertPanelPriorityEnhancer() {
  useEffect(() => {
    const dismissedCleaning = readDismissed(CLEANING_DISMISSED_STORAGE_KEY);
    const dismissedAuditorio = readDismissed(AUDITORIO_DISMISSED_STORAGE_KEY);

    const enhance = () => {
      document.querySelectorAll<HTMLElement>(CLEANING_CARD_SELECTOR).forEach((card) => {
        if (!isStockCheckCard(card)) return;

        const signature = getCardSignature(card);
        if (dismissedCleaning.has(signature)) {
          hideCard(card, CLEANING_DISMISSED_CLASS);
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
          dismissedCleaning.add(signature);
          saveDismissed(CLEANING_DISMISSED_STORAGE_KEY, dismissedCleaning);
          hideCard(card, CLEANING_DISMISSED_CLASS);
        });
        card.appendChild(doneButton);
      });

      document.querySelectorAll<HTMLElement>(AUDITORIO_CARD_SELECTOR).forEach((card) => {
        const status = card.querySelector<HTMLElement>(".hub-alert-card-status span")?.textContent?.trim().toUpperCase() ?? "";

        if (!status.startsWith("HOJE")) {
          hideCard(card, AUDITORIO_OUTSIDE_TODAY_CLASS);
          return;
        }

        showCard(card, AUDITORIO_OUTSIDE_TODAY_CLASS);
        const signature = getCardSignature(card);
        if (dismissedAuditorio.has(signature)) {
          hideCard(card, AUDITORIO_DISMISSED_CLASS);
          return;
        }

        showCard(card, AUDITORIO_DISMISSED_CLASS);
        card.classList.add("hub-auditorio-today-enhanced");
        if (card.querySelector(".hub-auditorio-today-done")) return;

        const doneButton = document.createElement("button");
        doneButton.type = "button";
        doneButton.className = "hub-alert-done-button hub-auditorio-today-done";
        doneButton.textContent = "FEITO";
        doneButton.setAttribute("aria-label", "Retirar aviso de preparação do Auditório do painel");
        doneButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dismissedAuditorio.add(signature);
          saveDismissed(AUDITORIO_DISMISSED_STORAGE_KEY, dismissedAuditorio);
          hideCard(card, AUDITORIO_DISMISSED_CLASS);
        });
        card.appendChild(doneButton);
      });
    };

    enhance();

    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

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
  const detail = card.querySelector<HTMLElement>("small")?.textContent?.trim() ?? "";
  const day = new Date().toLocaleDateString("pt-BR");
  return [day, status, time, title, description, detail].join("|");
}

function hideCard(card: HTMLElement, className: string) {
  card.classList.add(className);
  card.setAttribute("aria-hidden", "true");
  card.style.setProperty("display", "none", "important");
}

function showCard(card: HTMLElement, className: string) {
  card.classList.remove(className);
  if (!card.classList.contains(CLEANING_DISMISSED_CLASS)
    && !card.classList.contains(AUDITORIO_DISMISSED_CLASS)
    && !card.classList.contains(AUDITORIO_OUTSIDE_TODAY_CLASS)) {
    card.removeAttribute("aria-hidden");
    card.style.removeProperty("display");
  }
}

function readDismissed(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveDismissed(storageKey: string, dismissed: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(dismissed).slice(-100)));
  } catch {
    // A remoção visual continua funcionando mesmo sem persistência local.
  }
}
