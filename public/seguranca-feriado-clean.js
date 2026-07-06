(() => {
  function limparFeriado() {
    document.querySelectorAll('.escala-obs').forEach((item) => {
      const texto = String(item.textContent || '').trim();
      if (!texto.includes('FERIADO')) return;
      item.textContent = 'FERIADO - EXTRA 6H';
    });
  }

  window.addEventListener('load', () => {
    limparFeriado();
    new MutationObserver(limparFeriado).observe(document.body, { childList: true, subtree: true, characterData: true });
  });

  document.addEventListener('click', () => setTimeout(limparFeriado, 80), true);
})();
