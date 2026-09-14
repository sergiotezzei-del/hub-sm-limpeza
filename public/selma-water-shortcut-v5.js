(() => {
  const MARKER = 'data-selma-water-shortcut';
  const SESSION_KEY = 'hub-sm-active-session';

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function activeScreen() {
    return Array.from(document.querySelectorAll('.screen')).find((screen) => {
      if (!(screen instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(screen);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function currentUserId() {
    try {
      return normalize(JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')?.currentUser || '');
    } catch {
      return '';
    }
  }

  function isSelmaScreen() {
    const screen = activeScreen();
    const text = normalize(screen?.textContent || '');
    const current = currentUserId();
    return current === 'selma' || (text.includes('selma') && text.includes('retirada') && current !== 'neia');
  }

  function findWithdrawalButton() {
    const screen = activeScreen();
    if (!screen) return null;
    return Array.from(screen.querySelectorAll('button')).find((button) => {
      const text = normalize(button.textContent || '');
      return text.includes('saida de produto') || (text.includes('retirada') && (text.includes('material') || text.includes('estoque')));
    }) || null;
  }

  function openWaterCheck() {
    const feature = window.HubWaterStockCheck;
    if (feature && typeof feature.open === 'function') {
      void feature.open();
      return;
    }
    window.alert('Não foi possível abrir a Conferência de Água. Avise o Tezzei.');
  }

  async function refreshStatus(button) {
    const feature = window.HubWaterStockCheck;
    if (!feature || typeof feature.weekComplete !== 'function') {
      button.textContent = 'Conferência semanal da Água';
      return;
    }
    try {
      const complete = await feature.weekComplete();
      button.textContent = complete ? 'Conferência semanal da Água ✓' : 'Conferência semanal da Água — PENDENTE';
      button.dataset.weekComplete = complete ? '1' : '0';
      button.title = complete ? 'Conferência desta semana concluída' : 'Conferência desta semana ainda não foi feita';
    } catch {
      button.textContent = 'Conferência semanal da Água';
    }
  }

  function addShortcut() {
    if (!isSelmaScreen()) {
      document.querySelectorAll(`[${MARKER}="1"]`).forEach((node) => node.remove());
      return;
    }

    let button = document.querySelector(`[${MARKER}="1"]`);
    if (button instanceof HTMLButtonElement) {
      void refreshStatus(button);
      return;
    }

    const withdrawalButton = findWithdrawalButton();
    if (!(withdrawalButton instanceof HTMLButtonElement) || !withdrawalButton.parentElement) return;

    button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(MARKER, '1');
    button.className = `${withdrawalButton.className || ''} selma-water-shortcut`.trim();
    button.textContent = 'Conferência semanal da Água';
    button.style.marginTop = '10px';
    button.style.width = '100%';
    button.style.maxWidth = '100%';
    button.style.minHeight = '48px';
    button.style.fontWeight = '900';
    button.style.cursor = 'pointer';
    button.addEventListener('click', openWaterCheck);
    withdrawalButton.insertAdjacentElement('afterend', button);
    void refreshStatus(button);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      addShortcut();
    });
  }

  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  window.addEventListener('hub-water-check-saved', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
