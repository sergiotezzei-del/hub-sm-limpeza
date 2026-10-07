import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual frontend functions against in-memory Auth/HTTP contracts.
// No network, real credentials, database writes or browser storage are used.
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function functions(path, names) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
      found.set(node.name.text, node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(found.size, names.length, 'frontend function not found');
  return names.map((name) => found.get(name)).join('\n');
}

function moduleSource(source, dependencies, globals = {}) {
  const exports = {};
  const context = vm.createContext({
    ...globals, exports, module: { exports },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), 'unexpected module dependency');
      return dependencies[name];
    },
  });
  vm.runInContext(compile(source), context);
  return context.module.exports;
}

const origin = 'https://hubsantamariatem.vercel.app';
const code = 'SYNTHETIC-TEST-ONLY';
const tokens = { access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token' };

function scenario({ id = 'tezzei', marketing = true, denyMarketing = false,
  invalidAuth = false, mismatchMarketing = false } = {}) {
  const events = [];
  const requests = [];
  const state = { currentUser: null, view: 'login', marketingSessionToken: null, password: code };
  const user = { id, name: 'SYNTHETIC TEST', active: true, permissions: marketing ? ['marketing'] : [] };
  let authSession = null;
  const authUser = { id: 'synthetic-auth-id', app_metadata: {
    managed_user_id: invalidAuth ? 'another-user' : id,
    role: id === 'tezzei' || id === 'recovery-ui-test' ? 'tezzei' : 'hub_user',
  } };
  const supabase = { auth: {
    async setSession(input) {
      assert.deepEqual(JSON.parse(JSON.stringify(input)), tokens);
      events.push('auth:setSession');
      authSession = { ...tokens, user: authUser };
      return { data: { session: authSession }, error: null };
    },
    async getSession() { return { data: { session: authSession }, error: null }; },
    async getUser() {
      events.push('auth:getUser');
      return { data: { user: authSession?.user }, error: authSession ? null : new Error('SIGNED_OUT') };
    },
    async signOut() { events.push('auth:signOut'); authSession = null; },
  } };
  const globals = {
    window: { setTimeout, clearTimeout, sessionStorage: { removeItem() { events.push('hub:clearStorage'); } } },
    AbortController, Event, console: { error() {}, log() {} },
    SUPABASE_URL: origin, readString: (value) => typeof value === 'string' && value ? value : undefined,
    getSupabaseClient: async () => supabase,
    rememberSupabaseSession() {}, activeSessionSnapshot: {},
    createAuthDiagnostic: () => ({}), logSupabaseAuthDiagnostic() {}, logSupabaseAuthProbeError() {},
    async authenticatedSupabaseFetch(url) {
      assert.equal(url, `${origin}/rest/v1/hub_alert_rules?select=id&limit=1`);
      assert.ok(authSession);
      events.push('rest:probe');
      return new Response('[]', { status: 200 });
    },
  };
  const auth = moduleSource(functions('src/modules/security/services/supabaseClient.ts', [
    'verifySupabaseAuthenticatedRest', 'installAndVerifyRecoveryAuthSession', 'signOutSupabaseAuth',
  ]), {}, globals);
  const transport = {
    ...globals,
    async fetch(url, init) {
      const body = JSON.parse(init.body);
      requests.push({ url, method: init.method, body, credentials: init.credentials, headers: init.headers });
      assert.ok(url.startsWith(origin + '/'));
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.cache, 'no-store');
      if (url.endsWith('/recovery-auth/v1/session')) {
        assert.deepEqual(body, { managedUserId: id, accessCode: code });
        events.push('bridge:auth');
        return Response.json(tokens);
      }
      assert.equal(init.headers.Authorization, `Bearer ${tokens.access_token}`);
      assert.ok(authSession);
      if (init.method === 'DELETE') {
        events.push('marketing:end');
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/session/refresh')) {
        assert.deepEqual(body, { sessionToken: 'synthetic-marketing-session' });
        events.push('marketing:refresh');
        return new Response(null, { status: 204 });
      }
      assert.deepEqual(body, { accessCode: code });
      events.push('bridge:marketing');
      return denyMarketing ? Response.json({ message: 'MARKETING_ACCESS_DENIED' }, { status: 403 })
        : Response.json({ session_token: 'synthetic-marketing-session', user_id: mismatchMarketing ? 'other' : id,
          expires_at: '2099-01-01T00:00:00Z' });
    },
  };
  const recovery = moduleSource(read('src/modules/security/services/recoveryAuthBridge.ts'), {
    './supabaseClient': { ...auth, SUPABASE_URL: origin },
  }, transport);
  const bridge = moduleSource(read('src/modules/marketing/marketingSessionBridge.ts'), {
    '../security/services/supabaseClient': {
      SUPABASE_URL: origin,
      getFreshSupabaseAccessToken: async () => authSession?.access_token,
      SupabaseAuthSessionRequiredError: class extends Error {},
      readSupabaseRestError: async (response) => response.json(),
    },
  }, transport);
  const marketingService = moduleSource(functions('src/modules/marketing/marketingService.ts', [
    'startMarketingSession', 'endMarketingSession',
  ]), {}, { ...bridge, MarketingRemoteError: class extends Error {} });
  const app = {
    ...globals, ...recovery, ...auth, ...marketingService,
    password: code, managedUsers: [], marketingSessionToken: null,
    document: Object.assign(new EventTarget(), { activeElement: null }), HTMLElement: class {},
    loginManagedUserRemoteByAccessCode: async (input) => { assert.equal(input, code); return user; },
    normalizeManagedUser: (value) => value, upsertManagedUser: (_list, value) => [value],
    saveLocalManagedUsers() {}, setManagedUsers() {}, setManagedUsersSync() {},
    getManagedUserRemoteLoginErrorMessage: () => 'LOGIN_FAILED',
    refreshManagedUsersFromCloud() {}, guardUserMap: {},
    getNormalizedManagedUserPermissions: (value) => value.permissions,
    hasCurrentPermission: (permission) => user.permissions.includes(permission),
    isLocalRecoveryAdmin: () => false, hasMasterMapPageUrl: () => false,
    getInitialViewForManagedUser: () => 'admin',
  };
  for (const field of ['CurrentUser', 'View', 'MarketingSessionToken', 'Password', 'Notice', 'LoginError']) {
    app[`set${field}`] = (value) => {
      state[field[0].toLowerCase() + field.slice(1)] = value;
      app[field[0].toLowerCase() + field.slice(1)] = value;
    };
  }
  for (const field of ['MarketingSummary', 'PreviewEmployeeId', 'SelectedGuardName', 'EditingOrderId', 'EditDraft']) {
    app[`set${field}`] = () => {};
  }
  app.SESSION_KEY = 'synthetic-storage-key';
  const context = vm.createContext(app);
  vm.runInContext(compile(functions('src/App.tsx', ['handleLogin', 'goToLogin', 'openMarketing'])), context);
  return { state, events, requests, user, bridge, getSession: () => authSession,
    login: () => context.handleLogin({ preventDefault() {} }),
    logout: () => context.goToLogin(), openMarketing: () => context.openMarketing(),
    setPassword: () => { context.password = code; } };
}

test('tezzei login installs individual Auth before Marketing; no second code prompt', async () => {
  const s = scenario();
  await s.login();
  assert.equal(s.state.currentUser, 'tezzei');
  assert.equal(s.state.marketingSessionToken, 'synthetic-marketing-session');
  assert.equal(s.state.view, 'admin');
  assert.equal(s.state.password, '');
  assert.equal(s.requests.length, 2);
  assert.ok(s.events.indexOf('rest:probe') < s.events.indexOf('bridge:marketing'));
  s.openMarketing();
  assert.equal(s.state.view, 'marketing');
  assert.equal(s.state.marketingSessionToken, 'synthetic-marketing-session');
  assert.equal(s.requests.length, 2, 'opening Marketing must reuse the session');
});

test('regular Marketing user keeps own identity and hub_user role', async () => {
  const s = scenario({ id: 'synthetic-marketing-user' });
  await s.login();
  assert.equal(s.state.currentUser, s.user.id);
  assert.equal(s.getSession().user.app_metadata.role, 'hub_user');
  assert.ok(s.state.marketingSessionToken);
});

test('user without menu permission logs in but does not request Marketing', async () => {
  const s = scenario({ id: 'synthetic-common-user', marketing: false });
  await s.login();
  assert.equal(s.state.currentUser, s.user.id);
  assert.equal(s.state.marketingSessionToken, null);
  assert.equal(s.requests.length, 1);
  assert.equal(s.getSession().user.app_metadata.role, 'hub_user');
  s.openMarketing();
  assert.equal(s.state.view, 'admin');
  assert.match(s.state.notice, /Sem permissão/);
});

test('server Marketing 403 remains denied even with stale frontend permission', async () => {
  const s = scenario({ id: 'synthetic-denied-user', denyMarketing: true });
  await s.login();
  assert.equal(s.state.currentUser, s.user.id);
  assert.equal(s.state.marketingSessionToken, null);
  assert.match(s.state.notice, /Sessão do Marketing indisponível/);
  await assert.rejects(s.bridge.startRecoveryMarketingSession(code), /MARKETING_ACCESS_DENIED/);
});

test('mismatched Auth managed_user_id cancels login before Marketing', async () => {
  const s = scenario({ invalidAuth: true });
  await s.login();
  assert.equal(s.state.currentUser, null);
  assert.equal(s.getSession(), null);
  assert.equal(s.requests.length, 1);
  assert.ok(s.state.loginError);
});

test('mismatched Marketing identity is ended and not installed', async () => {
  const s = scenario({ mismatchMarketing: true });
  await s.login();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.state.marketingSessionToken, null);
  assert.ok(s.events.includes('marketing:end'));
});

test('logout clears HUB/Auth/Marketing, then login creates valid sessions again', async () => {
  const s = scenario();
  await s.login();
  s.logout();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.state.currentUser, null);
  assert.equal(s.state.marketingSessionToken, null);
  assert.equal(s.getSession(), null);
  assert.equal(s.state.view, 'login');
  assert.ok(s.events.includes('marketing:end'));
  s.setPassword();
  await s.login();
  assert.equal(s.state.currentUser, 'tezzei');
  assert.ok(s.state.marketingSessionToken);
});

test('Marketing cannot request a session without Auth', async () => {
  const s = scenario();
  await assert.rejects(s.bridge.startRecoveryMarketingSession(code));
  assert.equal(s.requests.length, 0);
});

test('existing Marketing session renews with JWT and session token, not access code', async () => {
  const s = scenario();
  await s.login();
  await s.bridge.refreshRecoveryMarketingSession(s.state.marketingSessionToken);
  const renewal = s.requests.at(-1);
  assert.equal(renewal.url, `${origin}/recovery-marketing/v1/session/refresh`);
  assert.equal(renewal.headers.Authorization, `Bearer ${tokens.access_token}`);
  assert.equal(Object.hasOwn(renewal.body, 'accessCode'), false);
  assert.ok(s.events.includes('marketing:refresh'));
});
