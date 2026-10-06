import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const attentionSource = ts.transpileModule(
  readFileSync(new URL("../src/modules/alerts/browserAlertAttention.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

class EventBus {
  listeners = new Map();
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) ?? []) handler(event);
  }
}

class FakeElement {
  dataset = {};
  attributes = new Map();
  classes = new Set();
  isConnected = true;
  display = "block";
  classList = {
    contains: (name) => this.classes.has(name),
    add: (name) => this.classes.add(name),
    remove: (name) => this.classes.delete(name),
    toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name),
  };
  constructor(title = "", key = "") {
    this.title = title;
    if (key) this.dataset.hubAlertKey = key;
  }
  querySelector(selector) {
    if (selector === "h3") return { textContent: this.title };
    if (selector === "p") return { textContent: "Descrição" };
    if (selector === ".hub-alert-card-status span") return { textContent: this.status ?? "" };
    return null;
  }
  querySelectorAll() { return this.cards ?? []; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest(selector) {
    if (selector.includes("aria-hidden")) return this.attributes.has("aria-hidden") || this.attributes.has("hidden") ? this : null;
    return this;
  }
  scrollIntoView() {}
}

function frontend({ user = "tezzei", cards = [], legacy = 18, badgeApi = {} } = {}) {
  const document = new EventBus();
  document.documentElement = new FakeElement();
  document.title = "HUB Santa Maria";
  document.visibilityState = "visible";
  const root = new FakeElement();
  const panel = new FakeElement();
  panel.cards = cards;
  let mountedPanel = panel;
  document.getElementById = () => root;
  document.querySelector = (selector) => selector === ".hub-alert-panel" ? mountedPanel : null;
  document.querySelectorAll = () => mountedPanel?.cards ?? [];
  const session = new Map(user ? [["hub-sm-active-session", JSON.stringify({ currentUser: user })]] : []);
  const local = new Map([["hub-sm-unseen-alerts-v1", JSON.stringify(Array.from({ length: legacy }, (_, i) => ({ key: `old:${i}`, title: "Antigo", body: "Já concluído", firstSeenAt: "2026-10-06T00:00:00Z" })))]]);
  const storage = (data) => ({ getItem: (key) => data.get(key) ?? null, removeItem: (key) => data.delete(key) });
  const writes = [];
  const notifications = [];
  const closed = [];
  const timers = new Map();
  let timerId = 0;
  const window = new EventBus();
  window.setTimeout = window.setInterval = (handler, delay) => { timers.set(++timerId, { handler, delay }); return timerId; };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  const serviceWorker = new EventBus();
  let mutation;
  let observation;
  const context = vm.createContext({
    exports: {}, document, window, localStorage: storage(local), sessionStorage: storage(session),
    navigator: {
      serviceWorker,
      setAppBadge: async (count) => { writes.push(count); await badgeApi.set?.(count); },
      clearAppBadge: async () => { writes.push(0); await badgeApi.clear?.(); },
    },
    Element: FakeElement, getComputedStyle: (element) => ({ display: element.display }),
    MutationObserver: class {
      constructor(callback) { mutation = callback; }
      observe(_root, options) { observation = options; }
    },
    CustomEvent: class { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } },
    require: () => ({
      closeHubWindowsNotification: async (tag) => { closed.push(tag); },
      showHubWindowsNotification: async (...args) => { notifications.push(args); },
    }),
  });
  vm.runInContext(attentionSource, context);
  return {
    writes, notifications, closed, local, session, document, panel, serviceWorker,
    mutate: () => mutation(),
    observation: () => observation,
    mount: (value) => { mountedPanel = value; mutation(); },
    flush: () => vm.runInContext("badgeWrite.catch(() => undefined)", context),
    runTimer: (delay) => { for (const timer of [...timers.values()]) if (timer.delay === delay) timer.handler(); },
    changeUser: (nextUser) => {
      if (nextUser) session.set("hub-sm-active-session", JSON.stringify({ currentUser: nextUser }));
      else session.delete("hub-sm-active-session");
      document.dispatchEvent({ type: "hub:alert-session-change" });
    },
  };
}

test("abandona o contador legado de 18 e limpa o painel vazio, inclusive no keepalive", async () => {
  const app = frontend();
  await app.flush();
  app.runTimer(5000);
  app.runTimer(120000);
  await app.flush();
  assert.deepEqual(app.writes, [0, 0]);
  assert.equal(app.local.has("hub-sm-unseen-alerts-v1"), false);
  assert.equal(app.notifications.length, 0);
});

test("conta todas as pendências já existentes no carregamento inicial", async () => {
  const app = frontend({ cards: [new FakeElement("A"), new FakeElement("B")] });
  await app.flush();
  assert.equal(app.writes.at(-1), 2);
});

test("abrir/clicar não conclui; remover o último card limpa imediatamente e para a piscada", async () => {
  const app = frontend();
  app.runTimer(4000);
  const card = new FakeElement("Novo", "task:1");
  app.panel.cards = [card];
  app.mutate();
  await app.flush();
  assert.equal(app.writes.at(-1), 1);
  assert.ok(app.document.title.includes("NOVO ALERTA"));
  app.document.dispatchEvent({ type: "click", target: card });
  await app.flush();
  assert.equal(app.writes.at(-1), 1);
  // Uma operação FEITO que falhe mantém o card e portanto o badge.
  app.mutate();
  await app.flush();
  assert.equal(app.writes.at(-1), 1);
  app.panel.cards = [];
  app.mutate();
  await app.flush();
  app.runTimer(120000);
  assert.equal(app.writes.at(-1), 0);
  assert.equal(app.document.title, "HUB Santa Maria");
});

test("remoção externa fecha atenção e não envia lembrete de pendência concluída", async () => {
  const app = frontend();
  app.runTimer(4000);
  app.panel.cards = [new FakeElement("Novo", "task:1")];
  app.mutate();
  assert.equal(app.notifications.length, 1);
  app.panel.cards = [];
  app.mutate();
  app.runTimer(120000);
  await app.flush();
  assert.equal(app.writes.at(-1), 0);
  assert.equal(app.notifications.length, 1);
  assert.equal(app.document.documentElement.attributes.has("data-hub-alert-attention"), false);
});

test("respeita ocultação/deduplicação existente e observa alteração de atributos", async () => {
  const visible = new FakeElement("Ativo");
  const hidden = new FakeElement("Dispensado");
  hidden.setAttribute("aria-hidden", "true");
  const duplicate = new FakeElement("Duplicado");
  duplicate.display = "none";
  const app = frontend({ cards: [visible, hidden, duplicate] });
  await app.flush();
  assert.equal(app.writes.at(-1), 1);
  visible.display = "none";
  app.mutate();
  await app.flush();
  assert.equal(app.writes.at(-1), 0);
  assert.equal(app.observation().attributes, true);
  assert.ok(app.observation().attributeFilter.includes("style"));
});

test("operações já realizadas não contam; conferências e divergências pendentes contam", async () => {
  const history = new FakeElement("Entrega já lançada no estoque");
  history.classes.add("hub-cleaning-activity-card");
  history.status = "ENTREGA";
  const stockCheck = new FakeElement("Conferência a conferir");
  stockCheck.classes.add("hub-cleaning-activity-card");
  stockCheck.status = "CONFERÊNCIA";
  const divergence = new FakeElement("Divergência a analisar");
  divergence.classes.add("hub-cleaning-activity-card");
  divergence.classes.add("is-divergence");
  const app = frontend({ cards: [history, stockCheck, divergence] });
  await app.flush();
  assert.equal(app.writes.at(-1), 2);
});

test("navegação conserva o estado em memória; logout limpa mesmo antes de desmontar os cards", async () => {
  const app = frontend({ cards: [new FakeElement("A")] });
  await app.flush();
  app.mount(null);
  app.runTimer(5000);
  await app.flush();
  assert.equal(app.writes.at(-1), 1);
  app.mount(app.panel);
  app.changeUser(null);
  app.runTimer(5000);
  await app.flush();
  assert.equal(app.writes.at(-1), 0);
});

test("troca de usuário recalcula do zero e recarga nunca reutiliza o contador", async () => {
  const app = frontend({ cards: [new FakeElement("A"), new FakeElement("B")] });
  await app.flush();
  app.panel.cards = [new FakeElement("Outro usuário")];
  app.changeUser("outro");
  await app.flush();
  assert.deepEqual(app.writes.slice(-2), [0, 1]);
  const reloaded = frontend({ user: "outro", cards: [] });
  await reloaded.flush();
  assert.equal(reloaded.writes.at(-1), 0);
});

test("worker novo/atualização e mensagens de push reaplicam a contagem real", async () => {
  const app = frontend({ cards: [new FakeElement("A"), new FakeElement("B")] });
  await app.flush();
  app.serviceWorker.dispatchEvent({ type: "controllerchange" });
  app.serviceWorker.dispatchEvent({ type: "message", data: { type: "hub:refresh-alert-badge" } });
  await app.flush();
  assert.deepEqual(app.writes.slice(-2), [2, 2]);
});

test("evento de tarefa ausente do painel não inventa pendência ou notificação", async () => {
  const app = frontend();
  app.document.dispatchEvent({ type: "hub:new-alert-tasks", detail: { tasks: [{ id: "inexistente", title: "Outro usuário" }] } });
  await app.flush();
  app.runTimer(120000);
  assert.equal(app.writes.at(-1), 0);
  assert.equal(app.notifications.length, 0);
});

test("escritas assíncronas preservam o clear do logout como última operação", async () => {
  let release;
  const app = frontend({ cards: [new FakeElement("A")], badgeApi: { set: () => new Promise((resolve) => { release = resolve; }) } });
  // Deixa o set entrar na API antes de fazer logout.
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  assert.ok(release);
  app.changeUser(null);
  release();
  await app.flush();
  assert.equal(app.writes.at(-1), 0);
});

function worker() {
  const handlers = new Map();
  const writes = [];
  const shown = [];
  const messages = [];
  const deleted = [];
  const client = { postMessage: (message) => messages.push(message), focus: async () => undefined, navigate: async () => undefined };
  vm.runInNewContext(workerSource, {
    self: {
      addEventListener: (type, handler) => handlers.set(type, handler), skipWaiting: () => undefined,
      navigator: { setAppBadge: async (count) => writes.push(count), clearAppBadge: async () => writes.push(0) },
      registration: { showNotification: async (...args) => shown.push(args) },
      clients: { matchAll: async () => [client], claim: async () => undefined },
    },
    caches: { keys: async () => ["hub-santa-maria-v21", "hub-santa-maria-v24-email-badge-preview", "hub-marketing-push-state"], delete: async (key) => deleted.push(key), open: async () => ({ put: async () => undefined }) },
    Response,
  });
  return {
    writes, shown, messages, deleted,
    dispatch: async (type, fields) => {
      let completion;
      handlers.get(type)({ ...fields, waitUntil: (promise) => { completion = promise; } });
      await completion;
    },
  };
}

test("push continua mostrando notificação, sem setAppBadge(1), incluindo marketing", async () => {
  for (const kind of ["email", "marketing", "hub"]) {
    const sw = worker();
    await sw.dispatch("push", { data: { json: () => ({ title: "Real", data: { kind } }) } });
    assert.equal(sw.shown.length, 1);
    assert.deepEqual(sw.writes, []);
    assert.equal(sw.messages[0].type, "hub:refresh-alert-badge");
  }
});

test("clique na notificação não zera outras pendências", async () => {
  const sw = worker();
  await sw.dispatch("notificationclick", { notification: { data: { url: "/" }, close() {} } });
  assert.deepEqual(sw.writes, []);
  assert.equal(sw.messages[0].type, "hub:refresh-alert-badge");
});

test("ativação limpa badge legado, remove shell antigo e solicita recálculo", async () => {
  const sw = worker();
  await sw.dispatch("activate");
  assert.deepEqual(sw.writes, [0]);
  assert.deepEqual(sw.deleted, ["hub-santa-maria-v21"]);
  assert.equal(sw.messages[0].type, "hub:refresh-alert-badge");
});
