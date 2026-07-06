(() => {
  function painelAberto() {
    const grid = document.querySelector('.module-grid');
    if (!grid) return null;
    const screen = grid.closest('.screen');
    if (!screen || screen.style.display === 'none') return null;
    const titulo = String(screen.querySelector('h1')?.textContent || '').toLowerCase();
    if (!titulo.includes('painel tezzei')) return null;
    return grid;
  }

  function adicionarBotao() {
    const grid = painelAberto();
    if (!grid) return;
    if (grid.querySelector('[data-menu-seguranca="1"]')) return;

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'admin-card action-card module-card';
    botao.dataset.menuSeguranca = '1';
    botao.innerHTML = '<span>Segurança</span><strong>Módulo em construção</strong>';
    botao.addEventListener('click', () => {
      window.alert('Módulo Segurança será recriado em uma próxima etapa.');
    });
    grid.appendChild(botao);
  }

  function iniciar() {
    adicionarBotao();
    setTimeout(adicionarBotao, 300);
    setTimeout(adicionarBotao, 1000);
    setInterval(adicionarBotao, 1500);
    new MutationObserver(adicionarBotao).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', iniciar);
  } else {
    iniciar();
  }
})();
