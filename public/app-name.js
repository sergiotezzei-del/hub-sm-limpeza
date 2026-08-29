(() => {
  const APP_NAME = "HUB Santa Maria";
  const ATTENTION_ATTRIBUTE = "data-hub-alert-attention";
  const PAGE_TITLE_ATTRIBUTE = "data-hub-page-title";

  function applyAppName() {
    const pageTitle = document.documentElement.getAttribute(PAGE_TITLE_ATTRIBUTE) || APP_NAME;
    if (!document.documentElement.hasAttribute(ATTENTION_ATTRIBUTE) && document.title !== pageTitle) {
      document.title = pageTitle;
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
