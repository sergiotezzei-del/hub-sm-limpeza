(() => {
  let telaEscalaAnterior = null;

  const dados = {
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

  function item(linha) {
    const p = linha.split('|');
    return { de: p[0], deTexto: p[1], hDe: p[2], ate: p[3], ateTexto: p[4], hAte: p[5], turno: p[6], obs: p[7] || '' };
  }

  function dataHora(data, hora) {
    return new Date(`${data}T${hora}:00`);
  }

  function hojeIso(data = new Date()) {
    return data.toLocaleDateString('en-CA');
  }

  function card(r, titulo) {
    const obs = r.obs ? `<p class="escala-obs">${r.obs}</p>` : '';
    return `<article class="${titulo ? 'escala-hoje' : 'plantao-card'}"><span>${titulo || r.turno}</span><strong>${r.deTexto}</strong><p>Entrada: ${r.hDe}<br>Saída: ${r.hAte} — ${r.ateTexto}</p>${obs}</article>`;
  }

  function resumo(nome, lista) {
    const agora = new Date();
    const hoje = hojeIso(agora);
    const ativo = lista.find((r) => dataHora(r.de, r.hDe) <= agora && agora <= dataHora(r.ate, r.hAte));
    const trabalhaHoje = lista.find((r) => r.de === hoje && dataHora(r.ate, r.hAte) >= agora);
    if (ativo || trabalhaHoje) return card(ativo || trabalhaHoje, 'HOJE');
    const proximo = lista.find((r) => dataHora(r.de, r.hDe) > agora);
    if (proximo) return card(proximo, 'PRÓXIMA ESCALA');
    return '<article class="escala-hoje"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a planilha do mês.</p></article>';
  }

  function abrir(nome) {
    const lista = (dados[nome] || []).map(item).sort((a, b) => dataHora(a.de, a.hDe) - dataHora(b.de, b.hDe));
    if (!lista.length) return;

    document.querySelector('[data-guarda-escala-page="1"]')?.remove();
    telaEscalaAnterior = document.querySelector('[data-escala-page="1"]');
    if (telaEscalaAnterior) telaEscalaAnterior.style.display = 'none';

    const agora = new Date();
    const proximos = lista.filter((r) => dataHora(r.ate, r.hAte) >= agora).slice(0, 6);
    const page = document.createElement('section');
    page.className = 'screen guarda-escala-page';
    page.dataset.guardaEscalaPage = '1';
    page.innerHTML = `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${nome}</h1><p>Escala de horários</p></div><button class="logout-button" type="button" data-voltar-escala-fix>Voltar</button></header><section class="escala-bloco">${resumo(nome, lista)}<h2>Próximos plantões</h2><div class="plantao-lista">${proximos.map((r) => card(r, '')).join('') || '<article class="plantao-card"><strong>Sem próximos plantões</strong><p>Atualize a planilha do mês.</p></article>'}</div></section>`;

    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(page, footer);
    else document.querySelector('.app-shell')?.appendChild(page);

    page.querySelector('[data-voltar-escala-fix]').addEventListener('click', () => {
      page.remove();
      if (telaEscalaAnterior) telaEscalaAnterior.style.display = '';
      window.scrollTo(0, 0);
    });
    limparFeriado();
    window.scrollTo(0, 0);
  }

  function nomeDoBotao(target) {
    const btn = target?.closest?.('[data-guarda],button,.admin-card,.module-card');
    if (!btn) return '';
    const nome = btn.getAttribute('data-guarda') || btn.textContent || '';
    if (nome.includes('Carlos Clemente')) return 'Carlos Clemente';
    if (nome.includes('Salomão')) return 'Salomão';
    return '';
  }

  function limparFeriado() {
    document.querySelectorAll('.escala-obs').forEach((itemObs) => {
      if (String(itemObs.textContent || '').includes('FERIADO')) itemObs.textContent = 'FERIADO - EXTRA 6H';
    });
  }

  function estilo() {
    if (document.querySelector('[data-guarda-fix-style="1"]')) return;
    const s = document.createElement('style');
    s.dataset.guardaFixStyle = '1';
    s.textContent = '.escala-bloco{display:grid;gap:14px}.escala-bloco h2{margin:8px 0 0;color:#1f2933}.escala-hoje{padding:18px;border-radius:14px;border:1px solid #fed7aa;background:#fff7ed}.escala-hoje span{display:block;color:#9a3412;font-size:.78rem;font-weight:900;letter-spacing:.08em}.escala-hoje strong{display:block;margin-top:6px;font-size:1.25rem;color:#1f2933}.escala-hoje p{margin:8px 0 0;color:#475569;font-size:1rem;line-height:1.45}.plantao-lista{display:grid;gap:10px}.plantao-card{padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.plantao-card span{display:block;color:#667085;font-size:.72rem;font-weight:900;letter-spacing:.08em}.plantao-card strong{display:block;margin-top:5px;color:#1f2933;font-size:1.05rem}.plantao-card p{margin:6px 0 0;color:#475569;line-height:1.4}.escala-obs{color:#9a3412!important;font-weight:800}';
    document.head.appendChild(s);
  }

  document.addEventListener('click', (event) => {
    const nome = nomeDoBotao(event.target);
    if (!nome) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    estilo();
    abrir(nome);
  }, true);

  window.addEventListener('load', () => {
    estilo();
    limparFeriado();
    new MutationObserver(limparFeriado).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
