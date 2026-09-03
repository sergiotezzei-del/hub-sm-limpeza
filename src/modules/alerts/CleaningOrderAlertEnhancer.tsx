import { useEffect } from "react";
import "./cleaningOrderAlert.css";

const SESSION_KEY = "hub-sm-active-session";
const DUPLICATE_CARD_SELECTOR = ".hub-cleaning-activity-card";
const OFFICIAL_CARD_SELECTOR = ".hub-alert-card.is-operational";

export function CleaningOrderAlertEnhancer() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    let frame = 0;

    const enhance = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        hideDuplicateOrderCards();
        enhanceOfficialOrderCards();
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>(".hub-operational-order-enhanced").forEach((card) => {
        card.classList.remove("hub-operational-order-enhanced");
        card.querySelector(".hub-operational-order-open")?.remove();
        card.querySelector(".hub-operational-order-aware")?.classList.remove("hub-operational-order-aware");
      });
      document.querySelectorAll<HTMLElement>(".hub-cleaning-order-duplicate-hidden").forEach((card) => {
        card.classList.remove("hub-cleaning-order-duplicate-hidden");
        card.removeAttribute("aria-hidden");
      });
    };
  }, []);

  return null;
}

function hideDuplicateOrderCards() {
  document.querySelectorAll<HTMLElement>(DUPLICATE_CARD_SELECTOR).forEach((card) => {
    const status = card.querySelector<HTMLElement>(".hub-alert-card-status span")?.textContent?.trim().toUpperCase() ?? "";
    if (status !== "PEDIDO") return;

    card.classList.add("hub-cleaning-order-duplicate-hidden");
    card.setAttribute("aria-hidden", "true");
  });
}

function enhanceOfficialOrderCards() {
  document.querySelectorAll<HTMLElement>(OFFICIAL_CARD_SELECTOR).forEach((card) => {
    const status = card.querySelector<HTMLElement>(".hub-alert-card-status span")?.textContent?.trim().toUpperCase() ?? "";
    if (status !== "NOVO PEDIDO") return;

    const awareButton = Array.from(card.querySelectorAll<HTMLButtonElement>(":scope > .hub-alert-done-button"))
      .find((button) => button.textContent?.trim().toUpperCase() === "CIENTE");
    if (!awareButton) return;

    card.classList.add("hub-operational-order-enhanced");
    awareButton.classList.add("hub-operational-order-aware");

    if (card.querySelector(".hub-operational-order-open")) return;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "hub-alert-done-button hub-operational-order-open";
    openButton.textContent = "CONFERIR PEDIDO";
    openButton.setAttribute("aria-label", "Abrir a tela de Pedidos Sinval para conferir este pedido");
    openButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCleaningOrdersScreen();
    });
    card.appendChild(openButton);
  });
}

function openCleaningOrdersScreen() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const session = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, view: "orders" }));
    window.location.reload();
    return;
  } catch {
    // Se a sessão não puder ser atualizada, usa a navegação já existente na tela.
  }

  const cleaningCard = findModuleCard("Limpeza");
  if (!cleaningCard) return;
  cleaningCard.click();
  openOrdersCardWhenReady();
}

function openOrdersCardWhenReady() {
  let attempts = 0;
  const maxAttempts = 60;

  const tryOpen = () => {
    attempts += 1;
    const ordersCard = findModuleCard("Pedidos Sinval");
    if (ordersCard) {
      ordersCard.click();
      return;
    }
    if (attempts < maxAttempts) window.setTimeout(tryOpen, 100);
  };

  window.setTimeout(tryOpen, 50);
}

function findModuleCard(title: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".module-card"))
    .find((card) => card.querySelector(".module-card-title")?.textContent?.trim() === title) ?? null;
}
