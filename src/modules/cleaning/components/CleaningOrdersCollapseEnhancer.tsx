import { useEffect } from "react";
import "./cleaningOrdersCollapse.css";

const ORDERS_TITLE = "Limpeza — Pedidos Sinval";
const TOGGLE_CLASS = "cleaning-order-collapse-toggle";

function getOrdersScreen(): HTMLElement | null {
  const title = Array.from(document.querySelectorAll<HTMLElement>(".screen .top-bar h1"))
    .find((element) => element.textContent?.trim() === ORDERS_TITLE);
  return title?.closest<HTMLElement>(".screen") ?? null;
}

function enhanceOrderCard(card: HTMLElement) {
  const head = card.querySelector<HTMLElement>(":scope > .order-head");
  const content = card.querySelector<HTMLElement>(":scope > .item-list, :scope > .edit-list");
  const actions = card.querySelector<HTMLElement>(":scope > .button-grid");
  if (!head || !content || !actions) return;

  const editing = content.classList.contains("edit-list");
  const itemCount = content.querySelectorAll("li, .edit-row").length;

  if (!card.dataset.cleaningCollapseInitialized) {
    card.dataset.cleaningCollapseInitialized = "1";
    card.dataset.cleaningOrderExpanded = "0";
  }

  if (editing) {
    card.dataset.cleaningOrderExpanded = "1";
  }

  let toggle = card.querySelector<HTMLButtonElement>(`:scope > .${TOGGLE_CLASS}`);
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `ghost-button ${TOGGLE_CLASS}`;
    toggle.addEventListener("click", () => {
      if (toggle?.disabled) return;
      card.dataset.cleaningOrderExpanded = card.dataset.cleaningOrderExpanded === "1" ? "0" : "1";
      applyCardState(card);
    });
    card.insertBefore(toggle, content);
  }

  toggle.dataset.itemCount = String(itemCount);
  toggle.disabled = editing;
  applyCardState(card);
}

function applyCardState(card: HTMLElement) {
  const toggle = card.querySelector<HTMLButtonElement>(`:scope > .${TOGGLE_CLASS}`);
  if (!toggle) return;

  const editing = Boolean(card.querySelector(":scope > .edit-list"));
  const expanded = editing || card.dataset.cleaningOrderExpanded === "1";
  const itemCount = Number(toggle.dataset.itemCount ?? "0");

  card.classList.toggle("cleaning-order-collapsed", !expanded);
  card.classList.toggle("cleaning-order-expanded", expanded);

  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.textContent = editing
    ? "Pedido em edição"
    : expanded
      ? "Recolher pedido"
      : `Ver pedido${itemCount > 0 ? ` (${itemCount} ${itemCount === 1 ? "item" : "itens"})` : ""}`;
}

function enhanceOrdersScreen() {
  const screen = getOrdersScreen();
  if (!screen) return;

  screen.querySelectorAll<HTMLElement>(".orders-list > .order-card").forEach(enhanceOrderCard);
}

export function CleaningOrdersCollapseEnhancer() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        enhanceOrdersScreen();
      });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
