(() => {
  const drinkNames = [
    'Espresso', 'Curto', 'Duplo', 'Americano', 'Cappuccino', 'Café com Leite',
    'Achocolatado KitKat', 'Água Quente', 'Cappuccino Alpino', 'Alpino',
    'Mokaccino Dois Frades', 'Achocolatado Dois Frades', '#13 — registro técnico'
  ];

  const estoqueMaquina = [
    ['ALPINO Achocolatado com Leite NPro 1,3 kg', '1', 'Pacote fechado', '31/08/2026'],
    ['KIT KAT Achocolatado em Pó NPro 1,3 kg', '1', 'Pacote fechado', '31/08/2026'],
    ['NESCAFÉ Café em Grãos NPro 1 kg', '1', 'Pacote fechado', '31/08/2026'],
    ['Cappuccino — variedade a confirmar', '1', 'Pacote fechado', '31/08/2026'],
    ['Achocolatado Dois Frades', '0', 'Estoque fechado', 'Há aprox. meio pacote aberto/em uso; não somado ao fechado.'],
    ['NESCAFÉ Copos 200 ml — pacote c/50', '12', 'Pacotes fechados', '31/08/2026']
  ];

  const agua = [
    ['Lindóia Premium 310 ml sem gás', '36 garrafas', '3 fardos fechados x 12', '31/08/2026'],
    ['Lindóia Premium 310 ml com gás', '24 garrafas', '2 fardos fechados x 12', '31/08/2026']
  ];

  const bebidasGeladeira = [
    ['Heineken Long Neck', '19', 'Unidades'],
    ['Stella Pure Gold', '15', 'Unidades'],
    ['Heineken 0.0', '6', 'Unidades']
  ];

  const leituras = [
    { date: '17/06/2026', realTime: 'Não registrada', machineTime: '16:xx — incorreto', total: 1477, doses: [159,126,55,28,207,25,246,2,336,154,91,47,1], note: 'Primeira leitura registrada.' },
    { date: '23/06/2026', realTime: 'Não registrada', machineTime: '23:xx — incorreto', total: 1680, doses: [181,137,63,34,242,30,278,3,387,171,98,55,1], note: 'Consumo desde a leitura anterior: 203 doses.' },
    { date: '30/06/2026', realTime: 'Não registrada', machineTime: 'Data/hora interna incorreta', total: 1822, doses: [195,145,67,39,253,35,306,3,428,183,106,61,1], note: 'Consumo desde 23/06: 142 doses.' },
    { date: '24/08/2026', realTime: 'Não informada', machineTime: 'Relógio interno incorreto', total: 3326, doses: [348,280,133,93,481,76,504,4,765,280,234,127,1], note: 'Leitura anterior de referência para o fechamento de 31/08.' },
    { date: '31/08/2026', realTime: '11:13', machineTime: '15:48', total: 3511, doses: [372,299,136,98,518,85,532,4,801,289,243,133,1], note: 'Hora real é a referência. Consumo desde 24/08: 185 doses em 7 dias (26,4/dia).' }
  ];

  const pedidos = [
    ['16/06/2026', 'Nestlé Brasil', 'Cappuccino Barista', '2', 'R$ 288,46', 'Entregue com divergência'],
    ['16/06/2026', 'Nestlé Brasil', 'Dois Frades', '2', 'R$ 454,21', 'Entregue'],
    ['16/06/2026', 'Nestlé Brasil', 'Alpino', '4', 'R$ 554,00', 'Entregue'],
    ['16/06/2026', 'Nestlé Brasil', 'Café NPro', '2', 'R$ 484,42', 'Entregue'],
    ['23/06/2026', 'Nestlé Brasil', 'Café NPro', '3', 'R$ 514,56', 'Entregue'],
    ['30/06/2026', 'Nestlé Brasil', 'Dois Frades', '1', 'R$ 227,68', 'Entregue'],
    ['25/08/2026', 'Nestlé Brasil Ltda', 'NF 003163825 — Alpino 1; Café 2; Barista 1; Copos 8; KitKat 1', '13 itens/pacotes', 'R$ 1.088,61', 'RECEBIDO / ENTREGUE — venc. 15/09/2026']
  ];

  const nfDetalhes = [
    ['ALPINO Achocolatado com Leite NPro 1,3 kg', '1', 'R$ 260,57', 'R$ 260,57'],
    ['NESCAFÉ Café em Grãos NPro 1 kg', '2', 'R$ 171,52', 'R$ 343,04'],
    ['NESCAFÉ Cappuccino Barista NPro 1,3 kg', '1', 'R$ 145,43', 'R$ 145,43'],
    ['NESCAFÉ Copos 200 ml — pacote c/50', '8', 'R$ 11,02', 'R$ 88,16'],
    ['KIT KAT Achocolatado em Pó NPro 1,3 kg', '1', 'R$ 242,81', 'R$ 242,81']
  ];

  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function tr(items) {
    return '<tr>' + items.map((i) => '<td>' + esc(i) + '</td>').join('') + '</tr>';
  }

  function readingHtml(reading) {
    const rows = reading.doses.map((value, index) => tr([`#${String(index + 1).padStart(2, '0')} — ${drinkNames[index]}`, value])).join('');
    return `<article class="cafe-reading"><h4>${esc(reading.date)} — ${reading.total.toLocaleString('pt-BR')} doses acumuladas</h4><p><strong>Hora real:</strong> ${esc(reading.realTime)} &nbsp; <strong>Hora da máquina:</strong> ${esc(reading.machineTime)}</p><div class="cafe-table-wrap"><table><thead><tr><th>Bebida</th><th>Acumulado</th></tr></thead><tbody>${rows}</tbody></table></div><p>${esc(reading.note)}</p></article>`;
  }

  function abrirCafe(foco = 'resumo') {
    document.querySelector('[data-cafe-box="1"]')?.remove();
    const fundo = document.createElement('div');
    fundo.className = 'cafe-fundo';
    fundo.dataset.cafeBox = '1';
    fundo.innerHTML = `
      <section class="cafe-box" role="dialog" aria-modal="true" aria-label="Copa e Café">
        <header><div><p>HUB SM</p><h2>Máquina de Café / Copa & Café</h2><small>Atualizado em 31/08/2026</small></div><button type="button" class="cafe-fechar">Fechar</button></header>
        <div class="cafe-resumo" id="cafe-resumo">
          <article><span>Total acumulado</span><strong>3.511 doses</strong></article>
          <article><span>Última leitura</span><strong>31/08/2026 11:13</strong></article>
          <article><span>Consumo 24→31/08</span><strong>185 doses</strong></article>
          <article><span>Média do período</span><strong>26,4/dia</strong></article>
        </div>
        <section class="cafe-alerta"><strong>Importante</strong><p>O relógio da máquina está adiantado. Para histórico e relatórios, usar sempre a data/hora real. Produto dentro do reservatório não entra no estoque fechado.</p></section>
        <section id="cafe-estoque"><h3>Estoque fechado — Máquina</h3><div class="cafe-table-wrap"><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Situação</th><th>Observação</th></tr></thead><tbody>${estoqueMaquina.map(tr).join('')}</tbody></table></div></section>
        <section id="cafe-leituras"><h3>Leituras da máquina</h3>${leituras.map(readingHtml).join('')}</section>
        <section id="cafe-pedidos"><h3>Pedidos / Compras Nestlé</h3><div class="cafe-table-wrap"><table><thead><tr><th>Data</th><th>Fornecedor</th><th>Produto/NF</th><th>Qtd.</th><th>Total</th><th>Status</th></tr></thead><tbody>${pedidos.map(tr).join('')}</tbody></table></div><article class="cafe-nf"><h4>NF 003163825 — 25/08/2026</h4><div class="cafe-table-wrap"><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${nfDetalhes.map(tr).join('')}</tbody></table></div><p>Subtotal: <strong>R$ 1.080,01</strong> · IPI: <strong>R$ 8,60</strong> · Total: <strong>R$ 1.088,61</strong> · Vencimento: <strong>15/09/2026</strong>.</p></article></section>
        <section id="cafe-agua"><h3>Água</h3><div class="cafe-table-wrap"><table><thead><tr><th>Produto</th><th>Saldo</th><th>Equivalência</th><th>Data</th></tr></thead><tbody>${agua.map(tr).join('')}</tbody></table></div><p>Informação “4 caixas e meia de copos” permanece pendente de identificação e não foi misturada aos copos da máquina.</p></section>
        <section id="cafe-copos"><h3>Copos e descartáveis</h3><p><strong>NESCAFÉ Copos 200 ml:</strong> 12 pacotes fechados, com 50 unidades por pacote.</p><p>Não misturar com copos de água/Minalice enquanto o produto específico não estiver confirmado.</p></section>
        <section id="cafe-bebidas"><h3>Bebidas da geladeira</h3><div class="cafe-table-wrap"><table><thead><tr><th>Produto</th><th>Saldo</th><th>Unidade</th></tr></thead><tbody>${bebidasGeladeira.map(tr).join('')}</tbody></table></div></section>
        <section id="cafe-gourmet"><h3>Itens da área gourmet</h3><p>Ainda não há inventário confirmado para este grupo. Nenhum dado foi inventado.</p></section>
      </section>`;

    document.body.appendChild(fundo);
    fundo.querySelector('.cafe-fechar')?.addEventListener('click', () => fundo.remove());
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fundo.remove(); });
    document.addEventListener('keydown', function fecharEsc(e) {
      if (e.key === 'Escape' && document.body.contains(fundo)) { fundo.remove(); document.removeEventListener('keydown', fecharEsc); }
    });

    const target = fundo.querySelector(`#cafe-${foco}`);
    if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 50);
  }

  const destinos = new Map([
    ['maquina de cafe', 'resumo'],
    ['leituras da maquina', 'leituras'],
    ['estoque de insumos da maquina', 'estoque'],
    ['pedido nestle', 'pedidos'],
    ['agua', 'agua'],
    ['estoque de agua', 'agua'],
    ['compras de agua', 'agua'],
    ['copos e descartaveis', 'copos'],
    ['bebidas da geladeira', 'bebidas'],
    ['itens da area gourmet', 'gourmet']
  ]);

  function preparar() {
    const cards = Array.from(document.querySelectorAll('.admin-card, .module-card'));
    cards.forEach((card) => {
      const title = norm(card.querySelector('.module-card-title')?.textContent || card.querySelector('span')?.textContent || '');
      const foco = destinos.get(title);
      if (!foco || card.dataset.cafeReady === '1') return;
      card.dataset.cafeReady = '1';
      card.classList.add('cafe-card-ok', 'action-card');
      card.style.cursor = 'pointer';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => abrirCafe(foco));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          abrirCafe(foco);
        }
      });
    });
  }

  function estilo() {
    if (document.querySelector('[data-cafe-style="2"]')) return;
    const s = document.createElement('style');
    s.dataset.cafeStyle = '2';
    s.textContent = '.cafe-card-ok{border-left:4px solid #f97316!important}.cafe-fundo{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:14px;overflow:auto}.cafe-box{width:min(980px,100%);max-height:94vh;overflow:auto;background:#fff;border-radius:16px;padding:16px;display:grid;gap:12px;box-shadow:0 24px 80px rgba(15,23,42,.25)}.cafe-box header{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:10px;position:sticky;top:-16px;background:#fff;z-index:2;padding-top:4px}.cafe-box header p{margin:0;color:#c2410c;font-weight:900;font-size:.72rem}.cafe-box header small{color:#64748b}.cafe-box h2,.cafe-box h3,.cafe-box h4{margin:0}.cafe-box button{min-height:36px;padding:7px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-weight:900}.cafe-resumo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cafe-resumo article,.cafe-box>section,.cafe-reading,.cafe-nf{padding:10px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}.cafe-resumo article{background:#fff7ed;border-color:#fed7aa}.cafe-resumo span{display:block;color:#9a3412;font-size:.72rem;font-weight:900}.cafe-alerta{background:#fff7ed!important;border-color:#fed7aa!important}.cafe-table-wrap{overflow:auto}.cafe-box table{width:100%;border-collapse:collapse;background:#fff}.cafe-box th,.cafe-box td{padding:8px;border-bottom:1px solid #e5e7eb;font-size:.78rem;vertical-align:top;text-align:left}.cafe-box th{background:#f1f5f9;color:#334155;font-weight:900}.cafe-box p{margin:6px 0 0;color:#475569}.cafe-reading,.cafe-nf{display:grid;gap:7px;background:#fff;margin-top:8px}.cafe-reading .cafe-table-wrap{max-height:260px}@media(max-width:760px){.cafe-resumo{grid-template-columns:1fr 1fr}.cafe-box{padding:12px}.cafe-box header{top:-12px}.cafe-box th,.cafe-box td{font-size:.72rem;padding:7px}}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); preparar(); }
  window.addEventListener('load', rodar);
  document.addEventListener('DOMContentLoaded', rodar);
  const observer = new MutationObserver(() => preparar());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(preparar, 2000);
})();
