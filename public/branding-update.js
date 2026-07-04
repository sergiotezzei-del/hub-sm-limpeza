(() => {
  const BRAND = "SANTA MARIA SOLUÇÕES IMOBILIÁRIAS";
  const FOOTER_TEXT = "TEZZEI - Operações & Processos";
  const WHATSAPP_URL = "https://wa.me/5541991533987?text=Ol%C3%A1%2C%20S%C3%A9rgio.%20Vim%20pelo%20app%20Santa%20Maria%20Solu%C3%A7%C3%B5es%20Imobili%C3%A1rias.";

  function updateTexts() {
    document.title = `${BRAND} - Central Operacional HUB SM`;

    document.querySelectorAll(".eyebrow").forEach((element) => {
      if (element.textContent && element.textContent.trim() === "TEZZEI HUB") {
        element.textContent = BRAND;
      }
    });

    document.querySelectorAll("h1").forEach((element) => {
      if (element.textContent && element.textContent.trim() === "TEZZEI HUB") {
        element.textContent = BRAND;
      }
    });

    const footer = document.querySelector("footer");
    if (footer && !footer.dataset.brandingUpdated) {
      footer.dataset.brandingUpdated = "true";
      footer.innerHTML = "";

      const title = document.createElement("div");
      title.textContent = FOOTER_TEXT;

      const link = document.createElement("a");
      link.href = WHATSAPP_URL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Entrar pelo WhatsApp";
      link.style.display = "inline-block";
      link.style.marginTop = "8px";
      link.style.color = "#c2410c";
      link.style.fontWeight = "900";
      link.style.textDecoration = "none";

      footer.appendChild(title);
      footer.appendChild(link);
    }
  }

  updateTexts();
  const observer = new MutationObserver(updateTexts);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
