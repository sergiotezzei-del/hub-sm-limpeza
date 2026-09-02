(() => {
  if (window.__hubOriginalMutationObserver) return;

  const OriginalMutationObserver = window.MutationObserver;
  window.__hubOriginalMutationObserver = OriginalMutationObserver;

  window.MutationObserver = class HubLegacyMutationObserver {
    constructor() {}
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
})();
