import type { InventoryProduct, StockCheck, StockMovement } from "../../types";

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function stockCheckTime(check: StockCheck) {
  // The operator's date/time is the time of counting, including offline submissions.
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(check.data);
  const value = match
    ? Date.parse(`${match[3]}-${match[2]}-${match[1]}T${check.hora}:00-03:00`)
    : NaN;
  return Number.isFinite(value) ? value : Date.parse(check.createdAt ?? "") || 0;
}

export function neiaStockChecks(checks: StockCheck[]) {
  return checks.filter((check) => normalizeName(check.conferente) === "neia")
    .sort((a, b) => stockCheckTime(b) - stockCheckTime(a));
}

export function productStockActivity(products: InventoryProduct[], checks: StockCheck[], movements: StockMovement[]) {
  const latestCheckByName = new Map<string, StockCheck>();
  for (const check of [...checks].sort((a, b) => stockCheckTime(b) - stockCheckTime(a))) {
    for (const item of check.itens) {
      // Legacy check items retain the product name, but have no product foreign key.
      const name = normalizeName(item.productName);
      if (!latestCheckByName.has(name)) latestCheckByName.set(name, check);
    }
  }
  const latestExitById = new Map<string, StockMovement>();
  for (const movement of movements) {
    if (movement.movementType !== "saida") continue;
    const previous = latestExitById.get(movement.productId);
    if (!previous || Date.parse(movement.createdAt) > Date.parse(previous.createdAt)) {
      latestExitById.set(movement.productId, movement);
    }
  }
  return new Map(products.map((product) => [product.id, {
    check: latestCheckByName.get(normalizeName(product.name)),
    exit: latestExitById.get(product.id),
  }]));
}

export function stockHistoryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
