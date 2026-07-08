import type { GuardId } from "../../../types";
import { getGuardSupabaseAuthEmailBinding, getGuardSupabaseUserBinding } from "./guardSupabaseConfig";
import { getSupabaseClient, signOutSupabaseAuth, supabaseConfigured } from "./supabaseClient";

const AUTH_BRIDGE_STATUS_KEY = "hub-sm-guard-auth-bridge-status";
const AUTH_BRIDGE_TIMEOUT_MS = 5000;

export type GuardAuthBridgeStatus = {
  ok: boolean;
  reason: string;
  checkedAt: string;
  userId?: string;
};

type StoredBridgeStatus = Partial<Record<GuardId, GuardAuthBridgeStatus>>;

export async function signInGuardSupabaseAuth(guardLocalId: GuardId, password: string): Promise<GuardAuthBridgeStatus> {
  const authEmail = getGuardSupabaseAuthEmailBinding(guardLocalId);
  const userBinding = getGuardSupabaseUserBinding(guardLocalId);

  if (!supabaseConfigured) {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: "Supabase não configurado; confira VITE_DB_URL e VITE_DB_PUBLIC_KEY.",
      checkedAt: new Date().toISOString(),
    });
  }

  if (!authEmail.email) {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: `${authEmail.envName} não configurada.`,
      checkedAt: new Date().toISOString(),
    });
  }

  let supabase: Awaited<ReturnType<typeof getSupabaseClient>>;
  try {
    supabase = await getSupabaseClient();
  } catch {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: "Cliente Supabase indisponível; fallback local mantido.",
      checkedAt: new Date().toISOString(),
    });
  }

  if (!supabase) {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: "Cliente Supabase indisponível.",
      checkedAt: new Date().toISOString(),
    });
  }

  let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | { timedOut: true };

  try {
    const signInPromise = supabase.auth.signInWithPassword({
      email: authEmail.email,
      password,
    });
    signInPromise.catch(() => undefined);
    signInResult = await Promise.race([signInPromise, createAuthBridgeTimeout()]);
  } catch {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: "Falha ao contatar Supabase Auth; fallback local mantido.",
      checkedAt: new Date().toISOString(),
    });
  }

  if ("timedOut" in signInResult) {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: "Supabase Auth demorou para responder; fallback local mantido.",
      checkedAt: new Date().toISOString(),
    });
  }

  const { data, error } = signInResult;

  if (error || !data.session?.user.id) {
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: "Supabase Auth não criou sessão para este guarda.",
      checkedAt: new Date().toISOString(),
    });
  }

  const authUserId = data.session.user.id;
  if (userBinding.userId && userBinding.userId !== authUserId) {
    await signOutSupabaseAuth();
    return saveGuardAuthBridgeStatus(guardLocalId, {
      ok: false,
      reason: `${userBinding.envName} não confere com o usuário autenticado no Supabase.`,
      checkedAt: new Date().toISOString(),
      userId: authUserId,
    });
  }

  return saveGuardAuthBridgeStatus(guardLocalId, {
    ok: true,
    reason: "Sessão Supabase Auth criada para o guarda.",
    checkedAt: new Date().toISOString(),
    userId: authUserId,
  });
}

export function getGuardAuthBridgeStatus(guardLocalId: GuardId) {
  return getStoredBridgeStatus()[guardLocalId];
}

function saveGuardAuthBridgeStatus(guardLocalId: GuardId, status: GuardAuthBridgeStatus) {
  if (typeof window !== "undefined") {
    const current = getStoredBridgeStatus();
    try {
      window.localStorage.setItem(AUTH_BRIDGE_STATUS_KEY, JSON.stringify({ ...current, [guardLocalId]: status }));
    } catch {
      // O status e apenas diagnostico tecnico; o login local nao deve depender dele.
    }
  }

  return status;
}

function getStoredBridgeStatus(): StoredBridgeStatus {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(AUTH_BRIDGE_STATUS_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as StoredBridgeStatus;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function createAuthBridgeTimeout() {
  return new Promise<{ timedOut: true }>((resolve) => {
    window.setTimeout(() => resolve({ timedOut: true }), AUTH_BRIDGE_TIMEOUT_MS);
  });
}
