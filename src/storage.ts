import type {
  CleaningOrder,
  EmployeeId,
  EmployeeProfile,
  InventoryProduct,
  OrderItem,
  OrderStatus,
  StockCheck,
  StockCheckItem,
  StockMovement,
} from "./types";
import { products as baseProducts } from "./data";

const ORDERS_KEY = "hub-sm-cleaning-orders";
const PROFILES_KEY = "hub-sm-employee-profiles";
const STOCK_CHECKS_KEY = "hub-sm-stock-checks";
const INVENTORY_KEY = "hub-sm-inventory-products";
const STOCK_MOVEMENTS_KEY = "hub-sm-stock-movements";
const OFFLINE_QUEUE_KEY = "hub-sm-cleaning-offline-queue";
const LEGACY_PRODUCT_PHOTOS_KEY = "hub-sm-product-photos";
const LEGACY_STOCK_BOOTSTRAP_KEY = "hub-sm-limpeza-stock-bootstrap-2026-06-24";
const CLOUD_URL = import.meta.env.VITE_DB_URL ?? "";
const PUBLIC_KEY = import.meta.env.VITE_DB_PUBLIC_KEY ?? "";
const KEY_HEADER = ["api", "key"].join("");
const cloudEnabled = Boolean(CLOUD_URL && PUBLIC_KEY);
const CLEANING_CATEGORY_SLUG = "limpeza";
const DEFAULT_PRODUCT_UNIT = "Unidade";
const INVENTORY_STORAGE_MAX_CHARS = 4_000_000;

export class InventoryStorageTooLargeError extends Error {
  constructor() {
    super("INVENTORY_STORAGE_TOO_LARGE");
    this.name = "InventoryStorageTooLargeError";
  }
}

export type InventoryProductSaveInput = {
  mode: "edit" | "new";
  product: InventoryProduct;
};

export type StockExitInput = {
  product: InventoryProduct;
  quantity: number;
  userId: string;
  userName: string;
  observation?: string;
  operationId?: string;
};

export type CleaningProductionResetResult = {
  cloud: boolean;
  remoteTables: string[];
  localKeys: string[];
};

export type CleaningWriteResult = {
  synced: boolean;
  queued: boolean;
};

export type CleaningOfflineQueueKind = "order" | "stock-check" | "stock-exit";

export type CleaningOfflineQueueItem = {
  id: string;
  kind: CleaningOfflineQueueKind;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  payload: CleaningOrder | StockCheck | StockExitInput;
};

export type CleaningOfflineQueueSummary = {
  total: number;
  orders: number;
  stockChecks: number;
  stockExits: number;
};

export type CleaningOfflineSyncResult = {
  attempted: number;
  synced: number;
  failed: number;
  remaining: number;
};

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

type ProductRow = {
  slug: string;
  name: string;
  category_slug: string | null;
  unit: string;
  active: boolean | null;
  barcode: string | null;
  current_stock: number | string | null;
  min_stock: number | string | null;
  photo_data?: string | null;
};

type StockMovementRow = {
  id: string;
  created_at: string;
  product_slug: string;
  product_name: string;
  unit: string;
  barcode: string | null;
  movement_type: "saida" | "entrada" | "ajuste";
  quantity: number | string;
  user_id: string;
  user_name: string;
  observation: string | null;
  source?: string | null;
};

let offlineSyncPromise: Promise<CleaningOfflineSyncResult> | null = null;

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

function clearLocalOrders() {
  window.localStorage.removeItem(ORDERS_KEY);
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
    saveLocalOrders(orders);
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

export async function addOrder(order: CleaningOrder): Promise<CleaningWriteResult> {
  if (!cloudEnabled) {
    enqueueCleaningOfflineItem("order", order.id, order);
    return { synced: false, queued: true };
  }

  try {
    await syncOrderToRemote(order);
    await getOrders();
    return { synced: true, queued: false };
  } catch (error) {
    console.error(error);
    enqueueCleaningOfflineItem("order", order.id, order);
    return { synced: false, queued: true };
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
    enqueueCleaningOfflineItem("order", orderForSave.id, orderForSave);
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
    enqueueCleaningOfflineItem("order", orderForSave.id, orderForSave);
    throw error;
  }
}

export async function deleteOrder(orderId: string) {
  const deletedAt = new Date().toISOString();
  const localOrder = getLocalOrders().find((order) => order.id === orderId);
  const deletedOrder = localOrder ? { ...localOrder, deletedAt } : null;

  if (!cloudEnabled) {
    saveLocalOrders(
      getLocalOrders().map((order) => (order.id === orderId ? { ...order, deletedAt } : order)),
    );
    if (deletedOrder) enqueueCleaningOfflineItem("order", orderId, deletedOrder);
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
    if (deletedOrder) enqueueCleaningOfflineItem("order", orderId, deletedOrder);
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

export async function addStockCheck(check: StockCheck): Promise<CleaningWriteResult> {
  if (!cloudEnabled) {
    enqueueCleaningOfflineItem("stock-check", check.id, check);
    return { synced: false, queued: true };
  }

  try {
    await syncStockCheckToRemote(check);
    await getStockChecks();
    return { synced: true, queued: false };
  } catch (error) {
    console.error(error);
    enqueueCleaningOfflineItem("stock-check", check.id, check);
    return { synced: false, queued: true };
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

async function syncStockCheckToRemote(check: StockCheck) {
  const response = await request(`${CLOUD_URL}/rest/v1/stock_checks?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        id: check.id,
        data: check.data,
        hora: check.hora,
        conferente: check.conferente,
      },
    ]),
  });

  const rows = (await response.json()) as StockCheckRow[];
  if (!rows[0]?.id) throw new Error("Conferência criada sem ID online");

  await request(`${CLOUD_URL}/rest/v1/stock_check_items?stock_check_id=eq.${rows[0].id}`, {
    method: "DELETE",
  });

  if (check.itens.length === 0) return;

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

async function syncOrderToRemote(order: CleaningOrder) {
  const createdOrder = await postOrder(order);
  await request(`${CLOUD_URL}/rest/v1/order_items?order_id=eq.${createdOrder.id}`, {
    method: "DELETE",
  });
  await postOrderItems(createdOrder.id, order.itens);
}

async function postOrder(order: CleaningOrder): Promise<OrderRow> {
  const response = await request(`${CLOUD_URL}/rest/v1/orders?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        id: order.id,
        data: order.data,
        hora: order.hora,
        solicitante: order.solicitante,
        status: order.status,
        deleted_at: order.deletedAt ?? null,
        completed_at: order.completedAt ?? null,
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

export function getLocalInventoryProducts(): InventoryProduct[] {
  const rawProducts = window.localStorage.getItem(INVENTORY_KEY);
  const legacyPhotos = getLegacyProductPhotos();
  if (!rawProducts) {
    return baseInventory().map((product) => ({ ...product, photoData: legacyPhotos[getLegacyProductPhotoKey(product.name)] }));
  }

  try {
    const parsed = JSON.parse(rawProducts);
    if (!Array.isArray(parsed)) throw new Error("Estoque invalido");
    const storedProducts = parsed.filter(isInventoryProductLike).map(normalizeInventoryProduct).filter(isCleaningInventoryProduct);
    const localMap = new Map(storedProducts.map((product) => [product.id, product]));
    const baseItems = baseInventory().map((product) => {
      const localProduct = localMap.get(product.id);
      return {
        ...product,
        ...localProduct,
        photoData: localProduct?.photoData ?? legacyPhotos[getLegacyProductPhotoKey(product.name)],
      };
    });
    const baseIds = new Set(baseItems.map((product) => product.id));
    const customProducts = storedProducts.filter((product) => !baseIds.has(product.id));
    return [...baseItems, ...customProducts];
  } catch {
    return baseInventory().map((product) => ({ ...product, photoData: legacyPhotos[getLegacyProductPhotoKey(product.name)] }));
  }
}

export async function getInventoryProducts(): Promise<InventoryProduct[]> {
  if (!cloudEnabled) return getLocalInventoryProducts();

  try {
    const rows = await getRemoteCleaningProducts();
    const products = rows.map(mapProductRow);
    saveLocalInventoryProducts(products);
    window.localStorage.removeItem(LEGACY_STOCK_BOOTSTRAP_KEY);
    return products;
  } catch (error) {
    console.error(error);
    return getLocalInventoryProducts();
  }
}

export async function saveInventoryProductDetails(input: InventoryProductSaveInput): Promise<{ products: InventoryProduct[]; productId: string }> {
  if (!cloudEnabled) {
    const currentProducts = getLocalInventoryProducts();
    const exists = currentProducts.some((product) => product.id === input.product.id);
    const nextProducts = exists
      ? currentProducts.map((product) => product.id === input.product.id ? input.product : product)
      : [...currentProducts, input.product];
    saveLocalInventoryProducts(nextProducts);
    return { products: nextProducts, productId: input.product.id };
  }

  await request(`${CLOUD_URL}/rest/v1/products?on_conflict=slug`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      slug: input.product.id,
      name: input.product.name,
      category_slug: CLEANING_CATEGORY_SLUG,
      unit: input.product.unit || DEFAULT_PRODUCT_UNIT,
      barcode: input.product.barcode ?? null,
      current_stock: input.product.currentStock,
      min_stock: input.product.minStock,
      photo_data: input.product.photoData ?? null,
      active: true,
      product_type: "insumo",
      updated_at: new Date().toISOString(),
    }]),
  });

  return { products: await getInventoryProducts(), productId: input.product.id };
}

export function getLocalStockMovements(): StockMovement[] {
  const rawMovements = window.localStorage.getItem(STOCK_MOVEMENTS_KEY);
  if (!rawMovements) return [];
  try {
    const parsed = JSON.parse(rawMovements);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function getStockMovements(): Promise<StockMovement[]> {
  if (!cloudEnabled) return getLocalStockMovements();

  try {
    const [productRows, movementRows] = await Promise.all([
      getRemoteCleaningProducts(),
      fetchRemoteStockMovements(),
    ]);
    const cleaningSlugs = new Set(productRows.map((product) => product.slug));
    const movements = movementRows
      .filter((movement) => cleaningSlugs.has(movement.product_slug))
      .map(mapStockMovementRow);
    saveLocalStockMovements(movements);
    return movements;
  } catch (error) {
    console.error(error);
    return getLocalStockMovements();
  }
}

export async function registerStockExit(input: StockExitInput): Promise<CleaningWriteResult> {
  const operationId = input.operationId || createOfflineOperationId();
  const payload = { ...input, operationId };

  if (!cloudEnabled) {
    enqueueCleaningOfflineItem("stock-exit", operationId, payload);
    return { synced: false, queued: true };
  }

  try {
    await syncStockExitToRemote(payload);
    await Promise.all([getInventoryProducts(), getStockMovements()]);
    return { synced: true, queued: false };
  } catch (error) {
    console.error(error);
    enqueueCleaningOfflineItem("stock-exit", operationId, payload);
    return { synced: false, queued: true };
  }
}

async function syncStockExitToRemote(input: StockExitInput) {
  await request(`${CLOUD_URL}/rest/v1/rpc/register_cleaning_stock_exit`, {
    method: "POST",
    body: JSON.stringify({
      p_product_slug: input.product.id,
      p_quantity: input.quantity,
      p_user_id: input.userId,
      p_user_name: input.userName,
      p_observation: input.observation?.trim() || null,
      p_source: "app",
      p_movement_id: input.operationId ?? null,
    }),
  });
}

export async function prepareCleaningForRealUse(): Promise<CleaningProductionResetResult> {
  const localKeys = clearLocalCleaningOperationalData();
  if (!cloudEnabled) return { cloud: false, remoteTables: [], localKeys };

  const remoteTables = [
    "order_items",
    "orders",
    "stock_check_items",
    "stock_checks",
    "stock_movements",
    "photo_permission_requests",
  ];

  for (const table of remoteTables) {
    await deleteAllRows(table);
  }

  clearLocalOrders();
  saveLocalStockChecks([]);
  saveLocalStockMovements([]);
  await Promise.all([getOrders(), getStockChecks(), getStockMovements(), getInventoryProducts()]);

  return { cloud: true, remoteTables, localKeys };
}

function clearLocalCleaningOperationalData() {
  const keys = [ORDERS_KEY, STOCK_CHECKS_KEY, STOCK_MOVEMENTS_KEY, LEGACY_STOCK_BOOTSTRAP_KEY];
  keys.forEach((key) => window.localStorage.removeItem(key));
  return keys;
}

export function getCleaningOfflineQueue(): CleaningOfflineQueueItem[] {
  const rawQueue = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!rawQueue) return [];

  try {
    const parsed = JSON.parse(rawQueue);
    return Array.isArray(parsed) ? parsed.filter(isCleaningOfflineQueueItem) : [];
  } catch {
    return [];
  }
}

export function getCleaningOfflineQueueSummary(): CleaningOfflineQueueSummary {
  return summarizeCleaningOfflineQueue(getCleaningOfflineQueue());
}

export function syncCleaningOfflineQueue(): Promise<CleaningOfflineSyncResult> {
  if (offlineSyncPromise) return offlineSyncPromise;

  offlineSyncPromise = syncCleaningOfflineQueueNow().finally(() => {
    offlineSyncPromise = null;
  });

  return offlineSyncPromise;
}

async function syncCleaningOfflineQueueNow(): Promise<CleaningOfflineSyncResult> {
  const queue = getCleaningOfflineQueue();
  if (!cloudEnabled || queue.length === 0) {
    return { attempted: 0, synced: 0, failed: 0, remaining: queue.length };
  }

  const remainingQueue: CleaningOfflineQueueItem[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await syncCleaningOfflineItem(item);
      synced += 1;
    } catch (error) {
      failed += 1;
      remainingQueue.push({
        ...item,
        attempts: item.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: getErrorMessage(error),
      });
    }
  }

  saveCleaningOfflineQueue(remainingQueue);

  if (synced > 0) {
    await Promise.all([getOrders(), getStockChecks(), getStockMovements(), getInventoryProducts()]);
  }

  return {
    attempted: queue.length,
    synced,
    failed,
    remaining: remainingQueue.length,
  };
}

async function syncCleaningOfflineItem(item: CleaningOfflineQueueItem) {
  if (item.kind === "order") {
    if (!isCleaningOrderLike(item.payload)) throw new Error("Pedido offline invalido");
    await syncOrderToRemote(item.payload);
    return;
  }

  if (item.kind === "stock-check") {
    if (!isStockCheckLike(item.payload)) throw new Error("Conferencia offline invalida");
    await syncStockCheckToRemote(item.payload);
    return;
  }

  if (!isStockExitInputLike(item.payload)) throw new Error("Saida offline invalida");
  await syncStockExitToRemote(item.payload);
}

function enqueueCleaningOfflineItem(kind: CleaningOfflineQueueKind, localId: string, payload: CleaningOfflineQueueItem["payload"]) {
  const queue = getCleaningOfflineQueue();
  const queueId = `${kind}:${localId}`;
  const existingItem = queue.find((item) => item.id === queueId);
  const nextItem: CleaningOfflineQueueItem = {
    id: queueId,
    kind,
    createdAt: existingItem?.createdAt ?? new Date().toISOString(),
    attempts: existingItem?.attempts ?? 0,
    lastAttemptAt: existingItem?.lastAttemptAt,
    lastError: existingItem?.lastError,
    payload,
  };
  saveCleaningOfflineQueue([nextItem, ...queue.filter((item) => item.id !== queueId)]);
}

function saveCleaningOfflineQueue(queue: CleaningOfflineQueueItem[]) {
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function summarizeCleaningOfflineQueue(queue: CleaningOfflineQueueItem[]): CleaningOfflineQueueSummary {
  return queue.reduce<CleaningOfflineQueueSummary>(
    (summary, item) => ({
      total: summary.total + 1,
      orders: summary.orders + (item.kind === "order" ? 1 : 0),
      stockChecks: summary.stockChecks + (item.kind === "stock-check" ? 1 : 0),
      stockExits: summary.stockExits + (item.kind === "stock-exit" ? 1 : 0),
    }),
    { total: 0, orders: 0, stockChecks: 0, stockExits: 0 },
  );
}

function isCleaningOfflineQueueItem(value: unknown): value is CleaningOfflineQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CleaningOfflineQueueItem>;
  return (
    typeof item.id === "string" &&
    (item.kind === "order" || item.kind === "stock-check" || item.kind === "stock-exit") &&
    typeof item.createdAt === "string" &&
    typeof item.attempts === "number" &&
    Boolean(item.payload)
  );
}

function isCleaningOrderLike(value: unknown): value is CleaningOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<CleaningOrder>;
  return typeof order.id === "string" && order.solicitante === "Neia" && Array.isArray(order.itens);
}

function isStockCheckLike(value: unknown): value is StockCheck {
  if (!value || typeof value !== "object") return false;
  const check = value as Partial<StockCheck>;
  return typeof check.id === "string" && check.conferente === "Neia" && Array.isArray(check.itens);
}

function isStockExitInputLike(value: unknown): value is StockExitInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<StockExitInput>;
  return Boolean(input.product) && typeof input.quantity === "number" && typeof input.userId === "string" && typeof input.userName === "string";
}

function createOfflineOperationId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Falha ao sincronizar";
}

async function getRemoteCleaningProducts(): Promise<ProductRow[]> {
  const query = [
    "select=slug,name,category_slug,unit,active,barcode,current_stock,min_stock,photo_data",
    `category_slug=eq.${CLEANING_CATEGORY_SLUG}`,
    "active=eq.true",
    "order=name.asc",
  ].join("&");

  try {
    const response = await fetch(`${CLOUD_URL}/rest/v1/products?${query}`, { headers: apiHeaders() });
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as ProductRow[];
  } catch (error) {
    const fallbackQuery = [
      "select=slug,name,category_slug,unit,active,barcode,current_stock,min_stock",
      `category_slug=eq.${CLEANING_CATEGORY_SLUG}`,
      "active=eq.true",
      "order=name.asc",
    ].join("&");
    const response = await fetch(`${CLOUD_URL}/rest/v1/products?${fallbackQuery}`, { headers: apiHeaders() });
    if (!response.ok) throw error;
    return await response.json() as ProductRow[];
  }
}

async function fetchRemoteStockMovements(): Promise<StockMovementRow[]> {
  const response = await fetch(
    `${CLOUD_URL}/rest/v1/stock_movements?select=id,created_at,product_slug,product_name,unit,barcode,movement_type,quantity,user_id,user_name,observation,source&order=created_at.desc`,
    { headers: apiHeaders() },
  );
  if (!response.ok) throw new Error("Erro ao buscar movimentacoes");
  return await response.json() as StockMovementRow[];
}

async function deleteAllRows(table: string) {
  await request(`${CLOUD_URL}/rest/v1/${table}?id=not.is.null`, {
    method: "DELETE",
  });
}

function saveLocalInventoryProducts(inventoryProducts: InventoryProduct[]) {
  const cleanProducts = inventoryProducts.filter(isCleaningInventoryProduct);
  const serializedProducts = JSON.stringify(cleanProducts);
  if (serializedProducts.length > INVENTORY_STORAGE_MAX_CHARS) {
    throw new InventoryStorageTooLargeError();
  }
  window.localStorage.setItem(INVENTORY_KEY, serializedProducts);
}

function saveLocalStockMovements(movements: StockMovement[]) {
  window.localStorage.setItem(STOCK_MOVEMENTS_KEY, JSON.stringify(movements));
}

function baseInventory(): InventoryProduct[] {
  return baseProducts
    .filter((product) => !isCopaCafeProduct(product.id, product.name))
    .map((product) => ({ ...product, currentStock: 0, minStock: 0 }));
}

function isInventoryProductLike(value: unknown): value is Partial<InventoryProduct> & { id: string; name: string } {
  if (!value || typeof value !== "object") return false;
  const product = value as Partial<InventoryProduct>;
  return typeof product.id === "string" && typeof product.name === "string";
}

function normalizeInventoryProduct(product: Partial<InventoryProduct> & { id: string; name: string }): InventoryProduct {
  return {
    id: product.id,
    name: product.name || "Produto",
    unit: product.unit || DEFAULT_PRODUCT_UNIT,
    barcode: product.barcode || undefined,
    photoData: product.photoData || undefined,
    currentStock: Number.isFinite(Number(product.currentStock)) ? Number(product.currentStock) : 0,
    minStock: Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : 0,
  };
}

function isCleaningInventoryProduct(product: InventoryProduct) {
  return !isCopaCafeProduct(product.id, product.name);
}

function isCopaCafeProduct(productId: string, productName: string) {
  const normalizedId = normalizeSearchText(productId);
  const normalizedName = normalizeSearchText(productName);
  return [
    "copo",
    "descartavel",
    "cafe",
    "cappuccino",
    "achocolatado",
    "kitkat",
    "alpino",
    "lindoya",
    "bebida",
  ].some((term) => normalizedId.includes(term) || normalizedName.includes(term));
}

function mapProductRow(row: ProductRow): InventoryProduct {
  return {
    id: row.slug,
    name: row.name,
    unit: row.unit || DEFAULT_PRODUCT_UNIT,
    barcode: row.barcode ?? undefined,
    photoData: row.photo_data ?? undefined,
    currentStock: Number(row.current_stock ?? 0),
    minStock: Number(row.min_stock ?? 0),
  };
}

function mapStockMovementRow(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_slug,
    productName: row.product_name,
    unit: row.unit,
    barcode: row.barcode ?? undefined,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    userId: row.user_id,
    userName: row.user_name,
    createdAt: row.created_at,
    observation: row.observation ?? undefined,
  };
}

function addLocalStockExit(input: StockExitInput) {
  const movement: StockMovement = {
    id: crypto.randomUUID ? crypto.randomUUID() : `movement-${Date.now()}`,
    productId: input.product.id,
    productName: input.product.name,
    unit: input.product.unit,
    barcode: input.product.barcode,
    movementType: "saida",
    quantity: input.quantity,
    userId: input.userId,
    userName: input.userName,
    createdAt: new Date().toISOString(),
    observation: input.observation?.trim() || undefined,
  };
  saveLocalStockMovements([movement, ...getLocalStockMovements()]);
  saveLocalInventoryProducts(getLocalInventoryProducts().map((product) => product.id === input.product.id ? { ...product, currentStock: Math.max(0, Number(product.currentStock || 0) - input.quantity) } : product));
}

function getLegacyProductPhotos(): Record<string, string> {
  const rawPhotos = window.localStorage.getItem(LEGACY_PRODUCT_PHOTOS_KEY);
  if (!rawPhotos) return {};
  try {
    const parsed = JSON.parse(rawPhotos);
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch { return {}; }
}

function getLegacyProductPhotoKey(productName: string) {
  return normalizeSearchText(productName);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
