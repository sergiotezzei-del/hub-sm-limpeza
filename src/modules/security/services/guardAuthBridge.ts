import type { GuardId } from "../../../types";
import {
  getAdminSupabaseAuthEmailBinding,
  getAdminSupabaseUserBinding,
  getGuardSupabaseAuthEmailBinding,
  getGuardSupabaseUserBinding,
} from "./guardSupabaseConfig";
import { getSupabaseClient, signOutSupabaseAuth, supabaseConfigured } from "./supabaseClient";

const AUTH_BRIDGE_STATUS_KEY = "hub-sm-guard-auth-bridge-status";
const AUTH_BRIDGE_TIMEOUT_MS = 5000;
const ADMIN_AUTH_BRIDGE_ID = "admin";

export type GuardAuthBridgeStatus = {
  ok: boolean;
  reason: string;
  checkedAt: string;
  userId?: string;
};

type StoredBridgeStatus = Partial<Record<GuardId, GuardAuthBridgeStatus>>;
type AuthBridgeUserId = GuardId | typeof ADMIN_AUTH_BRIDGE_ID;
type StoredAuthBridgeStatus = Partial<Record<AuthBridgeUserId, GuardAuthBridgeStatus>>;

export async function signInGuardSupabaseAuth(guardLocalId: GuardId, password: string): Promise<GuardAuthBridgeStatus> {
  const authEmail = getGuardSupabaseAuthEmailBinding(guardLocalId);
  const userBinding = getGuardSupabaseUserBinding(guardLocalId);
  return signInSupabaseAuthBridge({
    bridgeId: guardLocalId,
    password,
    authEmail,
    userBinding,
    unavailableReason: "Supabase não configurado; confira VITE_DB_URL e VITE_DB_PUBLIC_KEY.",
    missingEmailReason: `${authEmail.envName} não configurada.`,
    unavailableClientReason: "Cliente Supabase indisponível; fallback local mantido.",
    missingClientReason: "Cliente Supabase indisponível.",
    networkReason: "Falha ao contatar Supabase Auth; fallback local mantido.",
    timeoutReason: "Supabase Auth demorou para responder; fallback local mantido.",
    noSessionReason: "Supabase Auth não criou sessão para este guarda.",
    mismatchReason: `${userBinding.envName} não confere com o usuário autenticado no Supabase.`,
    successReason: "Sessão Supabase Auth criada para o guarda.",
    signOutOnFailure: false,
  });
}

export async function signInAdminSupabaseAuth(password: string): Promise<GuardAuthBridgeStatus> {
  const authEmail = getAdminSupabaseAuthEmailBinding();
  const userBinding = getAdminSupabaseUserBinding();
  return signInSupabaseAuthBridge({
    bridgeId: ADMIN_AUTH_BRIDGE_ID,
    password,
    authEmail,
    userBinding,
    unavailableReason: "Supabase não configurado; confira VITE_DB_URL e VITE_DB_PUBLIC_KEY.",
    missingEmailReason: `${authEmail.envName} não configurada.`,
    missingUserReason: `${userBinding.envName} não configurada.`,
    unavailableClientReason: "Cliente Supabase indisponível; sessão Auth do admin não criada.",
    missingClientReason: "Cliente Supabase indisponível.",
    networkReason: "Falha ao contatar Supabase Auth; admin local mantido.",
    timeoutReason: "Supabase Auth demorou para responder; admin local mantido.",
    noSessionReason: "Supabase Auth não criou sessão para o Admin.",
    mismatchReason: `${userBinding.envName} não confere com o usuário admin autenticado no Supabase.`,
    successReason: "Sessão Supabase Auth criada para o Admin.",
    signOutOnFailure: true,
  });
}

async function signInSupabaseAuthBridge(input: {
  bridgeId: AuthBridgeUserId;
  password: string;
  authEmail: { envName: string; email?: string };
  userBinding: { envName: string; userId?: string };
  unavailableReason: string;
  missingEmailReason: string;
  missingUserReason?: string;
  unavailableClientReason: string;
  missingClientReason: string;
  networkReason: string;
  timeoutReason: string;
  noSessionReason: string;
  mismatchReason: string;
  successReason: string;
  signOutOnFailure: boolean;
}): Promise<GuardAuthBridgeStatus> {
  if (!supabaseConfigured) {
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.unavailableReason,
      checkedAt: new Date().toISOString(),
    });
  }

  if (!input.authEmail.email) {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.missingEmailReason,
      checkedAt: new Date().toISOString(),
    });
  }
  const email = input.authEmail.email;

  if (input.missingUserReason && !input.userBinding.userId) {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.missingUserReason,
      checkedAt: new Date().toISOString(),
    });
  }

  let supabase: Awaited<ReturnType<typeof getSupabaseClient>>;
  try {
    supabase = await getSupabaseClient();
  } catch {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.unavailableClientReason,
      checkedAt: new Date().toISOString(),
    });
  }

  if (!supabase) {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.missingClientReason,
      checkedAt: new Date().toISOString(),
    });
  }

  let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | { timedOut: true };

  try {
    const signInPromise = supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });
    signInPromise.catch(() => undefined);
    signInResult = await Promise.race([signInPromise, createAuthBridgeTimeout()]);
  } catch {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.networkReason,
      checkedAt: new Date().toISOString(),
    });
  }

  if ("timedOut" in signInResult) {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.timeoutReason,
      checkedAt: new Date().toISOString(),
    });
  }

  const { data, error } = signInResult;

  if (error || !data.session?.user.id) {
    if (input.signOutOnFailure) await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.noSessionReason,
      checkedAt: new Date().toISOString(),
    });
  }

  const authUserId = data.session.user.id;
  if (input.userBinding.userId && input.userBinding.userId !== authUserId) {
    await signOutSupabaseAuth();
    return saveAuthBridgeStatus(input.bridgeId, {
      ok: false,
      reason: input.mismatchReason,
      checkedAt: new Date().toISOString(),
      userId: authUserId,
    });
  }

  return saveAuthBridgeStatus(input.bridgeId, {
    ok: true,
    reason: input.successReason,
    checkedAt: new Date().toISOString(),
    userId: authUserId,
  });
}

export function getGuardAuthBridgeStatus(guardLocalId: GuardId) {
  return getStoredBridgeStatus()[guardLocalId];
}

export function getAdminAuthBridgeStatus() {
  return getStoredAuthBridgeStatus()[ADMIN_AUTH_BRIDGE_ID];
}

function saveAuthBridgeStatus(bridgeId: AuthBridgeUserId, status: GuardAuthBridgeStatus) {
  if (typeof window !== "undefined") {
    const current = getStoredAuthBridgeStatus();
    try {
      window.localStorage.setItem(AUTH_BRIDGE_STATUS_KEY, JSON.stringify({ ...current, [bridgeId]: status }));
    } catch {
      // O status e apenas diagnostico tecnico; o login local nao deve depender dele.
    }
  }

  return status;
}

function getStoredBridgeStatus(): StoredBridgeStatus {
  return getStoredAuthBridgeStatus();
}

function getStoredAuthBridgeStatus(): StoredAuthBridgeStatus {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(AUTH_BRIDGE_STATUS_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as StoredAuthBridgeStatus;
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
