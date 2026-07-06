(() => {
  function abrirSeguranca() {
    document.querySelector('[data-seguranca-box="1"]')?.remove();
    const fundo = document.createElement('div');
    fundo.className = 'seguranca-fundo';
    fundo.dataset.segurancaBox = '1';
    fundo.innerHTML = '<section class="seguranca-box"><header><div><p>HUB SM</p><h2>Segurança</h2><small>Controle operacional da segurança</small></div><button type="button">Fechar</button></header><section class="seguranca-grid"><button type="button" class="seguranca-card"><span>Guardas</span><strong>Clemente, Salomão e rotinas</strong></button></section></section>';
    document.body.appendChild(fundo);
    fundo.querySelector('header button').onclick = () => fundo.remove();
    fundo.onclick = (e) => { if (e.target === fundo) fundo.remove(); };
  }

  function adicionarCard() {
    const painel = String(document.body.textContent || '').toLowerCase().includes('painel tezzei');
    if (!painel) return;
    const grid = document.querySelector('.module-grid');
    if (!grid || document.querySelector('[data-seguranca-card="1"]')) return;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'admin-card action-card module-card seguranca-card-principal';
    botao.dataset.segurancaCard = '1';
    botao.innerHTML = '<span>SEGURANÇA</span><strong>Guardas, rondas e ocorrências</strong>';
    botao.onclick = abrirSeguranca;
    grid.appendChild(botao);
  }

  function estilo() {
    if (document.querySelector('[data-seguranca-style="1"]')) return;
    const s = document.createElement('style');
    s.dataset.segurancaStyle = '1';
    s.textContent = '.seguranca-card-principal{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-fundo{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:16px;overflow:auto}.seguranca-box{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;padding:16px;display:grid;gap:14px}.seguranca-box header{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:10px}.seguranca-box header p{margin:0;color:#c2410c;font-weight:900;font-size:.72rem;text-transform:uppercase}.seguranca-box h2{margin:2px 0;color:#1f2933}.seguranca-box small{color:#667085;font-weight:800}.seguranca-box header button{min-height:34px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-weight:900}.seguranca-grid{display:grid;gap:10px}.seguranca-card{width:100%;text-align:left;padding:18px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.06)}.seguranca-card span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card strong{display:block;margin-top:8px;color:#1f2933;font-size:1.05rem}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); adicionarCard(); }
  window.addEventListener('load', () => { setTimeout(rodar, 700); setTimeout(rodar, 1600); setTimeout(rodar, 3000); });
})();
