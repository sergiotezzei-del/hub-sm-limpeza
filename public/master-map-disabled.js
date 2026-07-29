(() => {
  const SESSION_KEY = "hub-sm-active-session";
  const DISABLED_VIEW = "master-map";
  const DISABLED_LABEL = "mapa mestre";
  const RELOAD_GUARD_KEY = "hub-sm-master-map-redirected";

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function sanitizeSavedSession() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;

      const session = JSON.parse(raw);
      if (session?.view !== DISABLED_VIEW) return false;

      window.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...session, view: "admin", previewEmployeeId: null, selectedGuardName: null }),
      );
      return true;
    } catch {
      return false;
    }
  }

  function sanitizeUrl() {
    const url = new URL(window.location.href);
    let changed = false;
    const disabledValues = new Set(["master-map", "mapa-mestre", "mapa_mestre"]);

    ["page", "view", "screen", "module"].forEach((key) => {
      const value = normalizeText(url.searchParams.get(key));
      if (disabledValues.has(value)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    const normalizedHash = normalizeText(url.hash.replace(/^#/, ""));
    if (disabledValues.has(normalizedHash)) {
      url.hash = "";
      changed = true;
    }

    if (changed) window.history.replaceState({}, "", url.toString());
    return changed;
  }

  function findMasterMapCard() {
    return Array.from(document.querySelectorAll(".module-card-title"))
      .filter((title) => normalizeText(title.textContent) === DISABLED_LABEL)
      .map((title) => title.closest("button, article"))
      .filter(Boolean);
  }

  function hideMasterMapCards() {
    findMasterMapCard().forEach((card) => {
      card.setAttribute("hidden", "");
      card.setAttribute("aria-hidden", "true");
      card.setAttribute("data-feature-status", "discontinued");
      if (card instanceof HTMLButtonElement) card.disabled = true;
    });
  }

  function isMasterMapScreenOpen() {
    return Array.from(document.querySelectorAll("h1, h2, .topbar-title, .top-bar-title"))
      .some((element) => normalizeText(element.textContent).includes(DISABLED_LABEL));
  }

  function leaveMasterMapScreen() {
    if (!isMasterMapScreenOpen()) {
      window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
      return;
    }

    sanitizeSavedSession();
    sanitizeUrl();

    const backButton = Array.from(document.querySelectorAll("button"))
      .find((button) => normalizeText(button.textContent).startsWith("voltar"));

    if (backButton instanceof HTMLButtonElement) {
      backButton.click();
      return;
    }

    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) !== "1") {
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      window.location.reload();
    }
  }

  function applyDecommission() {
    hideMasterMapCards();
    leaveMasterMapScreen();
  }

  sanitizeSavedSession();
  sanitizeUrl();

  document.addEventListener(
    "click",
    (event) => {
      const card = event.target instanceof Element ? event.target.closest("button, article") : null;
      const title = card?.querySelector(".module-card-title");
      if (title && normalizeText(title.textContent) === DISABLED_LABEL) {
        event.preventDefault();
        event.stopImmediatePropagation();
        card.setAttribute("hidden", "");
      }
    },
    true,
  );

  const observer = new MutationObserver(applyDecommission);
  window.addEventListener("load", () => {
    applyDecommission();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  });
})();
