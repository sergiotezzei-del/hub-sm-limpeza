(() => {
  function applyFooter() {
    document.querySelectorAll('footer').forEach((footer) => {
      if ((footer.textContent || '').includes('TEZZEI')) {
        footer.textContent = 'TEZZEI';
      }
    });
  }

  window.addEventListener('load', applyFooter);
  new MutationObserver(applyFooter).observe(document.body, { childList: true, subtree: true });
})();
