(() => {
  const WATER_CARD_SELECTOR = '[data-water-stock-card="1"]';
  const SELMA_SHORTCUT_SELECTOR = '[data-selma-water-shortcut="1"]';
  const ACTIVE_SESSION_KEY = 'hub-sm-active-session';
  const WATER_USER_KEY = 'hub-water-stock-user';

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function activeScreen() {
    const screens = Array.from(document.querySelectorAll('.screen')).filter(isVisible);
    return screens.find((screen) => screen.querySelector('h1')) || screens[0] || null;
  }

  function screenTitle(screen) {
    return normalize(screen?.querySelector('h1')?.textContent || '');
  }

  function isCleaningDashboard(screen) {
    return screenTitle(screen) === 'gestao de limpeza';
  }

  function isCopaCafe(screen) {
    return screenTitle(screen) === 'copa & cafe';
  }

  function isSelmaScreen(screen) {
    if (!screen) return false;
    const text = normalize(screen.textContent || '');
    return text.includes('selma') && text.includes('retirada');
  }

  function syncWaterUser(screen) {
    try {
      const session = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || '{}');
      const currentUser = normalize(session?.currentUser || '');
      if (currentUser === 'tezzei') {
        sessionStorage.setItem(WATER_USER_KEY, JSON.stringify({ id: 'tezzei', name: 'Admin Tezzei' }));
        return;
      }
      if (currentUser === 'selma' || isSelmaScreen(screen)) {
        sessionStorage.setItem(WATER_USER_KEY, JSON.stringify({ id: 'selma', name: 'Selma' }));
      }
    } catch {
      // Mantém o cache existente se a sessão não estiver disponível.
    }
  }

  function standardWaterCardMarkup() {
    return `
      <span class="module-icon-circle" aria-hidden="true">
        <svg class="module-icon water-placement-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.8S6.5 9 6.5 13.4a5.5 5.5 0 0 0 11 0C17.5 9 12 2.8 12 2.8Z"></path>
          <path d="M9.5 14.2a2.8 2.8 0 0 0 2.7 2.1"></path>
        </svg>
      </span>
      <span class="module-card-copy">
        <span class="module-card-title">Conferência de Água</span>
        <strong>Contagem semanal de água</strong>
      </span>`;
  }

  function placeInsideCopa(screen, card) {
    const grid = screen?.querySelector('.module-grid');
    if (!(grid instanceof HTMLElement)) return false;

    if (card.parentElement !== grid) grid.appendChild(card);

    const waterReference = Array.from(grid.querySelectorAll('.module-card')).find((candidate) => {
      if (candidate === card) return false;
      const title = normalize(candidate.querySelector('.module-card-title')?.textContent || candidate.textContent || '');
      return title === 'estoque de agua' || title === 'compras de agua';
    });

    if (waterReference instanceof HTMLElement && waterReference.nextElementSibling !== card) {
      waterReference.insertAdjacentElement('afterend', card);
    }

    return true;
  }

  function decorateWaterCard(card) {
    if (!(card instanceof HTMLButtonElement)) return;
    card.className = 'admin-card module-card with-icon has-access action-card water-stock-check-card water-stock-check-card-fixed';
    card.innerHTML = standardWaterCardMarkup();
    card.setAttribute('aria-label', 'Abrir Conferência de Água');
  }

  function cleanAndPlaceWaterCard(screen) {
    const cards = Array.from(document.querySelectorAll(WATER_CARD_SELECTOR));

    if (isCleaningDashboard(screen)) {
      cards.forEach((card) => card.remove());
      return;
    }

    if (!isCopaCafe(screen)) return;

    let mainCard = cards.find((card) => screen?.contains(card)) || cards[0] || null;
    cards.forEach((card) => {
      if (card !== mainCard && !card.closest('[aria-hidden="true"]')) card.remove();
    });

    if (!(mainCard instanceof HTMLButtonElement)) return;
    if (!placeInsideCopa(screen, mainCard)) return;
    decorateWaterCard(mainCard);
  }

  function tidySelmaShortcut(screen) {
    if (!isSelmaScreen(screen)) return;
    const shortcut = document.querySelector(SELMA_SHORTCUT_SELECTOR);
    if (!(shortcut instanceof HTMLButtonElement)) return;
    shortcut.classList.add('selma-water-shortcut-fixed');
    shortcut.setAttribute('aria-label', 'Abrir Conferência de Água');
  }

  function run() {
    const screen = activeScreen();
    syncWaterUser(screen);
    cleanAndPlaceWaterCard(screen);
    tidySelmaShortcut(screen);
  }

  function addStyles() {
    if (document.querySelector('[data-water-placement-style="1"]')) return;
    const style = document.createElement('style');
    style.dataset.waterPlacementStyle = '1';
    style.textContent = `
      .water-stock-check-card-fixed{
        border-left:6px solid #f97316!important;
        min-height:116px!important;
        height:auto!important;
        padding:18px 16px!important;
        align-items:center!important;
        text-align:left!important;
      }
      .water-stock-check-card-fixed .module-icon-circle{
        flex:0 0 auto!important;
      }
      .water-stock-check-card-fixed .module-card-copy{
        min-width:0!important;
      }
      .water-stock-check-card-fixed .module-card-title{
        display:block!important;
      }
      .water-stock-check-card-fixed .water-placement-icon{
        color:inherit!important;
      }
      .selma-water-shortcut-fixed{
        min-height:48px!important;
      }
    `;
    document.head.appendChild(style);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  }

  addStyles();
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
