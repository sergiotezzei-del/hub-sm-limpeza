import { useEffect } from "react";
import { getSupabaseClient } from "./services/supabaseClient";
import { HUB_ACTIVE_SESSION_KEY } from "./services/hubSessionRecovery";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
type SavedHubSession = {
  currentUser?: string | null;
};

export function HubAuthSessionGuard() {
  useEffect(() => {
    let cancelled = false;
    let checking = false;

    const validate = async () => {
      if (cancelled || checking) return;
      const expectedManagedUserId = readSavedCurrentUser();
      if (!expectedManagedUserId) return;

      checking = true;
      try {
        const supabase = await getSupabaseClient();
        if (!supabase || cancelled) return;

        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!error && sessionMatchesManagedUser(data.session?.user, expectedManagedUserId)) return;

        // Try to recover an expired access token from the persisted refresh token.
        // A temporary/missing cloud session must not erase the valid local HUB
        // session or trigger a reload/login loop.
        const refreshed = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (!refreshed.error && sessionMatchesManagedUser(refreshed.data.session?.user, expectedManagedUserId)) return;
      } catch {
        // Network/auth refresh failures are surfaced by protected modules when
        // needed, but the main HUB session remains stable.
      } finally {
        checking = false;
      }
    };

    const onFocus = () => { void validate(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void validate();
    };

    void validate();
    const timer = window.setInterval(() => { void validate(); }, CHECK_INTERVAL_MS);
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

function sessionMatchesManagedUser(user: { app_metadata?: Record<string, unknown> } | null | undefined, managedUserId: string) {
  return user?.app_metadata?.managed_user_id === managedUserId;
}

function readSavedCurrentUser() {
  try {
    const raw = window.sessionStorage.getItem(HUB_ACTIVE_SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SavedHubSession;
    return typeof parsed.currentUser === "string" ? parsed.currentUser : undefined;
  } catch {
    return undefined;
  }
}
