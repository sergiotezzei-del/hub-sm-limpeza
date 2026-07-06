(() => {
  let telaAnterior = null;
  let telaSeguranca = null;
  let telaGuardas = null;

  function abrirSeguranca() {
    const telaAtual = document.querySelector('.screen:not(.seguranca-page):not(.guardas-page):not(.escala-page)');
    if (!telaAtual) return;
    telaAnterior = telaAtual;
    telaAtual.style.display = 'none';

    document.querySelector('[data-seguranca-page="1"]')?.remove();
    document.querySelector('[data-guardas-page="1"]')?.remove();
    document.querySelector('[data-escala-page="1"]')?.remove();

    const pagina = document.createElement('section');
    pagina.className = 'screen seguranca-page';
    pagina.dataset.segurancaPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Segurança</h1><p>Guardas, rondas e ocorrências</p></div><button class="logout-button" type="button" data-seguranca-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-abrir-guardas><span>Guardas</span><strong></strong></button></section>';

    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);

    telaSeguranca = pagina;
    pagina.querySelector('[data-seguranca-voltar]').onclick = voltarPainel;
    pagina.querySelector('[data-abrir-guardas]').onclick = abrirGuardas;
    window.scrollTo(0, 0);
  }

  function abrirGuardas() {
    const atual = document.querySelector('[data-seguranca-page="1"]');
    if (atual) atual.style.display = 'none';

    document.querySelector('[data-guardas-page="1"]')?.remove();
    document.querySelector('[data-escala-page="1"]')?.remove();

    const pagina = document.createElement('section');
    pagina.className = 'screen guardas-page';
    pagina.dataset.guardasPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Guardas</h1><p>Controle dos guardas</p></div><button class="logout-button" type="button" data-guardas-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-abrir-escala><span>Escala de horários</span><strong></strong></button><button type="button" class="admin-card action-card module-card seguranca-card-interno"><span>Pagamentos</span><strong></strong></button></section>';

    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);

    telaGuardas = pagina;
    pagina.querySelector('[data-guardas-voltar]').onclick = voltarSeguranca;
    pagina.querySelector('[data-abrir-escala]').onclick = abrirEscala;
    window.scrollTo(0, 0);
  }

  function abrirEscala() {
    const atual = document.querySelector('[data-guardas-page="1"]');
    if (atual) atual.style.display = 'none';

    document.querySelector('[data-escala-page="1"]')?.remove();

    const pagina = document.createElement('section');
    pagina.className = 'screen escala-page';
    pagina.dataset.escalaPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Escala de horários</h1><p>Guardas</p></div><button class="logout-button" type="button" data-escala-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno"><span>Carlos Clemente</span><strong></strong></button><button type="button" class="admin-card action-card module-card seguranca-card-interno"><span>Salomão</span><strong></strong></button></section>';

    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);

    pagina.querySelector('[data-escala-voltar]').onclick = voltarGuardas;
    window.scrollTo(0, 0);
  }

  function voltarGuardas() {
    document.querySelector('[data-escala-page="1"]')?.remove();
    const guardas = document.querySelector('[data-guardas-page="1"]') || telaGuardas;
    if (guardas) guardas.style.display = '';
    window.scrollTo(0, 0);
  }

  function voltarSeguranca() {
    document.querySelector('[data-escala-page="1"]')?.remove();
    document.querySelector('[data-guardas-page="1"]')?.remove();
    const seguranca = document.querySelector('[data-seguranca-page="1"]') || telaSeguranca;
    if (seguranca) seguranca.style.display = '';
    window.scrollTo(0, 0);
  }

  function voltarPainel() {
    document.querySelector('[data-escala-page="1"]')?.remove();
    document.querySelector('[data-guardas-page="1"]')?.remove();
    document.querySelector('[data-seguranca-page="1"]')?.remove();
    if (telaAnterior) telaAnterior.style.display = '';
    telaAnterior = null;
    telaSeguranca = null;
    telaGuardas = null;
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
    s.textContent = '.seguranca-card-principal,.seguranca-card-interno{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-grid{display:grid;gap:14px}.seguranca-card-interno span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card-interno strong{display:none!important}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); adicionarCard(); }
  window.addEventListener('load', () => { setTimeout(rodar, 700); setTimeout(rodar, 1600); setTimeout(rodar, 3000); });
})();
