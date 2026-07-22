import { getSupabaseAccessToken } from "../../security/services/supabaseClient";

const CLOUD_URL = import.meta.env.VITE_DB_URL ?? "";
const PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
const KEY_HEADER = ["api", "key"].join("");

export type CleaningDeliveryItemRecord = {
  id: string;
  orderItemId: string;
  productSlug: string;
  productName: string;
  unit: string;
  orderedQuantity: number;
  preStockQuantity: number;
  systemStockBefore: number;
  adjustmentQuantity: number;
  receivedQuantity: number;
  finalStockQuantity: number;
  observation?: string;
};

export type CleaningDeliveryRecord = {
  id: string;
  orderId: string;
  stockCheckId?: string;
  approvalId?: string;
  hasDivergence: boolean;
  receivedAt: string;
  receivedById: string;
  receivedByName: string;
  notes?: string;
  items: CleaningDeliveryItemRecord[];
};

export type CleaningDeliveryInputItem = {
  orderItemId: string;
  productSlug: string;
  orderedQuantity: number;
  receivedQuantity: number;
  observation?: string;
};

export type CleaningDeliveryInput = {
  id: string;
  orderId: string;
  stockCheckId: string;
  approvalId?: string;
  receivedById: string;
  receivedByName: string;
  notes?: string;
  items: CleaningDeliveryInputItem[];
};

export type CleaningDeliveryApprovalStatus = "pending" | "approved" | "rejected" | "cancelled" | "used";

export type CleaningDeliveryApprovalItem = {
  orderItemId: string;
  productSlug: string;
  productName: string;
  unit: string;
  expectedQuantity: number;
  receivedQuantity: number;
};

export type CleaningDeliveryApproval = {
  id: string;
  orderId: string;
  stockCheckId: string;
  requestedById: string;
  requestedByName: string;
  supervisorId: string;
  status: CleaningDeliveryApprovalStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedByName?: string;
  decisionNote?: string;
  items: CleaningDeliveryApprovalItem[];
};

export type CleaningDeliveryStockCheckValidation = {
  ok: boolean;
  stockCheckId?: string;
  data?: string;
  hora?: string;
  createdAt?: string;
  message: string;
  missingProducts: string[];
};

export type CleaningDeliveryApprovalInput = {
  id: string;
  orderId: string;
  stockCheckId: string;
  requestedById: string;
  requestedByName: string;
  supervisorId: string;
  items: Array<{
    orderItemId: string;
    productSlug: string;
    receivedQuantity: number;
  }>;
};

type CleaningDeliveryItemRow = {
  id: string;
  order_item_id: string;
  product_slug: string;
  product_name: string;
  unit: string;
  ordered_quantity: number | string;
  pre_stock_quantity: number | string;
  system_stock_before: number | string;
  adjustment_quantity: number | string;
  received_quantity: number | string;
  final_stock_quantity: number | string;
  observation: string | null;
};

type CleaningDeliveryRow = {
  id: string;
  order_id: string;
  stock_check_id: string | null;
  approval_id: string | null;
  has_divergence: boolean | null;
  received_at: string;
  received_by_id: string;
  received_by_name: string;
  notes: string | null;
  cleaning_delivery_items?: CleaningDeliveryItemRow[];
};

type CleaningDeliveryApprovalRow = {
  id: string;
  order_id: string;
  stock_check_id: string;
  requested_by_id: string;
  requested_by_name: string;
  supervisor_id: string;
  status: CleaningDeliveryApprovalStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
  items: Array<{
    order_item_id: string;
    product_slug: string;
    product_name: string;
    unit: string;
    expected_quantity: number | string;
    received_quantity: number | string;
  }>;
};

function apiHeaders(extra: Record<string, string> = {}) {
  return {
    [KEY_HEADER]: PUBLIC_KEY,
    "Content-Type": "application/json",
    ...extra,
  };
}

function authenticatedHeaders() {
  const accessToken = getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error("Entre novamente como Admin Tezzei para liberar a entrega.");
  }
  return apiHeaders({ Authorization: `Bearer ${accessToken}` });
}

export function isCleaningDeliveryCloudEnabled() {
  return Boolean(CLOUD_URL && PUBLIC_KEY);
}

export async function loadCleaningDeliveries(): Promise<CleaningDeliveryRecord[]> {
  if (!isCleaningDeliveryCloudEnabled()) return [];

  const select = [
    "id",
    "order_id",
    "stock_check_id",
    "approval_id",
    "has_divergence",
    "received_at",
    "received_by_id",
    "received_by_name",
    "notes",
    "cleaning_delivery_items(id,order_item_id,product_slug,product_name,unit,ordered_quantity,pre_stock_quantity,system_stock_before,adjustment_quantity,received_quantity,final_stock_quantity,observation)",
  ].join(",");
  const response = await fetch(
    `${CLOUD_URL}/rest/v1/cleaning_deliveries?select=${select}&order=received_at.desc`,
    { headers: apiHeaders() },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Não foi possível carregar as conferências de entrega.");
  }

  const rows = await response.json() as CleaningDeliveryRow[];
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    stockCheckId: row.stock_check_id ?? undefined,
    approvalId: row.approval_id ?? undefined,
    hasDivergence: Boolean(row.has_divergence),
    receivedAt: row.received_at,
    receivedById: row.received_by_id,
    receivedByName: row.received_by_name,
    notes: row.notes ?? undefined,
    items: (row.cleaning_delivery_items ?? []).map((item) => ({
      id: item.id,
      orderItemId: item.order_item_id,
      productSlug: item.product_slug,
      productName: item.product_name,
      unit: item.unit,
      orderedQuantity: Number(item.ordered_quantity),
      preStockQuantity: Number(item.pre_stock_quantity),
      systemStockBefore: Number(item.system_stock_before),
      adjustmentQuantity: Number(item.adjustment_quantity),
      receivedQuantity: Number(item.received_quantity),
      finalStockQuantity: Number(item.final_stock_quantity),
      observation: item.observation ?? undefined,
    })),
  }));
}

export async function loadCleaningDeliveryApprovals(filters: {
  requesterId?: string;
  pendingSupervisorId?: string;
  orderId?: string;
} = {}): Promise<CleaningDeliveryApproval[]> {
  if (!isCleaningDeliveryCloudEnabled()) return [];

  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/list_cleaning_delivery_approvals`, {
    method: "POST",
    headers: filters.pendingSupervisorId ? authenticatedHeaders() : apiHeaders(),
    body: JSON.stringify({
      p_requester_id: filters.requesterId ?? null,
      p_pending_supervisor_id: filters.pendingSupervisorId ?? null,
      p_order_id: filters.orderId ?? null,
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Não foi possível carregar as liberações de entrega.");
  }

  const rows = await response.json() as CleaningDeliveryApprovalRow[];
  return rows.map(mapApprovalRow);
}

export async function validateCleaningDeliveryStockCheck(stockCheckId?: string | null): Promise<CleaningDeliveryStockCheckValidation> {
  if (!isCleaningDeliveryCloudEnabled()) {
    return {
      ok: false,
      message: "A Conferencia de Entrega exige conexao com o sistema online.",
      missingProducts: [],
    };
  }

  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/validate_cleaning_delivery_stock_check`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ p_stock_check_id: stockCheckId ?? null }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Nao foi possivel validar a conferencia de estoque.");
  }

  const result = await response.json() as {
    ok?: boolean;
    stock_check_id?: string | null;
    data?: string | null;
    hora?: string | null;
    created_at?: string | null;
    message?: string | null;
    missing_products?: string[] | null;
  };

  return {
    ok: Boolean(result.ok),
    stockCheckId: result.stock_check_id ?? undefined,
    data: result.data ?? undefined,
    hora: result.hora ?? undefined,
    createdAt: result.created_at ?? undefined,
    message: result.message ?? "Conferencia de estoque nao esta pronta para recebimento.",
    missingProducts: Array.isArray(result.missing_products) ? result.missing_products : [],
  };
}

export async function requestCleaningDeliveryApproval(input: CleaningDeliveryApprovalInput) {
  if (!isCleaningDeliveryCloudEnabled()) {
    throw new Error("A solicitação de liberação exige conexão com o sistema online.");
  }

  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/request_cleaning_delivery_approval`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      p_request_id: input.id,
      p_order_id: input.orderId,
      p_stock_check_id: input.stockCheckId,
      p_requested_by_id: input.requestedById,
      p_requested_by_name: input.requestedByName,
      p_supervisor_id: input.supervisorId,
      p_items: input.items.map((item) => ({
        order_item_id: item.orderItemId,
        product_slug: item.productSlug,
        received_quantity: item.receivedQuantity,
      })),
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Não foi possível pedir a liberação do supervisor.");
  }
  return await response.json() as string;
}

export async function decideCleaningDeliveryApproval(input: {
  approvalId: string;
  decision: "approved" | "rejected";
  supervisorName: string;
  note?: string;
}) {
  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/decide_cleaning_delivery_approval`, {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify({
      p_request_id: input.approvalId,
      p_decision: input.decision,
      p_supervisor_name: input.supervisorName,
      p_note: input.note?.trim() || null,
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Não foi possível registrar a decisão do supervisor.");
  }
  return await response.json() as string;
}

export async function registerCleaningDelivery(input: CleaningDeliveryInput) {
  if (!isCleaningDeliveryCloudEnabled()) {
    throw new Error("A conferência de entrega exige conexão com o sistema online.");
  }

  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/register_cleaning_delivery_v2`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      p_delivery_id: input.id,
      p_order_id: input.orderId,
      p_stock_check_id: input.stockCheckId,
      p_approval_id: input.approvalId ?? null,
      p_received_by_id: input.receivedById,
      p_received_by_name: input.receivedByName,
      p_notes: input.notes?.trim() || null,
      p_items: input.items.map((item) => ({
        order_item_id: item.orderItemId,
        product_slug: item.productSlug,
        ordered_quantity: item.orderedQuantity,
        received_quantity: item.receivedQuantity,
        observation: item.observation?.trim() || null,
      })),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Não foi possível registrar a entrega.");
  }

  return await response.json() as string;
}

function mapApprovalRow(row: CleaningDeliveryApprovalRow): CleaningDeliveryApproval {
  return {
    id: row.id,
    orderId: row.order_id,
    stockCheckId: row.stock_check_id,
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name,
    supervisorId: row.supervisor_id,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at ?? undefined,
    decidedByName: row.decided_by_name ?? undefined,
    decisionNote: row.decision_note ?? undefined,
    items: (row.items ?? []).map((item) => ({
      orderItemId: item.order_item_id,
      productSlug: item.product_slug,
      productName: item.product_name,
      unit: item.unit,
      expectedQuantity: Number(item.expected_quantity),
      receivedQuantity: Number(item.received_quantity),
    })),
  };
}
