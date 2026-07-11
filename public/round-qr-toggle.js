(() => {
  function setupQrPanel(panel) {
    if (!panel || panel.dataset.qrToggleReady === "true") return;

    const head = panel.querySelector(".round-qr-panel-head");
    const grid = panel.querySelector(".round-qr-grid");
    if (!head || !grid) return;

    panel.dataset.qrToggleReady = "true";
    panel.classList.add("round-qr-panel-collapsed");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button wide-button round-qr-toggle-button";
    button.textContent = "ABRIR QR CODES DOS PONTOS";
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", () => {
      const expanded = panel.classList.toggle("round-qr-panel-open");
      panel.classList.toggle("round-qr-panel-collapsed", !expanded);
      button.textContent = expanded ? "FECHAR QR CODES DOS PONTOS" : "ABRIR QR CODES DOS PONTOS";
      button.setAttribute("aria-expanded", String(expanded));
    });

    head.insertAdjacentElement("afterend", button);
  }

  function setupAllQrPanels() {
    document.querySelectorAll(".round-qr-panel").forEach(setupQrPanel);
  }

  const observer = new MutationObserver(setupAllQrPanels);

  function start() {
    setupAllQrPanels();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
