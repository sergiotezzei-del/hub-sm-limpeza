(() => {
  let telaAnterior = null;

  const escala = {
    'Carlos Clemente': [
      '2026-06-30|terça-feira, 30 de junho|19:00|2026-07-01|quarta-feira, 1 de julho|07:00|NOTURNO|',
      '2026-07-02|quinta-feira, 2 de julho|19:00|2026-07-03|sexta-feira, 3 de julho|07:00|NOTURNO|',
      '2026-07-04|sábado, 4 de julho|07:00|2026-07-04|sábado, 4 de julho|19:00|DIURNO|',
      '2026-07-05|domingo, 5 de julho|07:00|2026-07-05|domingo, 5 de julho|19:00|DIURNO|',
      '2026-07-06|segunda-feira, 6 de julho|19:00|2026-07-07|terça-feira, 7 de julho|07:00|NOTURNO|',
      '2026-07-08|quarta-feira, 8 de julho|19:00|2026-07-09|quinta-feira, 9 de julho|07:00|NOTURNO|',
      '2026-07-09|quinta-feira, 9 de julho|07:00|2026-07-09|quinta-feira, 9 de julho|13:00|DIURNO|FERIADO - EXTRA 6H',
      '2026-07-10|sexta-feira, 10 de julho|19:00|2026-07-11|sábado, 11 de julho|07:00|NOTURNO|',
      '2026-07-11|sábado, 11 de julho|19:00|2026-07-12|domingo, 12 de julho|07:00|NOTURNO|',
      '2026-07-12|domingo, 12 de julho|19:00|2026-07-13|segunda-feira, 13 de julho|07:00|NOTURNO|',
      '2026-07-14|terça-feira, 14 de julho|19:00|2026-07-15|quarta-feira, 15 de julho|07:00|NOTURNO|',
      '2026-07-16|quinta-feira, 16 de julho|19:00|2026-07-17|sexta-feira, 17 de julho|07:00|NOTURNO|',
      '2026-07-18|sábado, 18 de julho|07:00|2026-07-18|sábado, 18 de julho|19:00|DIURNO|',
      '2026-07-19|domingo, 19 de julho|07:00|2026-07-19|domingo, 19 de julho|19:00|DIURNO|',
      '2026-07-20|segunda-feira, 20 de julho|19:00|2026-07-21|terça-feira, 21 de julho|07:00|NOTURNO|',
      '2026-07-22|quarta-feira, 22 de julho|19:00|2026-07-23|quinta-feira, 23 de julho|07:00|NOTURNO|',
      '2026-07-25|sábado, 25 de julho|07:00|2026-07-25|sábado, 25 de julho|19:00|DIURNO|',
      '2026-07-26|domingo, 26 de julho|07:00|2026-07-26|domingo, 26 de julho|19:00|DIURNO|',
      '2026-07-27|segunda-feira, 27 de julho|19:00|2026-07-28|terça-feira, 28 de julho|07:00|NOTURNO|',
      '2026-07-29|quarta-feira, 29 de julho|19:00|2026-07-30|quinta-feira, 30 de julho|07:00|NOTURNO|'
    ],
    'Salomão': [
      '2026-07-01|quarta-feira, 1 de julho|19:00|2026-07-02|quinta-feira, 2 de julho|07:00|NOTURNO|',
      '2026-07-03|sexta-feira, 3 de julho|19:00|2026-07-04|sábado, 4 de julho|07:00|NOTURNO|',
      '2026-07-04|sábado, 4 de julho|19:00|2026-07-05|domingo, 5 de julho|07:00|NOTURNO|',
      '2026-07-05|domingo, 5 de julho|19:00|2026-07-06|segunda-feira, 6 de julho|07:00|NOTURNO|',
      '2026-07-07|terça-feira, 7 de julho|19:00|2026-07-08|quarta-feira, 8 de julho|07:00|NOTURNO|',
      '2026-07-09|quinta-feira, 9 de julho|13:00|2026-07-09|quinta-feira, 9 de julho|19:00|DIURNO|FERIADO - EXTRA 6H',
      '2026-07-09|quinta-feira, 9 de julho|19:00|2026-07-10|sexta-feira, 10 de julho|07:00|NOTURNO|',
      '2026-07-11|sábado, 11 de julho|07:00|2026-07-11|sábado, 11 de julho|19:00|DIURNO|',
      '2026-07-12|domingo, 12 de julho|07:00|2026-07-12|domingo, 12 de julho|19:00|DIURNO|',
      '2026-07-13|segunda-feira, 13 de julho|19:00|2026-07-14|terça-feira, 14 de julho|07:00|NOTURNO|',
      '2026-07-15|quarta-feira, 15 de julho|19:00|2026-07-16|quinta-feira, 16 de julho|07:00|NOTURNO|',
      '2026-07-17|sexta-feira, 17 de julho|19:00|2026-07-18|sábado, 18 de julho|07:00|NOTURNO|',
      '2026-07-18|sábado, 18 de julho|19:00|2026-07-19|domingo, 19 de julho|07:00|NOTURNO|',
      '2026-07-19|domingo, 19 de julho|19:00|2026-07-20|segunda-feira, 20 de julho|07:00|NOTURNO|',
      '2026-07-21|terça-feira, 21 de julho|19:00|2026-07-22|quarta-feira, 22 de julho|07:00|NOTURNO|',
      '2026-07-23|quinta-feira, 23 de julho|19:00|2026-07-24|sexta-feira, 24 de julho|07:00|NOTURNO|',
      '2026-07-24|sexta-feira, 24 de julho|19:00|2026-07-25|sábado, 25 de julho|07:00|NOTURNO|',
      '2026-07-25|sábado, 25 de julho|19:00|2026-07-26|domingo, 26 de julho|07:00|NOTURNO|',
      '2026-07-26|domingo, 26 de julho|19:00|2026-07-27|segunda-feira, 27 de julho|07:00|NOTURNO|',
      '2026-07-28|terça-feira, 28 de julho|19:00|2026-07-29|quarta-feira, 29 de julho|07:00|NOTURNO|',
      '2026-07-30|quinta-feira, 30 de julho|19:00|2026-07-31|sexta-feira, 31 de julho|07:00|NOTURNO|',
      '2026-07-31|sexta-feira, 31 de julho|19:00|2026-08-01|sábado, 1 de agosto|07:00|NOTURNO|'
    ]
  };

  function hojeIso(data = new Date()) {
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${m}-${d}`;
  }

  function parse(linha) {
    const p = linha.split('|');
    return { de: p[0], deTexto: p[1], hDe: p[2], ate: p[3], ateTexto: p[4], hAte: p[5], turno: p[6], obs: p[7] || '' };
  }

  function dt(data, hora) { return new Date(`${data}T${hora}:00-03:00`); }

  function clearPages() {
    document.querySelectorAll('[data-sm-seguranca-page]').forEach((el) => el.remove());
  }

  function inserir(page) {
    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(page, footer);
    else document.querySelector('.app-shell')?.appendChild(page);
  }

  function criarPage(classe, html) {
    const page = document.createElement('section');
    page.className = `screen ${classe}`;
    page.dataset.smSegurancaPage = '1';
    page.innerHTML = html;
    inserir(page);
    window.scrollTo(0, 0);
    return page;
  }

  function abrirSeguranca() {
    const atual = document.querySelector('.screen:not([data-sm-seguranca-page])');
    if (!atual) return;
    telaAnterior = atual;
    atual.style.display = 'none';
    clearPages();
    const page = criarPage('seguranca-page', '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Segurança</h1><p>Guardas, rondas e ocorrências</p></div><button class="logout-button" type="button" data-voltar-painel>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-open-guardas><span>Guardas</span><strong></strong></button></section>');
    page.querySelector('[data-voltar-painel]').addEventListener('click', voltarPainel);
    page.querySelector('[data-open-guardas]').addEventListener('click', abrirGuardas);
  }

  function abrirGuardas() {
    document.querySelector('[data-sm-seguranca-page]')?.remove();
    const page = criarPage('guardas-page', '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Guardas</h1><p>Controle dos guardas</p></div><button class="logout-button" type="button" data-voltar-seguranca>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-open-escala><span>Escala de horários</span><strong></strong></button><button type="button" class="admin-card action-card module-card seguranca-card-interno"><span>Pagamentos</span><strong></strong></button></section>');
    page.querySelector('[data-voltar-seguranca]').addEventListener('click', abrirSegurancaDireto);
    page.querySelector('[data-open-escala]').addEventListener('click', abrirListaGuardas);
  }

  function abrirSegurancaDireto() {
    clearPages();
    const page = criarPage('seguranca-page', '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Segurança</h1><p>Guardas, rondas e ocorrências</p></div><button class="logout-button" type="button" data-voltar-painel>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-open-guardas><span>Guardas</span><strong></strong></button></section>');
    page.querySelector('[data-voltar-painel]').addEventListener('click', voltarPainel);
    page.querySelector('[data-open-guardas]').addEventListener('click', abrirGuardas);
  }

  function abrirListaGuardas() {
    clearPages();
    const page = criarPage('escala-page', '<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>Escala de horários</h1><p>Guardas</p></div><button class="logout-button" type="button" data-voltar-guardas>Voltar</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-nome-guarda="Carlos Clemente"><span>Carlos Clemente</span><strong></strong></button><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-nome-guarda="Salomão"><span>Salomão</span><strong></strong></button></section>');
    page.querySelector('[data-voltar-guardas]').addEventListener('click', abrirGuardas);
    page.querySelectorAll('[data-nome-guarda]').forEach((btn) => btn.addEventListener('click', () => abrirEscalaGuarda(btn.dataset.nomeGuarda)));
  }

  function card(r, titulo) {
    const obs = r.obs ? `<p class="escala-obs">${r.obs}</p>` : '';
    return `<article class="${titulo ? 'escala-hoje' : 'plantao-card'}"><span>${titulo || r.turno}</span><strong>${r.deTexto}</strong><p>Entrada: ${r.hDe}<br>Saída: ${r.hAte} — ${r.ateTexto}</p>${obs}</article>`;
  }

  function resumo(lista) {
    const agora = new Date();
    const hoje = hojeIso(agora);
    const ativo = lista.find((r) => dt(r.de, r.hDe) <= agora && agora <= dt(r.ate, r.hAte));
    const hojeItem = lista.find((r) => r.de === hoje && dt(r.ate, r.hAte) >= agora);
    if (ativo || hojeItem) return card(ativo || hojeItem, 'HOJE');
    const prox = lista.find((r) => dt(r.de, r.hDe) > agora);
    if (prox) return card(prox, 'PRÓXIMA ESCALA');
    return '<article class="escala-hoje"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a planilha do mês.</p></article>';
  }

  function abrirEscalaGuarda(nome) {
    const lista = (escala[nome] || []).map(parse).sort((a, b) => dt(a.de, a.hDe) - dt(b.de, b.hDe));
    const agora = new Date();
    const proximos = lista.filter((r) => dt(r.ate, r.hAte) >= agora).slice(0, 6);
    const cards = (proximos.length ? proximos : lista.slice(-6)).map((r) => card(r, '')).join('');
    clearPages();
    const page = criarPage('guarda-escala-page', `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${nome}</h1><p>Escala de horários</p></div><button class="logout-button" type="button" data-voltar-lista>Voltar</button></header><section class="escala-bloco">${resumo(lista)}<h2>Próximos plantões</h2><div class="plantao-lista">${cards}</div></section>`);
    page.querySelector('[data-voltar-lista]').addEventListener('click', abrirListaGuardas);
  }

  function voltarPainel() {
    clearPages();
    if (telaAnterior) telaAnterior.style.display = '';
    telaAnterior = null;
    window.scrollTo(0, 0);
  }

  function adicionarCard() {
    const painel = String(document.body.textContent || '').toLowerCase().includes('painel tezzei');
    const grid = document.querySelector('.module-grid');
    if (!painel || !grid || document.querySelector('[data-seguranca-card="1"]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-card action-card module-card seguranca-card-principal';
    btn.dataset.segurancaCard = '1';
    btn.innerHTML = '<span>SEGURANÇA</span><strong>Guardas</strong>';
    btn.addEventListener('click', abrirSeguranca);
    grid.appendChild(btn);
  }

  function estilo() {
    if (document.querySelector('[data-seguranca-style="stable"]')) return;
    const s = document.createElement('style');
    s.dataset.segurancaStyle = 'stable';
    s.textContent = '.seguranca-card-principal,.seguranca-card-interno{border-left:4px solid #f97316!important;cursor:pointer!important}.seguranca-grid{display:grid;gap:14px}.seguranca-card-interno span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.seguranca-card-interno strong{display:none!important}.escala-bloco{display:grid;gap:14px}.escala-bloco h2{margin:8px 0 0;color:#1f2933}.escala-hoje{padding:18px;border-radius:14px;border:1px solid #fed7aa;background:#fff7ed}.escala-hoje span{display:block;color:#9a3412;font-size:.78rem;font-weight:900;letter-spacing:.08em}.escala-hoje strong{display:block;margin-top:6px;font-size:1.25rem;color:#1f2933}.escala-hoje p{margin:8px 0 0;color:#475569;font-size:1rem;line-height:1.45}.plantao-lista{display:grid;gap:10px}.plantao-card{padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.plantao-card span{display:block;color:#667085;font-size:.72rem;font-weight:900;letter-spacing:.08em}.plantao-card strong{display:block;margin-top:5px;color:#1f2933;font-size:1.05rem}.plantao-card p{margin:6px 0 0;color:#475569;line-height:1.4}.escala-obs{color:#9a3412!important;font-weight:800}';
    document.head.appendChild(s);
  }

  function rodar() { estilo(); adicionarCard(); }
  window.addEventListener('load', () => { setTimeout(rodar, 500); setTimeout(rodar, 1500); setTimeout(rodar, 3000); });
})();
