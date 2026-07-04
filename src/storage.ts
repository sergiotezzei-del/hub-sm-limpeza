import type { CleaningOrder } from "./types";

const ORDERS_KEY = "hub-sm-cleaning-orders";

export function getOrders(): CleaningOrder[] {
  const rawOrders = window.localStorage.getItem(ORDERS_KEY);

  if (!rawOrders) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawOrders);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrders(orders: CleaningOrder[]) {
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function addOrder(order: CleaningOrder) {
  const orders = getOrders();
  saveOrders([order, ...orders]);
}

export function updateOrder(updatedOrder: CleaningOrder) {
  const orders = getOrders().map((order) =>
    order.id === updatedOrder.id ? updatedOrder : order,
  );
  saveOrders(orders);
}

export function deleteOrder(orderId: string) {
  const orders = getOrders().filter((order) => order.id !== orderId);
  saveOrders(orders);
}
