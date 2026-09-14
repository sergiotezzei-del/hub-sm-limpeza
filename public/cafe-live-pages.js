(() => {
  const drinkNames = [
    'Espresso', 'Curto', 'Duplo', 'Americano', 'Cappuccino', 'Café com Leite',
    'Achocolatado KitKat', 'Água Quente', 'Cappuccino Alpino', 'Alpino',
    'Mokaccino Dois Frades', 'Achocolatado Dois Frades', '#13 — registro técnico',
  ];

  function api() {
    const helper = window.HubCopaCafeSession;
    if (!helper) throw new Error('Módulo da Copa & Café não carregado.');
    return helper;
  }

  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [year, month, day] = String(iso).split('-');
    return `${day}/${month}/${year}`;
  }

  function brNumber(value) {
    return Number(value).toLocaleString('pt-BR');
  }

  function daysBetween(start, end) {
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    return Math.max(1, Math.round((b - a) / 86400000));
  }

  function table(headers, rows) {
    return `<div class="cafe-table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${esc(item)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  async function loadReadings() {
    const rows = await api().rest('coffee_machine_readings?select=id,reading_date,real_time,total_accumulated,source,coffee_machine_reading_counters(counter_number,drink_name,accumulated_count,confidence,needs_review)&order=reading_date.asc,created_at.asc&limit=100');
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const counters = Array.isArray(row.coffee_machine_reading_counters)
        ? [...row.coffee_machine_reading_counters].sort((a, b) => Number(a.counter_number) - Number(b.counter_number))
        : [];
      return {
        id: row.id,
        date: row.reading_date,
        total: Number(row.total_accumulated),
        source: row.source,
        counters,
        doses: Array.from({ length: 13 }, (_, index) => {
          const found = counters.find((item) => Number(item.counter_number) === index + 1);
          return found ? Number(found.accumulated_count) : null;
        }),
      };
    });
  }

  function currentPeriod(readings) {
    if (!readings.length) return null;
    const latest = readings[readings.length - 1];
    const previous = readings.length >= 2 ? readings[readings.length - 2] : null;
    if (!previous) return { latest, previous: null, consumed: null, days: null, average: null, deltas: [], ranking: [] };

    const deltas = latest.doses.map((value, index) => {
      const oldValue = previous.doses[index];
      return Number.isFinite(value) && Number.isFinite(oldValue) ? value - oldValue : null;
    });
    const consumed = latest.total - previous.total;
    const days = daysBetween(previous.date, latest.date);
    const average = consumed / days;
    const ranking = deltas
      .map((value, index) => ({ name: drinkNames[index], value }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0 && !item.name.startsWith('#13'))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return { latest, previous, consumed, days, average, deltas, ranking };
  }

  function rankingChart(ranking) {
    if (!ranking.length) return '<p>Ainda não há duas leituras completas para formar o ranking.</p>';
    const max = Math.max(...ranking.map((item) => item.value), 1);
    return `<div class="cafe-live-ranking">${ranking.map((item, index) => `
      <div class="cafe-live-ranking-row">
        <div><span>${index + 1}. ${esc(item.name)}</span><strong>${item.value}</strong></div>
        <i><b style="width:${Math.max(4, (item.value / max) * 100)}%"></b></i>
      </div>`).join('')}</div>`;
  }

  function machineContent(readings) {
    const period = currentPeriod(readings);
    if (!period) return '<section class="cafe-panel cafe-empty"><h3>Máquina de Café</h3><p>Nenhuma leitura registrada.</p></section>';
    const { latest, previous, consumed, days, average, ranking } = period;
    return `
      <div class="cafe-metrics">
        <article><span>Total acumulado</span><strong>${brNumber(latest.total)} doses</strong></article>
        <article><span>Última leitura</span><strong>${formatDate(latest.date)}</strong></article>
        <article><span>Consumo desde a leitura anterior</span><strong>${consumed === null ? '—' : `${brNumber(consumed)} doses`}</strong></article>
        <article><span>Média diária no período</span><strong>${average === null ? '—' : `${average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} doses/dia`}</strong></article>
      </div>
      <section class="cafe-panel">
        <h3>Situação atual</h3>
        <p>Última leitura registrada em <strong>${formatDate(latest.date)}</strong>, com <strong>${brNumber(latest.total)} doses</strong> acumuladas.</p>
        ${previous ? `<p>De <strong>${formatDate(previous.date)}</strong> a <strong>${formatDate(latest.date)}</strong> foram consumidas <strong>${brNumber(consumed)} bebidas</strong> em <strong>${days} dias</strong>.</p>` : ''}
      </section>
      <section class="cafe-panel"><h3>Bebidas mais consumidas no último período</h3>${rankingChart(ranking)}</section>`;
  }

  function readingsContent(readings) {
    const period = currentPeriod(readings);
    if (!period) return '<section class="cafe-panel cafe-empty"><h3>Leituras</h3><p>Nenhuma leitura registrada.</p></section>';
    const { latest, previous, consumed, days, average, deltas, ranking } = period;

    const latestRows = latest.doses.map((value, index) => [
      `#${String(index + 1).padStart(2, '0')} — ${drinkNames[index]}`,
      value === null ? '—' : brNumber(value),
      previous ? (deltas[index] === null ? '—' : deltas[index] === 0 ? '0' : `+${deltas[index]}`) : '—',
    ]);
    const historyRows = [...readings].reverse().map((reading) => [
      formatDate(reading.date),
      `${brNumber(reading.total)} doses`,
    ]);

    return `
      <div class="cafe-metrics cafe-metrics-three">
        <article><span>Leitura anterior</span><strong>${previous ? `${formatDate(previous.date)} — ${brNumber(previous.total)}` : '—'}</strong></article>
        <article><span>Leitura atual</span><strong>${formatDate(latest.date)} — ${brNumber(latest.total)}</strong></article>
        <article><span>Consumo do período</span><strong>${consumed === null ? '—' : `${brNumber(consumed)} doses`}</strong></article>
      </div>
      <section class="cafe-panel"><h3>Contadores em ${formatDate(latest.date)}</h3>${table(['Bebida', 'Acumulado', previous ? `Consumo desde ${formatDate(previous.date)}` : 'Diferença'], latestRows)}</section>
      ${previous ? `<section class="cafe-panel"><h3>Média do período</h3><p><strong>${brNumber(consumed)} bebidas ÷ ${days} dias = ${average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bebidas/dia.</strong></p></section>` : ''}
      <section class="cafe-panel"><h3>Ranking do último período</h3>${rankingChart(ranking)}</section>
      <section class="cafe-panel"><h3>Histórico de leituras</h3>${table(['Data da leitura', 'Total acumulado'], historyRows)}</section>`;
  }

  function pageInfo(key) {
    return key === 'maquina'
      ? { title: 'Máquina de Café', subtitle: 'Resumo atualizado pelas leituras salvas no HUB' }
      : { title: 'Leituras da máquina', subtitle: 'Histórico real e comparação entre leituras' };
  }

  async function openPage(key) {
    document.querySelector('[data-cafe-page="1"]')?.remove();
    const info = pageInfo(key);
    const page = document.createElement('section');
    page.className = 'cafe-page-shell';
    page.dataset.cafePage = '1';
    page.innerHTML = `
      <div class="cafe-page-inner">
        <header class="cafe-page-header">
          <button type="button" class="cafe-back">← Voltar</button>
          <div><p>HUB SM · Copa & Café</p><h2>${esc(info.title)}</h2><small>${esc(info.subtitle)}</small></div>
        </header>
        <main class="cafe-page-content"><section class="cafe-panel"><strong>Carregando dados...</strong></section></main>
      </div>`;
    document.body.appendChild(page);
    history.pushState({ cafePage: key, live: true }, '', `#copa-cafe-${key}`);
    page.querySelector('.cafe-back')?.addEventListener('click', () => history.back());

    try {
      const readings = await loadReadings();
      const content = page.querySelector('.cafe-page-content');
      if (content) content.innerHTML = key === 'maquina' ? machineContent(readings) : readingsContent(readings);
    } catch (error) {
      const content = page.querySelector('.cafe-page-content');
      if (content) content.innerHTML = `<section class="cafe-panel cafe-empty"><h3>Não foi possível carregar as leituras</h3><p>${esc(error instanceof Error ? error.message : 'Erro desconhecido')}</p></section>`;
    }
  }

  function targetKey(eventTarget) {
    const element = eventTarget instanceof Element ? eventTarget : null;
    const card = element?.closest('.admin-card, .module-card');
    if (!card) return null;
    const title = norm(card.querySelector('.module-card-title')?.textContent || card.querySelector('span')?.textContent || '');
    if (title === 'maquina de cafe') return 'maquina';
    if (title === 'leituras da maquina') return 'leituras';
    return null;
  }

  function handleClick(event) {
    const key = targetKey(event.target);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    void openPage(key);
  }

  function handleKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const key = targetKey(event.target);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    void openPage(key);
  }

  function addStyles() {
    if (document.querySelector('[data-cafe-live-style="1"]')) return;
    const style = document.createElement('style');
    style.dataset.cafeLiveStyle = '1';
    style.textContent = `
      .cafe-live-ranking{display:grid;gap:9px}.cafe-live-ranking-row{display:grid;gap:5px}.cafe-live-ranking-row>div{display:flex;justify-content:space-between;gap:10px;font-size:.84rem}.cafe-live-ranking-row>div span{font-weight:800;color:#334155}.cafe-live-ranking-row>div strong{color:#9a3412}.cafe-live-ranking-row>i{display:block;height:8px;border-radius:999px;background:#ffedd5;overflow:hidden}.cafe-live-ranking-row>i>b{display:block;height:100%;border-radius:999px;background:#f97316}
    `;
    document.head.appendChild(style);
  }

  addStyles();
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
  window.HubCoffeeDashboard = { open: openPage, loadReadings };
})();
