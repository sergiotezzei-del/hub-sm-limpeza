(() => {
  if (window.__hubMutationObserverThrottleInstalled) return;
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  const DELAY_MS = 100;

  class HubThrottledMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.pendingRecords = [];
      this.timer = 0;
      this.nativeObserver = new NativeMutationObserver((records) => {
        this.pendingRecords.push(...records);
        if (this.timer) return;
        this.timer = window.setTimeout(() => {
          this.timer = 0;
          const batch = this.pendingRecords.splice(0);
          if (batch.length) this.callback(batch, this);
        }, DELAY_MS);
      });
    }

    observe(target, options) {
      this.nativeObserver.observe(target, options);
    }

    disconnect() {
      this.nativeObserver.disconnect();
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = 0;
      this.pendingRecords.length = 0;
    }

    takeRecords() {
      const queued = this.pendingRecords.splice(0);
      return queued.concat(this.nativeObserver.takeRecords());
    }
  }

  window.__hubMutationObserverThrottleInstalled = true;
  window.__hubNativeMutationObserver = NativeMutationObserver;
  window.MutationObserver = HubThrottledMutationObserver;
})();
