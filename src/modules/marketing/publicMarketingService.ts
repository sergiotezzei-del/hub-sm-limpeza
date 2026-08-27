import {
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "../security/services/supabaseClient";
import { DEFAULT_MARKETING_CAPTURE_WINDOWS, type MarketingOccupiedCaptureSlot, type MarketingScheduleConfig } from "./marketingConfig";

export type PublicMarketingTeam = {
  id: string;
  managerName: string;
};

export type PublicMarketingOptions = {
  teams: PublicMarketingTeam[];
  contentTypes: string[];
  requestKinds: Array<"capture_edit" | "edit_only">;
};

export type PublicMarketingAvailability = {
  scheduleConfig: MarketingScheduleConfig;
  occupiedCaptureSlots: MarketingOccupiedCaptureSlot[];
};

export type PublicMarketingRequestDraft = {
  submissionId: string;
  requesterName: string;
  teamId: string;
  brokerName: string;
  hasPropertyCode: boolean;
  propertyReference: string;
  isExclusive: boolean;
  requestKind: "capture_edit" | "edit_only";
  contentTypes: string[];
  captureLocation?: string;
  preferredCaptureAt?: string;
  preferredCaptureDurationMinutes?: number | null;
  assetLink?: string;
  paidTraffic: boolean;
  requesterNotes?: string;
  urgencyRequested: boolean;
  urgencyReason?: string;
  website?: string;
  captureGroupId?: string | null;
};

export type PublicMarketingReceipt = {
  requestNumber: number;
  teamName: string;
  createdAt: string;
  captureGroupId?: string | null;
};

type PublicReceiptRow = {
  request_number: number | string;
  team_name: string;
  created_at: string;
  capture_group_id?: string | null;
};

const REQUEST_TIMEOUT_MS = 12000;

export class PublicMarketingRemoteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PublicMarketingRemoteError";
  }
}

export async function loadPublicMarketingData() {
  const optionsPromise = publicRpc<PublicMarketingOptions>("marketing_public_get_options", {});
  const availabilityPromise = publicRpc<PublicMarketingAvailability>("marketing_public_get_availability_v22", {})
    .catch(async (error) => {
      if (!(error instanceof PublicMarketingRemoteError) || error.status !== 404) throw error;
      const legacy = await publicRpc<PublicMarketingAvailability>("marketing_public_get_availability", {});
      return {
        ...legacy,
        scheduleConfig: {
          ...legacy.scheduleConfig,
          captureWindows: DEFAULT_MARKETING_CAPTURE_WINDOWS.map((window) => ({ ...window })),
        },
      };
    });
  const [options, availability] = await Promise.all([optionsPromise, availabilityPromise]);
  return { options, availability };
}

export async function submitPublicMarketingRequest(draft: PublicMarketingRequestDraft) {
  const body = {
    p_submission_id: draft.submissionId,
    p_requester_name: draft.requesterName,
    p_team_id: draft.teamId,
    p_broker_name: draft.brokerName,
    p_has_property_code: draft.hasPropertyCode,
    p_property_reference: draft.hasPropertyCode ? draft.propertyReference : null,
    p_is_exclusive: draft.isExclusive,
    p_request_kind: draft.requestKind,
    p_content_types: draft.contentTypes,
    p_capture_location: draft.requestKind === "capture_edit" ? draft.captureLocation || null : null,
    p_preferred_capture_at: draft.requestKind === "capture_edit" ? draft.preferredCaptureAt || null : null,
    p_preferred_capture_duration_minutes: draft.requestKind === "capture_edit" ? draft.preferredCaptureDurationMinutes || null : null,
    p_asset_link: draft.assetLink || null,
    p_paid_traffic: draft.paidTraffic,
    p_requester_notes: draft.requesterNotes || null,
    p_urgency_requested: draft.urgencyRequested,
    p_urgency_reason: draft.urgencyRequested ? draft.urgencyReason || null : null,
    p_website: draft.website || null,
    p_capture_group_id: draft.captureGroupId || null,
  };
  let rows: PublicReceiptRow[];
  try {
    rows = await publicRpc<PublicReceiptRow[]>("marketing_public_create_grouped_request", body);
  } catch (error) {
    if (draft.captureGroupId || !(error instanceof PublicMarketingRemoteError) || error.status !== 404) throw error;
    const { p_capture_group_id: _captureGroupId, ...legacyBody } = body;
    rows = await publicRpc<PublicReceiptRow[]>("marketing_public_create_request", legacyBody);
  }
  const row = rows?.[0];
  if (!row) throw new PublicMarketingRemoteError(500, "Não foi possível confirmar o pedido enviado.");
  return {
    requestNumber: Number(row.request_number),
    teamName: row.team_name,
    createdAt: row.created_at,
    captureGroupId: row.capture_group_id || null,
  } satisfies PublicMarketingReceipt;
}

export function getPublicMarketingErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toUpperCase();
  if (normalized.includes("MARKETING_REQUESTER_NAME_INVALID")) return "Informe o nome do corretor.";
  if (normalized.includes("MARKETING_TEAM_NOT_FOUND")) return "Selecione uma equipe ativa.";
  if (normalized.includes("MARKETING_BROKER_REQUIRED")) return "Informe o nome do corretor.";
  if (normalized.includes("MARKETING_PROPERTY_REQUIRED")) return "Informe o código do imóvel.";
  if (normalized.includes("MARKETING_EXCLUSIVITY_REQUIRED")) return "Informe se o imóvel é exclusividade.";
  if (normalized.includes("MARKETING_CONTENT_INVALID")) return "Selecione pelo menos um tipo de conteúdo válido.";
  if (normalized.includes("MARKETING_CAPTURE_LOCATION_REQUIRED")) return "Informe o local da captação.";
  if (normalized.includes("MARKETING_CAPTURE_PERIOD_LIMIT_REACHED")) return "Esse período já atingiu o limite de 2 agendamentos. Escolha outro horário ou período.";
  if (normalized.includes("MARKETING_CAPTURE_DAY_LIMIT_REACHED")) return "Esse dia já atingiu o limite de 2 agendamentos. Escolha outra data.";
  if (normalized.includes("MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED")) return "Esta saída não cabe mais no horário escolhido. Envie este imóvel em uma nova saída de captação.";
  if (normalized.includes("MARKETING_CAPTURE_GROUP_SLOT_MISMATCH")) return "Os imóveis desta saída precisam permanecer na mesma data e no mesmo horário.";
  if (normalized.includes("MARKETING_CAPTURE_GROUP_MISMATCH")) return "Os dados desta saída não correspondem ao primeiro imóvel. Inicie uma nova saída.";
  if (normalized.includes("MARKETING_CAPTURE_CONFLICT")) return "Este horário acabou de ser ocupado. Escolha outro horário disponível.";
  if (normalized.includes("MARKETING_CAPTURE_WINDOW_INVALID")) return "Escolha um horário entre 08:00 e 18:00 que comporte a duração selecionada.";
  if (normalized.includes("MARKETING_EDIT_ONLY_CAPTURE_DENIED")) return "Pedidos de somente edição não podem incluir captação.";
  if (normalized.includes("MARKETING_URGENCY_REASON_REQUIRED")) return "Explique o motivo da solicitação de urgência.";
  if (normalized.includes("MARKETING_ASSET_LINK_INVALID")) return "Informe um link válido iniciado por http:// ou https://.";
  if (error instanceof PublicMarketingRemoteError && error.status === 408) return "A conexão demorou demais. Tente novamente.";
  if (error instanceof PublicMarketingRemoteError && error.status === 0) return "Não foi possível conectar ao Marketing. Verifique a internet.";
  if (error instanceof PublicMarketingRemoteError && error.status >= 500) return "O Marketing está temporariamente indisponível. Tente novamente em alguns instantes.";
  return "Não foi possível enviar o pedido. Confira os dados e tente novamente.";
}

async function publicRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseConfigured) throw new PublicMarketingRemoteError(503, "Supabase não configurado.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new PublicMarketingRemoteError(response.status, details);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof PublicMarketingRemoteError) throw error;
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "Timeout na conexão com o Marketing."
      : error instanceof Error ? error.message : "Falha de rede.";
    throw new PublicMarketingRemoteError(error instanceof DOMException && error.name === "AbortError" ? 408 : 0, message);
  } finally {
    window.clearTimeout(timeout);
  }
}
