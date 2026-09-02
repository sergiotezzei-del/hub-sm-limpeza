import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("vite")] }));
const root = fileURLToPath(new URL("../../", import.meta.url));
const bundle = await esbuild.build({
  stdin: { contents: 'export { buildActivities } from "./src/modules/alerts/CleaningActivityAlertEnhancer";', resolveDir: root, loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false, loader: { ".css": "empty" },
  plugins: [{ name: "isolated-services", setup(build) {
    build.onLoad({ filter: /\/src\/storage\.ts$/ }, () => ({ contents: "export const getOrders = async () => []; export const getStockChecks = async () => []; export const getStockMovements = async () => [];" }));
    build.onLoad({ filter: /\/cleaning\/services\/deliveryService\.ts$/ }, () => ({ contents: "export const loadCleaningDeliveries = async () => []; export const loadCleaningDeliveryApprovals = async () => [];" }));
    build.onLoad({ filter: /\/alerts\/attentionEventService\.ts$/ }, () => ({ contents: "export const loadAttentionEvents = async () => []; export const acknowledgeAttentionEvent = async () => {};" }));
  } }],
});
const { buildActivities } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const check = { id: "check", conferente: "Neia", data: new Date().toLocaleDateString("pt-BR"), hora: "10:00", itens: [] };
const event = { id: "event", sourceType: "stock_check", sourceId: check.id };

test("a pending Neia conference retains the persisted event ID for Feito", () => {
  const cards = buildActivities([], [check], [], [], [], [event]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].eventId, "event");
});

test("a completed conference does not reappear when rebuilding activities from stock history", () => {
  assert.equal(buildActivities([], [check], [], [], [], []).length, 0);
  assert.equal(buildActivities([], [check], [], [], [], []).length, 0);
});

test("an unrelated order event cannot revive a stock check alert", () => {
  assert.equal(buildActivities([], [check], [], [], [], [{ ...event, sourceType: "order" }]).length, 0);
});

test("pending stock check acknowledgments do not hide unresolved delivery divergences", () => {
  const approval = { id: "approval", requestedById: "neia", requestedByName: "Neia", requestedAt: new Date().toISOString(), status: "pending", items: [] };
  const cards = buildActivities([], [check], [], [], [approval], []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].kind, "divergence");
});
