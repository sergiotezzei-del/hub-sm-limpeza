(() => {
  const estoque = [
    ['Café NPro', '2 pacotes', 'estoque fechado'],
    ['Cappuccino Tradicional', '2 pacotes', 'entregue no lugar do Barista'],
    ['Dois Frades', '3 pacotes', 'estoque fechado'],
    ['Alpino', '4 pacotes', 'estoque fechado'],
    ['Copos', 'aprox. 10 pacotes', 'conferir fisicamente'],
    ['KitKat', 'sem quantidade', 'não lançar ainda']
  ];

  const pedidos = [
    ['16/06/2026', 'Cappuccino Barista', '2', 'R$ 288,46'],
    ['16/06/2026', 'Dois Frades', '2', 'R$ 454,21'],
    ['16/06/2026', 'Alpino', '4', 'R$ 554,00'],
    ['16/06/2026', 'Café NPro', '2', 'R$ 484,42'],
    ['23/06/2026', 'Café NPro', '3', 'R$ 514,56'],
    ['30/06/2026', 'Dois Frades', '1', 'R$ 227,68']
  ];

  const leituras = [
    ['17/06/2026', '1.477 doses'],
    ['23/06/2026', '1.680 doses'],
    ['30/06/2026', '1.822 doses']
  ];

  function tr(items) {
    return '<tr>' + items.map((i) => '<td>' + i + '</td>').join('') + '</tr>';
  }

  function abrirCafe() {
    const antigo = document.querySelector('[data-cafe-box="1"]');
    if (antigo) antigo.remove();
    const fundo = document.createElement('div');
    fundo.className = 'cafe-fundo';
    fundo.dataset.cafeBox = '1';
    fundo.innerHTML = '<section class="cafe-box"><header><div><p>HUB SM</p><h2>Máquina de Café</h2></div><button type="button">Fechar</button></header><div class="cafe-resumo"><article><span>Total atual</span><strong>1.822 doses</strong></article><article><span>Última leitura</span><strong>30/06/2026</strong></article><article><span>Último consumo</span><strong>142 bebidas</strong></article><article><span>Média</span><strong>20/dia</strong></article></div><section><h3>Estoque fechado</h3><table><tbody>' + estoque.map(tr).join('') + '</tbody></table></section><section><h3>Produto instalado</h3><p>Café NPro — 1 pacote instalado. Não conta como estoque fechado.</p></section><section><h3>Leituras</h3><table><tbody>' + leituras.map(tr).join('') + '</tbody></table></section><section><h3>Pedidos</h3><table><tbody>' + pedidos.map(tr).join('') + '</tbody></table></section><section><h3>Divergência</h3><p>16/06/2026: pedido era Cappuccino Barista, mas foi entregue Cappuccino Tradicional. Faturado por R$ 144,23. Wellington informou ruptura na indústria. Status: aguardando Thiago.</p></section></section>';
    document.body.appendChild(fundo);
    fundo.querySelector('button').onclick = () => fundo.remove();
    fundo.onclick = (e) => { if (e.target === fundo) fundo.remove(); };
  }

  function preparar() {
    const cards = Array.from(document.querySelectorAll('.admin-card'));
    const card = cards.find((c) => {
      const title = String(c.querySelector('span')?.textContent || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      return title === 'maquina de cafe';
    });
    if (!card) return;
    card.classList.add('cafe-card-ok');
    card.style.cursor = 'pointer';
    card.onclick = abrirCafe;
  }

  function estilo() {
    if (document.querySelector('[data-cafe-style="1"]')) return;
    const s = document.createElement('style');
    s.dataset.cafeStyle = '1';
    s.textContent = '.cafe-card-ok{border-left:4px solid #f97316!important}.cafe-fundo{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:14px;overflow:auto}.cafe-box{width:min(900px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;padding:16px;display:grid;gap:12px}.cafe-box header{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:10px}.cafe-box header p{margin:0;color:#c2410c;font-weight:900;font-size:.72rem}.cafe-box h2,.cafe-box h3{margin:0}.cafe-box button{min-height:34px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-weight:900}.cafe-resumo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cafe-resumo article,.cafe-box section{padding:10px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}.cafe-resumo article{background:#fff7ed;border-color:#fed7aa}.cafe-resumo span{display:block;color:#9a3412;font-size:.72rem;font-weight:900}.cafe-box table{width:100%;border-collapse:collapse;background:#fff}.cafe-box td{padding:8px;border-bottom:1px solid #e5e7eb;font-size:.78rem;vertical-align:top}.cafe-box p{margin:0;color:#475569}@media(max-width:760px){.cafe-resumo{grid-template-columns:1fr 1fr}.cafe-box{padding:12px}.cafe-box td{font-size:.72rem}}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); preparar(); }
  window.addEventListener('load', () => { setTimeout(rodar, 700); setTimeout(rodar, 1500); setTimeout(rodar, 3000); });
})();
