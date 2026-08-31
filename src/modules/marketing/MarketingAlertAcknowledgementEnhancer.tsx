import { useEffect } from "react";
import {
  acknowledgeMarketingRequestAlert,
  loadAcknowledgedMarketingAlerts,
  type MarketingAlertKind,
} from "./marketingAlertAcknowledgementService";
import "./marketingAlertAcknowledgement.css";

const SESSION_KEY = "hub-sm-active-session";
const ACK_CACHE_PREFIX = "hub-sm-marketing-alert-ack";
const REFRESH_MS = 20000;
const CARD_SELECTOR = ".marketing-day-alert[data-marketing-request-id]";
const DISMISSED_CLASS = "marketing-alert-dismissed";

export function MarketingAlertAcknowledgementEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let currentSessionToken = "";
    let currentUserId = "";
    let refreshing = false;
    const acknowledged = new Set<string>();
    const pending = new Set<string>();

    const alertKey = (requestId: string, kind: MarketingAlertKind) => `${kind}:${requestId}`;
    const isAcknowledged = (requestId: string, kind: MarketingAlertKind) => acknowledged.has(alertKey(requestId, kind));

    const getAlertKind = (card: HTMLElement): MarketingAlertKind => (
      card.classList.contains("is-urgent") ? "urgency" : "request"
    );

    const hideCard = (card: HTMLElement) => {
      card.classList.add(DISMISSED_CLASS);
      card.setAttribute("aria-hidden", "true");
      card.style.setProperty("display", "none", "important");
    };

    const showCard = (card: HTMLElement) => {
      card.classList.remove(DISMISSED_CLASS);
      card.removeAttribute("aria-hidden");
      card.style.removeProperty("display");
    };

    const loadCachedAcknowledgements = (userId: string) => {
      if (!userId) return;
      try {
        const raw = window.localStorage.getItem(`${ACK_CACHE_PREFIX}:${userId}`);
        if (!raw) return;
        const keys = JSON.parse(raw) as unknown;
        if (!Array.isArray(keys)) return;
        keys.forEach((key) => {
          if (typeof key === "string" && /^(request|urgency):/.test(key)) acknowledged.add(key);
        });
      } catch {
        // O cache local é apenas uma segurança visual; a fonte oficial continua sendo o Supabase.
      }
    };

    const saveCachedAcknowledgements = () => {
      if (!currentUserId) return;
      try {
        window.localStorage.setItem(
          `${ACK_CACHE_PREFIX}:${currentUserId}`,
          JSON.stringify(Array.from(acknowledged)),
        );
      } catch {
        // Falha de cache local não impede a persistência no Supabase.
      }
    };

    const enhanceCards = () => {
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        const requestId = card.dataset.marketingRequestId;
        if (!requestId) return;

        const kind = getAlertKind(card);
        const key = alertKey(requestId, kind);
        if (isAcknowledged(requestId, kind) || pending.has(key)) {
          hideCard(card);
          return;
        }

        showCard(card);
        if (card.dataset.marketingAlertEnhanced === "true") return;

        const openButton = card.querySelector<HTMLButtonElement>(".marketing-alert-open");
        if (!openButton || !openButton.parentElement) return;

        const actions = document.createElement("div");
        actions.className = "marketing-alert-actions";

        const doneButton = document.createElement("button");
        doneButton.type = "button";
        doneButton.className = "hub-alert-done-button marketing-alert-ack-button";
        doneButton.textContent = "FEITO";
        doneButton.setAttribute("aria-label", "Marcar alerta do Marketing como visto");

        card.dataset.marketingAlertEnhanced = "true";
        openButton.parentElement.insertBefore(actions, openButton);
        actions.append(openButton, doneButton);
      });
    };

    const refreshAcknowledgements = async () => {
      if (refreshing) return;
      const hubSession = readHubSession();
      const sessionToken = hubSession.marketingSessionToken;
      const userId = hubSession.currentUser;

      if (!sessionToken) {
        currentSessionToken = "";
        currentUserId = userId;
        acknowledged.clear();
        loadCachedAcknowledgements(userId);
        enhanceCards();
        return;
      }

      if (sessionToken !== currentSessionToken || userId !== currentUserId) {
        currentSessionToken = sessionToken;
        currentUserId = userId;
        acknowledged.clear();
        loadCachedAcknowledgements(userId);
        enhanceCards();
      }

      refreshing = true;
      try {
        const rows = await loadAcknowledgedMarketingAlerts(sessionToken);
        if (cancelled || sessionToken !== readHubSession().marketingSessionToken) return;
        rows.forEach((row) => acknowledged.add(alertKey(row.request_id, row.alert_kind)));
        saveCachedAcknowledgements();
        enhanceCards();
      } catch {
        // Mantém o cache local e não faz o alerta reaparecer por uma falha temporária de leitura.
        enhanceCards();
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
      const hubSession = readHubSession();
      const sessionToken = hubSession.marketingSessionToken;
      const key = alertKey(requestId, kind);

      if (!sessionToken) {
        if (button) button.title = "Sessão do Marketing indisponível. Entre novamente no HUB.";
        return;
      }
      if (pending.has(key) || isAcknowledged(requestId, kind)) {
        hideCard(card);
        return;
      }

      currentUserId = hubSession.currentUser || currentUserId;
      pending.add(key);
      hideCard(card);
      if (button) button.disabled = true;

      try {
        await acknowledgeMarketingRequestAlert(sessionToken, requestId, kind);
        if (cancelled) return;
        acknowledged.add(key);
        saveCachedAcknowledgements();
        enhanceCards();
      } catch {
        pending.delete(key);
        if (!cancelled) {
          showCard(card);
          enhanceCards();
        }
        if (button && document.contains(button)) {
          button.disabled = false;
          button.title = "Não foi possível retirar o alerta. Tente novamente.";
        }
        return;
      }

      pending.delete(key);
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

      // VER PEDIDO navega normalmente; o alerta já some da Home enquanto a gravação ocorre.
      void acknowledgeCard(card, requestId, kind);
    };

    const onFocus = () => { void refreshAcknowledgements(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshAcknowledgements();
    };

    const initialSession = readHubSession();
    currentSessionToken = initialSession.marketingSessionToken;
    currentUserId = initialSession.currentUser;
    loadCachedAcknowledgements(currentUserId);
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
        showCard(card);
        delete card.dataset.marketingAlertEnhanced;
        const actions = card.querySelector<HTMLElement>(".marketing-alert-actions");
        const openButton = actions?.querySelector<HTMLButtonElement>(".marketing-alert-open");
        if (actions && openButton) {
          actions.insertAdjacentElement("beforebegin", openButton);
          actions.remove();
        } else {
          card.querySelector(".marketing-alert-ack-button")?.remove();
        }
      });
    };
  }, []);

  return null;
}

function readHubSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { marketingSessionToken: "", currentUser: "" };
    const session = JSON.parse(raw) as {
      marketingSessionToken?: string | null;
      currentUser?: string | null;
    } | null;
    return {
      marketingSessionToken: session?.marketingSessionToken || "",
      currentUser: session?.currentUser || "",
    };
  } catch {
    return { marketingSessionToken: "", currentUser: "" };
  }
}
