import type { GuardId } from "../../../types";
import type { GuardPaymentLoadState, GuardPaymentProfile, GuardPaymentRecord, GuardPaymentStatus } from "../types/payment.types";
import { getSupabaseAccessToken, SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseConfigured } from "./supabaseClient";

const PAYMENT_PROFILES_KEY = "hub-sm-guard-payment-profiles";
const PAYMENT_RECORDS_KEY = "hub-sm-guard-payment-records";
const PAYMENT_REQUEST_TIMEOUT_MS = 8000;

type GuardPaymentProfileRow = {
  id: string;
  guard_id: string;
  operational_name: string;
  payment_name: string | null;
  bank_name: string | null;
  agency: string | null;
  account_type: string | null;
  account_number: string | null;
  cpf: string | null;
  pix: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type GuardPaymentRecordRow = {
  id: string;
  payment_date: string;
  period_label: string;
  period_start: string;
  period_end: string;
  guard_id: string;
  guard_display_name: string;
  base_amount: number | string;
  holiday_extra_amount: number | string;
  shift_extra_amount: number | string;
  extra_description: string | null;
  total_amount: number | string;
  status: GuardPaymentStatus;
  notes: string | null;
  finance_message: string | null;
  created_at: string;
  updated_at: string;
};

class GuardPaymentRemoteError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super(details || `GUARD_PAYMENT_REMOTE_ERROR_${status}`);
    this.name = "GuardPaymentRemoteError";
  }
}

export async function loadGuardPaymentData(): Promise<GuardPaymentLoadState> {
  if (!supabaseConfigured) {
    return {
      profiles: getLocalPaymentProfiles(),
      records: getLocalPaymentRecords(),
      remoteReadable: false,
      remoteProtected: false,
      message: "Supabase não configurado. Fechamento salvo somente neste aparelho.",
    };
  }

  try {
    const [profilesResponse, recordsResponse] = await Promise.all([
      paymentRequest("guard_payment_profiles?select=*&order=operational_name.asc"),
      paymentRequest("guard_payment_records?select=*&order=created_at.desc&limit=100"),
    ]);
    const profiles = ((await profilesResponse.json()) as GuardPaymentProfileRow[]).map(mapPaymentProfileRow);
    const records = ((await recordsResponse.json()) as GuardPaymentRecordRow[]).map(mapPaymentRecordRow);
    saveLocalPaymentProfiles(profiles);
    saveLocalPaymentRecords(records);
    return {
      profiles,
      records,
      remoteReadable: true,
      remoteProtected: false,
      message: "Dados de pagamento carregados do Supabase.",
    };
  } catch (error) {
    return {
      profiles: getLocalPaymentProfiles(),
      records: getLocalPaymentRecords(),
      remoteReadable: false,
      remoteProtected: isPaymentRemoteProtectedError(error),
      message: isPaymentRemoteProtectedError(error)
        ? "Histórico de pagamentos protegido por RLS. Verifique a sessão Auth do Admin."
        : "Não foi possível consultar pagamentos online agora. Exibindo registros deste aparelho.",
    };
  }
}

export async function saveGuardPaymentProfile(profile: GuardPaymentProfile): Promise<{ profile: GuardPaymentProfile; message: string }> {
  const cleanProfile = normalizePaymentProfile(profile);
  const accessToken = getSupabaseAccessToken();

  if (supabaseConfigured && accessToken) {
    try {
      const response = await paymentRequest("guard_payment_profiles?on_conflict=guard_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([profileToRow(cleanProfile)]),
      });
      const row = ((await response.json()) as GuardPaymentProfileRow[])[0];
      if (row?.id) {
        const saved = mapPaymentProfileRow(row);
        upsertLocalPaymentProfile(saved);
        return { profile: saved, message: "Dados de pagamento salvos no Supabase." };
      }
    } catch (error) {
      console.error(error);
    }
  }

  const localProfile = {
    ...cleanProfile,
    id: cleanProfile.id || createId(),
    source: "Local" as const,
    updatedAt: new Date().toISOString(),
    createdAt: cleanProfile.createdAt || new Date().toISOString(),
  };
  upsertLocalPaymentProfile(localProfile);
  return { profile: localProfile, message: "Dados de pagamento salvos neste aparelho." };
}

export async function saveGuardPaymentRecords(records: GuardPaymentRecord[]): Promise<{ records: GuardPaymentRecord[]; message: string }> {
  const normalizedRecords = records.map(normalizePaymentRecord);
  const accessToken = getSupabaseAccessToken();

  if (supabaseConfigured && accessToken) {
    try {
      const response = await paymentRequest("guard_payment_records", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(normalizedRecords.map(paymentRecordToRow)),
      });
      const saved = ((await response.json()) as GuardPaymentRecordRow[]).map(mapPaymentRecordRow);
      upsertLocalPaymentRecords(saved);
      return { records: saved, message: "Fechamento salvo no histórico do Supabase." };
    } catch (error) {
      console.error(error);
    }
  }

  const now = new Date().toISOString();
  const localRecords = normalizedRecords.map((record) => ({
    ...record,
    id: record.id || createId(),
    createdAt: record.createdAt || now,
    updatedAt: now,
    source: "Local" as const,
  }));
  upsertLocalPaymentRecords(localRecords);
  return { records: localRecords, message: "Fechamento salvo no histórico deste aparelho." };
}

export async function updateGuardPaymentRecordStatus(recordId: string, status: GuardPaymentStatus): Promise<{ record?: GuardPaymentRecord; message: string }> {
  const accessToken = getSupabaseAccessToken();
  if (supabaseConfigured && accessToken) {
    try {
      const response = await paymentRequest(`guard_payment_records?id=eq.${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status }),
      });
      const row = ((await response.json()) as GuardPaymentRecordRow[])[0];
      if (row?.id) {
        const record = mapPaymentRecordRow(row);
        upsertLocalPaymentRecords([record]);
        return { record, message: "Status atualizado no Supabase." };
      }
    } catch (error) {
      console.error(error);
    }
  }

  const records = getLocalPaymentRecords();
  const updatedAt = new Date().toISOString();
  const nextRecords = records.map((record) => (record.id === recordId ? { ...record, status, updatedAt } : record));
  saveLocalPaymentRecords(nextRecords);
  return { record: nextRecords.find((record) => record.id === recordId), message: "Status atualizado neste aparelho." };
}

function paymentRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PAYMENT_REQUEST_TIMEOUT_MS);
  const accessToken = getSupabaseAccessToken();

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) throw new GuardPaymentRemoteError(response.status, await response.text());
    return response;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function profileToRow(profile: GuardPaymentProfile) {
  return {
    guard_id: profile.guardId,
    operational_name: profile.operationalName,
    payment_name: nullableText(profile.paymentName),
    bank_name: nullableText(profile.bankName),
    agency: nullableText(profile.agency),
    account_type: nullableText(profile.accountType),
    account_number: nullableText(profile.accountNumber),
    cpf: nullableText(profile.cpf),
    pix: nullableText(profile.pix),
    notes: nullableText(profile.notes),
  };
}

function paymentRecordToRow(record: GuardPaymentRecord) {
  return {
    payment_date: record.paymentDate,
    period_label: record.periodLabel,
    period_start: record.periodStart,
    period_end: record.periodEnd,
    guard_id: record.guardId,
    guard_display_name: record.guardDisplayName,
    base_amount: record.baseAmount,
    holiday_extra_amount: record.holidayExtraAmount,
    shift_extra_amount: record.shiftExtraAmount,
    extra_description: nullableText(record.extraDescription),
    total_amount: record.totalAmount,
    status: record.status,
    notes: nullableText(record.notes),
    finance_message: nullableText(record.financeMessage),
  };
}

function mapPaymentProfileRow(row: GuardPaymentProfileRow): GuardPaymentProfile {
  return {
    id: row.id,
    guardId: normalizeGuardId(row.guard_id),
    operationalName: row.operational_name,
    paymentName: row.payment_name ?? "",
    bankName: row.bank_name ?? "",
    agency: row.agency ?? "",
    accountType: row.account_type ?? "",
    accountNumber: row.account_number ?? "",
    cpf: row.cpf ?? "",
    pix: row.pix ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: "Supabase",
  };
}

function mapPaymentRecordRow(row: GuardPaymentRecordRow): GuardPaymentRecord {
  return {
    id: row.id,
    paymentDate: row.payment_date,
    periodLabel: row.period_label,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    guardId: normalizeGuardId(row.guard_id),
    guardDisplayName: row.guard_display_name,
    baseAmount: toNumber(row.base_amount),
    holidayExtraAmount: toNumber(row.holiday_extra_amount),
    shiftExtraAmount: toNumber(row.shift_extra_amount),
    extraDescription: row.extra_description ?? "",
    totalAmount: toNumber(row.total_amount),
    status: row.status,
    notes: row.notes ?? "",
    financeMessage: row.finance_message ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: "Supabase",
  };
}

function normalizePaymentProfile(profile: GuardPaymentProfile): GuardPaymentProfile {
  return {
    ...profile,
    operationalName: profile.operationalName.trim(),
    paymentName: profile.paymentName.trim(),
    bankName: profile.bankName.trim(),
    agency: profile.agency.trim(),
    accountType: profile.accountType.trim(),
    accountNumber: profile.accountNumber.trim(),
    cpf: profile.cpf.trim(),
    pix: profile.pix.trim(),
    notes: profile.notes.trim(),
  };
}

function normalizePaymentRecord(record: GuardPaymentRecord): GuardPaymentRecord {
  return {
    ...record,
    baseAmount: roundMoney(record.baseAmount),
    holidayExtraAmount: roundMoney(record.holidayExtraAmount),
    shiftExtraAmount: roundMoney(record.shiftExtraAmount),
    totalAmount: roundMoney(record.totalAmount),
  };
}

function getLocalPaymentProfiles(): GuardPaymentProfile[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(PAYMENT_PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPaymentProfileLike) : [];
  } catch {
    return [];
  }
}

function saveLocalPaymentProfiles(profiles: GuardPaymentProfile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PAYMENT_PROFILES_KEY, JSON.stringify(profiles));
}

function upsertLocalPaymentProfile(profile: GuardPaymentProfile) {
  const profiles = getLocalPaymentProfiles();
  const nextProfiles = profiles.some((current) => current.guardId === profile.guardId || current.id === profile.id)
    ? profiles.map((current) => (current.guardId === profile.guardId || current.id === profile.id ? profile : current))
    : [profile, ...profiles];
  saveLocalPaymentProfiles(nextProfiles);
}

function getLocalPaymentRecords(): GuardPaymentRecord[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(PAYMENT_RECORDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPaymentRecordLike) : [];
  } catch {
    return [];
  }
}

function saveLocalPaymentRecords(records: GuardPaymentRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PAYMENT_RECORDS_KEY, JSON.stringify(records));
}

function upsertLocalPaymentRecords(records: GuardPaymentRecord[]) {
  const currentRecords = getLocalPaymentRecords();
  const nextRecords = records.reduce((list, record) => (
    list.some((current) => current.id === record.id)
      ? list.map((current) => (current.id === record.id ? record : current))
      : [record, ...list]
  ), currentRecords);
  saveLocalPaymentRecords(nextRecords);
}

function isPaymentProfileLike(value: unknown): value is GuardPaymentProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<GuardPaymentProfile>;
  return typeof profile.id === "string" && typeof profile.guardId === "string";
}

function isPaymentRecordLike(value: unknown): value is GuardPaymentRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<GuardPaymentRecord>;
  return typeof record.id === "string" && typeof record.guardId === "string";
}

function normalizeGuardId(value: string): GuardId {
  return value === "salomao" ? "salomao" : "carlos-clemente";
}

function nullableText(value: string) {
  const cleanValue = value.trim();
  return cleanValue || null;
}

function toNumber(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function isPaymentRemoteProtectedError(error: unknown) {
  if (!(error instanceof GuardPaymentRemoteError)) return false;
  const details = error.details.toLowerCase();
  return [401, 403].includes(error.status)
    || details.includes("42501")
    || details.includes("permission denied")
    || details.includes("row-level security")
    || details.includes("rls");
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
