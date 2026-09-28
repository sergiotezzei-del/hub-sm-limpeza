import { useEffect } from "react";
import { refreshMarketingSession } from "./marketingService";

const KEEPALIVE_MS = 10 * 60 * 1000;

type MarketingSessionKeepaliveProps = {
  sessionToken: string;
  onSessionInvalid: () => void;
};

export function MarketingSessionKeepalive({ sessionToken, onSessionInvalid }: MarketingSessionKeepaliveProps) {
  useEffect(() => {
    let cancelled = false;
    let busy = false;

    const refresh = async () => {
      if (cancelled || busy) return;

      busy = true;
      try {
        await refreshMarketingSession(sessionToken);
        if (cancelled) return;
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error ?? "")).toUpperCase();
        if (message.includes("MARKETING_SESSION_EXPIRED") || message.includes("MARKETING_SESSION_MISMATCH")) {
          onSessionInvalid();
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
  }, [onSessionInvalid, sessionToken]);

  return null;
}
