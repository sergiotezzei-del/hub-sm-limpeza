import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("vite")] }));
const build = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("../../src/modules/cleaning/consumption.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false,
});
const { calculateConsumption: calculate, parseConsumptionQuestion: parse, productCheckReadings } = await import(`data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString("base64")}`);
const now = new Date("2026-09-02T15:00:00Z");
const product = { id: "detergente", name: "Detergente", unit: "Unidade", currentStock: 12, minStock: 0 };
const check = (id, data, hora, quantity, extra = {}) => ({ id, data, hora, conferente: "Neia", itens: [{ id, productName: "Detergente", unit: "Unidade", quantity }], ...extra });
const initial = check("first", "11/08/2026", "10:43", 14);
const final = check("last", "02/09/2026", "11:33", 1);
const movement = (id, movementType, quantity, createdAt = "2026-08-18T13:24:44Z", extra = {}) => ({ id, productId: product.id, productName: product.name, movementType, quantity, createdAt, unit: "Unidade", userId: "neia", userName: "Neia", ...extra });
const order = (id, data, quantity = 12, extra = {}) => ({ id, data, hora: "09:00", solicitante: "Neia", status: "Pedido feito", itens: [{ id, productName: "Detergente", quantity, unit: "Unidade" }], ...extra });
const base = { products: [product], checks: [final, initial], movements: [movement("exit", "saida", 1)], orders: [] };
const query = { productId: product.id, intent: "consumption", mode: "checks", days: 20, from: "", to: "", startId: "", endId: "", recentOrders: 1 };

test("consumption between conferences uses physical counts and entries", () => {
  const r = calculate(base, query, now);
  assert.equal(r.exits, 1);
  assert.equal(r.entries, 0);
  assert.equal(r.comparison.estimated, 13);
  assert.equal(r.comparison.difference, 12);
});

test("received entries count once and orders never become received stock", () => {
  const r = calculate({ ...base, movements: [...base.movements, movement("entry", "entrada", 5)], orders: [order("pending", "15/08/2026", 200)] }, query, now);
  assert.equal(r.entries, 5);
  assert.equal(r.comparison.estimated, 18);
});

test("adjustments suppress unreliable consumption estimates", () => {
  const r = calculate({ ...base, movements: [...base.movements, movement("adjust", "ajuste", -4)] }, query, now);
  assert.equal(r.comparison.estimated, null);
  assert.match(r.comparison.reason, /ajustes/);
});

test("last N days include today in Brazil", () => {
  const r = calculate(base, { ...query, mode: "days", days: 2 }, new Date("2026-09-03T01:00:00Z"));
  assert.equal(new Date(r.from).toISOString(), "2026-09-01T03:00:00.000Z");
});

test("only Neia counts with matching units form anchors", () => {
  const admin = check("admin", final.data, "11:34", 100, { conferente: "Tezzei - ajuste administrativo" });
  const otherUnit = { ...final, id: "liters", itens: [{ ...final.itens[0], unit: "Litro" }] };
  assert.deepEqual(productCheckReadings(product, [admin, otherUnit, initial]).map((r) => r.check.id), ["first"]);
});

test("natural language resolves consumption examples", () => {
  assert.equal(parse("Quanto de DETERGENTE gastamos nos últimos 20 dias?", [product]).days, 20);
  assert.equal(parse("Detergente entre as últimas duas conferências", [product]).mode, "checks");
});

test("natural language resolves purchase examples", () => {
  const lastOrder = parse("Quanto de detergente compramos no último pedido?", [product]);
  assert.equal(lastOrder.intent, "purchases");
  assert.equal(lastOrder.mode, "recent-orders");
  assert.equal(lastOrder.recentOrders, 1);
  const lastMonth = parse("Quanto de detergente compramos no último mês?", [product]);
  assert.equal(lastMonth.intent, "purchases");
  assert.equal(lastMonth.mode, "days");
  assert.equal(lastMonth.days, 30);
});

test("last order returns quantity recorded in Pedido feito", () => {
  const data = { ...base, orders: [order("older", "10/08/2026", 6), order("latest", "01/09/2026", 14)] };
  const r = calculate(data, { ...query, intent: "purchases", mode: "recent-orders", recentOrders: 1 }, now);
  assert.equal(r.ordered, 14);
  assert.deepEqual(r.orders.map((item) => item.id), ["latest"]);
});

test("new and deleted orders do not count as purchases", () => {
  const data = { ...base, orders: [
    order("done", "01/09/2026", 14),
    order("new", "02/09/2026", 100, { status: "Novo" }),
    order("deleted", "02/09/2026", 200, { deletedAt: now.toISOString() }),
  ] };
  const r = calculate(data, { ...query, intent: "purchases", mode: "recent-orders", recentOrders: 3 }, now);
  assert.equal(r.ordered, 14);
  assert.deepEqual(r.orders.map((item) => item.id), ["done"]);
});

test("last month sums only completed orders inside period", () => {
  const data = { ...base, orders: [order("old", "01/07/2026", 100), order("a", "10/08/2026", 6), order("b", "01/09/2026", 14)] };
  const r = calculate(data, { ...query, intent: "purchases", mode: "days", days: 30 }, now);
  assert.equal(r.ordered, 20);
});
