import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SESSION_KEY = "hub-sm-active-session";
const OPEN_DELIVERY_KEY = "hub-sm-neia-open-delivery";

function getCurrentUserId() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? String(JSON.parse(raw)?.currentUser ?? "") : "";
  } catch {
    return "";
  }
}

function findNeiaQuickActions(root: HTMLElement) {
  if (getCurrentUserId() !== "neia") return null;

  return Array.from(root.querySelectorAll<HTMLElement>(".screen"))
    .map((screen) => screen.querySelector<HTMLElement>(".quick-actions"))
    .find((actions) => {
      if (!actions) return false;
      const labels = Array.from(actions.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
      return labels.includes("Fazer Pedido Sinval") && labels.includes("Conferência de Estoque");
    }) ?? null;
}

export function NeiaDeliveryShortcutFeature() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!(root instanceof HTMLElement)) return;

    const sync = () => {
      setTarget((current) => {
        const next = findNeiaQuickActions(root);
        return current === next ? current : next;
      });

      if (getCurrentUserId() !== "neia" || window.localStorage.getItem(OPEN_DELIVERY_KEY) !== "1") return;
      const deliveryCard = root.querySelector<HTMLButtonElement>(".cleaning-delivery-card");
      if (!deliveryCard) return;
      window.localStorage.removeItem(OPEN_DELIVERY_KEY);
      window.setTimeout(() => deliveryCard.click(), 0);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    const interval = window.setInterval(sync, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  function openDelivery() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      const session = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(OPEN_DELIVERY_KEY, "1");
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, view: "cleaning-dashboard" }));
      window.location.reload();
    } catch {
      window.alert("Não foi possível abrir a Conferência de Entrega agora.");
    }
  }

  if (!target) return null;

  return createPortal(
    <button className="secondary-button wide-button" type="button" onClick={openDelivery}>
      Conferência de Entrega
    </button>,
    target,
  );
}
