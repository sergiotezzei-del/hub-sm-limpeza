import {
  authenticatedSupabaseFetch,
  publicSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";
import type {
  AuditorioAvailability,
  AuditorioDashboard,
  AuditorioDecision,
  AuditorioReservation,
  PublicAuditorioReceipt,
  PublicAuditorioRequestDraft,
  PublicAuditorioStatus,
} from "../types/auditorio.types";

const REQUEST_TIMEOUT_MS = 12000;

type PublicReceiptRow = {
  reserva_id: string;
  protocolo: number | string;
  created_at: string;
  status: PublicAuditorioReceipt["status"];
};

export class AuditorioRemoteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details = "",
  ) {
    super(message);
    this.name = "AuditorioRemoteError";
  }
}

export async function loadPublicAuditorioAvailability(year: number, month: number): Promise<AuditorioAvailability> {
  const data = await publicRpc<AuditorioAvailability>("auditorio_public_get_availability", {
    p_year: year,
    p_month: month,
  });

  return {
    monthStart: data.monthStart,
    monthEnd: data.monthEnd,
    timezone: data.timezone || "America/Sao_Paulo",
    dayStart: data.dayStart || "08:00",
    dayEnd: data.dayEnd || "22:00",
    timeStepMinutes: Number(data.timeStepMinutes || 30),
    reservedSlots: Array.isArray(data.reservedSlots) ? data.reservedSlots : [],
  };
}

export async function submitPublicAuditorioRequest(draft: PublicAuditorioRequestDraft): Promise<PublicAuditorioReceipt> {
  const rows = await publicRpc<PublicReceiptRow[]>("auditorio_public_create_reserva", {
    p_submission_id: draft.submissionId,
    p_public_access_code: draft.accessCode,
    p_solicitante_nome: draft.requesterName,
    p_solicitante_telefone: draft.requesterPhone,
    p_solicitante_email: draft.requesterEmail || null,
    p_solicitante_setor: draft.requesterDepartment || null,
    p_solicitante_empresa: draft.requesterCompany || null,
    p_tipo_evento: draft.eventType,
    p_nome_evento: draft.eventName,
    p_nome_lancamento: draft.eventType === "lancamento" ? draft.launchName || null : null,
    p_construtora: draft.eventType === "lancamento" ? draft.builderName || null : null,
    p_data_evento: draft.eventDate,
    p_horario_montagem: draft.setupTime,
    p_horario_inicio: draft.startTime,
    p_horario_fim: draft.endTime,
    p_horario_desmontagem: draft.teardownTime,
    p_quantidade_pessoas: draft.peopleCount,
    p_tipo_alimentacao: draft.foodType,
    p_responsavel_alimentacao: draft.foodType === "nao" ? null : draft.foodResponsible || null,
    p_responsavel_alimentacao_outro: draft.foodResponsible === "outro" ? draft.foodResponsibleOther || null : null,
    p_precisa_projetor: draft.needsProjector,
    p_precisa_microfone: draft.needsMicrophone,
    p_precisa_som: draft.needsSound,
    p_precisa_cadeiras: draft.needsChairs,
    p_precisa_mesas: draft.needsTables,
    p_necessidades_especiais: draft.specialNeeds || null,
    p_observacoes: draft.notes || null,
    p_website: draft.website || null,
  });

  const row = rows?.[0];
  if (!row) throw new AuditorioRemoteError(500, "Não foi possível confirmar a solicitação enviada.");

  const protocolNumber = Number(row.protocolo);
  return {
    reservationId: row.reserva_id,
    protocolNumber,
    protocol: formatAuditorioProtocol(protocolNumber, row.created_at),
    createdAt: row.created_at,
    status: row.status,
    accessCode: draft.accessCode,
  };
}

export async function getPublicAuditorioStatus(protocolInput: string, accessCode: string): Promise<PublicAuditorioStatus> {
  const protocolNumber = parseAuditorioProtocol(protocolInput);
  if (!protocolNumber) {
    throw new AuditorioRemoteError(400, "Informe um protocolo válido.");
  }

  return publicRpc<PublicAuditorioStatus>("auditorio_public_get_reserva", {
    p_protocolo: protocolNumber,
    p_codigo_consulta: accessCode,
  });
}

export async function loadAuditorioDashboard(): Promise<AuditorioDashboard> {
  const data = await adminRpc<AuditorioDashboard>("auditorio_admin_get_dashboard", {});
  return {
    reservations: Array.isArray(data.reservations) ? data.reservations : [],
    events: Array.isArray(data.events) ? data.events : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    generatedAt: data.generatedAt || new Date().toISOString(),
  };
}

export async function decideAuditorioReservation(input: {
  reservationId: string;
  decision: AuditorioDecision;
  actorUserId: string;
  actorName: string;
  note?: string;
}): Promise<Partial<AuditorioReservation>> {
  return adminRpc<Partial<AuditorioReservation>>("auditorio_admin_decidir_reserva", {
    p_reserva_id: input.reservationId,
    p_decisao: input.decision,
    p_actor_user_id: input.actorUserId,
    p_actor_name: input.actorName,
    p_observacao: input.note || null,
  });
}

export async function markAuditorioNotificationsRead(notificationIds?: string[]) {
  return adminRpc<number>("auditorio_admin_marcar_notificacoes_lidas", {
    p_notification_ids: notificationIds && notificationIds.length > 0 ? notificationIds : null,
  });
}

export function getPublicAuditorioErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = normalize(raw);

  if (normalized.includes("AUDITORIO_RESERVA_CONFLITO")) {
    return extractConflictMessage(raw) || "Esse período já possui reserva aprovada. Escolha outro horário.";
  }
  if (normalized.includes("AUDITORIO_SOLICITANTE_NOME_REQUIRED")) return "Informe o nome do solicitante.";
  if (normalized.includes("AUDITORIO_SOLICITANTE_TELEFONE_REQUIRED")) return "Informe o telefone ou WhatsApp.";
  if (normalized.includes("AUDITORIO_NOME_EVENTO_REQUIRED")) return "Informe o nome do evento.";
  if (normalized.includes("AUDITORIO_DATA_INVALIDA")) return "Escolha uma data válida.";
  if (normalized.includes("AUDITORIO_HORARIOS")) return "Confira os horários de montagem, evento e desmontagem.";
  if (normalized.includes("AUDITORIO_QUANTIDADE_INVALIDA")) return "Informe a quantidade estimada de pessoas.";
  if (normalized.includes("AUDITORIO_LANCAMENTO_DADOS_REQUIRED")) return "Informe o nome do lançamento e a construtora.";
  if (normalized.includes("AUDITORIO_ALIMENTACAO_RESPONSAVEL_REQUIRED")) return "Informe quem será responsável pela alimentação.";
  if (normalized.includes("AUDITORIO_ALIMENTACAO_OUTRO_REQUIRED")) return "Descreva o responsável pela alimentação.";
  if (normalized.includes("AUDITORIO_SOLICITACAO_NAO_ENCONTRADA")) return "Não encontramos uma solicitação com esse protocolo e código.";
  if (normalized.includes("AUDITORIO_CODIGO_CONSULTA_INVALIDO")) return "Informe o código de consulta.";
  if (error instanceof AuditorioRemoteError && error.status === 408) return "A conexão demorou demais. Verifique a internet e tente novamente.";
  if (error instanceof AuditorioRemoteError && error.status === 0) return "Não foi possível conectar ao Supabase. Verifique a internet.";
  if (error instanceof AuditorioRemoteError && error.status >= 500) return "O agendamento está temporariamente indisponível. Tente novamente em instantes.";
  return raw || "Não foi possível concluir a solicitação.";
}

export function getAdminAuditorioErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = normalize(raw);

  if (normalized.includes("AUDITORIO_RESERVA_CONFLITO")) {
    return extractConflictMessage(raw) || "Existe conflito com outra reserva aprovada.";
  }
  if (normalized.includes("AUDITORIO_ACESSO_NEGADO") || normalized.includes("ROW-LEVEL SECURITY")) {
    return "Você não tem permissão para acessar o módulo Auditório.";
  }
  if (normalized.includes("JWT EXPIRED")) return "Sua sessão expirou. Entre novamente para continuar.";
  if (normalized.includes("JWT ISSUED AT FUTURE")) return "O serviço de autenticação recusou temporariamente o horário do token. Tente novamente.";
  if (normalized.includes("AUDITORIO_RESERVA_APROVADA_USE_CANCELAR")) return "Reserva aprovada deve ser cancelada, não recusada.";
  if (normalized.includes("AUDITORIO_RESERVA_NAO_CANCELAVEL")) return "Esta solicitação não pode mais ser cancelada.";
  if (normalized.includes("AUDITORIO_RESERVA_NAO_CONCLUIVEL")) return "Somente reservas aprovadas podem ser concluídas.";
  if (error instanceof AuditorioRemoteError && (error.status === 401 || error.status === 403)) return "Sua sessão administrativa expirou. Entre novamente.";
  if (error instanceof AuditorioRemoteError && error.status === 408) return "A conexão demorou demais. Verifique a internet e tente novamente.";
  if (error instanceof AuditorioRemoteError && error.status >= 500) return "O Supabase apresentou uma falha temporária. Tente novamente.";
  return raw || "Não foi possível concluir a operação.";
}

export function formatAuditorioProtocol(protocolNumber: number, createdAt: string) {
  const year = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(createdAt));
  return `AUD-${year}-${String(protocolNumber).padStart(6, "0")}`;
}

export function parseAuditorioProtocol(value: string) {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/(?:AUD-)?(?:\d{4}-)?(\d{1,12})$/);
  const parsed = Number(match?.[1] ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function publicRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return rpc<T>(name, body, false);
}

async function adminRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return rpc<T>(name, body, true);
}

async function rpc<T>(name: string, body: Record<string, unknown>, authenticated: boolean): Promise<T> {
  if (!supabaseConfigured) throw new AuditorioRemoteError(503, "Supabase não configurado.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await (authenticated ? authenticatedSupabaseFetch : publicSupabaseFetch)(
      `${SUPABASE_URL}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const details = await response.text();
      throw new AuditorioRemoteError(response.status, extractRemoteMessage(details), details);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof AuditorioRemoteError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new AuditorioRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AuditorioRemoteError(408, "Tempo limite da conexão excedido.");
    }
    throw new AuditorioRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function extractRemoteMessage(details: string) {
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const extra = typeof parsed.details === "string"
      ? parsed.details
      : typeof parsed.hint === "string"
        ? parsed.hint
        : "";
    return [message, extra].filter(Boolean).join(" — ") || details;
  } catch {
    return details;
  }
}

function extractConflictMessage(raw: string) {
  const marker = "AUDITORIO_RESERVA_CONFLITO:";
  const index = raw.toUpperCase().indexOf(marker);
  if (index < 0) return "";
  return raw.slice(index + marker.length).replace(/[{}"]/g, "").trim();
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
