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

  function setQrMode(screen, enabled) {
    if (!screen) return;
    screen.classList.toggle("monitoring-qrcode-mode", enabled);
    const qrButton = screen.querySelector(".monitoring-qr-tab-button");
    const tabButtons = screen.querySelectorAll(".monitoring-tabs > button:not(.monitoring-qr-tab-button)");

    qrButton?.classList.toggle("active", enabled);
    tabButtons.forEach((button) => {
      if (enabled) button.classList.remove("active");
    });
  }

  function setupMonitoringQrTab(screen) {
    if (!screen || screen.dataset.qrTabReady === "true") return;
    const tabs = screen.querySelector(".monitoring-tabs");
    if (!tabs) return;

    const tabButtons = Array.from(tabs.querySelectorAll("button"));
    const roundsButton = tabButtons.find((button) => button.textContent?.toLowerCase().includes("rondas"));
    if (!roundsButton) return;

    screen.dataset.qrTabReady = "true";

    const qrButton = document.createElement("button");
    qrButton.type = "button";
    qrButton.className = "monitoring-qr-tab-button";
    qrButton.textContent = "QR Code";

    qrButton.addEventListener("click", () => {
      if (!screen.querySelector(".round-qr-panel")) {
        roundsButton.click();
      }

      window.requestAnimationFrame(() => {
        setupAllQrPanels();
        setQrMode(screen, true);
        screen.querySelector(".round-qr-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });

    roundsButton.insertAdjacentElement("afterend", qrButton);

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setQrMode(screen, false);
      });
    });
  }

  function setupAllQrPanels() {
    document.querySelectorAll(".round-qr-panel").forEach(setupQrPanel);
  }

  function setupAllMonitoringTabs() {
    document.querySelectorAll(".monitoring-screen").forEach(setupMonitoringQrTab);
  }

  function setupAll() {
    setupAllQrPanels();
    setupAllMonitoringTabs();
  }

  const observer = new MutationObserver(setupAll);

  function start() {
    setupAll();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
