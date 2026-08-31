import { useEffect } from "react";
import {
  acknowledgeMarketingRequestAlert,
  loadAcknowledgedMarketingAlerts,
  type MarketingAlertKind,
} from "./marketingAlertAcknowledgementService";
import "./marketingAlertAcknowledgement.css";

const SESSION_KEY = "hub-sm-active-session";
const REFRESH_MS = 20000;
const CARD_SELECTOR = ".marketing-day-alert[data-marketing-request-id]";

export function MarketingAlertAcknowledgementEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let currentSessionToken = "";
    let refreshing = false;
    const acknowledged = new Set<string>();
    const pending = new Set<string>();

    const alertKey = (requestId: string, kind: MarketingAlertKind) => `${kind}:${requestId}`;

    const isAcknowledged = (requestId: string, kind: MarketingAlertKind) => {
      if (acknowledged.has(alertKey(requestId, kind))) return true;
      return kind === "request" && acknowledged.has(alertKey(requestId, "urgency"));
    };

    const getAlertKind = (card: HTMLElement): MarketingAlertKind => (
      card.classList.contains("is-urgent") ? "urgency" : "request"
    );

    const enhanceCards = () => {
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        const requestId = card.dataset.marketingRequestId;
        if (!requestId) return;

        const kind = getAlertKind(card);
        if (isAcknowledged(requestId, kind)) {
          card.hidden = true;
          return;
        }

        card.hidden = false;
        if (card.dataset.marketingAlertEnhanced === "true") return;

        const openButton = card.querySelector<HTMLButtonElement>(".marketing-alert-open");
        if (!openButton) return;

        const doneButton = document.createElement("button");
        doneButton.type = "button";
        doneButton.className = "hub-alert-done-button marketing-alert-ack-button";
        doneButton.textContent = "FEITO";
        doneButton.setAttribute("aria-label", "Marcar alerta do Marketing como visto");
        openButton.insertAdjacentElement("afterend", doneButton);
        card.dataset.marketingAlertEnhanced = "true";
      });
    };

    const refreshAcknowledgements = async () => {
      if (refreshing) return;
      const sessionToken = readMarketingSessionToken();

      if (!sessionToken) {
        currentSessionToken = "";
        acknowledged.clear();
        enhanceCards();
        return;
      }

      if (sessionToken !== currentSessionToken) {
        currentSessionToken = sessionToken;
        acknowledged.clear();
      }

      refreshing = true;
      try {
        const rows = await loadAcknowledgedMarketingAlerts(sessionToken);
        if (cancelled || sessionToken !== readMarketingSessionToken()) return;
        acknowledged.clear();
        rows.forEach((row) => acknowledged.add(alertKey(row.request_id, row.alert_kind)));
        enhanceCards();
      } catch {
        // Se a leitura falhar, os cards permanecem visíveis para não esconder alertas por engano.
      } finally {
        refreshing = false;
      }
    };

    const acknowledgeCard = async (
      card: HTMLElement,
      requestId: string,
      kind: MarketingAlertKind,
      button?: HTMLButtonElement,
    ) => {
      const sessionToken = readMarketingSessionToken();
      const key = alertKey(requestId, kind);
      if (!sessionToken || pending.has(key) || isAcknowledged(requestId, kind)) return;

      pending.add(key);
      if (button) {
        button.disabled = true;
        button.textContent = "...";
        button.removeAttribute("title");
      }

      try {
        await acknowledgeMarketingRequestAlert(sessionToken, requestId, kind);
        if (cancelled) return;
        acknowledged.add(key);
        card.hidden = true;
      } catch {
        if (button && document.contains(button)) {
          button.disabled = false;
          button.textContent = "FEITO";
          button.title = "Não foi possível retirar o alerta. Tente novamente.";
        }
      } finally {
        pending.delete(key);
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionButton = target.closest<HTMLButtonElement>(".marketing-alert-open, .marketing-alert-ack-button");
      if (!actionButton) return;

      const card = actionButton.closest<HTMLElement>(CARD_SELECTOR);
      const requestId = card?.dataset.marketingRequestId;
      if (!card || !requestId) return;

      const kind = getAlertKind(card);
      if (actionButton.classList.contains("marketing-alert-ack-button")) {
        event.preventDefault();
        event.stopPropagation();
        void acknowledgeCard(card, requestId, kind, actionButton);
        return;
      }

      // VER PEDIDO continua navegando normalmente; o reconhecimento é gravado em paralelo.
      void acknowledgeCard(card, requestId, kind);
    };

    const onFocus = () => { void refreshAcknowledgements(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshAcknowledgements();
    };

    enhanceCards();
    void refreshAcknowledgements();

    const root = document.getElementById("root");
    let observer: MutationObserver | null = null;
    if (root) {
      observer = new MutationObserver(enhanceCards);
      observer.observe(root, { childList: true, subtree: true });
    }

    const intervalId = window.setInterval(() => { void refreshAcknowledgements(); }, REFRESH_MS);
    document.addEventListener("click", onClick);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearInterval(intervalId);
      document.removeEventListener("click", onClick);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        card.hidden = false;
        delete card.dataset.marketingAlertEnhanced;
        card.querySelector(".marketing-alert-ack-button")?.remove();
      });
    };
  }, []);

  return null;
}

function readMarketingSessionToken() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const session = JSON.parse(raw) as { marketingSessionToken?: string | null } | null;
    return session?.marketingSessionToken || "";
  } catch {
    return "";
  }
}
