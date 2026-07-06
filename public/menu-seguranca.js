(() => {
  let painelPrincipal = null;

  function painelAberto() {
    const grid = document.querySelector('.module-grid');
    if (!grid) return null;
    const screen = grid.closest('.screen');
    if (!screen || screen.style.display === 'none') return null;
    const titulo = String(screen.querySelector('h1')?.textContent || '').toLowerCase();
    if (!titulo.includes('painel tezzei')) return null;
    return grid;
  }

  function removerTelasSeguranca() {
    document.querySelectorAll('[data-seguranca-simples="1"]').forEach((item) => item.remove());
  }

  function inserirTela(html) {
    removerTelasSeguranca();
    const tela = document.createElement('section');
    tela.className = 'screen';
    tela.dataset.segurancaSimples = '1';
    tela.innerHTML = html;
    const footer = document.querySelector('footer');
    if (footer && footer.parentElement) footer.parentElement.insertBefore(tela, footer);
    else document.querySelector('.app-shell')?.appendChild(tela);
    window.scrollTo(0, 0);
    return tela;
  }

  function voltarPainel() {
    removerTelasSeguranca();
    if (painelPrincipal) painelPrincipal.style.display = '';
    setTimeout(adicionarBotao, 100);
  }

  function abrirSeguranca() {
    const grid = painelAberto();
    const screen = grid ? grid.closest('.screen') : null;
    if (screen) {
      painelPrincipal = screen;
      screen.style.display = 'none';
    }

    const tela = inserirTela('<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Segurança</h1><p>Controle de segurança</p></div><button class="logout-button" type="button" data-voltar-painel>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card" data-abrir-guardas><span>Guardas</span><strong>Controle dos guardas</strong></button></section>');

    const voltar = tela.querySelector('[data-voltar-painel]');
    const guardas = tela.querySelector('[data-abrir-guardas]');
    if (voltar) voltar.addEventListener('click', voltarPainel);
    if (guardas) guardas.addEventListener('click', abrirGuardas);
  }

  function abrirGuardas() {
    const tela = inserirTela('<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Guardas</h1><p>Módulo em construção</p></div><button class="logout-button" type="button" data-voltar-seguranca>Voltar</button></header><section class="empty-state"><h2>Guardas</h2><p>Próxima etapa: criar opções de cadastro, escala e controle.</p></section>');
    const voltar = tela.querySelector('[data-voltar-seguranca]');
    if (voltar) voltar.addEventListener('click', abrirSeguranca);
  }

  function adicionarBotao() {
    const grid = painelAberto();
    if (!grid) return;
    if (grid.querySelector('[data-menu-seguranca="1"]')) return;

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'admin-card action-card module-card';
    botao.dataset.menuSeguranca = '1';
    botao.innerHTML = '<span>Segurança</span><strong>Guardas</strong>';
    botao.addEventListener('click', abrirSeguranca);
    grid.appendChild(botao);
  }

  function estilo() {
    if (document.querySelector('[data-seguranca-simples-style="1"]')) return;
    const style = document.createElement('style');
    style.dataset.segurancaSimplesStyle = '1';
    style.textContent = '.seguranca-grid{display:grid;gap:14px}.seguranca-card{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-card span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card strong{display:block;margin-top:6px;color:#1f2933}.empty-state{padding:20px;border:1px solid #d0d5dd;border-radius:14px;background:#fff}.empty-state h2{margin:0 0 8px;color:#1f2933}.empty-state p{margin:6px 0;color:#475569;line-height:1.4}';
    document.head.appendChild(style);
  }

  function iniciar() {
    estilo();
    adicionarBotao();
    setTimeout(adicionarBotao, 300);
    setTimeout(adicionarBotao, 1000);
    setInterval(adicionarBotao, 1500);
    new MutationObserver(adicionarBotao).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', iniciar);
  } else {
    iniciar();
  }
})();
