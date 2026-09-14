(() => {
  const SUPABASE_URL = 'https://dtdepfpkyiqtnsjztjit.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZGVwZnBreWlxdG5zanp0aml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODkyMTcsImV4cCI6MjA5ODc2NTIxN30.kNYAYQTw8gqUaYqRTqdcPtthXO5vbZD6XwxeBvhpRgo';
  const SESSION_KEY = 'hub-copa-cafe-session-v1';

  function parseStored() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      if (!value?.token || !value?.expiresAt) return null;
      if (new Date(value.expiresAt).getTime() <= Date.now() + 30_000) return null;
      return value;
    } catch {
      return null;
    }
  }

  function storeSession(value) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok) {
      const message = data?.message || data?.hint || data?.details || `Falha no Supabase (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function rpc(name, body) {
    return request(`rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  async function rest(path, options = {}) {
    return request(path, options);
  }

  async function validate(stored, permission) {
    if (!stored?.token) return null;
    try {
      const actor = await rpc('copa_cafe_validate_session', {
        p_session_token: stored.token,
        p_required_permission: permission || null,
      });
      return actor ? { ...stored, actor } : null;
    } catch {
      clearSession();
      return null;
    }
  }

  async function ensure(permission) {
    const current = await validate(parseStored(), permission);
    if (current) return current;

    const accessCode = window.prompt('Digite seu código de acesso do HUB para continuar:');
    if (!accessCode || !String(accessCode).trim()) {
      const error = new Error('Acesso cancelado.');
      error.code = 'ACCESS_CANCELLED';
      throw error;
    }

    let rows;
    try {
      rows = await rpc('copa_cafe_start_session', { p_access_code: String(accessCode).trim() });
    } catch (error) {
      const next = new Error('Código não autorizado para esta conferência.');
      next.cause = error;
      throw next;
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.session_token) throw new Error('Não foi possível iniciar a sessão da Copa & Café.');

    const stored = {
      token: row.session_token,
      userId: row.user_id,
      userName: row.user_name,
      permissions: row.permissions || [],
      expiresAt: row.expires_at,
    };
    storeSession(stored);

    const validated = await validate(stored, permission);
    if (!validated) throw new Error('Este usuário não tem permissão para esta conferência.');
    return validated;
  }

  function localIsoDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function localTime(date = new Date()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function weekRange(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: localIsoDate(start), end: localIsoDate(end) };
  }

  window.HubCopaCafeSession = {
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_KEY,
    ensure,
    validate,
    rpc,
    rest,
    clear: clearSession,
    current: parseStored,
    localIsoDate,
    localTime,
    weekRange,
  };
})();
