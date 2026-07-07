(() => {
  const PHOTO_KEY = "hub-sm-product-photos";

  function readPhotos() {
    try {
      return JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function savePhoto(name, photo) {
    const data = readPhotos();
    data[name.trim().toLowerCase()] = photo;
    localStorage.setItem(PHOTO_KEY, JSON.stringify(data));
  }

  function getPhoto(name) {
    return readPhotos()[name.trim().toLowerCase()] || "";
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function photoButton(name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-photo-box";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;

    function render() {
      const photo = getPhoto(name);
      button.innerHTML = "";
      if (photo) {
        const img = document.createElement("img");
        img.src = photo;
        img.alt = `Foto de ${name}`;
        button.appendChild(img);
      } else {
        const span = document.createElement("span");
        span.textContent = "Foto do produto";
        button.appendChild(span);
      }
      button.appendChild(input);
    }

    button.addEventListener("click", () => input.click());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      const photo = await fileToDataUrl(file);
      savePhoto(name, photo);
      run();
    });

    render();
    return button;
  }

  function enhanceStockCards() {
    document.querySelectorAll(".inventory-stock-row").forEach((row) => {
      const name = row.querySelector("span strong")?.textContent?.trim();
      if (!name || row.querySelector(".product-photo-box")) return;
      row.classList.add("product-photo-row");
      row.insertBefore(photoButton(name), row.firstChild);
    });
  }

  function enhanceRegisterScreen() {
    const title = Array.from(document.querySelectorAll("h1")).find((item) => item.textContent?.trim() === "Cadastrar Código de Barras");
    if (!title) return;
    const form = title.closest(".screen")?.querySelector(".inventory-form");
    const select = form?.querySelector("select");
    if (!form || !select || form.querySelector("[data-product-photo-register]")) return;

    const panel = document.createElement("section");
    panel.className = "product-photo-register";
    panel.dataset.productPhotoRegister = "1";

    function render() {
      const option = select.options[select.selectedIndex];
      const name = option?.textContent?.trim() || "Produto";
      panel.innerHTML = "";
      const text = document.createElement("div");
      text.innerHTML = `<strong>Foto do produto</strong><small>${name}</small>`;
      panel.appendChild(photoButton(name));
      panel.appendChild(text);
    }

    select.addEventListener("change", render);
    render();
    const firstLabel = form.querySelector("label");
    if (firstLabel && firstLabel.nextSibling) form.insertBefore(panel, firstLabel.nextSibling);
    else form.appendChild(panel);
  }

  function installStyle() {
    if (document.querySelector("[data-product-photo-style]")) return;
    const style = document.createElement("style");
    style.dataset.productPhotoStyle = "1";
    style.textContent = `
      .inventory-stock-row.product-photo-row{display:grid!important;grid-template-columns:76px minmax(0,1fr) auto;align-items:center;gap:12px}
      .product-photo-box{width:68px;height:68px;display:grid;place-items:center;overflow:hidden;padding:0;color:#667085;text-align:center;background:#f8fafc;border:1px dashed #c7d0dd;border-radius:10px;font-size:.72rem;font-weight:900;line-height:1.1}
      .product-photo-box img{width:100%;height:100%;object-fit:cover;display:block}
      .product-photo-register{display:flex;align-items:center;gap:12px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px}
      .product-photo-register strong,.product-photo-register small{display:block}.product-photo-register small{margin-top:4px;color:#667085;font-weight:800}
      @media(max-width:520px){.inventory-stock-row.product-photo-row{grid-template-columns:72px minmax(0,1fr)}.inventory-stock-row.product-photo-row>strong{grid-column:2}}
    `;
    document.head.appendChild(style);
  }

  function run() {
    installStyle();
    enhanceStockCards();
    enhanceRegisterScreen();
  }

  if (document.readyState === "loading") window.addEventListener("load", run);
  else run();
  setInterval(run, 1200);
})();
