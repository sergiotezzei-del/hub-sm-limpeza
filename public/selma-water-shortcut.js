(() => {
  const MARKER = 'data-selma-water-shortcut';

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function activeScreen() {
    return Array.from(document.querySelectorAll('.screen')).find((screen) => {
      if (!(screen instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(screen);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function isSelmaScreen() {
    const screen = activeScreen();
    const text = normalize(screen?.textContent || '');
    return text.includes('selma') && text.includes('retirada');
  }

  function findWithdrawalButton() {
    const screen = activeScreen();
    if (!screen) return null;
    return Array.from(screen.querySelectorAll('button')).find((button) => {
      const text = normalize(button.textContent || '');
      return text.includes('retirada') && (text.includes('material') || text.includes('estoque'));
    }) || null;
  }

  function openWaterCheck() {
    const waterFeature = window.HubWaterStockCheck;
    if (waterFeature && typeof waterFeature.open === 'function') {
      void waterFeature.open();
      return;
    }
    window.alert('Não foi possível abrir a Conferência de Água. Avise o Tezzei.');
  }

  function addShortcut() {
    if (!isSelmaScreen()) return;
    if (document.querySelector(`[${MARKER}="1"]`)) return;

    const withdrawalButton = findWithdrawalButton();
    if (!withdrawalButton || !withdrawalButton.parentElement) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(MARKER, '1');
    button.className = `${withdrawalButton.className || ''} selma-water-shortcut`.trim();
    button.textContent = 'Conferência de Água';
    button.style.marginTop = '10px';
    button.style.width = withdrawalButton.getBoundingClientRect().width ? `${withdrawalButton.getBoundingClientRect().width}px` : '100%';
    button.style.maxWidth = '100%';
    button.style.minHeight = '48px';
    button.style.fontWeight = '900';
    button.style.cursor = 'pointer';
    button.addEventListener('click', openWaterCheck);

    withdrawalButton.insertAdjacentElement('afterend', button);
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
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
