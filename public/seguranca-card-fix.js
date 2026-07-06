(() => {
  let ultimoReload = 0;

  function painelTezzeiAberto() {
    const grid = document.querySelector('.module-grid');
    if (!grid) return false;
    const screen = grid.closest('.screen');
    if (!screen || screen.style.display === 'none') return false;
    return String(screen.textContent || '').toLowerCase().includes('painel tezzei');
  }

  function garantirCardSeguranca() {
    if (!painelTezzeiAberto()) return;
    if (document.querySelector('[data-seguranca-card="1"]')) return;

    const agora = Date.now();
    if (agora - ultimoReload < 1500) return;
    ultimoReload = agora;

    const script = document.createElement('script');
    script.src = `/seguranca-ui.js?v=4&late=${agora}`;
    script.async = true;
    document.body.appendChild(script);
  }

  window.addEventListener('load', () => {
    garantirCardSeguranca();
    setTimeout(garantirCardSeguranca, 300);
    setTimeout(garantirCardSeguranca, 900);
    setTimeout(garantirCardSeguranca, 1800);
    setInterval(garantirCardSeguranca, 1000);
    new MutationObserver(garantirCardSeguranca).observe(document.body, { childList: true, subtree: true });
  });

  document.addEventListener('click', () => setTimeout(garantirCardSeguranca, 150), true);
  window.addEventListener('focus', garantirCardSeguranca);
})();
