import { useEffect } from "react";
import type { GuardId } from "../../types";
import { getSupabaseClient } from "./services/supabaseClient";
import { getAdminSupabaseUserBinding, getGuardSupabaseUserBinding } from "./services/guardSupabaseConfig";
import { forceHubSessionReauthentication, HUB_ACTIVE_SESSION_KEY } from "./services/hubSessionRecovery";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const GUARD_IDS = new Set<GuardId>(["carlos-clemente", "salomao"]);

type SavedHubSession = {
  currentUser?: string | null;
};

export function HubAuthSessionGuard() {
  useEffect(() => {
    let cancelled = false;
    let checking = false;

    const validate = async () => {
      if (cancelled || checking) return;
      const expectedUserId = getExpectedSupabaseUserId();
      if (!expectedUserId) return;

      checking = true;
      try {
        const supabase = await getSupabaseClient();
        if (!supabase || cancelled) return;

        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error || !data.session?.user.id || data.session.user.id !== expectedUserId) {
          forceHubSessionReauthentication();
        }
      } catch {
        // Falha de rede temporária não deve derrubar uma sessão local válida.
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

    let unsubscribe: () => void = () => {};
    void getSupabaseClient().then((supabase) => {
      if (!supabase || cancelled) return;
      const subscription = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" && getExpectedSupabaseUserId()) {
          forceHubSessionReauthentication();
        }
      });
      unsubscribe = () => subscription.data.subscription.unsubscribe();
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribe();
    };
  }, []);

  return null;
}

function getExpectedSupabaseUserId() {
  const currentUser = readSavedCurrentUser();
  if (!currentUser) return undefined;
  if (currentUser === "tezzei") return getAdminSupabaseUserBinding().userId;
  if (GUARD_IDS.has(currentUser as GuardId)) return getGuardSupabaseUserBinding(currentUser as GuardId).userId;
  return undefined;
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
