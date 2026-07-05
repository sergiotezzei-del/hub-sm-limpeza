(() => {
  let configPromise = null;
  const EMPLOYEES = { neia: 'Neia', selma: 'Selma', helena: 'Helena' };

  function normalize(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function employeeIdFromName(name) {
    const clean = normalize(name);
    if (clean.includes('neia')) return 'neia';
    if (clean.includes('selma')) return 'selma';
    if (clean.includes('helena')) return 'helena';
    return null;
  }

  function currentEmployeeId() {
    return employeeIdFromName(document.querySelector('.employee-top-bar h1')?.textContent || '');
  }

  function isAdminView() {
    const text = normalize(document.body.textContent || '');
    return text.includes('painel tezzei') || text.includes('gestao de limpeza') || text.includes('perfis da equipe') || text.includes('visualizacao pelo painel tezzei');
  }

  async function getConfig() {
    if (configPromise) return configPromise;
    configPromise = (async () => {
      const appScript = Array.from(document.scripts).find((script) => script.src.includes('/assets/index-'));
      if (!appScript) throw new Error('Bundle principal não encontrado');
      const code = await fetch(appScript.src).then((response) => response.text());
      const url = code.match(/https:\/\/dtdepfpkyiqtnsjztjit\.supabase\.co/)?.[0];
      const key = code.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
      if (!url || !key) throw new Error('Configuração online não encontrada');
      return { url, key };
    })();
    return configPromise;
  }

  async function api(path, options = {}) {
    const { url, key } = await getConfig();
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await response.text());
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function getRequests(employeeId) {
    return api(`photo_permission_requests?select=*&employee_id=eq.${employeeId}&order=created_at.desc&limit=10`);
  }

  async function getPendingRequests() {
    return api('photo_permission_requests?select=*&status=eq.pending&order=created_at.asc&limit=20');
  }

  async function createRequest(employeeId, action) {
    const employeeName = EMPLOYEES[employeeId] || employeeId;
    return api('photo_permission_requests', {
      method: 'POST',
      body: JSON.stringify([{ employee_id: employeeId, employee_name: employeeName, action, requested_by: employeeName, status: 'pending' }]),
    });
  }

  async function decideRequest(id, status) {
    return api(`photo_permission_requests?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decided_at: new Date().toISOString(), decided_by: 'Sergio Tezzei' }),
    });
  }

  async function markUsed(id) {
    return api(`photo_permission_requests?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'used', used_at: new Date().toISOString() }),
    });
  }

  async function saveEmployeePhoto(employeeId, photoData) {
    return api('employee_profiles?on_conflict=employee_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ employee_id: employeeId, photo_data: photoData }]),
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function compressImage(file) {
    const raw = await readFile(file);
    const image = await loadImage(raw);
    const scale = Math.min(1, 520 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return raw;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  }

  function makeButton(text, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  function latestRelevant(requests) {
    return (requests || []).find((item) => item.status !== 'used') || null;
  }

  function statusText(request) {
    if (!request) return '';
    if (request.status === 'pending') return 'Aguardando liberação do Tezzei.';
    if (request.status === 'approved') return request.action === 'remove_photo' ? 'Liberado para remover foto.' : 'Liberado para alterar foto.';
    if (request.status === 'denied') return 'Acesso negado pelo Tezzei.';
    return '';
  }

  async function renderEmployeePermission() {
    const employeeId = currentEmployeeId();
    if (!employeeId) return;
    const adminPreview = normalize(document.body.textContent || '').includes('visualizacao pelo painel tezzei');
    if (adminPreview) return;

    const nativeButton = document.querySelector('.employee-top-bar .photo-button');
    if (nativeButton) nativeButton.style.display = 'none';

    const titleBlock = document.querySelector('.employee-title-block');
    if (!titleBlock) return;

    let box = document.querySelector('.photo-permission-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'photo-permission-box';
      titleBlock.appendChild(box);
    }

    let request = null;
    try {
      request = latestRelevant(await getRequests(employeeId));
    } catch {
      box.innerHTML = '<small class="photo-status denied">Falha ao consultar permissão.</small>';
      return;
    }

    box.innerHTML = '';
    if (!request) {
      box.append(
        makeButton('Solicitar troca de foto', 'photo-control neutral', async (event) => {
          event.currentTarget.disabled = true;
          await createRequest(employeeId, 'change_photo');
          await renderEmployeePermission();
        }),
        makeButton('Solicitar remover foto', 'photo-control neutral danger-lite', async (event) => {
          event.currentTarget.disabled = true;
          await createRequest(employeeId, 'remove_photo');
          await renderEmployeePermission();
        }),
      );
      return;
    }

    const status = document.createElement('small');
    status.className = `photo-status ${request.status}`;
    status.textContent = statusText(request);
    box.appendChild(status);

    if (request.status === 'pending') return;

    if (request.status === 'denied') {
      box.appendChild(makeButton('Pedir novamente', 'photo-control neutral', async (event) => {
        event.currentTarget.disabled = true;
        await createRequest(employeeId, request.action || 'change_photo');
        await renderEmployeePermission();
      }));
      return;
    }

    if (request.status === 'approved' && request.action === 'change_photo') {
      const label = document.createElement('label');
      label.className = 'photo-control approved';
      label.textContent = 'Acesso liberado: abrir câmera';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.style.display = 'none';
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        label.textContent = 'Salvando foto...';
        try {
          await saveEmployeePhoto(employeeId, await compressImage(file));
          await markUsed(request.id);
          label.textContent = 'Foto atualizada.';
          setTimeout(() => window.location.reload(), 700);
        } catch {
          label.textContent = 'Erro ao salvar foto.';
        }
      });
      label.appendChild(input);
      box.appendChild(label);
      return;
    }

    if (request.status === 'approved' && request.action === 'remove_photo') {
      box.appendChild(makeButton('Acesso liberado: remover foto', 'photo-control approved', async (event) => {
        event.currentTarget.disabled = true;
        event.currentTarget.textContent = 'Removendo...';
        try {
          await saveEmployeePhoto(employeeId, null);
          await markUsed(request.id);
          event.currentTarget.textContent = 'Foto removida.';
          setTimeout(() => window.location.reload(), 700);
        } catch {
          event.currentTarget.textContent = 'Erro ao remover foto.';
        }
      }));
    }
  }

  async function renderAdminPanel() {
    if (!isAdminView()) return;
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;

    let requests = [];
    try {
      requests = await getPendingRequests();
    } catch {
      return;
    }

    let panel = document.querySelector('.photo-admin-panel');
    if (requests.length === 0) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'photo-admin-panel';
      topBar.insertAdjacentElement('afterend', panel);
    }

    panel.innerHTML = '<h2>Solicitações de foto</h2>';
    requests.forEach((request) => {
      const card = document.createElement('article');
      card.className = 'photo-request-card';
      const actionLabel = request.action === 'remove_photo' ? 'remover foto' : 'trocar foto';
      card.innerHTML = `<div><strong>${request.employee_name}</strong><small>Solicitou permissão para ${actionLabel}</small></div>`;
      const actions = document.createElement('div');
      actions.className = 'photo-request-actions';
      actions.append(
        makeButton('Liberar', 'success-button small-button', async (event) => {
          event.currentTarget.disabled = true;
          await decideRequest(request.id, 'approved');
          await renderAdminPanel();
        }),
        makeButton('Negar', 'danger-button small-button', async (event) => {
          event.currentTarget.disabled = true;
          await decideRequest(request.id, 'denied');
          await renderAdminPanel();
        }),
      );
      card.appendChild(actions);
      panel.appendChild(card);
    });
  }

  async function apply() {
    await renderEmployeePermission();
    await renderAdminPanel();
  }

  const style = document.createElement('style');
  style.textContent = '.photo-permission-box{display:grid;gap:6px;margin-top:8px;max-width:280px}.photo-control{display:grid;place-items:center;width:100%;min-height:34px;padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-size:.72rem;font-weight:900;text-align:center;cursor:pointer;line-height:1.15}.photo-control.neutral{background:#fff;color:#475569}.photo-control.danger-lite{color:#991b1b;background:#fff7f7;border-color:#fecaca}.photo-control.approved{color:#166534;background:#dcfce7;border-color:#86efac}.photo-status{display:block;width:fit-content;padding:6px 8px;border-radius:999px;font-size:.7rem;font-weight:900;line-height:1.1}.photo-status.pending{color:#92400e;background:#fef3c7}.photo-status.approved{color:#166534;background:#dcfce7}.photo-status.denied{color:#991b1b;background:#fee2e2}.photo-admin-panel{display:grid;gap:10px;margin:12px 0;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-left:6px solid #f97316;border-radius:10px}.photo-admin-panel h2{margin:0;color:#9a3412;font-size:1rem;font-weight:900}.photo-request-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;background:#fff;border:1px solid #fed7aa;border-radius:8px}.photo-request-card strong{display:block;color:#1f2933}.photo-request-card small{display:block;color:#667085;font-weight:800}.photo-request-actions{display:flex;gap:8px;align-items:center}.small-button{min-height:34px!important;padding:7px 10px!important;font-size:.78rem!important}@media(max-width:720px){.photo-request-card{grid-template-columns:1fr}.photo-request-actions{display:grid;grid-template-columns:1fr 1fr}.photo-permission-box{max-width:100%}}';
  document.head.appendChild(style);

  window.addEventListener('load', () => setTimeout(apply, 600));
  let locked = false;
  new MutationObserver(() => {
    if (locked) return;
    locked = true;
    setTimeout(async () => {
      locked = false;
      await apply();
    }, 500);
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(apply, 12000);
})();
