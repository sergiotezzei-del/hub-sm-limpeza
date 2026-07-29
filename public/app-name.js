(() => {
  const APP_NAME = "HUB Santa Maria";

  function applyAppName() {
    if (document.title !== APP_NAME) {
      document.title = APP_NAME;
    }

    document.querySelector('meta[name="application-name"]')?.setAttribute("content", APP_NAME);
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", APP_NAME);
  }

  applyAppName();
  window.addEventListener("load", applyAppName);
  document.addEventListener("DOMContentLoaded", applyAppName, { once: true });

  const observer = new MutationObserver(applyAppName);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
})();
