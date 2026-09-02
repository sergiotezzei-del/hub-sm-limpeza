(() => {
  const original = window.__hubOriginalMutationObserver;
  if (!original) return;
  window.MutationObserver = original;
  delete window.__hubOriginalMutationObserver;
})();
