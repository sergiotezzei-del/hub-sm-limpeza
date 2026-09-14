(() => {
  const PRODUCT_SLUGS = [
    'agua-copo-200ml',
    'copa-cafe-agua-lindoia-sem-gas',
    'copa-cafe-agua-lindoia-com-gas-310ml',
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

  function brDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  function table(headers, rows) {
    return `<div class="cafe-table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${esc(item)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function fardosLabel(bottles) {
    const qty = Number(bottles || 0);
    const full = Math.floor(qty / 12);
    const loose = qty % 12;
    if (!loose) return `${full} fardo${full === 1 ? '' : 's'} (${qty} garrafas)`;
    return `${full} fardo${full === 1 ? '' : 's'} + ${loose} garrafa${loose === 1 ? '' : 's'} (${qty} no total)`;
  }

  async function loadData() {
    const slugs = PRODUCT_SLUGS.map((slug) => `"${slug}"`).join(',');
    const [products, purchases] = await Promise.all([
      api().rest(`products?select=slug,name,unit,current_stock,updated_at&slug=in.(${encodeURIComponent(slugs)})`),
      api().rest('stock_movements?select=created_at,product_slug,product_name,unit,quantity,observation,source&source=eq.copa-cafe-water-purchase&order=created_at.desc'),
    ]);
    return {
      products: Array.isArray(products) ? products : [],
      purchases: Array.isArray(purchases) ? purchases : [],
    };
  }

  function productMap(products) {
    return new Map(products.map((item) => [item.slug, item]));
  }

  function summaryContent(products) {
    const map = productMap(products);
    const copos = Number(map.get('agua-copo-200ml')?.current_stock || 0);
    const semGas = Number(map.get('copa-cafe-agua-lindoia-sem-gas')?.current_stock || 0);
    const comGas = Number(map.get('copa-cafe-agua-lindoia-com-gas-310ml')?.current_stock || 0);
    const updated = map.get('copa-cafe-agua-lindoia-sem-gas')?.updated_at || map.get('copa-cafe-agua-lindoia-com-gas-310ml')?.updated_at;

    return `
      <div class="cafe-metrics cafe-metrics-three">
        <article><span>Água em copo 200 ml</span><strong>${copos} caixas</strong><small>${copos * 48} copos de água</small></article>
        <article><span>Lindóia sem gás</span><strong>${semGas} garrafas</strong><small>${esc(fardosLabel(semGas))}</small></article>
        <article><span>Lindóia com gás</span><strong>${comGas} garrafas</strong><small>${esc(fardosLabel(comGas))}</small></article>
      </div>
      <section class="cafe-panel cafe-note">
        <h3>Base do saldo</h3>
        <p>Saldo calculado a partir da conferência física de <strong>08/09/2026</strong> e da entrada recebida em <strong>10/09/2026</strong>.</p>
        <p>Última atualização registrada: <strong>${esc(brDate(updated))}</strong>. Uma nova conferência física deve ajustar qualquer consumo ocorrido depois da entrega.</p>
      </section>`;
  }

  function stockContent(products) {
    const map = productMap(products);
    const copos = Number(map.get('agua-copo-200ml')?.current_stock || 0);
    const semGas = Number(map.get('copa-cafe-agua-lindoia-sem-gas')?.current_stock || 0);
    const comGas = Number(map.get('copa-cafe-agua-lindoia-com-gas-310ml')?.current_stock || 0);
    const rows = [
      ['Água em copo Minalice 200 ml', `${copos} caixas`, `${copos * 48} copos`, '48 por caixa'],
      ['Lindóia Premium 310 ml sem gás', `${semGas} garrafas`, fardosLabel(semGas), '12 por fardo'],
      ['Lindóia Premium 310 ml com gás', `${comGas} garrafas`, fardosLabel(comGas), '12 por fardo'],
    ];
    return `<section class="cafe-panel"><h3>Estoque atualizado</h3>${table(['Produto', 'Saldo', 'Conversão', 'Embalagem'], rows)}</section>`;
  }

  function purchaseContent(purchases) {
    if (!purchases.length) {
      return '<section class="cafe-panel cafe-empty"><h3>Compras de água</h3><p>Nenhuma compra estruturada foi localizada.</p></section>';
    }

    const rows = purchases.map((item) => [
      brDate(item.created_at),
      item.product_name,
      `${Number(item.quantity).toLocaleString('pt-BR')} ${item.unit || ''}`.trim(),
      item.observation || '—',
    ]);

    return `
      <div class="cafe-metrics cafe-metrics-three">
        <article><span>Última compra</span><strong>10/09/2026</strong></article>
        <article><span>Fornecedor</span><strong>Água Leve</strong></article>
        <article><span>Total</span><strong>R$ 316,40</strong></article>
      </div>
      <section class="cafe-panel">
        <h3>Pedido 121.475</h3>
        <p><strong>Vencimento:</strong> 02/10/2026</p>
        ${table(['Data', 'Produto', 'Entrada', 'Detalhes'], rows)}
      </section>`;
  }

  function pageInfo(key) {
    if (key === 'agua') return { title: 'Água', subtitle: 'Resumo atualizado do estoque de água' };
    if (key === 'estoque-agua') return { title: 'Estoque de água', subtitle: 'Saldo físico atualizado após conferências e entradas' };
    return { title: 'Compras de água', subtitle: 'Histórico de compras e recebimentos' };
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
    history.pushState({ cafePage: key, liveWater: true }, '', `#copa-cafe-${key}`);
    page.querySelector('.cafe-back')?.addEventListener('click', () => history.back());

    try {
      const { products, purchases } = await loadData();
      const content = page.querySelector('.cafe-page-content');
      if (!content) return;
      if (key === 'agua') content.innerHTML = summaryContent(products);
      else if (key === 'estoque-agua') content.innerHTML = stockContent(products);
      else content.innerHTML = purchaseContent(purchases);
    } catch (error) {
      const content = page.querySelector('.cafe-page-content');
      if (content) content.innerHTML = `<section class="cafe-panel cafe-empty"><h3>Não foi possível carregar</h3><p>${esc(error instanceof Error ? error.message : 'Erro desconhecido')}</p></section>`;
    }
  }

  function targetKey(target) {
    const element = target instanceof Element ? target : null;
    const card = element?.closest('.admin-card, .module-card');
    if (!card) return null;
    const title = norm(card.querySelector('.module-card-title')?.textContent || card.querySelector('span')?.textContent || '');
    if (title === 'agua') return 'agua';
    if (title === 'estoque de agua') return 'estoque-agua';
    if (title === 'compras de agua') return 'compras-agua';
    return null;
  }

  function intercept(event) {
    const key = targetKey(event.target);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    void openPage(key);
  }

  document.addEventListener('click', intercept, true);
  window.HubWaterDashboard = { open: openPage, loadData };
})();