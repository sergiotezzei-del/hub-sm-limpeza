import type { CleaningOrder, OrderItem, OrderStatus } from "./types";

const ORDERS_KEY = "hub-sm-cleaning-orders";
const CLOUD_URL = import.meta.env.VITE_DB_URL ?? "";
const PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
const KEY_HEADER = ["api", "key"].join("");
const cloudEnabled = Boolean(CLOUD_URL && PUBLIC_KEY);

type OrderRow = {
  id: string;
  data: string;
  hora: string;
  solicitante: "Neia";
  status: OrderStatus;
  order_items?: OrderItemRow[];
};

type OrderItemRow = {
  id: string;
  product_name: string;
  unit: string;
  quantity: number | string;
  manual: boolean | null;
  observation: string | null;
};

function apiHeaders(extra: Record<string, string> = {}) {
  return {
    [KEY_HEADER]: PUBLIC_KEY,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function isCloudStorageEnabled() {
  return cloudEnabled;
}

export function getLocalOrders(): CleaningOrder[] {
  const rawOrders = window.localStorage.getItem(ORDERS_KEY);
  if (!rawOrders) return [];

  try {
    const parsed = JSON.parse(rawOrders);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalOrders(orders: CleaningOrder[]) {
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export async function getOrders(): Promise<CleaningOrder[]> {
  if (!cloudEnabled) return getLocalOrders();

  try {
    const response = await fetch(
      `${CLOUD_URL}/rest/v1/orders?select=id,data,hora,solicitante,status,order_items(id,product_name,unit,quantity,manual,observation)&order=created_at.desc`,
      { headers: apiHeaders() },
    );

    if (!response.ok) throw new Error("Erro ao buscar pedidos online");

    const rows = (await response.json()) as OrderRow[];
    const orders = rows.map(mapOrderRow);
    saveLocalOrders(orders);
    return orders;
  } catch (error) {
    console.error(error);
    return getLocalOrders();
  }
}

export async function addOrder(order: CleaningOrder) {
  if (!cloudEnabled) {
    saveLocalOrders([order, ...getLocalOrders()]);
    return;
  }

  try {
    const createdOrder = await postOrder(order);
    await postOrderItems(createdOrder.id, order.itens);
    await getOrders();
  } catch (error) {
    console.error(error);
    saveLocalOrders([order, ...getLocalOrders()]);
    throw error;
  }
}

export async function updateOrder(updatedOrder: CleaningOrder) {
  if (!cloudEnabled) {
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
    );
    return;
  }

  try {
    await request(`${CLOUD_URL}/rest/v1/orders?id=eq.${updatedOrder.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: updatedOrder.data,
        hora: updatedOrder.hora,
        solicitante: updatedOrder.solicitante,
        status: updatedOrder.status,
      }),
    });

    await request(`${CLOUD_URL}/rest/v1/order_items?order_id=eq.${updatedOrder.id}`, {
      method: "DELETE",
    });

    await postOrderItems(updatedOrder.id, updatedOrder.itens);
    await getOrders();
  } catch (error) {
    console.error(error);
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
    );
    throw error;
  }
}

export async function deleteOrder(orderId: string) {
  if (!cloudEnabled) {
    saveLocalOrders(getLocalOrders().filter((order) => order.id !== orderId));
    return;
  }

  try {
    await request(`${CLOUD_URL}/rest/v1/orders?id=eq.${orderId}`, { method: "DELETE" });
    await getOrders();
  } catch (error) {
    console.error(error);
    saveLocalOrders(getLocalOrders().filter((order) => order.id !== orderId));
    throw error;
  }
}

async function postOrder(order: CleaningOrder): Promise<OrderRow> {
  const response = await request(`${CLOUD_URL}/rest/v1/orders`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        data: order.data,
        hora: order.hora,
        solicitante: order.solicitante,
        status: order.status,
      },
    ]),
  });

  const rows = (await response.json()) as OrderRow[];
  if (!rows[0]?.id) throw new Error("Pedido criado sem ID online");
  return rows[0];
}

async function postOrderItems(orderId: string, items: OrderItem[]) {
  if (items.length === 0) return;

  await request(`${CLOUD_URL}/rest/v1/order_items`, {
    method: "POST",
    body: JSON.stringify(
      items.map((item) => ({
        order_id: orderId,
        product_name: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        manual: Boolean(item.manual),
        observation: item.observation ?? null,
      })),
    ),
  });
}

async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: apiHeaders(init.headers as Record<string, string> | undefined),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Erro online: ${response.status}`);
  }

  return response;
}

function mapOrderRow(row: OrderRow): CleaningOrder {
  return {
    id: row.id,
    data: row.data,
    hora: row.hora,
    solicitante: row.solicitante,
    status: row.status,
    itens: (row.order_items ?? []).map(mapOrderItemRow),
  };
}

function mapOrderItemRow(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productName: row.product_name,
    unit: row.unit,
    quantity: Number(row.quantity),
    manual: Boolean(row.manual),
    observation: row.observation ?? undefined,
  };
}
