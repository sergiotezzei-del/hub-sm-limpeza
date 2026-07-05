(() => {
  function applyFooter() {
    document.querySelectorAll('footer').forEach((footer) => {
      const current = (footer.textContent || '').trim();
      if (current !== 'TEZZEI' && current.includes('TEZZEI')) {
        footer.textContent = 'TEZZEI';
      }
    });
  }

  window.addEventListener('load', applyFooter);
  const observer = new MutationObserver(applyFooter);
  window.addEventListener('load', () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  });
})();
