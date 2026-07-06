(() => {
  const SESSION_KEY = 'hub-sm-guard-session';
  const PHOTO_PREFIX = 'hub-sm-guard-photo:';

  const guards = {
    clemente1234: { name: 'Carlos Clemente' },
    salomao1234: { name: 'Salomão' },
  };

  const escalas = {
    'Carlos Clemente': [
      ['2026-06-30', 'terça-feira, 30 de junho', '19:00', '2026-07-01', 'quarta-feira, 1 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-02', 'quinta-feira, 2 de julho', '19:00', '2026-07-03', 'sexta-feira, 3 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-04', 'sábado, 4 de julho', '07:00', '2026-07-04', 'sábado, 4 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-05', 'domingo, 5 de julho', '07:00', '2026-07-05', 'domingo, 5 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-06', 'segunda-feira, 6 de julho', '19:00', '2026-07-07', 'terça-feira, 7 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-08', 'quarta-feira, 8 de julho', '19:00', '2026-07-09', 'quinta-feira, 9 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-09', 'quinta-feira, 9 de julho', '07:00', '2026-07-09', 'quinta-feira, 9 de julho', '13:00', 'DIURNO', 'FERIADO - EXTRA 6H'],
      ['2026-07-10', 'sexta-feira, 10 de julho', '19:00', '2026-07-11', 'sábado, 11 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-11', 'sábado, 11 de julho', '19:00', '2026-07-12', 'domingo, 12 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-12', 'domingo, 12 de julho', '19:00', '2026-07-13', 'segunda-feira, 13 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-14', 'terça-feira, 14 de julho', '19:00', '2026-07-15', 'quarta-feira, 15 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-16', 'quinta-feira, 16 de julho', '19:00', '2026-07-17', 'sexta-feira, 17 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-18', 'sábado, 18 de julho', '07:00', '2026-07-18', 'sábado, 18 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-19', 'domingo, 19 de julho', '07:00', '2026-07-19', 'domingo, 19 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-20', 'segunda-feira, 20 de julho', '19:00', '2026-07-21', 'terça-feira, 21 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-22', 'quarta-feira, 22 de julho', '19:00', '2026-07-23', 'quinta-feira, 23 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-25', 'sábado, 25 de julho', '07:00', '2026-07-25', 'sábado, 25 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-26', 'domingo, 26 de julho', '07:00', '2026-07-26', 'domingo, 26 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-27', 'segunda-feira, 27 de julho', '19:00', '2026-07-28', 'terça-feira, 28 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-29', 'quarta-feira, 29 de julho', '19:00', '2026-07-30', 'quinta-feira, 30 de julho', '07:00', 'NOTURNO', ''],
    ],
    'Salomão': [
      ['2026-07-01', 'quarta-feira, 1 de julho', '19:00', '2026-07-02', 'quinta-feira, 2 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-03', 'sexta-feira, 3 de julho', '19:00', '2026-07-04', 'sábado, 4 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-04', 'sábado, 4 de julho', '19:00', '2026-07-05', 'domingo, 5 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-05', 'domingo, 5 de julho', '19:00', '2026-07-06', 'segunda-feira, 6 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-07', 'terça-feira, 7 de julho', '19:00', '2026-07-08', 'quarta-feira, 8 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-09', 'quinta-feira, 9 de julho', '13:00', '2026-07-09', 'quinta-feira, 9 de julho', '19:00', 'DIURNO', 'FERIADO - EXTRA 6H'],
      ['2026-07-09', 'quinta-feira, 9 de julho', '19:00', '2026-07-10', 'sexta-feira, 10 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-11', 'sábado, 11 de julho', '07:00', '2026-07-11', 'sábado, 11 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-12', 'domingo, 12 de julho', '07:00', '2026-07-12', 'domingo, 12 de julho', '19:00', 'DIURNO', ''],
      ['2026-07-13', 'segunda-feira, 13 de julho', '19:00', '2026-07-14', 'terça-feira, 14 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-15', 'quarta-feira, 15 de julho', '19:00', '2026-07-16', 'quinta-feira, 16 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-17', 'sexta-feira, 17 de julho', '19:00', '2026-07-18', 'sábado, 18 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-18', 'sábado, 18 de julho', '19:00', '2026-07-19', 'domingo, 19 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-19', 'domingo, 19 de julho', '19:00', '2026-07-20', 'segunda-feira, 20 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-21', 'terça-feira, 21 de julho', '19:00', '2026-07-22', 'quarta-feira, 22 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-23', 'quinta-feira, 23 de julho', '19:00', '2026-07-24', 'sexta-feira, 24 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-24', 'sexta-feira, 24 de julho', '19:00', '2026-07-25', 'sábado, 25 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-25', 'sábado, 25 de julho', '19:00', '2026-07-26', 'domingo, 26 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-26', 'domingo, 26 de julho', '19:00', '2026-07-27', 'segunda-feira, 27 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-28', 'terça-feira, 28 de julho', '19:00', '2026-07-29', 'quarta-feira, 29 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-30', 'quinta-feira, 30 de julho', '19:00', '2026-07-31', 'sexta-feira, 31 de julho', '07:00', 'NOTURNO', ''],
      ['2026-07-31', 'sexta-feira, 31 de julho', '19:00', '2026-08-01', 'sábado, 1 de agosto', '07:00', 'NOTURNO', ''],
    ],
  };

  function getGuard() {
    try {
      const guard = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return guard?.name && escalas[guard.name] ? guard : null;
    } catch {
      return null;
    }
  }

  function registro(item) {
    return { dataEntrada: item[0], entradaTexto: item[1], horaEntrada: item[2], dataSaida: item[3], saidaTexto: item[4], horaSaida: item[5], turno: item[6], observacao: item[7] };
  }

  function dataHora(data, hora) { return new Date(`${data}T${hora}:00`); }
  function hojeIso(data = new Date()) { return data.toLocaleDateString('en-CA'); }

  function limparTelas() { document.querySelectorAll('.guard-user-screen').forEach((el) => el.remove()); }
  function esconderApp() { document.querySelectorAll('.screen').forEach((el) => { el.style.display = 'none'; }); }
  function inserir(pagina) {
    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);
  }

  function cardPlantao(titulo, r, destaque) {
    const obs = r.observacao ? `<p class="escala-obs">${r.observacao}</p>` : '';
    return `<article class="${destaque ? 'escala-hoje' : 'plantao-card'}"><span>${titulo || r.turno}</span><strong>${r.entradaTexto}</strong><p>Entrada: ${r.horaEntrada}<br>Saída: ${r.horaSaida} — ${r.saidaTexto}</p>${obs}</article>`;
  }

  function cardDestaque(nome) {
    const agora = new Date();
    const hoje = hojeIso(agora);
    const registros = escalas[nome].map(registro).sort((a, b) => dataHora(a.dataEntrada, a.horaEntrada) - dataHora(b.dataEntrada, b.horaEntrada));
    const ativo = registros.find((r) => dataHora(r.dataEntrada, r.horaEntrada) <= agora && agora <= dataHora(r.dataSaida, r.horaSaida));
    const trabalhaHoje = registros.find((r) => r.dataEntrada === hoje && dataHora(r.dataSaida, r.horaSaida) >= agora);
    const escolhido = ativo || trabalhaHoje;
    if (escolhido) return cardPlantao('HOJE', escolhido, true);
    const proximo = registros.find((r) => dataHora(r.dataEntrada, r.horaEntrada) > agora);
    if (proximo) return cardPlantao('PRÓXIMA ESCALA', proximo, true);
    return '<article class="escala-hoje"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>';
  }

  function proximosCards(nome) {
    const agora = new Date();
    const registros = escalas[nome].map(registro).sort((a, b) => dataHora(a.dataEntrada, a.horaEntrada) - dataHora(b.dataEntrada, b.horaEntrada));
    const proximos = registros.filter((r) => dataHora(r.dataSaida, r.horaSaida) >= agora).slice(0, 6);
    if (!proximos.length) return '<article class="plantao-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>';
    return proximos.map((r) => cardPlantao('', r, false)).join('');
  }

  function renderFoto(name) {
    const key = PHOTO_PREFIX + name;
    const photo = localStorage.getItem(key) || '';
    return `<section class="guard-photo-area"><div class="guard-photo-box">${photo ? `<img src="${photo}" alt="Foto de ${name}">` : '<span>👤</span>'}</div><div class="guard-photo-actions"><label class="photo-button guard-photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" data-guard-photo-input></label><button type="button" class="ghost-button guard-photo-remove" data-guard-photo-remove>Remover foto</button></div></section>`;
  }

  function ativarFoto(pagina, guarda) {
    const key = PHOTO_PREFIX + guarda.name;
    const input = pagina.querySelector('[data-guard-photo-input]');
    const remove = pagina.querySelector('[data-guard-photo-remove]');
    input?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        localStorage.setItem(key, String(reader.result || ''));
        mostrarHome(guarda);
      };
      reader.readAsDataURL(file);
    });
    remove?.addEventListener('click', () => {
      localStorage.removeItem(key);
      mostrarHome(guarda);
    });
  }

  function mostrarHome(guarda) {
    limparTelas();
    esconderApp();
    const pagina = document.createElement('section');
    pagina.className = 'screen guard-user-screen guard-home-screen';
    pagina.innerHTML = `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${guarda.name}</h1><p>Perfil do guarda</p></div><button class="logout-button" type="button" data-guard-logout>Sair</button></header>${renderFoto(guarda.name)}<section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-guard-schedule><span>Escala de horário</span><strong></strong></button></section>`;
    inserir(pagina);
    pagina.querySelector('[data-guard-logout]')?.addEventListener('click', sair);
    pagina.querySelector('[data-guard-schedule]')?.addEventListener('click', () => mostrarEscala(guarda));
    ativarFoto(pagina, guarda);
    window.scrollTo(0, 0);
  }

  function mostrarEscala(guarda) {
    limparTelas();
    esconderApp();
    const pagina = document.createElement('section');
    pagina.className = 'screen guard-user-screen guard-schedule-screen';
    pagina.innerHTML = `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${guarda.name}</h1><p>Escala de horário</p></div><button class="logout-button" type="button" data-guard-back>Voltar</button></header><section class="escala-bloco">${cardDestaque(guarda.name)}<h2>Próximos plantões</h2><div class="plantao-lista">${proximosCards(guarda.name)}</div></section>`;
    inserir(pagina);
    pagina.querySelector('[data-guard-back]')?.addEventListener('click', () => mostrarHome(guarda));
    window.scrollTo(0, 0);
  }

  function sair() {
    sessionStorage.removeItem(SESSION_KEY);
    limparTelas();
    document.querySelectorAll('.screen').forEach((el) => { el.style.display = ''; });
    window.location.reload();
  }

  function loginGuarda(senha) {
    const guarda = guards[senha];
    if (!guarda) return false;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(guarda));
    mostrarHome(guarda);
    return true;
  }

  function interceptarLogin() {
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const input = form.querySelector('#password');
      if (!(input instanceof HTMLInputElement)) return;
      const senha = input.value.trim().toLowerCase();
      if (!guards[senha]) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.blur();
      loginGuarda(senha);
    }, true);
  }

  function restaurarSessao() {
    const guarda = getGuard();
    if (guarda) setTimeout(() => mostrarHome(guarda), 500);
  }

  function estilo() {
    if (document.querySelector('[data-guard-login-style="2"]')) return;
    const s = document.createElement('style');
    s.dataset.guardLoginStyle = '2';
    s.textContent = '.guard-user-screen .seguranca-card-interno{border-left:4px solid #f97316!important;cursor:pointer!important}.guard-user-screen .seguranca-card-interno span{display:block;color:#667085;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.guard-user-screen .seguranca-card-interno strong{display:none!important}.guard-photo-area{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;margin:14px 0;padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.guard-photo-box{width:108px;height:108px;border-radius:14px;background:#f1f5f9;display:grid;place-items:center;overflow:hidden;font-size:2.2rem}.guard-photo-box img{width:100%;height:100%;object-fit:cover}.guard-photo-actions{display:grid;gap:8px}.guard-photo-button,.guard-photo-remove{width:100%!important;min-height:34px!important;padding:7px 9px!important;font-size:.75rem!important;border-radius:8px!important;text-align:center!important}.guard-photo-button input{display:none!important}.guard-user-screen .escala-bloco{display:grid;gap:14px}.guard-user-screen .escala-bloco h2{margin:8px 0 0;color:#1f2933}.guard-user-screen .escala-hoje{padding:18px;border-radius:14px;border:1px solid #fed7aa;background:#fff7ed}.guard-user-screen .escala-hoje span{display:block;color:#9a3412;font-size:.78rem;font-weight:900;letter-spacing:.08em}.guard-user-screen .escala-hoje strong{display:block;margin-top:6px;font-size:1.25rem;color:#1f2933}.guard-user-screen .escala-hoje p{margin:8px 0 0;color:#475569;font-size:1rem;line-height:1.45}.guard-user-screen .plantao-lista{display:grid;gap:10px}.guard-user-screen .plantao-card{padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.guard-user-screen .plantao-card span{display:block;color:#667085;font-size:.72rem;font-weight:900;letter-spacing:.08em}.guard-user-screen .plantao-card strong{display:block;margin-top:5px;color:#1f2933;font-size:1.05rem}.guard-user-screen .plantao-card p{margin:6px 0 0;color:#475569;line-height:1.4}.guard-user-screen .escala-obs{color:#9a3412!important;font-weight:800}@media(max-width:720px){.guard-photo-area{grid-template-columns:1fr}.guard-photo-box{width:108px;height:108px}}';
    document.head.appendChild(s);
  }

  window.addEventListener('load', () => {
    estilo();
    interceptarLogin();
    restaurarSessao();
  });
})();
