(() => {
  const drinkNames = [
    'Espresso', 'Curto', 'Duplo', 'Americano', 'Cappuccino', 'Café com Leite',
    'Achocolatado KitKat', 'Água Quente', 'Cappuccino Alpino', 'Alpino',
    'Mokaccino Dois Frades', 'Achocolatado Dois Frades', '#13 — registro técnico'
  ];

  const estoqueMaquina = [
    ['ALPINO Achocolatado com Leite NPro 1,3 kg', '1', 'Pacote fechado'],
    ['KIT KAT Achocolatado em Pó NPro 1,3 kg', '1', 'Pacote fechado'],
    ['NESCAFÉ Café em Grãos NPro 1 kg', '1', 'Pacote fechado'],
    ['Cappuccino — variedade a confirmar', '1', 'Pacote fechado'],
    ['Achocolatado Dois Frades', '0', 'Fechado — há aprox. meio pacote aberto/em uso'],
    ['NESCAFÉ Copos 200 ml — pacote c/50', '12', 'Pacotes fechados']
  ];

  const aguas = [
    ['Lindóia Premium 310 ml sem gás', '3 fardos', '36 garrafas', '12 por fardo'],
    ['Lindóia Premium 310 ml com gás', '2 fardos', '24 garrafas', '12 por fardo']
  ];

  const bebidas = [
    ['Heineken Long Neck', '19', 'Unidades'],
    ['Stella Pure Gold', '15', 'Unidades'],
    ['Heineken 0.0', '6', 'Unidades']
  ];

  const leituras = [
    { date: '17/06/2026', total: 1477, realTime: null, machineDateTime: null, doses: [159,126,55,28,207,25,246,2,336,154,91,47,1] },
    { date: '23/06/2026', total: 1680, realTime: null, machineDateTime: null, doses: [181,137,63,34,242,30,278,3,387,171,98,55,1] },
    { date: '30/06/2026', total: 1822, realTime: null, machineDateTime: null, doses: [195,145,67,39,253,35,306,3,428,183,106,61,1] },
    { date: '24/08/2026', total: 3326, realTime: null, machineDateTime: null, doses: [348,280,133,93,481,76,504,4,765,280,234,127,1] },
    { date: '31/08/2026', total: 3511, realTime: '11:13', machineDateTime: '31/08/2026 15:48', doses: [372,299,136,98,518,85,532,4,801,289,243,133,1] },
    { date: '08/09/2026', total: 3748, realTime: '13:06', machineDateTime: null, doses: [387,319,148,104,564,93,571,4,861,297,262,137,1] }
  ];

  const nfDetalhes = [
    ['ALPINO Achocolatado com Leite NPro 1,3 kg', '1', 'R$ 260,57', 'R$ 260,57'],
    ['NESCAFÉ Café em Grãos NPro 1 kg', '2', 'R$ 171,52', 'R$ 343,04'],
    ['NESCAFÉ Cappuccino Barista NPro 1,3 kg', '1', 'R$ 145,43', 'R$ 145,43'],
    ['NESCAFÉ Copos 200 ml — pacote c/50', '8', 'R$ 11,02', 'R$ 88,16'],
    ['KIT KAT Achocolatado em Pó NPro 1,3 kg', '1', 'R$ 242,81', 'R$ 242,81']
  ];

  const pageInfo = {
    maquina: { title: 'Máquina de Café', subtitle: 'Resumo operacional da máquina' },
    leituras: { title: 'Leituras da máquina', subtitle: 'Leituras acumuladas e consumo entre períodos' },
    estoque: { title: 'Estoque da máquina', subtitle: 'Produtos fechados e produtos abertos/em uso' },
    nestle: { title: 'Pedido Nestlé', subtitle: 'Compras, recebimentos e notas fiscais' },
    agua: { title: 'Água', subtitle: 'Resumo do abastecimento de água' },
    'estoque-agua': { title: 'Estoque de água', subtitle: 'Saldo físico de água' },
    'compras-agua': { title: 'Compras de água', subtitle: 'Histórico de compras e recebimentos de água' },
    copos: { title: 'Copos e descartáveis', subtitle: 'Controle separado de copos e descartáveis' },
    bebidas: { title: 'Bebidas da geladeira', subtitle: 'Saldo atual de bebidas refrigeradas' },
    gourmet: { title: 'Itens da área gourmet', subtitle: 'Controle dos itens de apoio da área gourmet' }
  };

  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function tr(items) {
    return '<tr>' + items.map((item) => '<td>' + esc(item) + '</td>').join('') + '</tr>';
  }

  function table(headers, rows) {
    return `<div class="cafe-table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  }

  function brNumber(value) {
    return Number(value).toLocaleString('pt-BR');
  }

  function parseBrDate(value) {
    const [day, month, year] = String(value).split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function daysBetween(start, end) {
    return Math.max(1, Math.round((parseBrDate(end) - parseBrDate(start)) / 86400000));
  }

  function currentPeriod() {
    const latest = leituras[leituras.length - 1];
    const previous = leituras[leituras.length - 2];
    const deltas = latest.doses.map((value, index) => value - previous.doses[index]);
    const consumed = latest.total - previous.total;
    const days = daysBetween(previous.date, latest.date);
    const average = consumed / days;
    const ranking = deltas
      .map((value, index) => ({ name: drinkNames[index], value }))
      .filter((item) => item.value > 0 && !item.name.startsWith('#13'))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return { latest, previous, deltas, consumed, days, average, ranking };
  }

  function rankingChart(ranking) {
    const max = Math.max(...ranking.map((item) => item.value), 1);
    return `<div class="cafe-ranking">${ranking.map((item, index) => `
      <div class="cafe-ranking-row">
        <div class="cafe-ranking-label"><span>${index + 1}. ${esc(item.name)}</span><strong>${item.value}</strong></div>
        <div class="cafe-ranking-track"><i style="width:${Math.max(4, (item.value / max) * 100)}%"></i></div>
      </div>`).join('')}</div>`;
  }

  function machinePage() {
    const { latest, previous, consumed, days, average, ranking } = currentPeriod();
    return `
      <div class="cafe-metrics">
        <article><span>Total acumulado</span><strong>${brNumber(latest.total)} doses</strong></article>
        <article><span>Última leitura</span><strong>${latest.date}</strong></article>
        <article><span>Consumo de ${previous.date} a ${latest.date}</span><strong>${brNumber(consumed)} doses</strong></article>
        <article><span>Média diária de ${previous.date} a ${latest.date}</span><strong>${average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} doses/dia</strong></article>
      </div>
      <section class="cafe-panel">
        <h3>Situação atual</h3>
        <p>A leitura mais recente foi registrada em <strong>${latest.date}${latest.realTime ? ` às ${latest.realTime}` : ''}</strong>, com total acumulado de <strong>${brNumber(latest.total)} doses</strong>.</p>
        <p>Entre <strong>${previous.date}</strong> e <strong>${latest.date}</strong> foram consumidas <strong>${brNumber(consumed)} bebidas</strong> em <strong>${days} dias</strong>, média de <strong>${average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} por dia</strong>.</p>
      </section>
      <section class="cafe-panel">
        <h3>Bebidas mais consumidas — ${previous.date} a ${latest.date}</h3>
        ${rankingChart(ranking)}
      </section>`;
  }

  function readingsPage() {
    const { latest, previous, deltas, consumed, average, ranking } = currentPeriod();
    const latestRows = latest.doses.map((value, index) => [
      `#${String(index + 1).padStart(2, '0')} — ${drinkNames[index]}`,
      brNumber(value),
      deltas[index] === 0 ? '0' : `+${deltas[index]}`
    ]);
    const historyRows = [...leituras].reverse().map((reading) => [
      reading.date,
      reading.realTime || '—',
      brNumber(reading.total) + ' doses'
    ]);
    return `
      <div class="cafe-metrics cafe-metrics-three">
        <article><span>Leitura anterior</span><strong>${previous.date} — ${brNumber(previous.total)}</strong></article>
        <article><span>Leitura atual</span><strong>${latest.date} — ${brNumber(latest.total)}</strong></article>
        <article><span>Consumo de ${previous.date} a ${latest.date}</span><strong>${brNumber(consumed)} doses</strong></article>
      </div>
      <section class="cafe-panel"><h3>Contadores em ${latest.date}</h3>${table(['Bebida', 'Acumulado', `Consumo desde ${previous.date}`], latestRows)}</section>
      <section class="cafe-panel"><h3>Média do período</h3><p><strong>${brNumber(consumed)} bebidas ÷ 8 dias = ${average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bebidas/dia.</strong></p></section>
      <section class="cafe-panel"><h3>Ranking do período</h3>${rankingChart(ranking)}</section>
      <section class="cafe-panel"><h3>Histórico de leituras</h3>${table(['Data real', 'Hora real', 'Total acumulado'], historyRows)}</section>`;
  }

  function stockPage() {
    return `
      <section class="cafe-panel"><h3>Estoque fechado — última conferência física</h3>${table(['Produto', 'Quantidade', 'Situação'], estoqueMaquina)}</section>
      <section class="cafe-panel cafe-note"><h3>Produto aberto / em uso</h3><p><strong>Achocolatado Dois Frades:</strong> aproximadamente meio pacote aberto/em uso. Esse volume não foi somado ao estoque fechado.</p><p>Produto que estiver dentro dos reservatórios da máquina também não entra no estoque fechado.</p><p><strong>A leitura da máquina não altera o estoque automaticamente.</strong> O estoque continua baseado em entradas, baixas e conferências físicas.</p></section>`;
  }

  function nestlePage() {
    return `
      <div class="cafe-metrics cafe-metrics-three">
        <article><span>NF</span><strong>003163825</strong></article>
        <article><span>Data da NF</span><strong>25/08/2026</strong></article>
        <article><span>Status</span><strong>Recebido / Entregue</strong></article>
      </div>
      <section class="cafe-panel"><h3>Nestlé Brasil Ltda</h3>${table(['Produto', 'Qtd.', 'Valor unitário', 'Total'], nfDetalhes)}<div class="cafe-totals"><p>Subtotal dos produtos: <strong>R$ 1.080,01</strong></p><p>IPI: <strong>R$ 8,60</strong></p><p>Total da NF: <strong>R$ 1.088,61</strong></p><p>Vencimento: <strong>15/09/2026</strong></p></div></section>`;
  }

  function waterSummaryPage() {
    return `
      <div class="cafe-metrics cafe-metrics-three">
        <article><span>Sem gás</span><strong>36 garrafas</strong></article>
        <article><span>Com gás</span><strong>24 garrafas</strong></article>
        <article><span>Total fechado</span><strong>60 garrafas</strong></article>
      </div>
      <section class="cafe-panel"><h3>Resumo</h3><p>Último estoque confirmado: <strong>3 fardos sem gás</strong> e <strong>2 fardos com gás</strong>, cada fardo com 12 unidades.</p></section>`;
  }

  function waterStockPage() {
    return `<section class="cafe-panel"><h3>Estoque físico</h3>${table(['Produto', 'Fardos fechados', 'Garrafas fechadas', 'Conversão'], aguas)}</section>`;
  }

  function waterPurchasesPage() {
    return `<section class="cafe-panel cafe-empty"><h3>Compras de água</h3><p>O estoque atual de água já está registrado, mas os dados completos da compra mais recente — fornecedor, nota, valores e data de recebimento — ainda não estão estruturados neste módulo.</p><p>Quando esses dados forem confirmados, eles ficarão somente nesta página.</p></section>`;
  }

  function cupsPage() {
    return `
      <section class="cafe-panel"><h3>Copos da máquina</h3><p><strong>NESCAFÉ Copos 200 ml — pacote com 50:</strong> 12 pacotes fechados.</p></section>
      <section class="cafe-panel cafe-note"><h3>Pendente de conferência</h3><p>A informação de <strong>“4 caixas e meia de copos”</strong> enviada pela equipe continua separada. Ela não foi somada aos 12 pacotes da máquina.</p><p>Somente depois de confirmar se corresponde ao produto Minalice/Copo Água 200 ml esse saldo será classificado.</p></section>`;
  }

  function drinksPage() {
    return `<section class="cafe-panel"><h3>Estoque atual</h3>${table(['Bebida', 'Quantidade', 'Unidade'], bebidas)}</section>`;
  }

  function gourmetPage() {
    return `<section class="cafe-panel cafe-empty"><h3>Área gourmet</h3><p>Ainda não existe inventário físico confirmado para esse grupo. Nenhum produto ou quantidade foi inventado.</p></section>`;
  }

  function contentFor(key) {
    const renderers = {
      maquina: machinePage,
      leituras: readingsPage,
      estoque: stockPage,
      nestle: nestlePage,
      agua: waterSummaryPage,
      'estoque-agua': waterStockPage,
      'compras-agua': waterPurchasesPage,
      copos: cupsPage,
      bebidas: drinksPage,
      gourmet: gourmetPage
    };
    return renderers[key]?.() || '';
  }

  function removePage() {
    document.querySelector('[data-cafe-page="1"]')?.remove();
  }

  function openPage(key) {
    const info = pageInfo[key];
    if (!info) return;
    removePage();
    const page = document.createElement('section');
    page.className = 'cafe-page-shell';
    page.dataset.cafePage = '1';
    page.innerHTML = `
      <div class="cafe-page-inner">
        <header class="cafe-page-header">
          <button type="button" class="cafe-back">← Voltar</button>
          <div><p>HUB SM · Copa & Café</p><h2>${esc(info.title)}</h2><small>${esc(info.subtitle)}</small></div>
        </header>
        <main class="cafe-page-content">${contentFor(key)}</main>
      </div>`;
    document.body.appendChild(page);
    history.pushState({ cafePage: key }, '', `#copa-cafe-${key}`);
    page.querySelector('.cafe-back')?.addEventListener('click', () => history.back());
    page.scrollTop = 0;
  }

  const destinos = new Map([
    ['maquina de cafe', 'maquina'],
    ['leituras da maquina', 'leituras'],
    ['estoque de insumos da maquina', 'estoque'],
    ['pedido nestle', 'nestle'],
    ['agua', 'agua'],
    ['estoque de agua', 'estoque-agua'],
    ['compras de agua', 'compras-agua'],
    ['copos e descartaveis', 'copos'],
    ['bebidas da geladeira', 'bebidas'],
    ['itens da area gourmet', 'gourmet']
  ]);

  function preparar() {
    const cards = Array.from(document.querySelectorAll('.admin-card, .module-card'));
    cards.forEach((card) => {
      const title = norm(card.querySelector('.module-card-title')?.textContent || card.querySelector('span')?.textContent || '');
      const key = destinos.get(title);
      if (!key || card.dataset.cafePageReady === '1') return;
      card.dataset.cafePageReady = '1';
      card.classList.add('cafe-card-ok', 'action-card');
      card.style.cursor = 'pointer';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => openPage(key));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPage(key);
        }
      });
    });
  }

  function estilo() {
    if (document.querySelector('[data-cafe-style="4"]')) return;
    const s = document.createElement('style');
    s.dataset.cafeStyle = '4';
    s.textContent = `
      .cafe-card-ok{border-left:4px solid #f97316!important}
      .cafe-page-shell{position:fixed;inset:0;z-index:9999;background:#f6f8fb;overflow:auto;color:#17212b}
      .cafe-page-inner{width:min(1050px,100%);min-height:100%;margin:0 auto;padding:18px}
      .cafe-page-header{display:flex;align-items:flex-start;gap:14px;padding:14px 0 18px;border-bottom:1px solid #dfe5ec;background:#f6f8fb;position:sticky;top:0;z-index:2}
      .cafe-page-header p{margin:0 0 2px;color:#c2410c;font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
      .cafe-page-header h2{margin:0;font-size:1.45rem}
      .cafe-page-header small{display:block;margin-top:3px;color:#667085;font-weight:700}
      .cafe-back{min-height:40px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font-weight:900;cursor:pointer}
      .cafe-page-content{display:grid;gap:14px;padding:18px 0 32px}
      .cafe-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .cafe-metrics-three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .cafe-metrics article{padding:14px;border:1px solid #fed7aa;border-radius:14px;background:#fff7ed}
      .cafe-metrics span{display:block;color:#9a3412;font-size:.74rem;font-weight:900;line-height:1.25}
      .cafe-metrics strong{display:block;margin-top:5px;color:#1f2937;font-size:1.05rem}
      .cafe-panel{padding:16px;border:1px solid #dfe5ec;border-radius:14px;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.04)}
      .cafe-panel h3{margin:0 0 10px;font-size:1rem}
      .cafe-panel p{margin:7px 0;color:#475569;line-height:1.5}
      .cafe-note{border-color:#fed7aa;background:#fffaf5}
      .cafe-empty{border-style:dashed}
      .cafe-table-wrap{overflow:auto;border:1px solid #e5e7eb;border-radius:10px}
      .cafe-panel table{width:100%;border-collapse:collapse;background:#fff}
      .cafe-panel th,.cafe-panel td{padding:9px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:.8rem;vertical-align:top}
      .cafe-panel th{background:#f8fafc;color:#334155;font-weight:900;white-space:nowrap}
      .cafe-panel tr:last-child td{border-bottom:0}
      .cafe-totals{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:12px}
      .cafe-totals p{margin:0}
      .cafe-ranking{display:grid;gap:10px}
      .cafe-ranking-row{display:grid;gap:5px}
      .cafe-ranking-label{display:flex;justify-content:space-between;gap:12px;color:#334155;font-size:.82rem;font-weight:800}
      .cafe-ranking-track{height:9px;background:#f1f5f9;border-radius:999px;overflow:hidden}
      .cafe-ranking-track i{display:block;height:100%;background:#f97316;border-radius:999px}
      @media(max-width:760px){
        .cafe-page-inner{padding:12px}
        .cafe-page-header{padding-top:8px}
        .cafe-page-header h2{font-size:1.2rem}
        .cafe-metrics,.cafe-metrics-three{grid-template-columns:1fr 1fr}
        .cafe-metrics article{padding:11px}
        .cafe-metrics strong{font-size:.95rem}
        .cafe-panel{padding:12px}
        .cafe-panel th,.cafe-panel td{font-size:.73rem;padding:8px}
      }
      @media(max-width:430px){.cafe-metrics,.cafe-metrics-three{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function rodar() { estilo(); preparar(); }
  window.addEventListener('load', rodar);
  document.addEventListener('DOMContentLoaded', rodar);
  window.addEventListener('popstate', removePage);
  const observer = new MutationObserver(preparar);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(preparar, 2000);
})();
