(() => {
  let telaAnterior = null;

  function abrirSeguranca() {
    const telaAtual = document.querySelector('.screen');
    if (!telaAtual) return;
    telaAnterior = telaAtual;
    telaAtual.style.display = 'none';

    document.querySelector('[data-seguranca-page="1"]')?.remove();

    const pagina = document.createElement('section');
    pagina.className = 'screen seguranca-page';
    pagina.dataset.segurancaPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Segurança</h1><p>Guardas, rondas e ocorrências</p></div><button class="logout-button" type="button" data-seguranca-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno"><span>Guardas</span><strong>Clemente, Salomão e rotinas</strong></button></section>';

    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);

    pagina.querySelector('[data-seguranca-voltar]').onclick = voltarPainel;
    window.scrollTo(0, 0);
  }

  function voltarPainel() {
    document.querySelector('[data-seguranca-page="1"]')?.remove();
    if (telaAnterior) telaAnterior.style.display = '';
    telaAnterior = null;
    window.scrollTo(0, 0);
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
    botao.innerHTML = '<span>SEGURANÇA</span><strong>Guardas</strong>';
    botao.onclick = abrirSeguranca;
    grid.appendChild(botao);
  }

  function estilo() {
    if (document.querySelector('[data-seguranca-style="1"]')) return;
    const s = document.createElement('style');
    s.dataset.segurancaStyle = '1';
    s.textContent = '.seguranca-card-principal,.seguranca-card-interno{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-grid{display:grid;gap:14px}.seguranca-card-interno span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card-interno strong{display:block;margin-top:8px;color:#1f2933;font-size:1.05rem}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); adicionarCard(); }
  window.addEventListener('load', () => { setTimeout(rodar, 700); setTimeout(rodar, 1600); setTimeout(rodar, 3000); });
})();
