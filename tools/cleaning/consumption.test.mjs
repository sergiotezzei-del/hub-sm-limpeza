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
const order = (id, data, quantity = 12) => ({ id, data, hora: "09:00", solicitante: "Neia", status: "Pedido feito", itens: [{ id, productName: "Detergente", quantity, unit: "Unidade" }] });
const base = { products: [product], checks: [final, initial], movements: [movement("exit", "saida", 1)], orders: [] };
const query = { productId: product.id, mode: "checks", days: 20, from: "", to: "", startId: "", endId: "" };

test("realistic discrepancy: physical reduction 13, recorded exit 1, difference 12", () => {
  const r = calculate(base, query, now);
  assert.equal(r.exits, 1);
  assert.equal(r.entries, 0);
  assert.equal(r.comparison.estimated, 13);
  assert.equal(r.comparison.difference, 12);
});

test("received entries count once; orders never count as received stock", () => {
  const r = calculate({ ...base, movements: [...base.movements, movement("entry", "entrada", 5)], orders: [order("pending", "15/08/2026", 200)] }, query, now);
  assert.equal(r.entries, 5);
  assert.equal(r.comparison.estimated, 18);
  assert.equal(r.orders.length, 1);
});

test("adjustments are neither exits nor entries and suppress an unreliable estimate", () => {
  const r = calculate({ ...base, movements: [...base.movements, movement("adjust", "ajuste", -4)] }, query, now);
  assert.equal(r.exits, 1);
  assert.equal(r.entries, 0);
  assert.equal(r.comparison.estimated, null);
  assert.match(r.comparison.reason, /ajustes/);
});

test("negative reduction is not reported as negative consumption", () => {
  const r = calculate({ ...base, checks: [initial, check("last", final.data, final.hora, 20)] }, query, now);
  assert.equal(r.comparison.estimated, null);
  assert.match(r.comparison.reason, /aumentou/);
});

test("conference window excludes its opening instant and includes its closing instant", () => {
  const r = calculate({ ...base, movements: [movement("before", "saida", 10, "2026-08-11T13:43:00Z"), movement("end", "saida", 2, "2026-09-02T14:33:00Z"), movement("after", "saida", 10, "2026-09-02T14:33:01Z")] }, query, now);
  assert.equal(r.exits, 2);
});

test("same-day custom dates use Brazil midnight and exclude next midnight", () => {
  const q = { ...query, mode: "dates", from: "2026-08-18", to: "2026-08-18" };
  const r = calculate({ ...base, movements: [movement("before", "saida", 10, "2026-08-18T02:59:59Z"), movement("start", "saida", 2, "2026-08-18T03:00:00Z"), movement("end", "saida", 3, "2026-08-19T02:59:59Z"), movement("after", "saida", 10, "2026-08-19T03:00:00Z")] }, q, now);
  assert.equal(r.exits, 5);
  assert.equal(r.comparison, null);
});

test("last N days include today in Brazil, even when UTC has changed date", () => {
  const r = calculate(base, { ...query, mode: "days", days: 2 }, new Date("2026-09-03T01:00:00Z"));
  assert.equal(new Date(r.from).toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(new Date(r.to).toISOString(), "2026-09-03T01:00:00.000Z");
});

test("dates with no physical counts still show recorded exits", () => {
  const r = calculate({ ...base, checks: [] }, { ...query, mode: "days" }, now);
  assert.equal(r.exits, 1);
  assert.equal(r.comparison, null);
});

test("invalid dates, reversed periods, zero days and missing anchors are rejected", () => {
  assert.throws(() => calculate(base, { ...query, mode: "dates", from: "2026-02-30", to: "2026-03-02" }, now), /válida/);
  assert.throws(() => calculate(base, { ...query, mode: "dates", from: "2026-09-01", to: "2026-08-01" }, now), /final/);
  assert.throws(() => calculate(base, { ...query, mode: "days", days: 0 }, now), /dias/);
  assert.throws(() => calculate(base, { ...query, startId: "unknown" }, now), /duas conferências/);
  assert.throws(() => calculate(base, { ...query, startId: "last", endId: "first" }, now), /início/);
  assert.throws(() => calculate(base, { ...query, mode: "dates", from: "2026-09-01", to: "2027-01-01" }, now), /futuro/);
});

test("only Neia counts with matching, unambiguous names and units form anchors", () => {
  const admin = check("admin", final.data, "11:34", 100, { conferente: "Tezzei - ajuste administrativo" });
  const duplicates = { ...final, id: "duplicate", itens: [...final.itens, ...final.itens] };
  const otherUnit = { ...final, id: "liters", itens: [{ ...final.itens[0], unit: "Litro" }] };
  assert.deepEqual(productCheckReadings(product, [admin, duplicates, otherUnit, initial]).map((r) => r.check.id), ["first"]);
  assert.throws(() => calculate({ ...base, checks: [admin, initial] }, query, now), /duas conferências/);
});

test("incompatible movement units cannot silently produce a total", () => {
  assert.throws(() => calculate({ ...base, movements: [movement("bad", "saida", 1, undefined, { unit: "Litro" })] }, query, now), /incompatíveis/);
});

test("fractional quantities avoid floating-point artifacts", () => {
  const r = calculate({ ...base, movements: [movement("a", "saida", 0.1), movement("b", "saida", 0.2)] }, query, now);
  assert.equal(r.exits, 0.3);
});

test("other products and deleted orders do not affect a product interval", () => {
  const orders = [order("first", "01/08/2026"), order("last", "01/09/2026"), { ...order("deleted", "02/09/2026"), deletedAt: now.toISOString() }];
  const r = calculate({ ...base, orders, movements: [...base.movements, movement("other", "saida", 100, undefined, { productId: "sabao" })] }, { ...query, mode: "orders" }, now);
  assert.equal(r.exits, 1);
  assert.equal(r.entries, 0);
  assert.deepEqual(r.orders.map((o) => o.id), ["last", "first"]);
  assert.equal(r.comparison, null);
});

test("a subperiod comparison keeps its own bounds instead of claiming the full date range", () => {
  const r = calculate(base, { ...query, mode: "dates", from: "2026-08-01", to: "2026-09-02" }, now);
  assert.ok(r.comparison.first.time > r.from);
  assert.ok(r.comparison.last.time < r.to);
});

test("questions resolve product and explicit days, dates, checks or orders", () => {
  assert.equal(parse("Quanto de DETERGENTE gastamos nos últimos 20 dias?", [product]).days, 20);
  assert.equal(parse("Detergente entre as últimas duas conferências", [product]).mode, "checks");
  assert.equal(parse("Detergente entre os últimos dois pedidos", [product]).mode, "orders");
  assert.equal(parse("Detergente de 11/08/2026 a 02/09/2026", [product]).from, "2026-08-11");
  assert.equal(parse("Detergente hoje", [product]).days, 1);
});

test("ambiguous product or missing period is rejected, never guessed", () => {
  assert.throws(() => parse("Detergente", [product]), /Indique/);
  assert.throws(() => parse("Sabão nos últimos 10 dias", [product]), /produto/);
  assert.throws(() => parse("Detergente e sabão nos últimos 10 dias", [product, { ...product, id: "sabao", name: "Sabão" }]), /produto/);
  assert.throws(() => parse("Detergente entre pedidos e conferências", [product]), /Indique/);
  assert.throws(() => parse("Detergente nas últimas 5 conferências", [product]), /Indique/);
});
