import { useEffect } from "react";
import { refreshMarketingSession } from "./marketingService";

const SESSION_KEY = "hub-sm-active-session";
const KEEPALIVE_MS = 10 * 60 * 1000;

type SavedSession = {
  marketingSessionToken?: string | null;
  [key: string]: unknown;
};

export function MarketingSessionKeepalive() {
  useEffect(() => {
    let cancelled = false;
    let busy = false;

    const refresh = async () => {
      if (cancelled || busy) return;
      const sessionToken = readMarketingSessionToken();
      if (!sessionToken) return;

      busy = true;
      try {
        await refreshMarketingSession(sessionToken);
        if (cancelled) return;
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error ?? "")).toUpperCase();
        if (message.includes("MARKETING_SESSION_EXPIRED") || message.includes("MARKETING_SESSION_MISMATCH")) {
          // Marketing is an auxiliary session. Expiration must never destroy the
          // active HUB/Admin session or force a page reload/login loop.
          clearMarketingSessionToken();
        }
      } finally {
        busy = false;
      }
    };

    const onFocus = () => { void refresh(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, KEEPALIVE_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

function readMarketingSessionToken() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as SavedSession;
    return typeof parsed.marketingSessionToken === "string" ? parsed.marketingSessionToken.trim() : "";
  } catch {
    return "";
  }
}

function clearMarketingSessionToken() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SavedSession;
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...parsed, marketingSessionToken: null }),
    );
  } catch {
    // Keepalive must never affect the main HUB session when storage is unavailable.
  }
}
