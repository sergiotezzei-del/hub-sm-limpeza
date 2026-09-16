import { getSupabaseClient, authenticatedSupabaseFetch, SupabaseAuthSessionRequiredError, SUPABASE_URL, supabaseConfigured } from "../../security/services/supabaseClient";
import { loadPatrimonyDataset } from "./patrimonyService";
import type {
  PatrimonyDataset,
  PatrimonyReturnCondition,
  UniformDeliveryBatch,
  UniformDeliveryBatchItem,
  UniformDeliveryTerm,
  UniformTermAttachment,
  UniformTermTemplateVersion,
} from "../types/patrimony.types";

const REQUEST_TIMEOUT_MS = 12000;
const SIGNED_TERMS_BUCKET = "uniform-signed-terms";

type TemplateRow = {
  version: string;
  name: string;
  source_file_name: string;
  source_sha256: string;
  source_docx_path: string;
  print_template_path: string;
  logo_path: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type BatchRow = {
  id: string;
  person_id: string;
  delivered_at: string;
  delivered_by_name: string;
  notes: string | null;
  status: UniformDeliveryBatch["status"];
  created_at: string;
  updated_at: string;
};

type BatchItemRow = {
  id: string;
  batch_id: string;
  patrimony_assignment_id: string;
  item_id: string;
  quantity: number | string;
  observation: string | null;
  active: boolean | null;
  corrected_at: string | null;
  corrected_by_name: string | null;
  correction_reason: string | null;
  created_at: string;
};

type TermRow = {
  id: string;
  batch_id: string;
  template_version: string;
  generated_at: string;
  printed_at: string | null;
  status: UniformDeliveryTerm["status"];
  signed_document_path: string | null;
  signed_uploaded_at: string | null;
  signed_uploaded_by_name: string | null;
  replaced_by_term_id: string | null;
  replaced_at: string | null;
  replaced_by_name: string | null;
  replacement_reason: string | null;
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  term_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size: number | string;
  version: number;
  active: boolean;
  uploaded_at: string;
  uploaded_by_name: string;
  notes: string | null;
  created_at: string;
};

export type UniformsDataset = {
  patrimony: PatrimonyDataset;
  templates: UniformTermTemplateVersion[];
  batches: UniformDeliveryBatch[];
  batchItems: UniformDeliveryBatchItem[];
  terms: UniformDeliveryTerm[];
  attachments: UniformTermAttachment[];
};

export type UniformDeliveryLineInput = {
  itemId: string;
  quantity: number;
  observation?: string;
};

export type UniformDeliveryCorrectionMode = "correcao_administrativa" | "troca_fisica";

export type UniformDeliveryCorrectionResult = {
  correctionId: string;
  batchId: string;
  termId: string;
  createdNewBatch: boolean;
  termStatus: string;
};

export class UniformsRemoteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details = "",
  ) {
    super(message);
    this.name = "UniformsRemoteError";
  }
}

export async function loadUniformsDataset(): Promise<UniformsDataset> {
  const [patrimony, templates, batches, batchItems, terms, attachments] = await Promise.all([
    loadPatrimonyDataset(),
    requestJson<TemplateRow[]>("uniform_term_template_versions?select=*&order=active.desc,version.desc"),
    requestJson<BatchRow[]>("uniform_delivery_batches?select=*&order=delivered_at.desc&limit=250"),
    requestJson<BatchItemRow[]>("uniform_delivery_batch_items?select=*&order=created_at.desc&limit=800"),
    requestJson<TermRow[]>("uniform_delivery_terms?select=*&order=generated_at.desc&limit=250"),
    requestJson<AttachmentRow[]>("uniform_term_attachments?select=*&order=uploaded_at.desc&limit=500"),
  ]);

  return {
    patrimony,
    templates: templates.map(mapTemplate),
    batches: batches.map(mapBatch),
    batchItems: batchItems.map(mapBatchItem),
    terms: terms.map(mapTerm),
    attachments: attachments.map(mapAttachment),
  };
}

export async function registerUniformDeliveryBatch(input: {
  batchId?: string;
  termId?: string;
  personId: string;
  items: UniformDeliveryLineInput[];
  actorName: string;
  notes?: string;
  templateVersion?: string;
}) {
  const rows = await requestJson<Array<{ batch_id: string; term_id: string; total_quantity: number | string }>>(
    "rpc/register_uniform_delivery_batch",
    {
      method: "POST",
      body: JSON.stringify({
        p_batch_id: input.batchId ?? crypto.randomUUID(),
        p_term_id: input.termId ?? crypto.randomUUID(),
        p_person_id: input.personId,
        p_items: input.items.map((item) => ({
          item_id: item.itemId,
          quantity: item.quantity,
          observation: cleanOptional(item.observation),
        })),
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
        p_template_version: input.templateVersion ?? "V5",
      }),
    },
  );
  return rows[0];
}

export async function returnUniformAssignment(input: {
  operationId?: string;
  assignmentId: string;
  quantity: number;
  condition: PatrimonyReturnCondition;
  actorName: string;
  reason: string;
}) {
  const rows = await requestJson<Array<{ assignment_id: string; item_status: string; available_quantity: number | string }>>(
    "rpc/return_uniform_assignment",
    {
      method: "POST",
      body: JSON.stringify({
        p_return_movement_id: input.operationId ?? crypto.randomUUID(),
        p_assignment_id: input.assignmentId,
        p_quantity: input.quantity,
        p_condition: input.condition,
        p_actor_name: input.actorName,
        p_reason: input.reason.trim(),
      }),
    },
  );
  return rows[0];
}

export async function correctUniformDeliveryPerson(input: {
  correctionId?: string;
  batchId: string;
  newPersonId: string;
  reason: string;
  actorName: string;
  newBatchId?: string;
  newTermId?: string;
  templateVersion?: string;
}) {
  const rows = await requestJson<Array<{
    correction_id: string;
    batch_id: string;
    term_id: string;
    created_new_batch: boolean;
    term_status: string;
  }>>(
    "rpc/correct_uniform_delivery_person",
    {
      method: "POST",
      body: JSON.stringify({
        p_correction_id: input.correctionId ?? crypto.randomUUID(),
        p_batch_id: input.batchId,
        p_new_person_id: input.newPersonId,
        p_reason: input.reason.trim(),
        p_actor_name: input.actorName,
        p_new_batch_id: input.newBatchId ?? null,
        p_new_term_id: input.newTermId ?? crypto.randomUUID(),
        p_template_version: input.templateVersion ?? null,
      }),
    },
  );
  return mapCorrectionResult(rows[0]);
}

export async function correctUniformDeliverySize(input: {
  correctionId?: string;
  batchItemId: string;
  targetItemId: string;
  quantity: number;
  mode: UniformDeliveryCorrectionMode;
  reason: string;
  actorName: string;
  newBatchId?: string;
  newTermId?: string;
  templateVersion?: string;
}) {
  const rows = await requestJson<Array<{
    correction_id: string;
    batch_id: string;
    term_id: string;
    created_new_batch: boolean;
    term_status: string;
  }>>(
    "rpc/correct_uniform_delivery_size",
    {
      method: "POST",
      body: JSON.stringify({
        p_correction_id: input.correctionId ?? crypto.randomUUID(),
        p_batch_item_id: input.batchItemId,
        p_target_item_id: input.targetItemId,
        p_quantity: input.quantity,
        p_mode: input.mode,
        p_reason: input.reason.trim(),
        p_actor_name: input.actorName,
        p_new_batch_id: input.newBatchId ?? null,
        p_new_term_id: input.newTermId ?? crypto.randomUUID(),
        p_template_version: input.templateVersion ?? null,
      }),
    },
  );
  return mapCorrectionResult(rows[0]);
}

export async function registerUniformStockReceipt(input: {
  operationId?: string;
  itemId?: string;
  itemCode?: string;
  name?: string;
  description?: string;
  size?: string;
  fabric?: string;
  color?: string;
  quantity: number;
  receivedAt?: string;
  supplier?: string;
  proposalNumber?: string;
  actorName: string;
  notes?: string;
}) {
  const rows = await requestJson<Array<{ item_id: string; item_code: string; total_quantity: number | string; available_quantity: number | string }>>(
    "rpc/register_uniform_stock_receipt",
    {
      method: "POST",
      body: JSON.stringify({
        p_receipt_movement_id: input.operationId ?? crypto.randomUUID(),
        p_item_id: input.itemId || null,
        p_item_code: cleanOptional(input.itemCode),
        p_name: cleanOptional(input.name),
        p_description: cleanOptional(input.description),
        p_size: cleanOptional(input.size),
        p_fabric: cleanOptional(input.fabric),
        p_color: cleanOptional(input.color),
        p_quantity: input.quantity,
        p_received_at: input.receivedAt || null,
        p_supplier: cleanOptional(input.supplier),
        p_proposal_number: cleanOptional(input.proposalNumber),
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
      }),
    },
  );
  return rows[0];
}

export async function markUniformTermPrinted(termId: string, actorName: string) {
  return requestJson<Array<{ term_id: string; printed_at: string }>>(
    "rpc/mark_uniform_term_printed",
    {
      method: "POST",
      body: JSON.stringify({
        p_term_id: termId,
        p_actor_name: actorName,
      }),
    },
  );
}

export async function uploadUniformSignedTerm(input: {
  termId: string;
  personId: string;
  batchId: string;
  file: File;
  actorName: string;
  notes?: string;
}) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new UniformsRemoteError(0, "Supabase não configurado.");
  const contentType = input.file.type || guessContentType(input.file.name);
  const storagePath = [
    "uniforms",
    input.personId,
    input.batchId,
    `termo-assinado-${Date.now()}-${sanitizeFileName(input.file.name)}`,
  ].join("/");

  const { error: uploadError } = await supabase.storage
    .from(SIGNED_TERMS_BUCKET)
    .upload(storagePath, input.file, {
      cacheControl: "3600",
      contentType,
      upsert: false,
    });
  if (uploadError) throw new UniformsRemoteError(400, uploadError.message);

  const rows = await requestJson<Array<{ attachment_id: string; term_status: string; version: number }>>(
    "rpc/record_uniform_signed_term_attachment",
    {
      method: "POST",
      body: JSON.stringify({
        p_attachment_id: crypto.randomUUID(),
        p_term_id: input.termId,
        p_storage_path: storagePath,
        p_file_name: input.file.name || "termo-assinado",
        p_content_type: contentType,
        p_file_size: input.file.size,
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
      }),
    },
  );

  return { storagePath, result: rows[0] };
}

export async function createUniformSignedTermUrl(storagePath: string) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new UniformsRemoteError(0, "Supabase não configurado.");
  const { data, error } = await supabase.storage
    .from(SIGNED_TERMS_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data?.signedUrl) throw new UniformsRemoteError(400, error?.message ?? "Não foi possível gerar link temporário.");
  return data.signedUrl;
}

export function getUniformsErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  const normalized = normalize(message);
  if (normalized.includes("SEM PERMISSAO")) return "A sessão de administrador não está válida. Entre novamente.";
  if (normalized.includes("PESSOA NAO ENCONTRADA OU INATIVA")) return "Pessoa inativa não pode receber uniforme.";
  if (normalized.includes("ESTOQUE INSUFICIENTE")) return message.replace("Disponivel", "Disponível");
  if (normalized.includes("MOTIVO DA DEVOLUCAO")) return "Informe o motivo da devolução.";
  if (normalized.includes("MOTIVO DA CORRECAO")) return "Informe o motivo da correção.";
  if (normalized.includes("TERMO SUBSTITUIDO")) return "Este termo foi substituído por uma correção e não pode mais ser impresso ou assinado.";
  if (normalized.includes("TERMO ASSINADO EXIGE RETIFICACAO")) return "Termo já assinado exige retificação com devolução e nova entrega.";
  if (normalized.includes("FUNCIONARIO CORRETO NAO ENCONTRADO OU INATIVO")) return "O funcionário correto precisa estar ativo para receber a correção.";
  if (normalized.includes("PESSOA DA ENTREGA NAO ENCONTRADA")) return "Não foi possível localizar a entrega selecionada.";
  if (normalized.includes("VERSAO DE TEMPLATE")) return "Template do termo não está ativo.";
  if (normalized.includes("TIPO DE ARQUIVO")) return "Envie JPG, PNG, WEBP ou PDF.";
  if (normalized.includes("JA EXISTE ITEM COM ESTE CODIGO")) return "Já existe um uniforme com este código.";
  if (normalized.includes("DUPLICATE") || normalized.includes("UNIQUE")) return "Registro duplicado. Atualize a tela e tente novamente.";
  if (error instanceof UniformsRemoteError && (error.status === 401 || error.status === 403)) return "A sessão de administrador expirou. Entre novamente.";
  if (error instanceof UniformsRemoteError && error.status >= 500) return "O Supabase apresentou uma falha temporária. Tente novamente.";
  return message || "Não foi possível concluir a operação.";
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  ensureReady();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new UniformsRemoteError(response.status, parseRemoteMessage(details) || `Erro online: ${response.status}`, details);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof UniformsRemoteError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) throw new UniformsRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");
    if (error instanceof DOMException && error.name === "AbortError") throw new UniformsRemoteError(408, "Tempo esgotado ao conectar com o Supabase.");
    throw new UniformsRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function ensureReady() {
  if (!supabaseConfigured) throw new UniformsRemoteError(0, "Supabase não configurado.");
}

function mapTemplate(row: TemplateRow): UniformTermTemplateVersion {
  return {
    version: row.version,
    name: row.name,
    sourceFileName: row.source_file_name,
    sourceSha256: row.source_sha256,
    sourceDocxPath: row.source_docx_path,
    printTemplatePath: row.print_template_path,
    logoPath: row.logo_path ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatch(row: BatchRow): UniformDeliveryBatch {
  return {
    id: row.id,
    personId: row.person_id,
    deliveredAt: row.delivered_at,
    deliveredByName: row.delivered_by_name,
    notes: row.notes ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatchItem(row: BatchItemRow): UniformDeliveryBatchItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    patrimonyAssignmentId: row.patrimony_assignment_id,
    itemId: row.item_id,
    quantity: Number(row.quantity),
    observation: row.observation ?? undefined,
    active: row.active ?? true,
    correctedAt: row.corrected_at ?? undefined,
    correctedByName: row.corrected_by_name ?? undefined,
    correctionReason: row.correction_reason ?? undefined,
    createdAt: row.created_at,
  };
}

function mapTerm(row: TermRow): UniformDeliveryTerm {
  return {
    id: row.id,
    batchId: row.batch_id,
    templateVersion: row.template_version,
    generatedAt: row.generated_at,
    printedAt: row.printed_at ?? undefined,
    status: row.status,
    signedDocumentPath: row.signed_document_path ?? undefined,
    signedUploadedAt: row.signed_uploaded_at ?? undefined,
    signedUploadedByName: row.signed_uploaded_by_name ?? undefined,
    replacedByTermId: row.replaced_by_term_id ?? undefined,
    replacedAt: row.replaced_at ?? undefined,
    replacedByName: row.replaced_by_name ?? undefined,
    replacementReason: row.replacement_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCorrectionResult(row?: {
  correction_id: string;
  batch_id: string;
  term_id: string;
  created_new_batch: boolean;
  term_status: string;
}): UniformDeliveryCorrectionResult {
  if (!row) throw new UniformsRemoteError(500, "Não foi possível confirmar a correção.");
  return {
    correctionId: row.correction_id,
    batchId: row.batch_id,
    termId: row.term_id,
    createdNewBatch: row.created_new_batch,
    termStatus: row.term_status,
  };
}

function mapAttachment(row: AttachmentRow): UniformTermAttachment {
  return {
    id: row.id,
    termId: row.term_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSize: Number(row.file_size),
    version: Number(row.version),
    active: row.active,
    uploadedAt: row.uploaded_at,
    uploadedByName: row.uploaded_by_name,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean || null;
}

function sanitizeFileName(value: string) {
  return (value || "termo-assinado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "termo-assinado";
}

function guessContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function parseRemoteMessage(details: string) {
  if (!details) return "";
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    return [parsed.message, parsed.details, parsed.hint].filter((value): value is string => typeof value === "string" && Boolean(value)).join(" ");
  } catch {
    return details;
  }
}
