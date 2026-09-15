import { useEffect } from "react";
import { forceHubSessionReauthentication } from "../security/services/hubSessionRecovery";
import { refreshMarketingSession } from "./marketingService";

const SESSION_KEY = "hub-sm-active-session";
const KEEPALIVE_MS = 10 * 60 * 1000;

type SavedSession = {
  marketingSessionToken?: string | null;
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
          forceHubSessionReauthentication();
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
