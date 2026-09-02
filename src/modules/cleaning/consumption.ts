import type { CleaningOrder, InventoryProduct, StockCheck, StockCheckItem, StockMovement } from "../../types";
import { neiaStockChecks, stockCheckTime } from "./stockHistory";

export type ConsumptionData = { products: InventoryProduct[]; checks: StockCheck[]; orders: CleaningOrder[]; movements: StockMovement[] };
export type ConsumptionIntent = "consumption" | "purchases";
export type ConsumptionQuery = {
  productId: string;
  intent: ConsumptionIntent;
  mode: "days" | "dates" | "checks" | "orders" | "recent-orders";
  days: number;
  from: string;
  to: string;
  startId: string;
  endId: string;
  recentOrders: number;
};
export type CheckReading = { check: StockCheck; item: StockCheckItem; time: number };
export type ConsumptionReport = ReturnType<typeof calculateConsumption>;

export function normalizeConsumptionText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const same = (a: string, b: string) => normalizeConsumptionText(a) === normalizeConsumptionText(b);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const sum = (items: { quantity: number }[]) => round(items.reduce((total, item) => total + item.quantity, 0));

export function productCheckReadings(product: InventoryProduct, checks: StockCheck[]): CheckReading[] {
  return neiaStockChecks(checks).flatMap((check) => {
    const items = check.itens.filter((item) => same(item.productName, product.name));
    if (items.length !== 1 || !same(items[0].unit, product.unit) || !Number.isFinite(items[0].quantity) || items[0].quantity < 0) return [];
    const time = stockCheckTime(check);
    return time ? [{ check, item: items[0], time }] : [];
  });
}

function orderTime(order: CleaningOrder) {
  const [day, month, year] = order.data.split("/");
  return Date.parse(`${year}-${month}-${day}T${order.hora}:00-03:00`);
}

export function productOrders(product: InventoryProduct, orders: CleaningOrder[]) {
  return orders.filter((order) => !order.deletedAt && order.itens.some((item) => same(item.productName, product.name)))
    .filter((order) => Number.isFinite(orderTime(order))).sort((a, b) => orderTime(b) - orderTime(a));
}

function orderedQuantity(product: InventoryProduct, order: CleaningOrder) {
  const items = order.itens.filter((item) => same(item.productName, product.name));
  if (items.some((item) => !same(item.unit, product.unit) || !Number.isFinite(item.quantity) || item.quantity < 0)) {
    throw new Error(`O pedido de ${order.data} tem unidade ou quantidade incompatível para ${product.name}.`);
  }
  return sum(items);
}

export function brazilDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function dayStart(value: string) {
  const time = Date.parse(`${value}T00:00:00-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || brazilDate(new Date(time)) !== value) {
    throw new Error("Informe uma data válida.");
  }
  return time;
}

export function parseConsumptionQuestion(question: string, products: InventoryProduct[]): ConsumptionQuery {
  const text = normalizeConsumptionText(question);
  const words = ` ${text.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  const matches = products.filter((product) => words.includes(` ${normalizeConsumptionText(product.name).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `));
  const specific = matches.filter((product) => !matches.some((other) => other.id !== product.id && normalizeConsumptionText(other.name).includes(normalizeConsumptionText(product.name)) && other.name.length > product.name.length));
  if (specific.length !== 1) throw new Error("Informe um produto pelo nome do cadastro ou use ‘Escolher produto e período’. ");

  const purchaseIntent = /\b(?:compramos|comprou|compraram|pedimos|pediram|adquirimos|adquiriram)\b/.test(text)
    || /\b(?:foi|foram) (?:comprado|comprada|comprados|compradas|pedido|pedida|pedidos|pedidas)\b/.test(text);
  const query: ConsumptionQuery = {
    productId: specific[0].id,
    intent: purchaseIntent ? "purchases" : "consumption",
    mode: purchaseIntent ? "recent-orders" : "checks",
    days: 30,
    from: "",
    to: "",
    startId: "",
    endId: "",
    recentOrders: 1,
  };

  const dates = [...text.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)];
  if (dates.length) {
    if (dates.length !== 2) throw new Error("Informe as duas datas, como 11/08/2026 a 02/09/2026.");
    return { ...query, mode: "dates", from: `${dates[0][3]}-${dates[0][2]}-${dates[0][1]}`, to: `${dates[1][3]}-${dates[1][2]}-${dates[1][1]}` };
  }

  const days = /\b(?:ultimos|ultimas)\s+(\d+)\s+dias?\b/.exec(text);
  if (days) return { ...query, mode: "days", days: Number(days[1]) };
  if (/\bhoje\b/.test(text)) return { ...query, mode: "days", days: 1 };
  if (/\b(?:ultimo mes|ultimos 30 dias)\b/.test(text)) return { ...query, mode: "days", days: 30 };

  if (query.intent === "purchases") {
    const count = /\bultim(?:os|as)\s+(\d+)\s+(?:pedidos|compras)\b/.exec(text);
    if (count) return { ...query, mode: "recent-orders", recentOrders: Number(count[1]) };
    if (/\bultim(?:os|as)\s+(?:dois|duas)\s+(?:pedidos|compras)\b/.test(text)) return { ...query, mode: "recent-orders", recentOrders: 2 };
    if (/\bultimo pedido\b/.test(text)) return { ...query, mode: "recent-orders", recentOrders: 1 };
    if (/\bultimas compras\b/.test(text)) return { ...query, mode: "recent-orders", recentOrders: 2 };
    throw new Error("Para compras, indique ‘no último pedido’, ‘nas últimas 2 compras’, ‘nos últimos 30 dias’ ou duas datas com ano.");
  }

  if (/\b(?:ultimas (?:duas|2) conferencias|entre (?:as )?conferencias)\b/.test(text) && !/\b(?:pedidos|compras)\b/.test(text)) return query;
  if (/\b(?:ultimos (?:dois|2) pedidos|ultimas (?:duas|2) compras|entre (?:os )?pedidos|entre (?:as )?compras|nas ultimas compras)\b/.test(text) && !/\bconferencias\b/.test(text)) return { ...query, mode: "orders" };
  throw new Error("Indique ‘nos últimos 20 dias’, duas datas com ano, ‘entre as últimas duas conferências’ ou ‘entre os últimos dois pedidos’.");
}

export function calculateConsumption(data: ConsumptionData, query: ConsumptionQuery, now = new Date()) {
  const product = data.products.find((item) => item.id === query.productId);
  if (!product) throw new Error("Escolha um produto cadastrado.");
  const readings = productCheckReadings(product, data.checks);
  const orders = productOrders(product, data.orders);

  if (query.intent === "purchases" && query.mode === "recent-orders") {
    if (!Number.isInteger(query.recentOrders) || query.recentOrders < 1 || query.recentOrders > 20) throw new Error("Escolha entre 1 e 20 pedidos.");
    const selected = orders.slice(0, query.recentOrders);
    if (!selected.length) throw new Error("Não há pedidos desse produto no histórico.");
    const orderDetails = selected.map((order) => ({ order, quantity: orderedQuantity(product, order) }));
    const times = selected.map(orderTime);
    return {
      product, intent: query.intent, mode: query.mode,
      from: Math.min(...times), to: Math.max(...times), days: 0,
      exits: 0, entries: 0, ordered: sum(orderDetails), movements: [] as StockMovement[], comparison: null,
      orders: selected, orderDetails,
    };
  }

  let from: number;
  let to: number;
  const boundaryPeriod = query.mode === "checks" || query.mode === "orders";
  let firstReading: CheckReading | undefined;
  let lastReading: CheckReading | undefined;

  if (query.mode === "checks") {
    if (query.intent === "purchases") throw new Error("Compras não são calculadas por conferências. Escolha pedidos, dias ou datas.");
    firstReading = query.startId ? readings.find((r) => r.check.id === query.startId) : readings[1];
    lastReading = query.endId ? readings.find((r) => r.check.id === query.endId) : readings[0];
    if (!firstReading || !lastReading) throw new Error("São necessárias duas conferências da Neia com este produto e a mesma unidade.");
    from = firstReading.time;
    to = lastReading.time;
  } else if (query.mode === "orders") {
    if (query.intent === "purchases") throw new Error("Para compras, escolha os últimos pedidos, dias ou datas.");
    const first = query.startId ? orders.find((r) => r.id === query.startId) : orders[1];
    const last = query.endId ? orders.find((r) => r.id === query.endId) : orders[0];
    if (!first || !last) throw new Error("São necessários dois pedidos deste produto para comparar o intervalo.");
    from = orderTime(first);
    to = orderTime(last);
  } else {
    if (query.mode === "days") {
      if (!Number.isInteger(query.days) || query.days < 1 || query.days > 3650) throw new Error("Escolha entre 1 e 3650 dias.");
      to = now.getTime();
      from = dayStart(brazilDate(now)) - (query.days - 1) * 86400000;
    } else if (query.mode === "dates") {
      from = dayStart(query.from);
      if (query.to > brazilDate(now)) throw new Error("O período não pode terminar no futuro.");
      to = Math.min(dayStart(query.to) + 86400000, now.getTime());
      if (query.to < query.from) throw new Error("A data final deve ser igual ou posterior à inicial.");
    } else {
      throw new Error("Escolha um período válido.");
    }
  }

  if (from >= to) throw new Error("Escolha um início anterior ao fim do período, sem datas futuras.");
  if (to > now.getTime()) throw new Error("O período não pode terminar no futuro.");
  const isWithin = (time: number) => (boundaryPeriod ? time > from : time >= from) && (boundaryPeriod ? time <= to : time < to);
  const periodOrders = orders.filter((order) => isWithin(orderTime(order)));
  const orderDetails = periodOrders.map((order) => ({ order, quantity: orderedQuantity(product, order) }));

  if (query.intent === "purchases") {
    return {
      product, intent: query.intent, mode: query.mode, from, to, days: round((to - from) / 86400000),
      exits: 0, entries: 0, ordered: sum(orderDetails), movements: [] as StockMovement[], comparison: null,
      orders: periodOrders, orderDetails,
    };
  }

  const movements = data.movements.filter((movement) => movement.productId === product.id && isWithin(Date.parse(movement.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (movements.some((m) => !same(m.unit, product.unit) || !Number.isFinite(m.quantity) || (m.movementType !== "ajuste" && m.quantity < 0))) {
    throw new Error("Há registros com unidades ou quantidades incompatíveis neste período. Confira o histórico antes de calcular.");
  }
  const exits = movements.filter((m) => m.movementType === "saida");
  const entries = movements.filter((m) => m.movementType === "entrada");
  if (!boundaryPeriod || query.mode === "orders") {
    const within = readings.filter((r) => r.time >= from && r.time <= to);
    if (within.length >= 2) {
      firstReading = within[within.length - 1];
      lastReading = within[0];
    }
  }

  let comparison: { first: CheckReading; last: CheckReading; entries: number; exits: number; estimated: number | null; difference: number | null; reason: string } | null = null;
  if (firstReading && lastReading && lastReading.time > firstReading.time) {
    const between = data.movements.filter((m) => m.productId === product.id && Date.parse(m.createdAt) > firstReading.time && Date.parse(m.createdAt) <= lastReading.time);
    const received = sum(between.filter((m) => m.movementType === "entrada"));
    const recorded = sum(between.filter((m) => m.movementType === "saida"));
    const reduction = round(firstReading.item.quantity + received - lastReading.item.quantity);
    const reason = between.some((m) => !same(m.unit, product.unit) || !Number.isFinite(m.quantity) || (m.movementType !== "ajuste" && m.quantity < 0))
      ? "Há unidades ou quantidades incompatíveis entre as conferências."
      : between.some((m) => m.movementType === "ajuste")
        ? "Há ajustes de estoque entre as conferências; não é possível atribuir toda a diferença ao uso."
        : reduction < 0 ? "O estoque aumentou além das entradas registradas. Confira os recebimentos e as contagens." : "";
    comparison = { first: firstReading, last: lastReading, entries: received, exits: recorded, estimated: reason ? null : reduction, difference: reason ? null : round(reduction - recorded), reason };
  }

  return {
    product, intent: query.intent, mode: query.mode, from, to, days: round((to - from) / 86400000),
    exits: sum(exits), entries: sum(entries), ordered: sum(orderDetails), movements, comparison,
    orders: periodOrders, orderDetails,
  };
}
