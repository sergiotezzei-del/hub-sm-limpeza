(() => {
  const SESSION_KEY = 'hub-sm-guard-session';
  const PHOTO_PREFIX = 'hub-sm-guard-photo:';

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
      ['2026-07-29', 'quarta-feira, 29 de julho', '19:00', '2026-07-30', 'quinta-feira, 30 de julho', '07:00', 'NOTURNO', '']
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
      ['2026-07-31', 'sexta-feira, 31 de julho', '19:00', '2026-08-01', 'sábado, 1 de agosto', '07:00', 'NOTURNO', '']
    ]
  };

  function getGuard() {
    try { const g = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return g?.name && escalas[g.name] ? g : null; } catch { return null; }
  }

  function registro(item) {
    return { dataEntrada: item[0], entradaTexto: item[1], horaEntrada: item[2], dataSaida: item[3], saidaTexto: item[4], horaSaida: item[5], turno: item[6], observacao: item[7] };
  }

  function dataHora(data, hora) { return new Date(`${data}T${hora}:00`); }
  function hojeIso(data = new Date()) { return data.toLocaleDateString('en-CA'); }

  function cardPlantao(titulo, r, destaque) {
    const obs = r.observacao ? `<p class="escala-obs">${r.observacao}</p>` : '';
    return `<article class="${destaque ? 'escala-hoje' : 'plantao-card'}"><span>${titulo || r.turno}</span><strong>${r.entradaTexto}</strong><p>Entrada: ${r.horaEntrada}<br>Saída: ${r.horaSaida} — ${r.saidaTexto}</p>${obs}</article>`;
  }

  function destaque(nome) {
    const agora = new Date();
    const hoje = hojeIso(agora);
    const lista = escalas[nome].map(registro).sort((a, b) => dataHora(a.dataEntrada, a.horaEntrada) - dataHora(b.dataEntrada, b.horaEntrada));
    const ativo = lista.find((r) => dataHora(r.dataEntrada, r.horaEntrada) <= agora && agora <= dataHora(r.dataSaida, r.horaSaida));
    const hojeRegistro = lista.find((r) => r.dataEntrada === hoje && dataHora(r.dataSaida, r.horaSaida) >= agora);
    if (ativo || hojeRegistro) return cardPlantao('HOJE', ativo || hojeRegistro, true);
    const proximo = lista.find((r) => dataHora(r.dataEntrada, r.horaEntrada) > agora);
    if (proximo) return cardPlantao('PRÓXIMA ESCALA', proximo, true);
    return '<article class="escala-hoje"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>';
  }

  function proximos(nome) {
    const agora = new Date();
    const lista = escalas[nome].map(registro).sort((a, b) => dataHora(a.dataEntrada, a.horaEntrada) - dataHora(b.dataEntrada, b.horaEntrada));
    const prox = lista.filter((r) => dataHora(r.dataSaida, r.horaSaida) >= agora).slice(0, 6);
    return prox.length ? prox.map((r) => cardPlantao('', r, false)).join('') : '<article class="plantao-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>';
  }

  function addPhotoArea() {
    const guard = getGuard();
    const page = document.querySelector('.guard-home-screen');
    if (!guard || !page || page.querySelector('[data-guard-photo-area="1"]')) return;
    const header = page.querySelector('.top-bar');
    if (!header) return;
    const key = PHOTO_PREFIX + guard.name;
    const photo = localStorage.getItem(key) || '';
    const box = document.createElement('section');
    box.className = 'guard-photo-area';
    box.dataset.guardPhotoArea = '1';
    box.innerHTML = `<div class="guard-photo-box">${photo ? `<img src="${photo}" alt="Foto de ${guard.name}">` : '<span>👤</span>'}</div><div class="guard-photo-actions"><label class="photo-button guard-photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" data-guard-photo-input></label><button type="button" class="ghost-button guard-photo-remove" data-guard-photo-remove>Remover foto</button></div>`;
    header.insertAdjacentElement('afterend', box);
    box.querySelector('[data-guard-photo-input]').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { localStorage.setItem(key, String(reader.result || '')); renderPhoto(box, key, guard.name); };
      reader.readAsDataURL(file);
    });
    box.querySelector('[data-guard-photo-remove]').addEventListener('click', () => { localStorage.removeItem(key); renderPhoto(box, key, guard.name); });
  }

  function renderPhoto(scope, key, name) {
    const photo = localStorage.getItem(key) || '';
    const target = scope.querySelector('.guard-photo-box');
    if (!target) return;
    target.innerHTML = photo ? `<img src="${photo}" alt="Foto de ${name}">` : '<span>👤</span>';
  }

  function abrirEscalaGuard() {
    const guard = getGuard();
    if (!guard) return;
    document.querySelectorAll('.guard-user-screen').forEach((el) => el.remove());
    document.querySelectorAll('.screen').forEach((el) => { el.style.display = 'none'; });
    const pagina = document.createElement('section');
    pagina.className = 'screen guard-user-screen guard-schedule-screen';
    pagina.innerHTML = `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${guard.name}</h1><p>Escala de horário</p></div><button class="logout-button" type="button" data-guard-back>Voltar</button></header><section class="escala-bloco">${destaque(guard.name)}<h2>Próximos plantões</h2><div class="plantao-lista">${proximos(guard.name)}</div></section>`;
    const footer = document.querySelector('footer');
    if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
    else document.querySelector('.app-shell')?.appendChild(pagina);
    pagina.querySelector('[data-guard-back]').addEventListener('click', () => {
      pagina.remove();
      if (window.loginGuardHomeFix) window.loginGuardHomeFix();
      else window.location.reload();
    });
    window.scrollTo(0, 0);
  }

  function patchHomeBackdoor() {
    const guard = getGuard();
    if (!guard) return;
    window.loginGuardHomeFix = () => {
      document.querySelectorAll('.guard-user-screen').forEach((el) => el.remove());
      document.querySelectorAll('.screen').forEach((el) => { el.style.display = 'none'; });
      const pagina = document.createElement('section');
      pagina.className = 'screen guard-user-screen guard-home-screen';
      pagina.innerHTML = `<header class="top-bar"><div><p class="eyebrow">SANTA MARIA SOLUÇÕES IMOBILIÁRIAS</p><h1>${guard.name}</h1><p>Perfil do guarda</p></div><button class="logout-button" type="button" data-guard-logout>Sair</button></header><section class="admin-grid seguranca-grid"><button type="button" class="admin-card action-card module-card seguranca-card-interno" data-guard-schedule><span>Escala de horário</span><strong></strong></button></section>`;
      const footer = document.querySelector('footer');
      if (footer?.parentElement) footer.parentElement.insertBefore(pagina, footer);
      else document.querySelector('.app-shell')?.appendChild(pagina);
      pagina.querySelector('[data-guard-logout]').addEventListener('click', () => { sessionStorage.removeItem(SESSION_KEY); window.location.reload(); });
      addPhotoArea();
      window.scrollTo(0, 0);
    };
  }

  function styles() {
    if (document.querySelector('[data-guard-profile-fix-style="1"]')) return;
    const s = document.createElement('style');
    s.dataset.guardProfileFixStyle = '1';
    s.textContent = '.guard-photo-area{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;margin:14px 0;padding:14px;border:1px solid #d0d5dd;border-left:4px solid #f97316;border-radius:12px;background:#fff}.guard-photo-box{width:96px;height:96px;border-radius:14px;background:#f1f5f9;display:grid;place-items:center;overflow:hidden;font-size:2rem}.guard-photo-box img{width:100%;height:100%;object-fit:cover}.guard-photo-actions{display:grid;gap:8px}.guard-photo-button,.guard-photo-remove{width:100%!important;min-height:34px!important;padding:7px 9px!important;font-size:.75rem!important;border-radius:8px!important;text-align:center!important}.guard-photo-button input{display:none!important}@media(max-width:720px){.guard-photo-area{grid-template-columns:1fr}.guard-photo-box{width:108px;height:108px}}';
    document.head.appendChild(s);
  }

  function run() { styles(); patchHomeBackdoor(); addPhotoArea(); }
  window.addEventListener('load', () => { setTimeout(run, 400); setTimeout(run, 1200); setTimeout(run, 2500); });
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const btn = event.target?.closest?.('[data-guard-schedule]');
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    abrirEscalaGuard();
  }, true);
})();
