(() => {
  let painelPrincipal = null;

  const escalaClemente = [
    { entradaData: '2026-06-30', entradaTexto: 'terça-feira, 30 de junho', entradaHora: '19:00', saidaData: '2026-07-01', saidaTexto: 'quarta-feira, 1 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-02', entradaTexto: 'quinta-feira, 2 de julho', entradaHora: '19:00', saidaData: '2026-07-03', saidaTexto: 'sexta-feira, 3 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-04', entradaTexto: 'sábado, 4 de julho', entradaHora: '07:00', saidaData: '2026-07-04', saidaTexto: 'sábado, 4 de julho', saidaHora: '19:00', turno: 'DIURNO' },
    { entradaData: '2026-07-05', entradaTexto: 'domingo, 5 de julho', entradaHora: '07:00', saidaData: '2026-07-05', saidaTexto: 'domingo, 5 de julho', saidaHora: '19:00', turno: 'DIURNO' },
    { entradaData: '2026-07-06', entradaTexto: 'segunda-feira, 6 de julho', entradaHora: '19:00', saidaData: '2026-07-07', saidaTexto: 'terça-feira, 7 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-08', entradaTexto: 'quarta-feira, 8 de julho', entradaHora: '19:00', saidaData: '2026-07-09', saidaTexto: 'quinta-feira, 9 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-09', entradaTexto: 'quinta-feira, 9 de julho', entradaHora: '07:00', saidaData: '2026-07-09', saidaTexto: 'quinta-feira, 9 de julho', saidaHora: '13:00', turno: 'DIURNO', obs: 'FERIADO - EXTRA 6H' },
    { entradaData: '2026-07-10', entradaTexto: 'sexta-feira, 10 de julho', entradaHora: '19:00', saidaData: '2026-07-11', saidaTexto: 'sábado, 11 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-11', entradaTexto: 'sábado, 11 de julho', entradaHora: '19:00', saidaData: '2026-07-12', saidaTexto: 'domingo, 12 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-12', entradaTexto: 'domingo, 12 de julho', entradaHora: '19:00', saidaData: '2026-07-13', saidaTexto: 'segunda-feira, 13 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-14', entradaTexto: 'terça-feira, 14 de julho', entradaHora: '19:00', saidaData: '2026-07-15', saidaTexto: 'quarta-feira, 15 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-16', entradaTexto: 'quinta-feira, 16 de julho', entradaHora: '19:00', saidaData: '2026-07-17', saidaTexto: 'sexta-feira, 17 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-18', entradaTexto: 'sábado, 18 de julho', entradaHora: '07:00', saidaData: '2026-07-18', saidaTexto: 'sábado, 18 de julho', saidaHora: '19:00', turno: 'DIURNO' },
    { entradaData: '2026-07-19', entradaTexto: 'domingo, 19 de julho', entradaHora: '07:00', saidaData: '2026-07-19', saidaTexto: 'domingo, 19 de julho', saidaHora: '19:00', turno: 'DIURNO' },
    { entradaData: '2026-07-20', entradaTexto: 'segunda-feira, 20 de julho', entradaHora: '19:00', saidaData: '2026-07-21', saidaTexto: 'terça-feira, 21 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-22', entradaTexto: 'quarta-feira, 22 de julho', entradaHora: '19:00', saidaData: '2026-07-23', saidaTexto: 'quinta-feira, 23 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-25', entradaTexto: 'sábado, 25 de julho', entradaHora: '07:00', saidaData: '2026-07-25', saidaTexto: 'sábado, 25 de julho', saidaHora: '19:00', turno: 'DIURNO' },
    { entradaData: '2026-07-26', entradaTexto: 'domingo, 26 de julho', entradaHora: '07:00', saidaData: '2026-07-26', saidaTexto: 'domingo, 26 de julho', saidaHora: '19:00', turno: 'DIURNO' },
    { entradaData: '2026-07-27', entradaTexto: 'segunda-feira, 27 de julho', entradaHora: '19:00', saidaData: '2026-07-28', saidaTexto: 'terça-feira, 28 de julho', saidaHora: '07:00', turno: 'NOTURNO' },
    { entradaData: '2026-07-29', entradaTexto: 'quarta-feira, 29 de julho', entradaHora: '19:00', saidaData: '2026-07-30', saidaTexto: 'quinta-feira, 30 de julho', saidaHora: '07:00', turno: 'NOTURNO' }
  ];

  function dataHora(data, hora) {
    return new Date(`${data}T${hora}:00-03:00`);
  }

  function hojeIso(data = new Date()) {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

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

  function plantaoHojeClemente() {
    const agora = new Date();
    const hoje = hojeIso(agora);
    const ativo = escalaClemente.find((item) => dataHora(item.entradaData, item.entradaHora) <= agora && agora <= dataHora(item.saidaData, item.saidaHora));
    if (ativo) return ativo;
    return escalaClemente.find((item) => item.entradaData === hoje) || null;
  }

  function cardServicoHoje() {
    const plantao = plantaoHojeClemente();
    if (!plantao) {
      return '<article class="servico-hoje-card"><span>HOJE DE SERVIÇO</span><strong>Nenhum guarda lançado para hoje</strong><p>Atualize a escala quando houver novo plantão.</p></article>';
    }

    const obs = plantao.obs ? `<p class="escala-obs">${plantao.obs}</p>` : '';
    return `<article class="servico-hoje-card"><span>HOJE DE SERVIÇO</span><strong>Carlos Clemente</strong><p>Entrada: ${plantao.entradaHora}<br>Saída: ${plantao.saidaHora} — ${plantao.saidaTexto}</p>${obs}</article>`;
  }

  function abrirGuardas() {
    const tela = inserirTela(`<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Guardas</h1><p>Selecione o guarda</p></div><button class="logout-button" type="button" data-voltar-seguranca>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card" data-guarda-nome="Carlos Clemente"><span>Carlos Clemente</span><strong>Guarda Santa Maria</strong></button>${cardServicoHoje()}<button type="button" class="admin-card action-card module-card seguranca-card" data-guarda-nome="Salomão"><span>Salomão</span><strong>Guarda Santa Maria</strong></button></section>`);
    const voltar = tela.querySelector('[data-voltar-seguranca]');
    if (voltar) voltar.addEventListener('click', abrirSeguranca);
    tela.querySelectorAll('[data-guarda-nome]').forEach((botao) => {
      botao.addEventListener('click', () => abrirGuarda(botao.getAttribute('data-guarda-nome') || ''));
    });
  }

  function cardPlantao(item, destaque) {
    const obs = item.obs ? `<p class="escala-obs">${item.obs}</p>` : '';
    return `<article class="${destaque ? 'escala-hoje' : 'plantao-card'}"><span>${destaque || item.turno}</span><strong>${item.entradaTexto}</strong><p>Entrada: ${item.entradaHora}<br>Saída: ${item.saidaHora} — ${item.saidaTexto}</p>${obs}</article>`;
  }

  function resumoClemente() {
    const agora = new Date();
    const ativo = escalaClemente.find((item) => dataHora(item.entradaData, item.entradaHora) <= agora && agora <= dataHora(item.saidaData, item.saidaHora));
    if (ativo) return cardPlantao(ativo, 'HOJE');
    const proximo = escalaClemente.find((item) => dataHora(item.entradaData, item.entradaHora) > agora);
    if (proximo) return cardPlantao(proximo, 'PRÓXIMA ESCALA');
    return '<article class="escala-hoje"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>';
  }

  function proximosClemente() {
    const agora = new Date();
    const lista = escalaClemente.filter((item) => dataHora(item.saidaData, item.saidaHora) >= agora).slice(0, 6);
    if (!lista.length) return '<article class="plantao-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>';
    return lista.map((item) => cardPlantao(item, '')).join('');
  }

  function abrirGuarda(nome) {
    if (nome === 'Carlos Clemente') {
      const tela = inserirTela(`<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${nome}</h1><p>Escala de horário</p></div><button class="logout-button" type="button" data-voltar-guardas>Voltar</button></header><section class="escala-bloco">${resumoClemente()}<h2>Próximos plantões</h2><div class="plantao-lista">${proximosClemente()}</div></section>`);
      const voltar = tela.querySelector('[data-voltar-guardas]');
      if (voltar) voltar.addEventListener('click', abrirGuardas);
      return;
    }

    const tela = inserirTela(`<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${nome}</h1><p>Perfil do guarda</p></div><button class="logout-button" type="button" data-voltar-guardas>Voltar</button></header><section class="empty-state"><h2>${nome}</h2><p>Próxima etapa: criar escala, registros e controle deste guarda.</p></section>`);
    const voltar = tela.querySelector('[data-voltar-guardas]');
    if (voltar) voltar.addEventListener('click', abrirGuardas);
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
    style.textContent = '.seguranca-grid{display:grid;gap:14px}.seguranca-card{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-card span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card strong{display:block;margin-top:6px;color:#1f2933}.empty-state{padding:20px;border:1px solid #d0d5dd;border-radius:14px;background:#fff}.empty-state h2{margin:0 0 8px;color:#1f2933}.empty-state p{margin:6px 0;color:#475569;line-height:1.4}.servico-hoje-card{padding:16px;border-radius:14px;border:1px solid #fed7aa;background:#fff7ed}.servico-hoje-card span{display:block;color:#9a3412;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.servico-hoje-card strong{display:block;margin-top:6px;font-size:1.15rem;color:#1f2933}.servico-hoje-card p{margin:8px 0 0;color:#475569;line-height:1.45}.escala-bloco{display:grid;gap:14px}.escala-bloco h2{margin:8px 0 0;color:#1f2933}.escala-hoje{padding:18px;border-radius:14px;border:1px solid #fed7aa;background:#fff7ed}.escala-hoje span{display:block;color:#9a3412;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.escala-hoje strong{display:block;margin-top:6px;font-size:1.25rem;color:#1f2933}.escala-hoje p{margin:8px 0 0;color:#475569;font-size:1rem;line-height:1.45}.plantao-lista{display:grid;gap:10px}.plantao-card{padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.plantao-card span{display:block;color:#667085;font-size:.72rem;font-weight:900;letter-spacing:.08em}.plantao-card strong{display:block;margin-top:5px;color:#1f2933;font-size:1.05rem}.plantao-card p{margin:6px 0 0;color:#475569;line-height:1.4}.escala-obs{color:#9a3412!important;font-weight:800}';
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
