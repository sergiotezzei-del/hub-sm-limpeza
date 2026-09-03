(() => {
  const SUPABASE_URL = 'https://dtdepfpkyiqtnsjztjit.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZGVwZnBreWlxdG5zanp0aml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODkyMTcsImV4cCI6MjA5ODc2NTIxN30.kNYAYQTw8gqUaYqRTqdcPtthXO5vbZD6XwxeBvhpRgo';
  const AUTH_KEY = 'sb-dtdepfpkyiqtnsjztjit-auth-token';
  const SESSION_KEY = 'hub-sm-active-session';
  const PAGE_ID = 'water-stock-check-page';
  const USER_CACHE_KEY = 'hub-water-stock-user';
  const CARD_SELECTOR = '[data-water-stock-card="1"]';

  const WATER_PRODUCTS = [
    { slug: 'copa-cafe-agua-lindoia-sem-gas', name: 'Lindóia Premium 310 ml sem gás' },
    { slug: 'copa-cafe-agua-lindoia-com-gas-310ml', name: 'Lindóia Premium 310 ml com gás' },
  ];

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function activeScreen() {
    return Array.from(document.querySelectorAll('.screen')).find((screen) => {
      if (!(screen instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(screen);
      return style.display !== 'none' && style.visibility !== 'hidden' && Boolean(screen.querySelector('h1'));
    }) || null;
  }

  function activeTitle() {
    return normalize(activeScreen()?.querySelector('h1')?.textContent || '');
  }

  function isCopaCafeMenu() {
    return !document.getElementById(PAGE_ID) && activeTitle() === 'copa & cafe';
  }

  function findCopaGrid() {
    if (!isCopaCafeMenu()) return null;
    const screen = activeScreen();
    return screen?.querySelector('.admin-grid.module-grid') || screen?.querySelector('.module-grid') || null;
  }

  function getAccessToken() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
      return parsed.access_token || parsed.currentSession?.access_token || '';
    } catch {
      return '';
    }
  }

  function apiHeaders(extra = {}) {
    const token = getAccessToken();
    return {
      apikey: SUPABASE_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: apiHeaders(options.headers || {}),
    });
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { detail = ''; }
      throw new Error(`Falha ao salvar no banco (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function cacheLoggedUser() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      const currentUser = normalize(session?.currentUser || '');
      if (currentUser === 'tezzei') {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'tezzei', name: 'Admin Tezzei' }));
        return;
      }
      if (currentUser === 'selma') {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'selma', name: 'Selma' }));
        return;
      }
    } catch {}

    const text = normalize(activeScreen()?.textContent || '');
    if (text.includes('selma') && text.includes('retirada')) {
      sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ id: 'selma', name: 'Selma' }));
    }
  }

  function getLoggedUser() {
    cacheLoggedUser();
    try {
      const value = JSON.parse(sessionStorage.getItem(USER_CACHE_KEY) || '{}');
      if (value?.id && value?.name) return value;
    } catch {}
    return { id: 'hub-user', name: 'Usuário HUB' };
  }

  function cardMarkup() {
    return `
      <span class="module-icon-circle" aria-hidden="true">
        <svg class="module-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.8S6.5 9 6.5 13.4a5.5 5.5 0 0 0 11 0C17.5 9 12 2.8 12 2.8Z"></path>
          <path d="M9.5 14.2a2.8 2.8 0 0 0 2.7 2.1"></path>
        </svg>
      </span>
      <span class="module-card-copy">
        <span class="module-card-title">Conferência de Água</span>
        <strong>Contagem semanal de água</strong>
      </span>`;
  }

  function moveNearWaterCards(grid, card) {
    const cards = Array.from(grid.querySelectorAll('.module-card')).filter((item) => item !== card);
    const reference = cards.find((item) => normalize(item.querySelector('.module-card-title')?.textContent || '') === 'compras de agua')
      || cards.find((item) => normalize(item.querySelector('.module-card-title')?.textContent || '') === 'estoque de agua');
    if (reference instanceof HTMLElement && reference.nextElementSibling !== card) {
      reference.insertAdjacentElement('afterend', card);
    }
  }

  function removeStrayCards() {
    if (isCopaCafeMenu()) return;
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => card.remove());
  }

  function addConferenceCard() {
    cacheLoggedUser();

    if (!isCopaCafeMenu()) {
      removeStrayCards();
      return;
    }

    const grid = findCopaGrid();
    if (!(grid instanceof HTMLElement)) return;

    const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
    let card = cards.find((candidate) => grid.contains(candidate)) || null;
    cards.forEach((candidate) => {
      if (candidate !== card) candidate.remove();
    });

    if (!(card instanceof HTMLButtonElement)) {
      card = document.createElement('button');
      card.type = 'button';
      card.dataset.waterStockCard = '1';
      card.addEventListener('click', () => void openPage());
      grid.appendChild(card);
    }

    if (card.dataset.waterStockReady !== '1') {
      card.className = 'admin-card module-card with-icon has-access action-card water-stock-check-card';
      card.innerHTML = cardMarkup();
      card.setAttribute('aria-label', 'Abrir Conferência de Água');
      card.dataset.waterStockReady = '1';
    }

    moveNearWaterCards(grid, card);
  }

  function localDateParts() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return { date: `${day}/${month}/${year}`, time: `${hour}:${minute}` };
  }

  async function loadProducts() {
    const slugs = WATER_PRODUCTS.map((item) => `"${item.slug}"`).join(',');
    const rows = await api(`products?select=slug,name,unit,current_stock,active&slug=in.(${encodeURIComponent(slugs)})`);
    return Array.isArray(rows) ? rows : [];
  }

  function waterItemsFromCheck(check) {
    const items = Array.isArray(check?.stock_check_items) ? check.stock_check_items : [];
    const semGas = items.find((item) => normalize(item.product_name).includes('310 ml sem gas'));
    const comGas = items.find((item) => normalize(item.product_name).includes('310 ml com gas'));
    if (!semGas && !comGas) return null;
    return { semGas: Number(semGas?.quantity || 0), comGas: Number(comGas?.quantity || 0) };
  }

  async function loadHistory() {
    const rows = await api('stock_checks?select=id,created_at,data,hora,conferente,stock_check_items(id,product_name,unit,quantity,observation)&order=created_at.desc&limit=40');
    return (Array.isArray(rows) ? rows : [])
      .map((check) => ({ check, values: waterItemsFromCheck(check) }))
      .filter((entry) => entry.values)
      .slice(0, 8);
  }

  function toFardosLabel(bottles) {
    const value = Number(bottles || 0);
    if (!Number.isFinite(value)) return '—';
    const full = Math.floor(value / 12);
    const loose = value % 12;
    if (loose === 0) return `${full} fardo${full === 1 ? '' : 's'} (${value} garrafas)`;
    return `${full} fardo${full === 1 ? '' : 's'} + ${loose} garrafa${loose === 1 ? '' : 's'} (${value} no total)`;
  }

  function historyHtml(history) {
    if (!history.length) return '<div class="water-empty">Ainda não existe conferência semanal de água. Esta será a primeira.</div>';
    return history.map(({ check, values }) => `
      <article class="water-history-row">
        <div><strong>${escapeHtml(check.data || '')}</strong><small>${escapeHtml(check.conferente || '')}</small></div>
        <div><span>Sem gás</span><strong>${escapeHtml(toFardosLabel(values.semGas))}</strong></div>
        <div><span>Com gás</span><strong>${escapeHtml(toFardosLabel(values.comGas))}</strong></div>
      </article>`).join('');
  }

  function renderPage(products, history) {
    document.getElementById(PAGE_ID)?.remove();
    const productMap = new Map(products.map((item) => [item.slug, item]));
    const semGasCurrent = Number(productMap.get(WATER_PRODUCTS[0].slug)?.current_stock || 0);
    const comGasCurrent = Number(productMap.get(WATER_PRODUCTS[1].slug)?.current_stock || 0);

    const page = document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'water-stock-page';
    page.innerHTML = `
      <main class="water-stock-shell">
        <header class="water-stock-header">
          <button type="button" class="water-back">← Voltar</button>
          <div><p>COPA & CAFÉ</p><h1>Conferência de Água</h1><small>Conte somente os fardos fechados.</small></div>
        </header>
        <section class="water-help"><strong>É só colocar o número de fardos.</strong><p>Exemplo: se encontrou 3 fardos, digite <b>3</b>. O sistema faz a conta das garrafas sozinho.</p></section>
        <form class="water-stock-form">
          <article class="water-count-card">
            <div class="water-count-title"><span>SEM GÁS</span><h2>Lindóia Premium 310 ml</h2></div>
            <label for="water-sem-gas">Quantos fardos fechados?</label>
            <input id="water-sem-gas" name="semGas" type="number" inputmode="numeric" min="0" step="1" required placeholder="Ex.: 3" autocomplete="off" />
            <small>Último saldo no sistema: ${escapeHtml(toFardosLabel(semGasCurrent))}</small>
          </article>
          <article class="water-count-card">
            <div class="water-count-title"><span>COM GÁS</span><h2>Lindóia Premium 310 ml</h2></div>
            <label for="water-com-gas">Quantos fardos fechados?</label>
            <input id="water-com-gas" name="comGas" type="number" inputmode="numeric" min="0" step="1" required placeholder="Ex.: 2" autocomplete="off" />
            <small>Último saldo no sistema: ${escapeHtml(toFardosLabel(comGasCurrent))}</small>
          </article>
          <div class="water-save-area"><button class="water-save" type="submit">SALVAR CONFERÊNCIA</button><p class="water-status" aria-live="polite"></p></div>
        </form>
        <section class="water-history"><div class="water-section-head"><h2>Últimas conferências</h2><span>Histórico semanal</span></div><div class="water-history-list">${historyHtml(history)}</div></section>
      </main>`;

    document.body.appendChild(page);
    document.body.classList.add('water-stock-open');
    page.querySelector('.water-back')?.addEventListener('click', closePage);
    page.querySelector('.water-stock-form')?.addEventListener('submit', (event) => void saveConference(event, products));
  }

  async function openPage() {
    if (document.getElementById(PAGE_ID)) return;
    cacheLoggedUser();
    const loading = document.createElement('div');
    loading.id = PAGE_ID;
    loading.className = 'water-stock-page water-loading';
    loading.innerHTML = '<div><strong>Carregando conferência de água...</strong></div>';
    document.body.appendChild(loading);
    document.body.classList.add('water-stock-open');
    try {
      const [products, history] = await Promise.all([loadProducts(), loadHistory()]);
      renderPage(products, history);
    } catch (error) {
      loading.innerHTML = `<div class="water-load-error"><strong>Não foi possível carregar.</strong><p>${escapeHtml(error instanceof Error ? error.message : 'Erro desconhecido')}</p><button type="button">Voltar</button></div>`;
      loading.querySelector('button')?.addEventListener('click', closePage);
    }
  }

  function closePage() {
    document.getElementById(PAGE_ID)?.remove();
    document.body.classList.remove('water-stock-open');
  }

  async function saveConference(event, products) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('.water-status');
    const saveButton = form.querySelector('.water-save');
    const semGasFardos = Number(form.elements.semGas.value);
    const comGasFardos = Number(form.elements.comGas.value);

    if (!Number.isInteger(semGasFardos) || semGasFardos < 0 || !Number.isInteger(comGasFardos) || comGasFardos < 0) {
      status.textContent = 'Digite apenas números inteiros. Ex.: 3.';
      status.className = 'water-status error';
      return;
    }

    if (!window.confirm(`Confirmar conferência?\n\nSem gás: ${semGasFardos} fardo(s)\nCom gás: ${comGasFardos} fardo(s)`)) return;

    const semGasBottles = semGasFardos * 12;
    const comGasBottles = comGasFardos * 12;
    const productMap = new Map(products.map((item) => [item.slug, item]));
    const user = getLoggedUser();
    const { date, time } = localDateParts();
    const checkId = crypto.randomUUID();

    saveButton.disabled = true;
    saveButton.textContent = 'SALVANDO...';
    status.textContent = '';
    status.className = 'water-status';

    try {
      await api('stock_checks', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{ id: checkId, data: date, hora: time, conferente: user.name }]),
      });

      await api('stock_check_items', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([
          { stock_check_id: checkId, product_name: WATER_PRODUCTS[0].name, unit: 'Unidade', quantity: semGasBottles, observation: `Conferência semanal de água | ${semGasFardos} fardo(s) fechado(s) x 12 = ${semGasBottles} garrafas` },
          { stock_check_id: checkId, product_name: WATER_PRODUCTS[1].name, unit: 'Unidade', quantity: comGasBottles, observation: `Conferência semanal de água | ${comGasFardos} fardo(s) fechado(s) x 12 = ${comGasBottles} garrafas` },
        ]),
      });

      for (const entry of [
        { product: WATER_PRODUCTS[0], bottles: semGasBottles },
        { product: WATER_PRODUCTS[1], bottles: comGasBottles },
      ]) {
        const before = Number(productMap.get(entry.product.slug)?.current_stock || 0);
        const difference = entry.bottles - before;
        if (difference !== 0) {
          await api('stock_movements', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify([{
              product_slug: entry.product.slug,
              product_name: entry.product.name,
              unit: 'Unidade',
              movement_type: 'ajuste',
              quantity: difference,
              user_id: user.id,
              user_name: user.name,
              observation: `Conferência semanal de água ${date}. Saldo ajustado de ${before} para ${entry.bottles} garrafas (${entry.bottles / 12} fardo(s) fechado(s)).`,
              source: 'copa-cafe-water-stock-check',
            }]),
          });
        }
        await api(`products?slug=eq.${encodeURIComponent(entry.product.slug)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ current_stock: entry.bottles, updated_at: new Date().toISOString() }),
        });
      }

      status.textContent = 'Conferência salva com sucesso.';
      status.className = 'water-status success';
      saveButton.textContent = 'SALVO ✓';
      form.querySelectorAll('input').forEach((input) => { input.disabled = true; });
      const history = await loadHistory();
      const historyList = document.querySelector(`#${PAGE_ID} .water-history-list`);
      if (historyList) historyList.innerHTML = historyHtml(history);
    } catch (error) {
      console.error('[water-stock-check]', error);
      status.textContent = 'Não foi possível concluir. Avise o Tezzei antes de tentar novamente.';
      status.className = 'water-status error';
      saveButton.disabled = false;
      saveButton.textContent = 'TENTAR NOVAMENTE';
    }
  }

  function addStyles() {
    if (document.querySelector('[data-water-stock-style="3"]')) return;
    document.querySelector('[data-water-stock-style="1"]')?.remove();
    const style = document.createElement('style');
    style.dataset.waterStockStyle = '3';
    style.textContent = `
      .water-stock-check-card{border-left:6px solid #f97316!important;cursor:pointer!important;min-height:116px!important;height:auto!important;padding:18px 16px!important;align-items:center!important;text-align:left!important}
      .water-stock-check-card .module-card-copy{min-width:0!important}
      body.water-stock-open{overflow:hidden!important}
      .water-stock-page{position:fixed;inset:0;z-index:10050;background:#f4f7fb;overflow:auto;color:#172033}
      .water-stock-shell{width:min(760px,100%);min-height:100%;margin:0 auto;padding:18px 16px 40px;display:grid;gap:16px}
      .water-stock-header{display:flex;align-items:flex-start;gap:14px;padding:4px 0 6px}.water-stock-header p{margin:0 0 2px;color:#ea580c;font-size:.72rem;font-weight:900;letter-spacing:.08em}.water-stock-header h1{margin:0;font-size:1.45rem}.water-stock-header small{display:block;margin-top:5px;color:#64748b;font-weight:700}
      .water-back{flex:0 0 auto;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:9px 12px;font-weight:900;color:#334155}
      .water-help{padding:14px;border:1px solid #fed7aa;border-radius:14px;background:#fff7ed}.water-help strong{display:block;color:#9a3412}.water-help p{margin:5px 0 0;color:#475569;line-height:1.4}
      .water-stock-form{display:grid;gap:14px}.water-count-card{display:grid;gap:10px;padding:16px;border:1px solid #dbe3ee;border-radius:16px;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,.05)}.water-count-title span{display:inline-block;padding:4px 8px;border-radius:999px;background:#ffedd5;color:#9a3412;font-size:.7rem;font-weight:950}.water-count-title h2{margin:7px 0 0;font-size:1.05rem}.water-count-card label{font-weight:900;color:#334155}.water-count-card input{width:100%;height:62px;border:2px solid #94a3b8;border-radius:12px;background:#fff;padding:8px 14px;text-align:center;font-size:1.9rem;font-weight:950;color:#0f172a;outline:none}.water-count-card input:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.12)}.water-count-card small{color:#64748b;font-weight:700;text-align:center}
      .water-save-area{display:grid;gap:8px}.water-save{min-height:54px;border:0;border-radius:12px;background:#f97316;color:#fff;font-size:1rem;font-weight:950;cursor:pointer}.water-save:disabled{opacity:.65;cursor:wait}.water-status{min-height:20px;margin:0;text-align:center;font-weight:850}.water-status.success{color:#047857}.water-status.error{color:#b91c1c}
      .water-history{display:grid;gap:10px;margin-top:4px;padding-top:14px;border-top:1px solid #dbe3ee}.water-section-head{display:flex;align-items:end;justify-content:space-between;gap:10px}.water-section-head h2{margin:0;font-size:1.1rem}.water-section-head span{color:#64748b;font-size:.75rem;font-weight:800}.water-history-list{display:grid;gap:8px}.water-history-row{display:grid;grid-template-columns:1fr 1.4fr 1.4fr;gap:8px;padding:11px;border:1px solid #dbe3ee;border-radius:12px;background:#fff}.water-history-row div{display:grid;gap:2px}.water-history-row span,.water-history-row small{color:#64748b;font-size:.7rem;font-weight:800}.water-history-row strong{font-size:.82rem}.water-empty{padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#fff;color:#64748b;text-align:center;font-weight:700}
      .water-loading{display:grid;place-items:center;padding:20px}.water-loading>div{padding:18px;border-radius:14px;background:#fff;box-shadow:0 8px 26px rgba(15,23,42,.08)}.water-load-error{max-width:420px;text-align:center}.water-load-error p{color:#64748b}.water-load-error button{border:0;border-radius:10px;background:#f97316;color:#fff;padding:10px 16px;font-weight:900}
      @media(max-width:620px){.water-stock-shell{padding:14px 12px 32px}.water-stock-header{gap:10px}.water-stock-header h1{font-size:1.25rem}.water-back{padding:8px 10px}.water-history-row{grid-template-columns:1fr}.water-history-row div:not(:first-child){grid-template-columns:90px 1fr;align-items:center}.water-count-card input{height:58px;font-size:1.75rem}}
    `;
    document.head.appendChild(style);
  }

  function run() {
    addStyles();
    cacheLoggedUser();
    addConferenceCard();
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  }

  window.HubWaterStockCheck = { open: openPage, close: closePage };
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
