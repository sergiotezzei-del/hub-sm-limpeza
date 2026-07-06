(() => {
  let telaAnterior = null;
  let telaSeguranca = null;
  let telaGuardas = null;
  let telaEscala = null;

  const escalas = {
    'Carlos Clemente': [
      ['2026-06-30', 'terça-feira, 30 de junho', '19:00', '2026-07-01', 'quarta-feira, 1 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-02', 'quinta-feira, 2 de julho', '19:00', '2026-07-03', 'sexta-feira, 3 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-04', 'sábado, 4 de julho', '07:00', '2026-07-04', 'sábado, 4 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-05', 'domingo, 5 de julho', '07:00', '2026-07-05', 'domingo, 5 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-06', 'segunda-feira, 6 de julho', '19:00', '2026-07-07', 'terça-feira, 7 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-08', 'quarta-feira, 8 de julho', '19:00', '2026-07-09', 'quinta-feira, 9 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-09', 'quinta-feira, 9 de julho', '07:00', '2026-07-09', 'quinta-feira, 9 de julho', '13:00', 'DIURNO', 'FERIADO - EXTRA 6H / MEIO DIA', 'R$ 75'],
      ['2026-07-10', 'sexta-feira, 10 de julho', '19:00', '2026-07-11', 'sábado, 11 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-11', 'sábado, 11 de julho', '19:00', '2026-07-12', 'domingo, 12 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-12', 'domingo, 12 de julho', '19:00', '2026-07-13', 'segunda-feira, 13 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-14', 'terça-feira, 14 de julho', '19:00', '2026-07-15', 'quarta-feira, 15 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-16', 'quinta-feira, 16 de julho', '19:00', '2026-07-17', 'sexta-feira, 17 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-18', 'sábado, 18 de julho', '07:00', '2026-07-18', 'sábado, 18 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-19', 'domingo, 19 de julho', '07:00', '2026-07-19', 'domingo, 19 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-20', 'segunda-feira, 20 de julho', '19:00', '2026-07-21', 'terça-feira, 21 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-22', 'quarta-feira, 22 de julho', '19:00', '2026-07-23', 'quinta-feira, 23 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-25', 'sábado, 25 de julho', '07:00', '2026-07-25', 'sábado, 25 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-26', 'domingo, 26 de julho', '07:00', '2026-07-26', 'domingo, 26 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-27', 'segunda-feira, 27 de julho', '19:00', '2026-07-28', 'terça-feira, 28 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-29', 'quarta-feira, 29 de julho', '19:00', '2026-07-30', 'quinta-feira, 30 de julho', '07:00', 'NOTURNO', '', '']
    ],
    'Salomão': [
      ['2026-07-01', 'quarta-feira, 1 de julho', '19:00', '2026-07-02', 'quinta-feira, 2 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-03', 'sexta-feira, 3 de julho', '19:00', '2026-07-04', 'sábado, 4 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-04', 'sábado, 4 de julho', '19:00', '2026-07-05', 'domingo, 5 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-05', 'domingo, 5 de julho', '19:00', '2026-07-06', 'segunda-feira, 6 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-07', 'terça-feira, 7 de julho', '19:00', '2026-07-08', 'quarta-feira, 8 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-09', 'quinta-feira, 9 de julho', '13:00', '2026-07-09', 'quinta-feira, 9 de julho', '19:00', 'DIURNO', 'FERIADO - EXTRA 6H / MEIO DIA', 'R$ 75'],
      ['2026-07-09', 'quinta-feira, 9 de julho', '19:00', '2026-07-10', 'sexta-feira, 10 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-11', 'sábado, 11 de julho', '07:00', '2026-07-11', 'sábado, 11 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-12', 'domingo, 12 de julho', '07:00', '2026-07-12', 'domingo, 12 de julho', '19:00', 'DIURNO', '', ''],
      ['2026-07-13', 'segunda-feira, 13 de julho', '19:00', '2026-07-14', 'terça-feira, 14 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-15', 'quarta-feira, 15 de julho', '19:00', '2026-07-16', 'quinta-feira, 16 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-17', 'sexta-feira, 17 de julho', '19:00', '2026-07-18', 'sábado, 18 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-18', 'sábado, 18 de julho', '19:00', '2026-07-19', 'domingo, 19 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-19', 'domingo, 19 de julho', '19:00', '2026-07-20', 'segunda-feira, 20 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-21', 'terça-feira, 21 de julho', '19:00', '2026-07-22', 'quarta-feira, 22 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-23', 'quinta-feira, 23 de julho', '19:00', '2026-07-24', 'sexta-feira, 24 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-24', 'sexta-feira, 24 de julho', '19:00', '2026-07-25', 'sábado, 25 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-25', 'sábado, 25 de julho', '19:00', '2026-07-26', 'domingo, 26 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-26', 'domingo, 26 de julho', '19:00', '2026-07-27', 'segunda-feira, 27 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-28', 'terça-feira, 28 de julho', '19:00', '2026-07-29', 'quarta-feira, 29 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-30', 'quinta-feira, 30 de julho', '19:00', '2026-07-31', 'sexta-feira, 31 de julho', '07:00', 'NOTURNO', '', ''],
      ['2026-07-31', 'sexta-feira, 31 de julho', '19:00', '2026-08-01', 'sábado, 1 de agosto', '07:00', 'NOTURNO', '', '']
    ]
  };

  function asRegistro(item) { return { dataEntrada: item[0], entradaTexto: item[1], horaEntrada: item[2], dataSaida: item[3], saidaTexto: item[4], horaSaida: item[5], turno: item[6], observacao: item[7], valorExtra: item[8] }; }
  function dataHora(data, hora) { return new Date(`${data}T${hora}:00`); }
  function hojeIso(data = new Date()) { return data.toLocaleDateString('en-CA'); }

  function registroCardDestaque(titulo, r) {
    const obs = r.observacao ? `<p class="escala-obs">${r.observacao}${r.valorExtra ? ' • ' + r.valorExtra : ''}</p>` : '';
    return `<article class="escala-hoje"><span>${titulo}</span><strong>${r.entradaTexto}</strong><p>Entrada: ${r.horaEntrada}<br>Saída: ${r.horaSaida} — ${r.saidaTexto}</p>${obs}</article>`;
  }

  function proximoResumo(nome) {
    const agora = new Date();
    const hoje = hojeIso(agora);
    const registros = escalas[nome].map(asRegistro).sort((a, b) => dataHora(a.dataEntrada, a.horaEntrada) - dataHora(b.dataEntrada, b.horaEntrada));
    const ativo = registros.find((r) => dataHora(r.dataEntrada, r.horaEntrada) <= agora && agora <= dataHora(r.dataSaida, r.horaSaida));
    const trabalhaHoje = registros.find((r) => r.dataEntrada === hoje && dataHora(r.dataSaida, r.horaSaida) >= agora);
    if (ativo || trabalhaHoje) return registroCardDestaque('HOJE', ativo || trabalhaHoje);
    const proximo = registros.find((r) => dataHora(r.dataEntrada, r.horaEntrada) > agora);
    if (proximo) return registroCardDestaque('PRÓXIMA ESCALA', proximo);
    return '<article class="escala-hoje"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a planilha do mês.</p></article>';
  }

  function cardPlantao(r) {
    const obs = r.observacao ? `<p class="escala-obs">${r.observacao}${r.valorExtra ? ' • ' + r.valorExtra : ''}</p>` : '';
    return `<article class="plantao-card"><span>${r.turno}</span><strong>${r.entradaTexto}</strong><p>Entrada: ${r.horaEntrada}<br>Saída: ${r.horaSaida} — ${r.saidaTexto}</p>${obs}</article>`;
  }

  function inserirPagina(pagina) {
    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);
  }

  function abrirSeguranca() {
    const telaAtual = document.querySelector('.screen:not(.seguranca-page):not(.guardas-page):not(.escala-page):not(.guarda-escala-page)');
    if (!telaAtual) return;
    telaAnterior = telaAtual;
    telaAtual.style.display = 'none';
    document.querySelector('[data-seguranca-page="1"]')?.remove();
    document.querySelector('[data-guardas-page="1"]')?.remove();
    document.querySelector('[data-escala-page="1"]')?.remove();
    document.querySelector('[data-guarda-escala-page="1"]')?.remove();
    const pagina = document.createElement('section');
    pagina.className = 'screen seguranca-page';
    pagina.dataset.segurancaPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Segurança</h1><p>Guardas, rondas e ocorrências</p></div><button class="logout-button" type="button" data-seguranca-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-abrir-guardas><span>Guardas</span><strong></strong></button></section>';
    inserirPagina(pagina);
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
    document.querySelector('[data-guarda-escala-page="1"]')?.remove();
    const pagina = document.createElement('section');
    pagina.className = 'screen guardas-page';
    pagina.dataset.guardasPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Guardas</h1><p>Controle dos guardas</p></div><button class="logout-button" type="button" data-guardas-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-abrir-escala><span>Escala de horários</span><strong></strong></button><button type="button" class="admin-card action-card module-card seguranca-card-interno"><span>Pagamentos</span><strong></strong></button></section>';
    inserirPagina(pagina);
    telaGuardas = pagina;
    pagina.querySelector('[data-guardas-voltar]').onclick = voltarSeguranca;
    pagina.querySelector('[data-abrir-escala]').onclick = abrirEscala;
    window.scrollTo(0, 0);
  }

  function abrirEscala() {
    const atual = document.querySelector('[data-guardas-page="1"]');
    if (atual) atual.style.display = 'none';
    document.querySelector('[data-escala-page="1"]')?.remove();
    document.querySelector('[data-guarda-escala-page="1"]')?.remove();
    const pagina = document.createElement('section');
    pagina.className = 'screen escala-page';
    pagina.dataset.escalaPage = '1';
    pagina.innerHTML = '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Escala de horários</h1><p>Guardas</p></div><button class="logout-button" type="button" data-escala-voltar>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-guarda="Carlos Clemente"><span>Carlos Clemente</span><strong></strong></button><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-guarda="Salomão"><span>Salomão</span><strong></strong></button></section>';
    inserirPagina(pagina);
    telaEscala = pagina;
    pagina.querySelector('[data-escala-voltar]').onclick = voltarGuardas;
    pagina.querySelectorAll('[data-guarda]').forEach((botao) => botao.onclick = () => abrirEscalaGuarda(botao.dataset.guarda));
    window.scrollTo(0, 0);
  }

  function abrirEscalaGuarda(nome) {
    const atual = document.querySelector('[data-escala-page="1"]');
    if (atual) atual.style.display = 'none';
    document.querySelector('[data-guarda-escala-page="1"]')?.remove();
    const registros = escalas[nome].map(asRegistro).sort((a, b) => dataHora(a.dataEntrada, a.horaEntrada) - dataHora(b.dataEntrada, b.horaEntrada));
    const agora = new Date();
    const proximos = registros.filter((r) => dataHora(r.dataSaida, r.horaSaida) >= agora).slice(0, 6);
    const lista = proximos.length ? proximos.map(cardPlantao).join('') : '<article class="plantao-card"><strong>Sem próximos plantões</strong><p>Atualize a planilha do mês.</p></article>';
    const pagina = document.createElement('section');
    pagina.className = 'screen guarda-escala-page';
    pagina.dataset.guardaEscalaPage = '1';
    pagina.innerHTML = `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${nome}</h1><p>Escala de horários</p></div><button class="logout-button" type="button" data-guarda-escala-voltar>Voltar</button></header><section class="escala-bloco">${proximoResumo(nome)}<h2>Próximos plantões</h2><div class="plantao-lista">${lista}</div></section>`;
    inserirPagina(pagina);
    pagina.querySelector('[data-guarda-escala-voltar]').onclick = voltarEscala;
    window.scrollTo(0, 0);
  }

  function voltarEscala() { document.querySelector('[data-guarda-escala-page="1"]')?.remove(); const escala = document.querySelector('[data-escala-page="1"]') || telaEscala; if (escala) escala.style.display = ''; window.scrollTo(0, 0); }
  function voltarGuardas() { document.querySelector('[data-guarda-escala-page="1"]')?.remove(); document.querySelector('[data-escala-page="1"]')?.remove(); const guardas = document.querySelector('[data-guardas-page="1"]') || telaGuardas; if (guardas) guardas.style.display = ''; window.scrollTo(0, 0); }
  function voltarSeguranca() { document.querySelector('[data-guarda-escala-page="1"]')?.remove(); document.querySelector('[data-escala-page="1"]')?.remove(); document.querySelector('[data-guardas-page="1"]')?.remove(); const seguranca = document.querySelector('[data-seguranca-page="1"]') || telaSeguranca; if (seguranca) seguranca.style.display = ''; window.scrollTo(0, 0); }
  function voltarPainel() { document.querySelector('[data-guarda-escala-page="1"]')?.remove(); document.querySelector('[data-escala-page="1"]')?.remove(); document.querySelector('[data-guardas-page="1"]')?.remove(); document.querySelector('[data-seguranca-page="1"]')?.remove(); if (telaAnterior) telaAnterior.style.display = ''; telaAnterior = null; telaSeguranca = null; telaGuardas = null; telaEscala = null; window.scrollTo(0, 0); }

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
    s.textContent = '.seguranca-card-principal,.seguranca-card-interno{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-grid{display:grid;gap:14px}.seguranca-card-interno span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card-interno strong{display:none!important}.escala-bloco{display:grid;gap:14px}.escala-bloco h2{margin:8px 0 0;color:#1f2933}.escala-hoje{padding:18px;border-radius:14px;border:1px solid #fed7aa;background:#fff7ed}.escala-hoje span{display:block;color:#9a3412;font-size:.78rem;font-weight:900;letter-spacing:.08em}.escala-hoje strong{display:block;margin-top:6px;font-size:1.25rem;color:#1f2933}.escala-hoje p{margin:8px 0 0;color:#475569;font-size:1rem;line-height:1.45}.plantao-lista{display:grid;gap:10px}.plantao-card{padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.plantao-card span{display:block;color:#667085;font-size:.72rem;font-weight:900;letter-spacing:.08em}.plantao-card strong{display:block;margin-top:5px;color:#1f2933;font-size:1.05rem}.plantao-card p{margin:6px 0 0;color:#475569;line-height:1.4}.escala-obs{color:#9a3412!important;font-weight:800}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); adicionarCard(); }
  window.addEventListener('load', () => { setTimeout(rodar, 700); setTimeout(rodar, 1600); setTimeout(rodar, 3000); });
})();
