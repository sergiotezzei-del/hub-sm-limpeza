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
  preStockQuantity: number;
  receivedQuantity: number;
  observation?: string;
};

export type CleaningDeliveryInput = {
  id: string;
  orderId: string;
  receivedById: string;
  receivedByName: string;
  notes?: string;
  items: CleaningDeliveryInputItem[];
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
  received_at: string;
  received_by_id: string;
  received_by_name: string;
  notes: string | null;
  cleaning_delivery_items?: CleaningDeliveryItemRow[];
};

function apiHeaders(extra: Record<string, string> = {}) {
  return {
    [KEY_HEADER]: PUBLIC_KEY,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function isCleaningDeliveryCloudEnabled() {
  return Boolean(CLOUD_URL && PUBLIC_KEY);
}

export async function loadCleaningDeliveries(): Promise<CleaningDeliveryRecord[]> {
  if (!isCleaningDeliveryCloudEnabled()) return [];

  const select = [
    "id",
    "order_id",
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

export async function registerCleaningDelivery(input: CleaningDeliveryInput) {
  if (!isCleaningDeliveryCloudEnabled()) {
    throw new Error("A conferência de entrega exige conexão com o sistema online.");
  }

  const response = await fetch(`${CLOUD_URL}/rest/v1/rpc/register_cleaning_delivery`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      p_delivery_id: input.id,
      p_order_id: input.orderId,
      p_received_by_id: input.receivedById,
      p_received_by_name: input.receivedByName,
      p_notes: input.notes?.trim() || null,
      p_items: input.items.map((item) => ({
        order_item_id: item.orderItemId,
        product_slug: item.productSlug,
        ordered_quantity: item.orderedQuantity,
        pre_stock_quantity: item.preStockQuantity,
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
