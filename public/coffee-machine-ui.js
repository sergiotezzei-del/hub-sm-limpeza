(() => {
  const data = {
    stock: [
      ['Café em Grãos NPro 1kg', '2', 'Pacotes', '30/06/2026', 'Estoque fechado. O pacote instalado não entra aqui.'],
      ['Cappuccino Tradicional', '2', 'Pacotes', '16/06/2026', 'Entregue no lugar do Cappuccino Barista.'],
      ['Achocolatado Dois Frades 6x1,3kg', '3', 'Pacotes', '30/06/2026', 'Dois de 16/06 + um de 30/06.'],
      ['Alpino', '4', 'Pacotes', '16/06/2026', 'Estoque inicial registrado.'],
      ['Copos descartáveis', 'aprox. 10', 'Pacotes', '16/06/2026', 'Quantidade aproximada por foto. Fazer inventário físico.'],
      ['KitKat', 'não lançar', '-', '-', 'Produto identificado no mix, sem compra/quantidade confirmada.'],
    ],
    installed: [['Café em Grãos NPro 1kg', '1', 'Pacote instalado na máquina', 'Não conta como estoque fechado.']],
    readings: [
      { date: '17/06/2026', realTime: 'Não registrada', machineTime: '16:xx - incorreto', total: 1477, doses: [159,126,55,28,207,25,246,2,336,154,91,47,1], notes: 'Primeira leitura registrada. Relógio interno incorreto.' },
      { date: '23/06/2026', realTime: 'Não registrada', machineTime: '23:xx - incorreto', total: 1680, doses: [181,137,63,34,242,30,278,3,387,171,98,55,1], notes: 'Consumo desde leitura anterior: 203 bebidas. Foto registrada.' },
      { date: '30/06/2026', realTime: 'Não registrada', machineTime: '2026/06/30 - incorreto', total: 1822, doses: [195,145,67,39,253,35,306,3,428,183,106,61,1], notes: 'Consumo desde 23/06: 142 bebidas. Média aproximada: 20 bebidas/dia.' },
    ],
    orders: [
      ['16/06/2026', 'Nestlé Brasil', 'Cappuccino Barista', '2', '2, com divergência', 'R$ 144,23', 'R$ 288,46', 'Entregue', 'Produto físico entregue: Cappuccino Tradicional.'],
      ['16/06/2026', 'Nestlé Brasil', 'Achocolatado Dois Frades', '2', '2', 'R$ 227,11', 'R$ 454,21', 'Entregue', ''],
      ['16/06/2026', 'Nestlé Brasil', 'Alpino', '4', '4', 'R$ 138,50', 'R$ 554,00', 'Entregue', ''],
      ['16/06/2026', 'Nestlé Brasil', 'Café em Grãos NPro 1kg', '2', '2', 'R$ 242,21', 'R$ 484,42', 'Entregue', ''],
      ['23/06/2026', 'Nestlé Brasil', 'Café em Grãos NPro 1kg', '3', '3', 'R$ 171,52', 'R$ 514,56', 'Entregue', ''],
      ['30/06/2026', 'Nestlé Brasil', 'Achocolatado Dois Frades', '1', '1', 'R$ 227,68', 'R$ 227,68', 'Entregue', 'Compra para manter programação, sem necessidade imediata.'],
    ],
    divergence: [['16/06/2026', 'Cappuccino Barista', 'Cappuccino Tradicional', 'R$ 144,23', 'R$ 266,43', 'R$ 144,23', 'Ruptura do Barista na indústria', 'Wellington / Nestlé', 'Aguardando alinhamento definitivo com Thiago']],
    products: ['Café em Grãos NPro 1kg', 'Café Espresso', 'Café Curto', 'Café Longo', 'Café Duplo', 'Café com Leite', 'Café com Leite Curto', 'Cappuccino Barista', 'Cappuccino Tradicional', 'Cappuccino Alpino', 'Cappuccino Dois Frades', 'Achocolatado Alpino', 'Achocolatado KitKat', 'Achocolatado Dois Frades', 'Copos descartáveis', 'Mexedores', 'Guardanapos', 'Produtos de limpeza da máquina', 'Pastilhas/descalcificante', 'Filtro de água'],
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isAdminPanel() {
    const text = clean(document.body.textContent).toLowerCase();
    return text.includes('painel tezzei') || text.includes('gestões operacionais');
  }

  function findExistingCoffeeCard(grid) {
    return Array.from(grid.querySelectorAll('.admin-card')).find((card) => clean(card.textContent).toLowerCase().includes('máquina de café'));
  }

  function addCard() {
    if (!isAdminPanel()) return;
    const grid = document.querySelector('.module-grid');
    if (!grid) return;

    const existing = findExistingCoffeeCard(grid);
    if (existing) {
      existing.dataset.coffeeCard = '1';
      existing.classList.add('coffee-card', 'action-card');
      existing.setAttribute('role', 'button');
      existing.setAttribute('tabindex', '0');
      const detail = existing.querySelector('strong');
      if (detail) detail.textContent = 'Estoque, doses e compras';
      if (!existing.dataset.coffeeReady) {
        existing.dataset.coffeeReady = '1';
        existing.addEventListener('click', openModal);
        existing.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openModal();
          }
        });
      }
      return;
    }

    if (document.querySelector('[data-coffee-card="1"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-card action-card module-card coffee-card';
    button.dataset.coffeeCard = '1';
    button.innerHTML = '<span>Máquina de Café</span><strong>Estoque, doses e compras</strong>';
    button.addEventListener('click', openModal);
    grid.appendChild(button);
  }

  function row(cells) {
    return '<tr>' + cells.map((cell) => `<td>${cell}</td>`).join('') + '</tr>';
  }

  function readingBlock(reading) {
    const doseRows = reading.doses.map((value, index) => `<tr><td>#${String(index + 1).padStart(2, '0')}</td><td>${value}</td></tr>`).join('');
    return `<article class="coffee-reading"><h4>${reading.date} — Total: ${reading.total} doses</h4><p><strong>Hora real:</strong> ${reading.realTime}<br><strong>Hora da máquina:</strong> ${reading.machineTime}</p><div class="coffee-dose-grid"><table><thead><tr><th>Botão</th><th>Total</th></tr></thead><tbody>${doseRows}</tbody></table></div><p>${reading.notes}</p></article>`;
  }

  function openModal() {
    document.querySelector('[data-coffee-modal="1"]')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'coffee-backdrop';
    backdrop.dataset.coffeeModal = '1';

    const modal = document.createElement('section');
    modal.className = 'coffee-modal';
    modal.innerHTML = `
      <header class="coffee-head"><div><p>HUB SM</p><h2>Máquina de Café</h2><small>Última atualização: 30/06/2026</small></div><button type="button" class="coffee-close">Fechar</button></header>
      <section class="coffee-summary"><article><span>Total atual</span><strong>1.822 doses</strong></article><article><span>Última leitura</span><strong>30/06/2026</strong></article><article><span>Último consumo</span><strong>142 bebidas</strong></article><article><span>Média</span><strong>20/dia</strong></article></section>
      <section class="coffee-alerts"><strong>Alertas</strong><p>Relógio da máquina incorreto. KitKat sem estoque confirmado. Cappuccino entregue diferente do pedido.</p></section>
      <section class="coffee-section"><h3>Estoque fechado</h3><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Un.</th><th>Data</th><th>Obs.</th></tr></thead><tbody>${data.stock.map(row).join('')}</tbody></table></section>
      <section class="coffee-section"><h3>Produto instalado na máquina</h3><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Situação</th><th>Obs.</th></tr></thead><tbody>${data.installed.map(row).join('')}</tbody></table></section>
      <section class="coffee-section"><h3>Leituras da máquina</h3>${data.readings.map(readingBlock).join('')}</section>
      <section class="coffee-section"><h3>Pedidos / Compras</h3><table><thead><tr><th>Data</th><th>Fornecedor</th><th>Produto</th><th>Pedido</th><th>Entregue</th><th>Unit.</th><th>Total</th><th>Status</th><th>Obs.</th></tr></thead><tbody>${data.orders.map(row).join('')}</tbody></table></section>
      <section class="coffee-section"><h3>Divergências</h3><table><thead><tr><th>Data</th><th>Pedido</th><th>Entregue</th><th>Combinado</th><th>Valor normal</th><th>Faturado</th><th>Motivo</th><th>Quem informou</th><th>Status</th></tr></thead><tbody>${data.divergence.map(row).join('')}</tbody></table></section>
      <section class="coffee-section"><h3>Produtos identificados</h3><div class="coffee-tags">${data.products.map((item) => `<span>${item}</span>`).join('')}</div></section>`;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    modal.querySelector('.coffee-close').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) backdrop.remove();
    });
  }

  function addStyles() {
    if (document.querySelector('[data-coffee-style="1"]')) return;
    const style = document.createElement('style');
    style.dataset.coffeeStyle = '1';
    style.textContent = `.coffee-card{border-left-color:#7c2d12!important;cursor:pointer!important}.coffee-card:hover{transform:translateY(-1px)}.coffee-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:14px;background:rgba(15,23,42,.58);overflow:auto}.coffee-modal{width:min(980px,100%);max-height:92vh;overflow:auto;display:grid;gap:14px;padding:16px;background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(15,23,42,.25)}.coffee-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:10px}.coffee-head p{margin:0;color:#c2410c;font-size:.72rem;font-weight:900;text-transform:uppercase}.coffee-head h2{margin:2px 0;color:#1f2933}.coffee-head small{color:#667085;font-weight:800}.coffee-close{min-height:34px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-weight:900;color:#475569}.coffee-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.coffee-summary article{padding:10px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed}.coffee-summary span{display:block;color:#9a3412;font-size:.72rem;font-weight:900}.coffee-summary strong{display:block;margin-top:3px;color:#1f2933}.coffee-alerts,.coffee-section{display:grid;gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}.coffee-alerts strong,.coffee-section h3{margin:0;color:#1f2933}.coffee-alerts p{margin:0;color:#475569}.coffee-section{overflow:auto}.coffee-section table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}.coffee-section th,.coffee-section td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:.78rem;vertical-align:top}.coffee-section th{color:#344054;background:#f1f5f9;font-weight:900}.coffee-reading{display:grid;gap:6px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.coffee-reading h4,.coffee-reading p{margin:0}.coffee-dose-grid{max-height:220px;overflow:auto}.coffee-tags{display:flex;flex-wrap:wrap;gap:6px}.coffee-tags span{padding:6px 8px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;color:#344054;font-size:.76rem;font-weight:800}@media(max-width:760px){.coffee-summary{grid-template-columns:1fr 1fr}.coffee-section th,.coffee-section td{font-size:.72rem;padding:7px}.coffee-modal{padding:12px}}`;
    document.head.appendChild(style);
  }

  function run() {
    addStyles();
    addCard();
  }

  window.addEventListener('load', () => setTimeout(run, 700));
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
})();
