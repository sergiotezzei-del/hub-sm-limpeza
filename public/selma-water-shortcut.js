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

  function isSelmaScreen() {
    const text = normalize(document.body?.innerText || '');
    return text.includes('selma') && text.includes('retirada');
  }

  function findWithdrawalButton() {
    return Array.from(document.querySelectorAll('button')).find((button) => {
      const text = normalize(button.textContent || '');
      return text.includes('retirada') && (text.includes('material') || text.includes('estoque'));
    });
  }

  function openExistingWaterCheck() {
    const directCard = document.querySelector('[data-water-stock-card="1"]');
    if (directCard instanceof HTMLElement) {
      directCard.click();
      return;
    }

    const helper = document.createElement('div');
    helper.setAttribute('aria-hidden', 'true');
    helper.style.position = 'fixed';
    helper.style.left = '-99999px';
    helper.style.top = '-99999px';
    helper.style.width = '1px';
    helper.style.height = '1px';
    helper.style.overflow = 'hidden';
    helper.innerHTML = '<span>Copa & Café Estoque de água Compras de água</span><div class="module-grid"></div>';
    document.body.appendChild(helper);

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const generated = helper.querySelector('[data-water-stock-card="1"]');
      if (generated instanceof HTMLElement) {
        window.clearInterval(timer);
        generated.click();
        window.setTimeout(() => helper.remove(), 100);
        return;
      }
      if (attempts >= 20) {
        window.clearInterval(timer);
        helper.remove();
        window.alert('Não foi possível abrir a Conferência de Água. Avise o Tezzei.');
      }
    }, 50);
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
    button.addEventListener('click', openExistingWaterCheck);

    withdrawalButton.insertAdjacentElement('afterend', button);
  }

  function run() {
    addShortcut();
  }

  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(run, 1500);
})();
