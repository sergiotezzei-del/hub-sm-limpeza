import type {
  CleaningOrder,
  EmployeeId,
  EmployeeProfile,
  OrderItem,
  OrderStatus,
  StockCheck,
  StockCheckItem,
} from "./types";

const ORDERS_KEY = "hub-sm-cleaning-orders";
const PROFILES_KEY = "hub-sm-employee-profiles";
const STOCK_CHECKS_KEY = "hub-sm-stock-checks";
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
  deleted_at?: string | null;
  completed_at?: string | null;
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

type EmployeeProfileRow = {
  employee_id: EmployeeId;
  photo_data: string | null;
};

type StockCheckRow = {
  id: string;
  data: string;
  hora: string;
  conferente: "Neia";
  stock_check_items?: StockCheckItemRow[];
};

type StockCheckItemRow = {
  id: string;
  product_name: string;
  unit: string;
  quantity: number | string;
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
  if (!cloudEnabled) return getLocalOrders().filter((order) => !order.deletedAt);

  try {
    const response = await fetch(
      `${CLOUD_URL}/rest/v1/orders?select=id,data,hora,solicitante,status,deleted_at,completed_at,order_items(id,product_name,unit,quantity,manual,observation)&deleted_at=is.null&order=created_at.desc`,
      { headers: apiHeaders() },
    );

    if (!response.ok) throw new Error("Erro ao buscar pedidos online");

    const rows = (await response.json()) as OrderRow[];
    const orders = rows.map(mapOrderRow);
    saveLocalOrders(mergeOrders(orders, getLocalOrders()));
    return orders;
  } catch (error) {
    console.error(error);
    return getLocalOrders().filter((order) => !order.deletedAt);
  }
}

export async function getOrderHistory(): Promise<CleaningOrder[]> {
  if (!cloudEnabled) {
    return getLocalOrders().filter((order) => order.deletedAt || order.status === "Pedido feito");
  }

  try {
    const response = await fetch(
      `${CLOUD_URL}/rest/v1/orders?select=id,data,hora,solicitante,status,deleted_at,completed_at,order_items(id,product_name,unit,quantity,manual,observation)&order=created_at.desc`,
      { headers: apiHeaders() },
    );

    if (!response.ok) throw new Error("Erro ao buscar histórico online");

    const rows = (await response.json()) as OrderRow[];
    const orders = rows.map(mapOrderRow);
    saveLocalOrders(orders);
    return orders.filter((order) => order.deletedAt || order.status === "Pedido feito");
  } catch (error) {
    console.error(error);
    return getLocalOrders().filter((order) => order.deletedAt || order.status === "Pedido feito");
  }
}

export async function getNeiaOrderHistory(): Promise<CleaningOrder[]> {
  if (!cloudEnabled) return getLocalOrders().filter((order) => order.solicitante === "Neia");

  try {
    const response = await fetch(
      `${CLOUD_URL}/rest/v1/orders?select=id,data,hora,solicitante,status,deleted_at,completed_at,order_items(id,product_name,unit,quantity,manual,observation)&solicitante=eq.Neia&order=created_at.desc`,
      { headers: apiHeaders() },
    );

    if (!response.ok) throw new Error("Erro ao buscar histórico da Neia");

    const rows = (await response.json()) as OrderRow[];
    return rows.map(mapOrderRow);
  } catch (error) {
    console.error(error);
    return getLocalOrders().filter((order) => order.solicitante === "Neia");
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
  const orderForSave = {
    ...updatedOrder,
    completedAt:
      updatedOrder.status === "Pedido feito"
        ? updatedOrder.completedAt ?? new Date().toISOString()
        : updatedOrder.completedAt,
  };

  if (!cloudEnabled) {
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === orderForSave.id ? orderForSave : order)),
    );
    return;
  }

  try {
    await request(`${CLOUD_URL}/rest/v1/orders?id=eq.${orderForSave.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: orderForSave.data,
        hora: orderForSave.hora,
        solicitante: orderForSave.solicitante,
        status: orderForSave.status,
        completed_at: orderForSave.completedAt ?? null,
      }),
    });

    await request(`${CLOUD_URL}/rest/v1/order_items?order_id=eq.${orderForSave.id}`, {
      method: "DELETE",
    });

    await postOrderItems(orderForSave.id, orderForSave.itens);
    await getOrders();
  } catch (error) {
    console.error(error);
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === orderForSave.id ? orderForSave : order)),
    );
    throw error;
  }
}

export async function deleteOrder(orderId: string) {
  const deletedAt = new Date().toISOString();

  if (!cloudEnabled) {
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === orderId ? { ...order, deletedAt } : order)),
    );
    return;
  }

  try {
    await request(`${CLOUD_URL}/rest/v1/orders?id=eq.${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: deletedAt }),
    });
    await getOrders();
  } catch (error) {
    console.error(error);
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === orderId ? { ...order, deletedAt } : order)),
    );
    throw error;
  }
}

export function getLocalEmployeeProfiles(): Record<EmployeeId, EmployeeProfile> {
  const empty = createEmptyProfiles();
  const rawProfiles = window.localStorage.getItem(PROFILES_KEY);
  if (!rawProfiles) return empty;

  try {
    return { ...empty, ...JSON.parse(rawProfiles) };
  } catch {
    return empty;
  }
}

function saveLocalEmployeeProfiles(profiles: Record<EmployeeId, EmployeeProfile>) {
  window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export async function getEmployeeProfiles(): Promise<Record<EmployeeId, EmployeeProfile>> {
  if (!cloudEnabled) return getLocalEmployeeProfiles();

  try {
    const response = await fetch(`${CLOUD_URL}/rest/v1/employee_profiles?select=employee_id,photo_data`, {
      headers: apiHeaders(),
    });

    if (!response.ok) throw new Error("Erro ao buscar perfis");

    const rows = (await response.json()) as EmployeeProfileRow[];
    const profiles = createEmptyProfiles();
    rows.forEach((row) => {
      profiles[row.employee_id] = {
        employeeId: row.employee_id,
        photoData: row.photo_data ?? undefined,
      };
    });
    saveLocalEmployeeProfiles(profiles);
    return profiles;
  } catch (error) {
    console.error(error);
    return getLocalEmployeeProfiles();
  }
}

export async function saveEmployeePhoto(employeeId: EmployeeId, photoData: string) {
  const profiles = getLocalEmployeeProfiles();
  const updatedProfiles = {
    ...profiles,
    [employeeId]: { employeeId, photoData },
  };
  saveLocalEmployeeProfiles(updatedProfiles);

  if (!cloudEnabled) return;

  await request(`${CLOUD_URL}/rest/v1/employee_profiles?on_conflict=employee_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ employee_id: employeeId, photo_data: photoData }]),
  });
}

export function getLocalStockChecks(): StockCheck[] {
  const rawChecks = window.localStorage.getItem(STOCK_CHECKS_KEY);
  if (!rawChecks) return [];

  try {
    const parsed = JSON.parse(rawChecks);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalStockChecks(checks: StockCheck[]) {
  window.localStorage.setItem(STOCK_CHECKS_KEY, JSON.stringify(checks));
}

export async function addStockCheck(check: StockCheck) {
  saveLocalStockChecks([check, ...getLocalStockChecks()]);

  if (!cloudEnabled) return;

  const response = await request(`${CLOUD_URL}/rest/v1/stock_checks`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        data: check.data,
        hora: check.hora,
        conferente: check.conferente,
      },
    ]),
  });

  const rows = (await response.json()) as StockCheckRow[];
  if (!rows[0]?.id) throw new Error("Conferência criada sem ID online");

  if (check.itens.length > 0) {
    await request(`${CLOUD_URL}/rest/v1/stock_check_items`, {
      method: "POST",
      body: JSON.stringify(
        check.itens.map((item) => ({
          stock_check_id: rows[0].id,
          product_name: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          observation: item.observation ?? null,
        })),
      ),
    });
  }
}

export async function getStockChecks(): Promise<StockCheck[]> {
  if (!cloudEnabled) return getLocalStockChecks();

  try {
    const response = await fetch(
      `${CLOUD_URL}/rest/v1/stock_checks?select=id,data,hora,conferente,stock_check_items(id,product_name,unit,quantity,observation)&order=created_at.desc`,
      { headers: apiHeaders() },
    );

    if (!response.ok) throw new Error("Erro ao buscar conferências");

    const rows = (await response.json()) as StockCheckRow[];
    const checks = rows.map(mapStockCheckRow);
    saveLocalStockChecks(checks);
    return checks;
  } catch (error) {
    console.error(error);
    return getLocalStockChecks();
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
    deletedAt: row.deleted_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
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

function mapStockCheckRow(row: StockCheckRow): StockCheck {
  return {
    id: row.id,
    data: row.data,
    hora: row.hora,
    conferente: row.conferente,
    itens: (row.stock_check_items ?? []).map(mapStockCheckItemRow),
  };
}

function mapStockCheckItemRow(row: StockCheckItemRow): StockCheckItem {
  return {
    id: row.id,
    productName: row.product_name,
    unit: row.unit,
    quantity: Number(row.quantity),
    observation: row.observation ?? undefined,
  };
}

function createEmptyProfiles(): Record<EmployeeId, EmployeeProfile> {
  return {
    neia: { employeeId: "neia" },
    selma: { employeeId: "selma" },
    helena: { employeeId: "helena" },
  };
}

function mergeOrders(activeOrders: CleaningOrder[], localOrders: CleaningOrder[]) {
  const orderMap = new Map<string, CleaningOrder>();
  localOrders.forEach((order) => orderMap.set(order.id, order));
  activeOrders.forEach((order) => orderMap.set(order.id, order));
  return Array.from(orderMap.values());
}
