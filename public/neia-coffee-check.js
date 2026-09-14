(() => {
  const PAGE_ID = 'neia-coffee-check-page';
  const MARKER = 'data-neia-coffee-check';
  const SESSION_KEY = 'hub-sm-active-session';
  const drinkNames = [
    'Espresso', 'Curto', 'Duplo', 'Americano', 'Cappuccino', 'Café com Leite',
    'Achocolatado KitKat', 'Água Quente', 'Cappuccino Alpino', 'Alpino',
    'Mokaccino Dois Frades', 'Achocolatado Dois Frades', 'Registro técnico/sem identificação',
  ];

  const state = {
    previous: null,
    photoPaths: [],
    visionUsed: false,
    machineDatetime: null,
  };

  function api() {
    const helper = window.HubCopaCafeSession;
    if (!helper) throw new Error('Módulo da Copa & Café não carregado.');
    return helper;
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function currentUserId() {
    try {
      return normalize(JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')?.currentUser || '');
    } catch {
      return '';
    }
  }

  function activeScreen() {
    return Array.from(document.querySelectorAll('.screen')).find((screen) => {
      if (!(screen instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(screen);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function isNeiaScreen() {
    const current = currentUserId();
    const text = normalize(activeScreen()?.textContent || '');
    return current === 'neia' || (text.includes('neia') && text.includes('conferencia de estoque') && current !== 'selma');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [year, month, day] = String(iso).split('-');
    return `${day}/${month}/${year}`;
  }

  async function loadLatest(limit = 2) {
    const rows = await api().rest(`coffee_machine_readings?select=id,reading_date,real_time,total_accumulated,photo_path,source,coffee_machine_reading_counters(counter_number,drink_name,accumulated_count,confidence,needs_review)&order=reading_date.desc,created_at.desc&limit=${limit}`);
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      coffee_machine_reading_counters: Array.isArray(row.coffee_machine_reading_counters)
        ? [...row.coffee_machine_reading_counters].sort((a, b) => Number(a.counter_number) - Number(b.counter_number))
        : [],
    }));
  }

  async function weekComplete() {
    const { start, end } = api().weekRange();
    const rows = await api().rest(`coffee_machine_readings?select=id,reading_date,total_accumulated&reading_date=gte.${start}&reading_date=lte.${end}&order=reading_date.desc&limit=1`);
    return Array.isArray(rows) && rows.length > 0;
  }

  function findAnchorButton() {
    const screen = activeScreen();
    if (!screen) return null;
    const buttons = Array.from(screen.querySelectorAll('button'));
    return buttons.find((button) => normalize(button.textContent || '').includes('conferencia de estoque'))
      || buttons.find((button) => normalize(button.textContent || '').includes('saida de produto'))
      || null;
  }

  async function refreshShortcutStatus(button) {
    try {
      const complete = await weekComplete();
      button.textContent = complete ? 'Conferência semanal do Café ✓' : 'Conferência semanal do Café — PENDENTE';
      button.dataset.weekComplete = complete ? '1' : '0';
      button.title = complete ? 'Leitura da máquina registrada nesta semana' : 'Leitura da máquina pendente nesta semana';
    } catch {
      button.textContent = 'Conferência semanal do Café';
    }
  }

  function addShortcut() {
    if (!isNeiaScreen()) {
      document.querySelectorAll(`[${MARKER}="1"]`).forEach((node) => node.remove());
      return;
    }

    let button = document.querySelector(`[${MARKER}="1"]`);
    if (button instanceof HTMLButtonElement) {
      void refreshShortcutStatus(button);
      return;
    }

    const anchor = findAnchorButton();
    if (!(anchor instanceof HTMLButtonElement) || !anchor.parentElement) return;

    button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(MARKER, '1');
    button.className = `${anchor.className || ''} neia-coffee-shortcut`.trim();
    button.textContent = 'Conferência semanal do Café';
    button.style.marginTop = '10px';
    button.style.width = '100%';
    button.style.maxWidth = '100%';
    button.style.minHeight = '48px';
    button.style.fontWeight = '900';
    button.style.cursor = 'pointer';
    button.addEventListener('click', () => void openPage());
    anchor.insertAdjacentElement('afterend', button);
    void refreshShortcutStatus(button);
  }

  function counterRowsHtml(previous) {
    const previousMap = new Map((previous?.coffee_machine_reading_counters || []).map((item) => [Number(item.counter_number), Number(item.accumulated_count)]));
    return drinkNames.map((name, index) => {
      const number = index + 1;
      const oldValue = previousMap.has(number) ? previousMap.get(number) : null;
      return `
        <article class="coffee-counter-card" data-counter-card="${number}">
          <div><span>#${String(number).padStart(2, '0')}</span><strong>${escapeHtml(name)}</strong></div>
          <input class="coffee-counter-input" data-counter="${number}" type="number" inputmode="numeric" min="0" step="1" placeholder="—" aria-label="${escapeHtml(name)}" />
          <small>${oldValue === null ? 'Sem leitura anterior' : `Anterior: ${oldValue.toLocaleString('pt-BR')}`}</small>
        </article>`;
    }).join('');
  }

  function renderPage(previous, weeklyComplete) {
    document.getElementById(PAGE_ID)?.remove();
    state.previous = previous || null;
    state.photoPaths = [];
    state.visionUsed = false;
    state.machineDatetime = null;

    const page = document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'coffee-check-page';
    page.innerHTML = `
      <main class="coffee-check-shell">
        <header class="coffee-check-header">
          <button type="button" class="coffee-check-back">← Voltar</button>
          <div>
            <p>COPA & CAFÉ · NÉIA</p>
            <h1>Conferência semanal do Café</h1>
            <small>${weeklyComplete ? 'A semana já possui leitura. Você pode registrar outra se necessário.' : 'Leitura desta semana pendente.'}</small>
          </div>
        </header>

        <section class="coffee-check-summary">
          <div><span>Última leitura</span><strong>${previous ? formatDate(previous.reading_date) : 'Nenhuma'}</strong></div>
          <div><span>Total anterior</span><strong>${previous ? Number(previous.total_accumulated).toLocaleString('pt-BR') : '—'}</strong></div>
        </section>

        <section class="coffee-photo-panel">
          <h2>1. Tire a foto da máquina</h2>
          <p>Fotografe a tela com os números. Se precisar de mais de uma foto, toque novamente em <strong>Adicionar foto</strong>. A IA junta as informações.</p>
          <label class="coffee-photo-button">
            <span>📷 Adicionar foto</span>
            <input type="file" accept="image/*" capture="environment" data-coffee-photo-input />
          </label>
          <p class="coffee-photo-status" aria-live="polite">Nenhuma foto analisada. Você também pode preencher os números manualmente.</p>
        </section>

        <section class="coffee-total-panel">
          <label for="coffee-total">2. Total geral acumulado</label>
          <input id="coffee-total" type="number" inputmode="numeric" min="0" step="1" placeholder="Ex.: 3748" />
          <small>Confira o número mesmo quando ele vier preenchido pela foto.</small>
        </section>

        <section class="coffee-counters-section">
          <div class="coffee-section-head"><h2>3. Confira os 13 contadores</h2><span>Laranja = precisa conferir</span></div>
          <div class="coffee-counter-grid">${counterRowsHtml(previous)}</div>
        </section>

        <section class="coffee-check-validation" data-coffee-validation>
          <strong>O HUB confere os números antes de salvar.</strong>
          <p>A soma das diferenças dos 13 contadores precisa ser igual à diferença do total geral.</p>
        </section>

        <div class="coffee-save-area">
          <button type="button" class="coffee-save-button">SALVAR LEITURA</button>
          <p class="coffee-save-status" aria-live="polite"></p>
        </div>
      </main>`;

    document.body.appendChild(page);
    document.body.classList.add('coffee-check-open');

    page.querySelector('.coffee-check-back')?.addEventListener('click', closePage);
    page.querySelector('[data-coffee-photo-input]')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0] || null;
      event.target.value = '';
      if (file) void analyzePhoto(file);
    });
    page.querySelector('.coffee-save-button')?.addEventListener('click', () => void saveReading());
    page.querySelectorAll('.coffee-counter-input').forEach((input) => {
      input.addEventListener('input', () => {
        input.dataset.needsReview = '0';
        input.closest('.coffee-counter-card')?.classList.remove('needs-review');
        updateValidationPreview();
      });
    });
    page.querySelector('#coffee-total')?.addEventListener('input', updateValidationPreview);
  }

  async function openPage() {
    if (document.getElementById(PAGE_ID)) return;
    const loading = document.createElement('div');
    loading.id = PAGE_ID;
    loading.className = 'coffee-check-page coffee-check-loading';
    loading.innerHTML = '<div><strong>Carregando conferência do café...</strong></div>';
    document.body.appendChild(loading);
    document.body.classList.add('coffee-check-open');

    try {
      const [readings, complete] = await Promise.all([loadLatest(1), weekComplete()]);
      renderPage(readings[0] || null, complete);
    } catch (error) {
      loading.innerHTML = `<div class="coffee-check-error"><strong>Não foi possível carregar.</strong><p>${escapeHtml(error instanceof Error ? error.message : 'Erro desconhecido')}</p><button type="button">Voltar</button></div>`;
      loading.querySelector('button')?.addEventListener('click', closePage);
    }
  }

  function closePage() {
    document.getElementById(PAGE_ID)?.remove();
    document.body.classList.remove('coffee-check-open');
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível abrir a foto.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Foto inválida.'));
        img.onload = () => {
          const maxSide = 1800;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Não foi possível preparar a foto.'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function normalizeMachineDatetime(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(text)) return text.replace('T', ' ');
    const br = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (br) return `${br[3]}-${br[2]}-${br[1]} ${br[4]}:${br[5]}:${br[6] || '00'}`;
    return null;
  }

  async function analyzePhoto(file) {
    const page = document.getElementById(PAGE_ID);
    const status = page?.querySelector('.coffee-photo-status');
    const input = page?.querySelector('[data-coffee-photo-input]');
    if (!page || !status) return;

    status.textContent = 'Analisando a foto...';
    status.className = 'coffee-photo-status loading';
    if (input) input.disabled = true;

    try {
      const session = await api().ensure('cafe');
      const imageData = await fileToDataUrl(file);
      const response = await fetch(`${api().supabaseUrl}/functions/v1/copa-cafe-vision`, {
        method: 'POST',
        headers: {
          apikey: api().anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionToken: session.token, mode: 'machine_reading', imageData }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result?.error === 'OPENAI_NOT_CONFIGURED') {
          throw Object.assign(new Error('A leitura automática por foto ainda precisa da chave da IA no servidor. Você pode preencher manualmente por enquanto.'), { code: 'OPENAI_NOT_CONFIGURED' });
        }
        throw new Error(result?.message || result?.error || 'A foto não pôde ser analisada.');
      }

      state.visionUsed = true;
      if (result.photoPath && !state.photoPaths.includes(result.photoPath)) state.photoPaths.push(result.photoPath);
      const machineDatetime = normalizeMachineDatetime(result?.reading?.machine_datetime);
      if (machineDatetime) state.machineDatetime = machineDatetime;

      if (Number.isInteger(result?.reading?.total_accumulated)) {
        const totalInput = page.querySelector('#coffee-total');
        if (totalInput) totalInput.value = String(result.reading.total_accumulated);
      }

      const counters = Array.isArray(result?.reading?.counters) ? result.reading.counters : [];
      counters.forEach((counter) => {
        const number = Number(counter?.number);
        const field = page.querySelector(`.coffee-counter-input[data-counter="${number}"]`);
        if (!(field instanceof HTMLInputElement)) return;
        const value = counter?.accumulated_count;
        if (Number.isInteger(value)) field.value = String(value);
        field.dataset.confidence = Number.isFinite(Number(counter?.confidence)) ? String(counter.confidence) : '';
        const needsReview = Boolean(counter?.needs_review) || !Number.isInteger(value) || Number(counter?.confidence || 0) < 0.75;
        field.dataset.needsReview = needsReview ? '1' : '0';
        field.closest('.coffee-counter-card')?.classList.toggle('needs-review', needsReview);
      });

      const reviewCount = Array.from(page.querySelectorAll('.coffee-counter-input')).filter((field) => field.dataset.needsReview === '1').length;
      status.textContent = reviewCount
        ? `Foto analisada. Confira ${reviewCount} campo(s) em laranja. Se algum número não apareceu, tire outra foto.`
        : 'Foto analisada. Confira os números antes de salvar.';
      status.className = 'coffee-photo-status success';
      updateValidationPreview();
    } catch (error) {
      console.error('[neia-coffee-check] vision', error);
      status.textContent = error instanceof Error ? error.message : 'Não foi possível analisar a foto.';
      status.className = 'coffee-photo-status error';
    } finally {
      if (input) input.disabled = false;
    }
  }

  function collectDraft() {
    const page = document.getElementById(PAGE_ID);
    if (!page) return null;
    const totalField = page.querySelector('#coffee-total');
    const total = Number(totalField?.value);
    const fields = Array.from(page.querySelectorAll('.coffee-counter-input'));
    const counters = fields.map((field) => ({
      number: Number(field.dataset.counter),
      accumulated_count: Number(field.value),
      confidence: field.dataset.confidence ? Number(field.dataset.confidence) : null,
      needs_review: field.dataset.needsReview === '1',
      field,
    }));
    return { total, totalField, counters };
  }

  function validateDraft(showErrors = false) {
    const draft = collectDraft();
    if (!draft) return { ok: false, message: 'Tela não encontrada.' };
    const { total, counters } = draft;

    if (!Number.isInteger(total) || total < 0) return { ok: false, message: 'Informe o total geral acumulado.' };
    if (counters.some((item) => !Number.isInteger(item.accumulated_count) || item.accumulated_count < 0)) {
      return { ok: false, message: 'Preencha os 13 contadores.' };
    }

    const pendingReview = counters.filter((item) => item.needs_review);
    if (pendingReview.length) return { ok: false, message: `Confira os ${pendingReview.length} campo(s) em laranja. Toque no número e confirme/corrija.` };

    const previous = state.previous;
    if (!previous) return { ok: true, message: 'Primeira leitura válida.', consumption: null, sumDelta: null };

    const previousMap = new Map((previous.coffee_machine_reading_counters || []).map((item) => [Number(item.counter_number), Number(item.accumulated_count)]));
    if (total < Number(previous.total_accumulated)) return { ok: false, message: 'O total geral não pode ser menor que a leitura anterior.' };

    let sumDelta = 0;
    let hasDecrease = false;
    counters.forEach((item) => {
      const oldValue = previousMap.get(item.number);
      const card = item.field.closest('.coffee-counter-card');
      if (oldValue !== undefined && item.accumulated_count < oldValue) {
        hasDecrease = true;
        if (showErrors) card?.classList.add('invalid');
      } else if (showErrors) {
        card?.classList.remove('invalid');
      }
      if (oldValue !== undefined) sumDelta += item.accumulated_count - oldValue;
    });
    if (hasDecrease) return { ok: false, message: 'Um contador ficou menor que na leitura anterior. Confira os campos marcados.' };

    const consumption = total - Number(previous.total_accumulated);
    if (sumDelta !== consumption) {
      return { ok: false, message: `Os contadores somam ${sumDelta} de diferença, mas o total geral mudou ${consumption}. Confira antes de salvar.`, consumption, sumDelta };
    }

    return { ok: true, message: `Conferência bateu: consumo de ${consumption} bebida(s) desde ${formatDate(previous.reading_date)}.`, consumption, sumDelta };
  }

  function updateValidationPreview() {
    const box = document.querySelector(`#${PAGE_ID} [data-coffee-validation]`);
    if (!box) return;
    const validation = validateDraft(false);
    box.classList.toggle('ok', validation.ok);
    box.classList.toggle('error', !validation.ok);
    box.querySelector('p').textContent = validation.message;
  }

  async function saveReading() {
    const page = document.getElementById(PAGE_ID);
    const button = page?.querySelector('.coffee-save-button');
    const status = page?.querySelector('.coffee-save-status');
    if (!page || !button || !status) return;

    const validation = validateDraft(true);
    updateValidationPreview();
    if (!validation.ok) {
      status.textContent = validation.message;
      status.className = 'coffee-save-status error';
      return;
    }

    const draft = collectDraft();
    if (!draft) return;
    if (!window.confirm(`Salvar esta leitura?\n\nTotal: ${draft.total.toLocaleString('pt-BR')}\n${validation.consumption === null ? '' : `Consumo desde a anterior: ${validation.consumption}`}`)) return;

    button.disabled = true;
    button.textContent = 'SALVANDO...';
    status.textContent = '';
    status.className = 'coffee-save-status';

    try {
      const session = await api().ensure('cafe');
      const result = await api().rpc('copa_cafe_save_coffee_reading', {
        p_session_token: session.token,
        p_reading_date: api().localIsoDate(),
        p_real_time: api().localTime(),
        p_machine_datetime: state.machineDatetime,
        p_total_accumulated: draft.total,
        p_counters: draft.counters.map((item) => ({
          number: item.number,
          accumulated_count: item.accumulated_count,
          confidence: item.confidence,
          needs_review: false,
        })),
        p_photo_path: state.photoPaths[0] || null,
        p_source: state.visionUsed ? 'vision' : 'manual',
        p_notes: state.photoPaths.length > 1 ? `Leitura conferida com ${state.photoPaths.length} fotos.` : 'Conferência semanal pelo HUB.',
      });

      status.textContent = `Leitura salva ✓ ID ${result.id} · Total ${Number(result.totalAccumulated).toLocaleString('pt-BR')}${result.consumption === null ? '' : ` · Consumo ${result.consumption}`}`;
      status.className = 'coffee-save-status success';
      button.textContent = 'SALVO ✓';
      page.querySelectorAll('input').forEach((field) => { field.disabled = true; });
      window.dispatchEvent(new CustomEvent('hub-coffee-reading-saved', { detail: result }));
    } catch (error) {
      console.error('[neia-coffee-check] save', error);
      const raw = String(error?.message || '');
      status.textContent = raw.includes('duplicate') || raw.includes('unique')
        ? 'Esta mesma leitura já está registrada.'
        : raw.includes('COFFEE_TOTAL_MISMATCH')
          ? 'O total geral não bate com a soma dos 13 contadores.'
          : 'Não foi possível salvar a leitura. Confira os números e tente novamente.';
      status.className = 'coffee-save-status error';
      button.disabled = false;
      button.textContent = 'TENTAR NOVAMENTE';
    }
  }

  function addStyles() {
    if (document.querySelector('[data-coffee-check-style="1"]')) return;
    const style = document.createElement('style');
    style.dataset.coffeeCheckStyle = '1';
    style.textContent = `
      body.coffee-check-open{overflow:hidden!important}.coffee-check-page{position:fixed;inset:0;z-index:10060;background:#f6f8fb;overflow:auto;color:#172033}.coffee-check-shell{width:min(880px,100%);min-height:100%;margin:0 auto;padding:18px 16px 42px;display:grid;gap:16px}.coffee-check-header{display:flex;gap:12px;align-items:flex-start}.coffee-check-header p{margin:0 0 3px;color:#c2410c;font-size:.72rem;font-weight:950;letter-spacing:.07em}.coffee-check-header h1{margin:0;font-size:1.42rem}.coffee-check-header small{display:block;margin-top:5px;color:#64748b;font-weight:750}.coffee-check-back{border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:9px 12px;font-weight:900;color:#334155}.coffee-check-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.coffee-check-summary div{padding:13px;border:1px solid #fed7aa;border-radius:13px;background:#fff7ed}.coffee-check-summary span{display:block;color:#9a3412;font-size:.75rem;font-weight:900}.coffee-check-summary strong{display:block;margin-top:4px;font-size:1.05rem}.coffee-photo-panel,.coffee-total-panel,.coffee-counters-section,.coffee-check-validation{padding:15px;border:1px solid #dbe3ee;border-radius:15px;background:#fff}.coffee-photo-panel h2,.coffee-counters-section h2{margin:0 0 6px;font-size:1.05rem}.coffee-photo-panel p{color:#475569;line-height:1.45}.coffee-photo-button{display:flex;align-items:center;justify-content:center;min-height:54px;border-radius:12px;background:#f97316;color:#fff;font-weight:950;cursor:pointer}.coffee-photo-button input{display:none}.coffee-photo-status{margin:9px 0 0!important;font-weight:800}.coffee-photo-status.success{color:#047857}.coffee-photo-status.error{color:#b91c1c}.coffee-total-panel{display:grid;gap:9px}.coffee-total-panel label{font-weight:950}.coffee-total-panel input{height:62px;border:2px solid #94a3b8;border-radius:12px;text-align:center;font-size:1.9rem;font-weight:950}.coffee-total-panel small{color:#64748b;text-align:center}.coffee-section-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}.coffee-section-head span{font-size:.72rem;color:#b45309;font-weight:900}.coffee-counter-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.coffee-counter-card{display:grid;grid-template-columns:minmax(0,1fr) 105px;gap:7px 10px;align-items:center;padding:11px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.coffee-counter-card>div{display:flex;gap:7px;align-items:center;min-width:0}.coffee-counter-card>div span{flex:0 0 auto;color:#64748b;font-size:.72rem;font-weight:900}.coffee-counter-card>div strong{font-size:.84rem;line-height:1.2}.coffee-counter-card input{width:100%;height:44px;border:1.5px solid #94a3b8;border-radius:9px;text-align:center;font-size:1.1rem;font-weight:900}.coffee-counter-card small{grid-column:1/-1;color:#64748b;font-size:.69rem}.coffee-counter-card.needs-review{border:2px solid #f59e0b;background:#fffbeb}.coffee-counter-card.invalid{border:2px solid #dc2626;background:#fef2f2}.coffee-check-validation{background:#f8fafc}.coffee-check-validation strong{display:block}.coffee-check-validation p{margin:5px 0 0;color:#475569}.coffee-check-validation.ok{border-color:#86efac;background:#f0fdf4}.coffee-check-validation.error{border-color:#fecaca}.coffee-save-area{display:grid;gap:8px}.coffee-save-button{min-height:56px;border:0;border-radius:12px;background:#166534;color:#fff;font-size:1rem;font-weight:950}.coffee-save-button:disabled{opacity:.65}.coffee-save-status{text-align:center;margin:0;font-weight:850}.coffee-save-status.success{color:#047857}.coffee-save-status.error{color:#b91c1c}.coffee-check-loading{display:grid;place-items:center}.coffee-check-loading>div,.coffee-check-error{padding:18px;border-radius:14px;background:#fff}.coffee-check-error{text-align:center;max-width:440px}.coffee-check-error button{border:0;border-radius:10px;background:#f97316;color:#fff;padding:9px 15px;font-weight:900}
      @media(max-width:650px){.coffee-check-shell{padding:13px 11px 34px}.coffee-check-header h1{font-size:1.2rem}.coffee-counter-grid{grid-template-columns:1fr}.coffee-check-summary{grid-template-columns:1fr 1fr}.coffee-counter-card{grid-template-columns:minmax(0,1fr) 92px}}
      @media(max-width:390px){.coffee-check-summary{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      addStyles();
      addShortcut();
    });
  }

  window.HubCoffeeWeeklyCheck = { open: openPage, weekComplete, refresh: schedule };
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  window.addEventListener('hub-coffee-reading-saved', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
