import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/modules/alerts/emailInboxService.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

function service({ rows = [], status = 200, code = "P0001" } = {}) {
  const requests = [];
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: () => ({
      RECOVERY_MODE: true,
      SUPABASE_URL: "https://preview.example",
      authenticatedSupabaseFetch: async (url, init) => {
        requests.push({ url, ...init });
        return { ok: status === 200, text: async () => JSON.stringify(rows) };
      },
      readSupabaseRestError: async () => ({ status, code }),
    }),
  });
  return { exports, requests };
}

test("recovery consulta a RPC real de status e preserva a pendência retornada", async () => {
  const api = service({ rows: [{ configured: true, pending_new_count: 1,
    last_checked_at: "2026-09-16T22:15:03.076113+00:00", last_error: null }] });
  const status = await api.exports.loadEmailInboxStatus();
  assert.equal(status.pendingNewCount, 1);
  assert.equal(status.configured, true);
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].url, "https://preview.example/rest/v1/rpc/hub_email_inbox_get_status");
  assert.equal(api.requests[0].method, "POST");
  assert.equal(api.requests[0].body, "{}");
});

test("recusa da RPC é propagada, sem fabricar status zerado", async () => {
  const api = service({ status: 400 });
  await assert.rejects(api.exports.loadEmailInboxStatus(),
    /EMAIL_INBOX_RPC_hub_email_inbox_get_status:400:P0001/);
});

test("configuração IMAP continua bloqueada no recovery e não envia credenciais", async () => {
  const api = service();
  await assert.rejects(api.exports.saveEmailInboxConfig("test@example.invalid", "test-only"),
    /EMAIL_INBOX_RECOVERY_BLOCKED/);
  assert.equal(api.requests.length, 0);
});

test("acknowledge encaminha o contrato correto no transporte simulado", async () => {
  // Apenas mock: nenhuma requisição HTTP ou mutação real é executada.
  const api = service();
  await api.exports.acknowledgeEmailInbox();
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].url, "https://preview.example/rest/v1/rpc/hub_email_inbox_acknowledge");
  assert.equal(api.requests[0].method, "POST");
  assert.equal(api.requests[0].body, "{}");
});
