(() => {
  const PAGE_ID = 'neia-coffee-check-page';
  const MARKER = 'data-neia-coffee-check';
  const SESSION_KEY = 'hub-sm-active-session';
  const drinks = [
    'Espresso','Curto','Duplo','Americano','Cappuccino','Café com Leite',
    'Achocolatado KitKat','Água Quente','Cappuccino Alpino','Alpino',
    'Mokaccino Dois Frades','Achocolatado Dois Frades','Registro técnico/sem identificação'
  ];
  const state = { previous: null, photoPaths: [], visionUsed: false, machineDatetime: null };

  function api() {
    if (!window.HubCopaCafeSession) throw new Error('Módulo da Copa & Café não carregado.');
    return window.HubCopaCafeSession;
  }
  function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase(); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function fmt(iso) { if (!iso) return '—'; const [y,m,d]=String(iso).split('-'); return `${d}/${m}/${y}`; }
  function activeScreen() {
    return Array.from(document.querySelectorAll('.screen')).find((el)=> el instanceof HTMLElement && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden') || null;
  }
  function currentUser() {
    try { return norm(JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')?.currentUser || ''); } catch { return ''; }
  }
  function isNeia() {
    const text = norm(activeScreen()?.textContent || '');
    const user = currentUser();
    return user === 'neia' || (user !== 'selma' && text.includes('neia') && text.includes('conferencia de estoque'));
  }

  async function latestReading() {
    const rows = await api().rest('coffee_machine_readings?select=id,reading_date,total_accumulated,coffee_machine_reading_counters(counter_number,accumulated_count)&order=reading_date.desc,created_at.desc&limit=1');
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.coffee_machine_reading_counters) row.coffee_machine_reading_counters.sort((a,b)=>Number(a.counter_number)-Number(b.counter_number));
    return row || null;
  }
  async function weekComplete() {
    const { start,end } = api().weekRange();
    const rows = await api().rest(`coffee_machine_readings?select=id&reading_date=gte.${start}&reading_date=lte.${end}&limit=1`);
    return Array.isArray(rows) && rows.length > 0;
  }

  function anchorButton() {
    const buttons = Array.from(activeScreen()?.querySelectorAll('button') || []);
    return buttons.find((b)=>norm(b.textContent).includes('conferencia de estoque')) || buttons.find((b)=>norm(b.textContent).includes('saida de produto')) || null;
  }
  async function refreshShortcut(button) {
    try {
      const done = await weekComplete();
      button.textContent = done ? 'Conferência semanal do Café ✓' : 'Conferência semanal do Café — PENDENTE';
      button.dataset.weekComplete = done ? '1' : '0';
    } catch { button.textContent = 'Conferência semanal do Café'; }
  }
  function addShortcut() {
    if (!isNeia()) { document.querySelectorAll(`[${MARKER}="1"]`).forEach((n)=>n.remove()); return; }
    let button = document.querySelector(`[${MARKER}="1"]`);
    if (button instanceof HTMLButtonElement) { void refreshShortcut(button); return; }
    const anchor = anchorButton();
    if (!(anchor instanceof HTMLButtonElement)) return;
    button = document.createElement('button');
    button.type='button'; button.setAttribute(MARKER,'1'); button.className=`${anchor.className || ''} neia-coffee-shortcut`.trim();
    button.style.cssText='margin-top:10px;width:100%;max-width:100%;min-height:48px;font-weight:900;cursor:pointer';
    button.textContent='Conferência semanal do Café'; button.addEventListener('click',()=>void openPage());
    anchor.insertAdjacentElement('afterend',button); void refreshShortcut(button);
  }

  function counterCards(previous) {
    const old = new Map((previous?.coffee_machine_reading_counters || []).map((x)=>[Number(x.counter_number),Number(x.accumulated_count)]));
    return drinks.map((name,i)=>{
      const n=i+1, prev=old.get(n);
      return `<article class="coffee-counter-card" data-counter-card="${n}"><div><span>#${String(n).padStart(2,'0')}</span><strong>${esc(name)}</strong></div><input class="coffee-counter-input" data-counter="${n}" type="number" inputmode="numeric" min="0" step="1" placeholder="—"><small>${prev===undefined?'Sem leitura anterior':`Anterior: ${prev.toLocaleString('pt-BR')}`}</small></article>`;
    }).join('');
  }

  function render(previous,done) {
    document.getElementById(PAGE_ID)?.remove();
    Object.assign(state,{ previous:previous || null, photoPaths:[], visionUsed:false, machineDatetime:null });
    const page=document.createElement('div'); page.id=PAGE_ID; page.className='coffee-check-page';
    page.innerHTML=`<main class="coffee-check-shell">
      <header class="coffee-check-header"><button type="button" class="coffee-check-back">← Voltar</button><div><p>COPA & CAFÉ · NÉIA</p><h1>Conferência semanal do Café</h1><small>${done?'A leitura desta semana já foi feita. Registre outra somente se necessário.':'Leitura desta semana pendente.'}</small></div></header>
      <section class="coffee-check-summary"><div><span>Última leitura</span><strong>${previous?fmt(previous.reading_date):'Nenhuma'}</strong></div><div><span>Total anterior</span><strong>${previous?Number(previous.total_accumulated).toLocaleString('pt-BR'):'—'}</strong></div></section>
      <section class="coffee-photo-panel"><h2>1. Fotografe a tela da máquina</h2><p>Se todos os números não couberem em uma foto, tire outras. O HUB preserva os números já lidos e completa somente o que faltar.</p><label class="coffee-photo-button"><span>📷 Adicionar foto</span><input type="file" accept="image/*" capture="environment" data-photo></label><p class="coffee-photo-status" data-photo-status>Nenhuma foto analisada. O preenchimento manual continua disponível.</p></section>
      <section class="coffee-total-panel"><label for="coffee-total">2. Total geral acumulado</label><input id="coffee-total" type="number" inputmode="numeric" min="0" step="1" placeholder="Ex.: 3748"><small>Confira antes de salvar.</small></section>
      <section class="coffee-counters-section"><div class="coffee-section-head"><h2>3. Confira os 13 contadores</h2><span>Laranja = precisa conferir</span></div><div class="coffee-counter-grid">${counterCards(previous)}</div></section>
      <section class="coffee-check-validation" data-validation><strong>Validação automática</strong><p>Preencha os dados para o HUB conferir.</p></section>
      <div class="coffee-save-area"><button type="button" class="coffee-save-button">SALVAR LEITURA</button><p class="coffee-save-status" data-save-status></p></div>
    </main>`;
    document.body.appendChild(page); document.body.classList.add('coffee-check-open');
    page.querySelector('.coffee-check-back')?.addEventListener('click',closePage);
    page.querySelector('[data-photo]')?.addEventListener('change',(e)=>{const file=e.target.files?.[0]||null;e.target.value='';if(file)void analyze(file);});
    page.querySelector('.coffee-save-button')?.addEventListener('click',()=>void save());
    page.querySelector('#coffee-total')?.addEventListener('input',validatePreview);
    page.querySelectorAll('.coffee-counter-input').forEach((input)=>input.addEventListener('input',()=>{input.dataset.needsReview='0';input.closest('.coffee-counter-card')?.classList.remove('needs-review');validatePreview();}));
  }
  async function openPage() {
    if(document.getElementById(PAGE_ID))return;
    const load=document.createElement('div');load.id=PAGE_ID;load.className='coffee-check-page coffee-check-loading';load.innerHTML='<div><strong>Carregando conferência do café...</strong></div>';document.body.appendChild(load);document.body.classList.add('coffee-check-open');
    try { const [previous,done]=await Promise.all([latestReading(),weekComplete()]); render(previous,done); }
    catch(error){load.innerHTML=`<div class="coffee-check-error"><strong>Não foi possível carregar.</strong><p>${esc(error instanceof Error?error.message:'Erro desconhecido')}</p><button type="button">Voltar</button></div>`;load.querySelector('button')?.addEventListener('click',closePage);}
  }
  function closePage(){document.getElementById(PAGE_ID)?.remove();document.body.classList.remove('coffee-check-open');}

  function compress(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error('Não foi possível abrir a foto.'));r.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('Foto inválida.'));img.onload=()=>{const max=1800,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext('2d');if(!ctx)return reject(new Error('Não foi possível preparar a foto.'));ctx.drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',0.84));};img.src=String(r.result||'');};r.readAsDataURL(file);});}
  function machineDatetime(value){const t=String(value||'').trim();if(!t)return null;if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t))return t.replace('T',' ');const m=/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);return m?`${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]||'00'}`:null;}

  async function analyze(file){
    const page=document.getElementById(PAGE_ID),status=page?.querySelector('[data-photo-status]'),input=page?.querySelector('[data-photo]');if(!page||!status)return;
    status.textContent='Analisando a foto...';status.className='coffee-photo-status loading';if(input)input.disabled=true;
    try{
      const session=await api().ensure('cafe'),imageData=await compress(file);
      const response=await fetch(`${api().supabaseUrl}/functions/v1/copa-cafe-vision`,{method:'POST',headers:{apikey:api().anonKey,'Content-Type':'application/json'},body:JSON.stringify({sessionToken:session.token,mode:'machine_reading',imageData})});
      const result=await response.json();
      if(!response.ok){if(result?.error==='OPENAI_NOT_CONFIGURED')throw new Error('A leitura automática por foto ainda precisa ser ativada no servidor. O preenchimento manual continua disponível.');throw new Error(result?.message||result?.error||'A foto não pôde ser analisada.');}
      state.visionUsed=true;if(result.photoPath&&!state.photoPaths.includes(result.photoPath))state.photoPaths.push(result.photoPath);const md=machineDatetime(result?.reading?.machine_datetime);if(md)state.machineDatetime=md;
      if(Number.isInteger(result?.reading?.total_accumulated)){const total=page.querySelector('#coffee-total');if(total instanceof HTMLInputElement)total.value=String(result.reading.total_accumulated);}
      const counters=Array.isArray(result?.reading?.counters)?result.reading.counters:[];
      counters.forEach((counter)=>{
        const field=page.querySelector(`.coffee-counter-input[data-counter="${Number(counter?.number)}"]`);if(!(field instanceof HTMLInputElement))return;
        const value=counter?.accumulated_count,newConfidence=Number(counter?.confidence||0),oldConfidence=Number(field.dataset.confidence||-1);
        if(Number.isInteger(value)){
          if(field.value===''||newConfidence>=oldConfidence){field.value=String(value);field.dataset.confidence=String(newConfidence);const review=Boolean(counter?.needs_review)||newConfidence<0.75;field.dataset.needsReview=review?'1':'0';field.closest('.coffee-counter-card')?.classList.toggle('needs-review',review);}
        } else if(field.value==='') {
          field.dataset.needsReview='1';field.closest('.coffee-counter-card')?.classList.add('needs-review');
        }
      });
      const unresolved=Array.from(page.querySelectorAll('.coffee-counter-input')).filter((f)=>!(f instanceof HTMLInputElement)||f.value===''||f.dataset.needsReview==='1').length;
      status.textContent=unresolved?`Foto analisada. Ainda há ${unresolved} campo(s) para conferir/completar.`:`Foto analisada. Todos os contadores foram preenchidos; confira antes de salvar.`;status.className='coffee-photo-status success';validatePreview();
    }catch(error){console.error('[neia-coffee-check-v2]',error);status.textContent=error instanceof Error?error.message:'Não foi possível analisar a foto.';status.className='coffee-photo-status error';}
    finally{if(input)input.disabled=false;}
  }

  function draft(){
    const page=document.getElementById(PAGE_ID);if(!page)return null;const totalField=page.querySelector('#coffee-total');
    const total=totalField instanceof HTMLInputElement&&totalField.value!==''?Number(totalField.value):NaN;
    const counters=Array.from(page.querySelectorAll('.coffee-counter-input')).map((field)=>({number:Number(field.dataset.counter),accumulated_count:field.value===''?NaN:Number(field.value),confidence:field.dataset.confidence?Number(field.dataset.confidence):null,needs_review:field.dataset.needsReview==='1',field}));
    return {total,counters};
  }
  function validate(mark=false){
    const d=draft();if(!d)return{ok:false,message:'Tela não encontrada.'};if(!Number.isInteger(d.total)||d.total<0)return{ok:false,message:'Informe o total geral acumulado.'};
    if(d.counters.some((x)=>!Number.isInteger(x.accumulated_count)||x.accumulated_count<0))return{ok:false,message:'Preencha os 13 contadores.'};
    const review=d.counters.filter((x)=>x.needs_review);if(review.length)return{ok:false,message:`Confira os ${review.length} campo(s) em laranja. Reconfirme ou corrija o número.`};
    const prev=state.previous;if(!prev)return{ok:true,message:'Primeira leitura válida.',consumption:null};if(d.total<Number(prev.total_accumulated))return{ok:false,message:'O total geral não pode ser menor que a leitura anterior.'};
    const old=new Map((prev.coffee_machine_reading_counters||[]).map((x)=>[Number(x.counter_number),Number(x.accumulated_count)]));let sum=0,decrease=false;
    d.counters.forEach((x)=>{const p=old.get(x.number),card=x.field.closest('.coffee-counter-card');if(p!==undefined&&x.accumulated_count<p){decrease=true;if(mark)card?.classList.add('invalid');}else if(mark)card?.classList.remove('invalid');if(p!==undefined)sum+=x.accumulated_count-p;});
    if(decrease)return{ok:false,message:'Um contador ficou menor que na leitura anterior. Confira os campos marcados.'};const consumption=d.total-Number(prev.total_accumulated);if(sum!==consumption)return{ok:false,message:`Os 13 contadores somam ${sum} de diferença, mas o total geral mudou ${consumption}. Confira antes de salvar.`};
    return{ok:true,message:`Conferência bateu: ${consumption} bebida(s) desde ${fmt(prev.reading_date)}.`,consumption};
  }
  function validatePreview(){const box=document.querySelector(`#${PAGE_ID} [data-validation]`);if(!box)return;const v=validate(false);box.classList.toggle('ok',v.ok);box.classList.toggle('error',!v.ok);box.querySelector('p').textContent=v.message;}

  async function save(){
    const page=document.getElementById(PAGE_ID),button=page?.querySelector('.coffee-save-button'),status=page?.querySelector('[data-save-status]');if(!page||!button||!status)return;
    const v=validate(true);validatePreview();if(!v.ok){status.textContent=v.message;status.className='coffee-save-status error';return;}const d=draft();if(!d)return;
    if(!confirm(`Salvar esta leitura?\n\nTotal: ${d.total.toLocaleString('pt-BR')}${v.consumption===null?'':`\nConsumo desde a anterior: ${v.consumption}`}`))return;
    button.disabled=true;button.textContent='SALVANDO...';status.textContent='';
    try{
      const session=await api().ensure('cafe');const result=await api().rpc('copa_cafe_save_coffee_reading',{p_session_token:session.token,p_reading_date:api().localIsoDate(),p_real_time:api().localTime(),p_machine_datetime:state.machineDatetime,p_total_accumulated:d.total,p_counters:d.counters.map((x)=>({number:x.number,accumulated_count:x.accumulated_count,confidence:x.confidence,needs_review:false})),p_photo_path:state.photoPaths[0]||null,p_source:state.visionUsed?'vision':'manual',p_notes:state.photoPaths.length>1?`Leitura conferida com ${state.photoPaths.length} fotos.`:'Conferência semanal pelo HUB.'});
      status.textContent=`Leitura salva ✓ · Total ${Number(result.totalAccumulated).toLocaleString('pt-BR')}${result.consumption===null?'':` · Consumo ${result.consumption}`}`;status.className='coffee-save-status success';button.textContent='SALVO ✓';page.querySelectorAll('input').forEach((f)=>f.disabled=true);window.dispatchEvent(new CustomEvent('hub-coffee-reading-saved',{detail:result}));
    }catch(error){console.error('[neia-coffee-check-v2] save',error);const raw=String(error?.message||'');status.textContent=raw.includes('duplicate')||raw.includes('unique')?'Esta mesma leitura já está registrada.':raw.includes('COFFEE_TOTAL_MISMATCH')?'O total não bate com os 13 contadores.':'Não foi possível salvar. Confira os números e tente novamente.';status.className='coffee-save-status error';button.disabled=false;button.textContent='TENTAR NOVAMENTE';}
  }

  function styles(){if(document.querySelector('[data-coffee-check-style="2"]'))return;const s=document.createElement('style');s.dataset.coffeeCheckStyle='2';s.textContent=`body.coffee-check-open{overflow:hidden!important}.coffee-check-page{position:fixed;inset:0;z-index:10060;background:#f6f8fb;overflow:auto;color:#172033}.coffee-check-shell{width:min(880px,100%);min-height:100%;margin:0 auto;padding:18px 16px 42px;display:grid;gap:16px}.coffee-check-header{display:flex;gap:12px;align-items:flex-start}.coffee-check-header p{margin:0 0 3px;color:#c2410c;font-size:.72rem;font-weight:950}.coffee-check-header h1{margin:0;font-size:1.42rem}.coffee-check-header small{display:block;margin-top:5px;color:#64748b;font-weight:750}.coffee-check-back{border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:9px 12px;font-weight:900}.coffee-check-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.coffee-check-summary div{padding:13px;border:1px solid #fed7aa;border-radius:13px;background:#fff7ed}.coffee-check-summary span{display:block;color:#9a3412;font-size:.75rem;font-weight:900}.coffee-check-summary strong{display:block;margin-top:4px}.coffee-photo-panel,.coffee-total-panel,.coffee-counters-section,.coffee-check-validation{padding:15px;border:1px solid #dbe3ee;border-radius:15px;background:#fff}.coffee-photo-panel h2,.coffee-counters-section h2{margin:0 0 6px;font-size:1.05rem}.coffee-photo-panel p{color:#475569;line-height:1.45}.coffee-photo-button{display:flex;align-items:center;justify-content:center;min-height:54px;border-radius:12px;background:#f97316;color:#fff;font-weight:950;cursor:pointer}.coffee-photo-button input{display:none}.coffee-photo-status{font-weight:800}.coffee-photo-status.success{color:#047857}.coffee-photo-status.error{color:#b91c1c}.coffee-total-panel{display:grid;gap:9px}.coffee-total-panel label{font-weight:950}.coffee-total-panel input{height:62px;border:2px solid #94a3b8;border-radius:12px;text-align:center;font-size:1.9rem;font-weight:950}.coffee-total-panel small{color:#64748b;text-align:center}.coffee-section-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:10px}.coffee-section-head span{font-size:.72rem;color:#b45309;font-weight:900}.coffee-counter-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.coffee-counter-card{display:grid;grid-template-columns:minmax(0,1fr) 105px;gap:7px 10px;align-items:center;padding:11px;border:1px solid #e2e8f0;border-radius:12px}.coffee-counter-card>div{display:flex;gap:7px;align-items:center}.coffee-counter-card>div span{color:#64748b;font-size:.72rem;font-weight:900}.coffee-counter-card>div strong{font-size:.84rem;line-height:1.2}.coffee-counter-card input{height:44px;border:1.5px solid #94a3b8;border-radius:9px;text-align:center;font-size:1.1rem;font-weight:900;min-width:0}.coffee-counter-card small{grid-column:1/-1;color:#64748b;font-size:.69rem}.coffee-counter-card.needs-review{border:2px solid #f59e0b;background:#fffbeb}.coffee-counter-card.invalid{border:2px solid #dc2626;background:#fef2f2}.coffee-check-validation{background:#f8fafc}.coffee-check-validation p{margin:5px 0 0;color:#475569}.coffee-check-validation.ok{border-color:#86efac;background:#f0fdf4}.coffee-check-validation.error{border-color:#fecaca}.coffee-save-area{display:grid;gap:8px}.coffee-save-button{min-height:56px;border:0;border-radius:12px;background:#166534;color:#fff;font-size:1rem;font-weight:950}.coffee-save-button:disabled{opacity:.65}.coffee-save-status{text-align:center;margin:0;font-weight:850}.coffee-save-status.success{color:#047857}.coffee-save-status.error{color:#b91c1c}.coffee-check-loading{display:grid;place-items:center}.coffee-check-loading>div,.coffee-check-error{padding:18px;border-radius:14px;background:#fff}.coffee-check-error{text-align:center}@media(max-width:650px){.coffee-check-shell{padding:13px 11px 34px}.coffee-check-header h1{font-size:1.2rem}.coffee-counter-grid{grid-template-columns:1fr}.coffee-counter-card{grid-template-columns:minmax(0,1fr) 92px}}@media(max-width:390px){.coffee-check-summary{grid-template-columns:1fr}}`;document.head.appendChild(s);}
  let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;styles();addShortcut();});}
  window.HubCoffeeWeeklyCheck={open:openPage,weekComplete,refresh:schedule};document.addEventListener('DOMContentLoaded',schedule);window.addEventListener('load',schedule);window.addEventListener('hub-coffee-reading-saved',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});schedule();
})();
