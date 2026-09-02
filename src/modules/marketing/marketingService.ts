import { publicSupabaseFetch, sessionAwareSupabaseFetch, SUPABASE_URL, supabaseConfigured } from "../security/services/supabaseClient";
import { DEFAULT_MARKETING_CAPTURE_WINDOWS, type MarketingOccupiedCaptureSlot, type MarketingScheduleConfig } from "./marketingConfig";

export type MarketingRole = "admin" | "marketing" | "sales_manager";
export type MarketingRequestStatus =
  | "solicitado"
  | "agendado"
  | "aguardando_edicao"
  | "em_edicao"
  | "em_aprovacao"
  | "revisao"
  | "pronto"
  | "bloqueado"
  | "cancelado";

export type MarketingContext = {
  userId: string;
  userName: string;
  role: MarketingRole;
  teamId?: string | null;
  teamName?: string | null;
};

export type MarketingTeam = {
  id: string;
  managerName: string;
  active: boolean;
  sortOrder: number;
};

export type MarketingBroker = {
  id: string;
  teamId: string;
  name: string;
  active: boolean;
};

export type MarketingRequest = {
  id: string;
  requestNumber: number;
  teamId: string;
  managerName: string;
  brokerId?: string | null;
  brokerName: string;
  hasPropertyCode: boolean;
  propertyReference: string;
  isExclusive: boolean | null;
  requestKind: "capture_edit" | "edit_only";
  contentTypes: string[];
  captureLocation?: string | null;
  preferredCaptureAt?: string | null;
  preferredCaptureDurationMinutes?: number | null;
  confirmedCaptureAt?: string | null;
  confirmedCaptureDurationMinutes?: number | null;
  assetLink?: string | null;
  paidTraffic: boolean;
  requesterNotes?: string | null;
  marketingNotes?: string | null;
  status: MarketingRequestStatus;
  assignedMarketingName?: string | null;
  promisedAt?: string | null;
  urgencyRequested: boolean;
  urgencyReason?: string | null;
  urgencyApproved: boolean;
  urgencyDecidedByName?: string | null;
  urgencyDecidedAt?: string | null;
  createdByUserId?: string | null;
  createdByName: string;
  requestSource: "hub" | "public";
  publicRequesterName?: string | null;
  captureGroupId?: string | null;
  captureGroupSize?: number;
  captureGroupRequestIds?: string[];
  captureGroupRequestNumbers?: number[];
  managerReviewStatus?: MarketingManagerReviewStatus | null;
  managerReviewUpdatedAt?: string | null;
  specialCaptureAt?: string | null;
  specialCaptureReason?: string | null;
  specialCaptureStatus?: "pending" | "approved" | "rejected" | null;
  specialCaptureDecidedByName?: string | null;
  specialCaptureDecidedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingRequestEvent = {
  id: string;
  eventType: string;
  fromStatus?: MarketingRequestStatus | null;
  toStatus?: MarketingRequestStatus | null;
  actorUserId?: string | null;
  actorName?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type MarketingDeletedRequest = MarketingRequest & {
  deletedAt: string;
  deletedByUserId: string;
  deletedByName: string;
  deletionReason: string;
  events: MarketingRequestEvent[];
};

export type MarketingAccess = {
  managedUserId: string;
  userName: string;
  role: MarketingRole;
  teamId?: string | null;
  active: boolean;
};

export type MarketingAvailableUser = {
  id: string;
  name: string;
  jobTitle?: string | null;
  department?: string | null;
  active: boolean;
};

export type MarketingNotification = {
  id: string;
  recipientUserId: string;
  requestId: string;
  requestNumber: number;
  brokerName: string;
  type: string;
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
};

export type MarketingQueueOverrideRequest = {
  id: string;
  requestId: string;
  requestNumber: number;
  brokerName: string;
  managerName: string;
  blockingRequestId?: string | null;
  blockingRequestNumber?: number | null;
  requestedByUserId: string;
  requestedByName: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedByUserId?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  consumedAt?: string | null;
  createdAt: string;
};

export type MarketingManagerReviewStatus = "pending" | "confirmed" | "modified" | "declined";

export type MarketingManagerReviewReason =
  | "property_code_divergent"
  | "incomplete_request"
  | "incorrect_service"
  | "capture_confirmation"
  | "content_validation"
  | "other";

export type MarketingManagerReview = {
  id: string;
  requestId: string;
  requestNumber: number;
  teamId: string;
  managerName: string;
  brokerName: string;
  propertyLabel: string;
  openedByUserId: string;
  openedByName: string;
  reason: MarketingManagerReviewReason;
  details: string;
  status: MarketingManagerReviewStatus;
  managerUserId: string;
  reviewManagerName?: string | null;
  managerResponse?: string | null;
  decidedAt?: string | null;
  returnStatus: MarketingRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type MarketingDashboard = {
  context: MarketingContext;
  teams: MarketingTeam[];
  brokers: MarketingBroker[];
  requests: MarketingRequest[];
  access: MarketingAccess[];
  availableUsers: MarketingAvailableUser[];
  notifications: MarketingNotification[];
  queueOverrideRequests: MarketingQueueOverrideRequest[];
  managerReviews: MarketingManagerReview[];
  deletedRequests: MarketingDeletedRequest[];
  occupiedCaptureSlots: MarketingOccupiedCaptureSlot[];
  scheduleConfig: MarketingScheduleConfig;
};

type MarketingOperationSchedule = {
  scheduleConfig: MarketingScheduleConfig;
  occupiedCaptureSlots: MarketingOccupiedCaptureSlot[];
  captureGroups: Array<{
    captureGroupId: string;
    requestIds: string[];
    requestNumbers: Array<number | string>;
  }>;
};

export type MarketingSession = {
  sessionToken: string;
  userId: string;
  expiresAt: string;
};

export type MarketingRequestDraft = {
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
};

const REQUEST_TIMEOUT_MS = 12000;

export class MarketingRemoteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "MarketingRemoteError";
  }
}

export async function startMarketingSession(accessCode: string): Promise<MarketingSession> {
  const rows = await rpc<Array<{ session_token: string; user_id: string; expires_at: string }>>(
    "marketing_start_session",
    { p_access_code: accessCode },
    true,
  );
  const session = rows?.[0];
  if (!session?.session_token || !session.user_id) {
    throw new MarketingRemoteError(403, "MARKETING_ACCESS_DENIED");
  }
  return {
    sessionToken: session.session_token,
    userId: session.user_id,
    expiresAt: session.expires_at,
  };
}

export async function endMarketingSession(sessionToken: string) {
  if (!sessionToken) return;
  await rpc<unknown>("marketing_end_session", { p_session_token: sessionToken });
}

export async function getMarketingDashboard(sessionToken: string): Promise<MarketingDashboard> {
  const dashboard = await rpc<MarketingDashboard>("marketing_v2_get_dashboard_review", { p_session_token: sessionToken });
  let operation: MarketingOperationSchedule;
  try {
    operation = await rpc<MarketingOperationSchedule>("marketing_v2_get_operation_schedule", { p_session_token: sessionToken });
  } catch (error) {
    if (!(error instanceof MarketingRemoteError) || error.status !== 404) throw error;
    return {
      ...dashboard,
      scheduleConfig: {
        ...dashboard.scheduleConfig,
        captureWindows: DEFAULT_MARKETING_CAPTURE_WINDOWS.map((window) => ({ ...window })),
      },
    };
  }
  const groups = new Map(operation.captureGroups.map((group) => [group.captureGroupId, group]));
  const groupsByRequest = new Map(
    operation.captureGroups.flatMap((group) => group.requestIds.map((requestId) => [requestId, group] as const)),
  );
  const enrichRequest = (request: MarketingRequest): MarketingRequest => {
    const group = request.captureGroupId ? groups.get(request.captureGroupId) : groupsByRequest.get(request.id);
    if (!group) return request;
    return {
      ...request,
      captureGroupId: group.captureGroupId,
      captureGroupSize: group.requestIds.length,
      captureGroupRequestIds: group.requestIds,
      captureGroupRequestNumbers: group.requestNumbers.map(Number),
    };
  };
  return {
    ...dashboard,
    scheduleConfig: operation.scheduleConfig,
    occupiedCaptureSlots: operation.occupiedCaptureSlots,
    requests: dashboard.requests.map(enrichRequest),
    deletedRequests: dashboard.deletedRequests.map(enrichRequest) as MarketingDeletedRequest[],
  };
}

export async function createMarketingRequest(sessionToken: string, draft: MarketingRequestDraft) {
  return rpc<Array<{ request_id: string; request_number: number }>>("marketing_v2_create_request", {
    p_session_token: sessionToken,
    p_team_id: draft.teamId,
    p_broker_name: draft.brokerName,
    p_has_property_code: draft.hasPropertyCode,
    p_property_reference: draft.propertyReference,
    p_is_exclusive: draft.isExclusive,
    p_request_kind: draft.requestKind,
    p_content_types: draft.contentTypes,
    p_capture_location: draft.captureLocation || null,
    p_preferred_capture_at: toIsoOrNull(draft.preferredCaptureAt),
    p_preferred_capture_duration_minutes: draft.preferredCaptureDurationMinutes || null,
    p_asset_link: draft.assetLink || null,
    p_paid_traffic: draft.paidTraffic,
    p_requester_notes: draft.requesterNotes || null,
    p_urgency_requested: draft.urgencyRequested,
    p_urgency_reason: draft.urgencyReason || null,
  });
}

export async function updateMarketingRequest(
  sessionToken: string,
  requestId: string,
  action: "save_management" | "approve_urgency" | "reject_urgency" | "cancel",
  payload: Record<string, unknown> = {},
) {
  const body = { p_session_token: sessionToken, p_request_id: requestId, p_action: action, p_payload: payload };
  try {
    await rpc<unknown>("marketing_v2_update_request_grouped", body);
  } catch (error) {
    if (!(error instanceof MarketingRemoteError) || error.status !== 404) throw error;
    await rpc<unknown>("marketing_v2_update_request", body);
  }
}

export async function adminUpdateMarketingRequest(
  sessionToken: string,
  requestId: string,
  payload: Record<string, unknown>,
) {
  return rpc<Record<string, { from: unknown; to: unknown }>>("marketing_v2_admin_update_request", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_payload: payload,
  });
}

export async function adminDeleteMarketingRequest(sessionToken: string, requestId: string, reason: string) {
  await rpc<unknown>("marketing_v2_admin_delete_request", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_reason: reason,
  });
}

export async function adminRestoreMarketingRequest(sessionToken: string, requestId: string) {
  await rpc<unknown>("marketing_v2_admin_restore_request", {
    p_session_token: sessionToken,
    p_request_id: requestId,
  });
}

export async function rescheduleMarketingRequest(sessionToken: string, requestId: string) {
  await rpc<unknown>("marketing_v2_reschedule_request", {
    p_session_token: sessionToken,
    p_request_id: requestId,
  });
}

export async function requestMarketingPeriodException(
  sessionToken: string,
  requestId: string,
  specialCaptureAt: string,
  reason: string,
) {
  await rpc<unknown>("marketing_v2_request_period_exception", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_special_capture_at: specialCaptureAt,
    p_reason: reason,
  });
}

export async function decideMarketingPeriodException(
  sessionToken: string,
  requestId: string,
  decision: "approved" | "rejected",
) {
  await rpc<unknown>("marketing_v2_decide_special_capture", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_decision: decision,
  });
}

export async function requestMarketingQueueOverride(sessionToken: string, requestId: string, reason: string) {
  return rpc<string>("marketing_v2_request_queue_override", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_reason: reason,
  });
}

export async function decideMarketingQueueOverride(
  sessionToken: string,
  overrideRequestId: string,
  decision: "approved" | "rejected",
) {
  await rpc<unknown>("marketing_v2_decide_queue_override", {
    p_session_token: sessionToken,
    p_override_request_id: overrideRequestId,
    p_decision: decision,
  });
}

export async function markMarketingNotificationsRead(sessionToken: string, notificationIds?: string[]) {
  return rpc<number>("marketing_v2_mark_notifications_read", {
    p_session_token: sessionToken,
    p_notification_ids: notificationIds?.length ? notificationIds : null,
  });
}

export async function openMarketingManagerReview(
  sessionToken: string,
  requestId: string,
  reason: MarketingManagerReviewReason,
  details: string,
) {
  return rpc<string>("marketing_v2_open_manager_review", {
    p_session_token: sessionToken,
    p_request_id: requestId,
    p_reason: reason,
    p_details: details,
  });
}

export async function resolveMarketingManagerReview(
  sessionToken: string,
  reviewId: string,
  decision: "confirmed" | "modified" | "declined",
  managerResponse?: string,
  corrections: Record<string, unknown> = {},
) {
  await rpc<unknown>("marketing_v2_resolve_manager_review", {
    p_session_token: sessionToken,
    p_review_id: reviewId,
    p_decision: decision,
    p_manager_response: managerResponse || null,
    p_corrections: corrections,
  });
}

export async function saveMarketingAccess(
  sessionToken: string,
  input: { managedUserId: string; role: MarketingRole; teamId?: string | null; active?: boolean },
) {
  await rpc<unknown>("marketing_session_save_access", {
    p_session_token: sessionToken,
    p_managed_user_id: input.managedUserId,
    p_role: input.role,
    p_team_id: input.role === "sales_manager" ? input.teamId || null : null,
    p_active: input.active ?? true,
  });
}

export function getMarketingErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toUpperCase();
  if (normalized.includes("MARKETING_ACCESS_DENIED")) return "Este usuário ainda não tem acesso ao Marketing.";
  if (normalized.includes("MARKETING_SESSION_EXPIRED")) return "Sua sessão do Marketing expirou. Entre novamente no HUB.";
  if (normalized.includes("MARKETING_SESSION_MISMATCH")) return "A sessão do Marketing não corresponde ao usuário atual.";
  if (normalized.includes("MARKETING_AUTH_REQUIRED")) return "A sessão segura do administrador não está disponível. Entre novamente no HUB.";
  if (normalized.includes("MARKETING_CREATE_DENIED")) return "Seu acesso permite acompanhar o Marketing, mas não criar pedidos.";
  if (normalized.includes("MARKETING_TEAM_DENIED")) return "O gerente só pode abrir pedidos para a própria equipe.";
  if (normalized.includes("MARKETING_BROKER_REQUIRED")) return "Informe o nome do corretor.";
  if (normalized.includes("MARKETING_PROPERTY_REQUIRED")) return "Informe o código ou a descrição do imóvel.";
  if (normalized.includes("MARKETING_EXCLUSIVITY_REQUIRED")) return "Informe se o imóvel é exclusividade.";
  if (normalized.includes("MARKETING_CONTENT_REQUIRED")) return "Selecione pelo menos um tipo de conteúdo.";
  if (normalized.includes("MARKETING_URGENCY_REASON_REQUIRED")) return "Explique o motivo do pedido de urgência.";
  if (normalized.includes("MARKETING_ADMIN_REQUIRED")) return "Somente o administrador do Marketing pode realizar esta ação.";
  if (normalized.includes("MARKETING_RESCHEDULE_DENIED")) return "Somente Maria e Arthur podem reagendar pedidos do Marketing.";
  if (normalized.includes("MARKETING_RESCHEDULE_CAPTURE_ONLY")) return "Somente pedidos com captação podem ser reagendados.";
  if (normalized.includes("MARKETING_RESCHEDULE_NOT_SCHEDULED")) return "Este pedido não está mais agendado. Atualize o Marketing e confira a fila.";
  if (normalized.includes("MARKETING_SPECIAL_REQUEST_DENIED")) return "Somente Maria e Arthur podem solicitar uma exceção de agenda.";
  if (normalized.includes("MARKETING_SPECIAL_DECISION_DENIED")) return "Somente Sérgio Tezzei pode aprovar ou negar esta exceção de agenda.";
  if (normalized.includes("MARKETING_SPECIAL_REASON_REQUIRED")) return "Explique o motivo da emergência com pelo menos 5 caracteres.";
  if (normalized.includes("MARKETING_SPECIAL_TIME_INVALID")) return "Escolha uma data e horário futuros.";
    if (normalized.includes("MARKETING_SPECIAL_PERIOD_NOT_RESERVED")) return "Esse período está livre. Use o agendamento normal; para outro horário, escolha Fora do padrão.";
  if (normalized.includes("MARKETING_SPECIAL_EXACT_CONFLICT")) return "Já existe uma captação ocupando esse horário. Escolha outro horário.";
  if (normalized.includes("MARKETING_SPECIAL_ALREADY_PENDING")) return "Já existe uma exceção aguardando autorização para este pedido.";
  if (normalized.includes("MARKETING_SPECIAL_NOT_PENDING")) return "Esta exceção já foi analisada ou não está mais pendente.";
  if (normalized.includes("MARKETING_TEAM_REQUIRED")) return "Escolha a equipe deste gerente.";
  if (normalized.includes("MARKETING_USER_NOT_FOUND")) return "O usuário do HUB não foi encontrado ou está inativo.";
  if (normalized.includes("MARKETING_REQUEST_NOT_FOUND")) return "Este pedido não foi encontrado.";
  if (normalized.includes("MARKETING_REQUEST_DELETED")) return "Este pedido foi excluído da operação e não pode mais ser alterado.";
  if (normalized.includes("MARKETING_ADMIN_UPDATE_NO_CHANGES")) return "Nenhum campo do pedido foi alterado.";
  if (normalized.includes("MARKETING_ADMIN_FIELD_DENIED")) return "A edição tentou alterar um campo interno do Marketing.";
  if (normalized.includes("MARKETING_ADMIN_KIND_CONFIRMED_CAPTURE_DENIED")) return "Retire a captação confirmada no controle operacional antes de mudar para somente edição.";
  if (normalized.includes("MARKETING_DELETION_REASON_REQUIRED")) return "Informe o motivo da exclusão com pelo menos 5 caracteres.";
  if (normalized.includes("MARKETING_REQUEST_ALREADY_DELETED")) return "Este pedido já está na área de excluídos.";
  if (normalized.includes("MARKETING_REQUEST_NOT_DELETED")) return "Este pedido não está excluído.";
  if (normalized.includes("MARKETING_RESTORE_CAPTURE_CONFLICT")) return "Este pedido possui uma captação confirmada que agora conflita com outro horário. Ajuste a agenda antes de restaurar.";
  if (normalized.includes("MARKETING_RESTORE_TEAM_INACTIVE")) return "A equipe deste pedido está inativa. Reative a equipe antes de restaurar.";
  if (normalized.includes("MARKETING_RESTORE_KIND_INVALID") || normalized.includes("MARKETING_RESTORE_DATA_INVALID")) return "Os dados deste pedido não atendem mais às regras atuais e impedem a restauração.";
  if (normalized.includes("MARKETING_QUEUE_ORDER_BLOCKED")) return "Existe um pedido anterior aguardando atendimento. A fila deve ser seguida na ordem de entrada.";
  if (normalized.includes("MARKETING_CAPTURE_CONFLICT")) return "Este horário já possui outra captação agendada.";
  if (normalized.includes("MARKETING_CAPTURE_DURATION_REQUIRED")) return "Escolha a data, o horário e a duração da captação.";
  if (normalized.includes("MARKETING_CAPTURE_WINDOW_INVALID")) return "Escolha um horário disponível dentro da agenda do Marketing.";
  if (normalized.includes("MARKETING_EDIT_ONLY_CAPTURE_DENIED")) return "Pedidos de somente edição não podem ter captação confirmada.";
  if (normalized.includes("MARKETING_ASSIGNEE_INVALID")) return "Escolha Maria ou Arthur como responsável do Marketing.";
  if (normalized.includes("MARKETING_OVERRIDE_REASON_REQUIRED")) return "Informe o motivo para alterar a ordem da fila.";
  if (normalized.includes("MARKETING_OVERRIDE_ALREADY_PENDING")) return "Já existe uma solicitação de autorização pendente para este pedido.";
  if (normalized.includes("MARKETING_OVERRIDE_NOT_NEEDED")) return "Este pedido já pode seguir a ordem normal da fila.";
  if (normalized.includes("MARKETING_OVERRIDE_REQUEST_DENIED")) return "Somente a equipe de Marketing pode solicitar alteração da fila.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_ALREADY_PENDING")) return "Este pedido já está aguardando conferência do gerente.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_DETAILS_REQUIRED")) return "Descreva o problema para o gerente com pelo menos 5 caracteres.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_MANAGER_NOT_FOUND")) return "A equipe ainda não possui um gerente ativo vinculado ao Marketing.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_PENDING")) return "Este pedido está bloqueado enquanto aguarda a conferência do gerente.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_DECLINE_REASON_REQUIRED")) return "Informe o motivo para declinar o pedido.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_NO_CHANGES")) return "Altere pelo menos um dado operacional antes de salvar a correção.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW_FIELD_DENIED")) return "A correção tentou alterar um campo interno do Marketing.";
  if (normalized.includes("MARKETING_URGENCY_ALREADY_DECIDED")) return "A urgência já foi decidida internamente e não pode ser alterada nesta conferência.";
  if (normalized.includes("MARKETING_REVIEW_KIND_CONFIRMED_CAPTURE_DENIED")) return "O Marketing precisa retirar a captação confirmada antes de mudar este pedido para somente edição.";
  if (normalized.includes("MARKETING_MANAGER_REVIEW")) return "Não foi possível concluir a conferência deste pedido.";
  if (normalized.includes("MARKETING_UPDATE_DENIED") || normalized.includes("MARKETING_REQUEST_DENIED")) return "Você não tem permissão para alterar este pedido.";
  if (error instanceof MarketingRemoteError && error.status === 0) return "Não foi possível conectar ao Marketing. Verifique a internet.";
  return "Não foi possível concluir a operação no Marketing.";
}

export function isMarketingError(error: unknown, code: string) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw.toUpperCase().includes(code.toUpperCase());
}

function toIsoOrNull(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function rpc<T>(name: string, body: Record<string, unknown>, sessionAware = false): Promise<T> {
  if (!supabaseConfigured) throw new MarketingRemoteError(0, "Supabase não configurado.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const transport = sessionAware ? sessionAwareSupabaseFetch : publicSupabaseFetch;
    const response = await transport(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new MarketingRemoteError(response.status, details);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof MarketingRemoteError) throw error;
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "Timeout na conexão com o Marketing."
      : error instanceof Error ? error.message : "Falha de rede.";
    throw new MarketingRemoteError(0, message);
  } finally {
    window.clearTimeout(timeout);
  }
}
