(() => {
  const STYLE_ID = "stock-exit-quick-style";
  const QUICK_PRODUCTS = [
    "Água Sanitária",
    "Detergente",
    "Papel Higiênico",
    "Papel Toalha",
    "Saco de Lixo 100L",
    "Saco de Lixo 60L",
    "Saco de Lixo 20L",
    "Rajalim",
    "Querosene",
    "Sabonete Líquido",
  ];

  function textOf(node) {
    return (node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function replaceLeadingLabelText(label, value) {
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode && textNode.textContent !== value) textNode.textContent = value;
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function setHtml(element, value) {
    if (element && element.innerHTML !== value) element.innerHTML = value;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .stock-exit-quick-screen { max-width: 760px; }
      .stock-exit-quick-screen .top-bar { margin-bottom: 12px; }
      .stock-exit-quick-form { display: grid; gap: 12px; padding: 16px; }
      .stock-exit-quick-form > * { min-width: 0; }
      .stock-exit-user-label { order: 0; }
      .stock-exit-step-title { margin: 4px 0 0; color: #1f2933; font-size: 1.02rem; font-weight: 900; }
      .stock-exit-step-one { order: 1; }
      .stock-exit-quick-grid { order: 2; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .stock-exit-quick-product { min-height: 54px; padding: 10px; border: 1px solid #d8dee8; border-radius: 10px; background: #fff; color: #334155; font-weight: 850; line-height: 1.15; text-align: left; }
      .stock-exit-quick-product:hover { border-color: #f97316; background: #fff7ed; }
      .stock-exit-quick-product.is-selected { border: 2px solid #f97316; color: #9a3412; background: #fff1e6; }
      .stock-exit-product-label { order: 3; }
      .stock-exit-product-label select { min-height: 50px; }
      .stock-exit-quick-screen .inventory-found-card { order: 4; margin: 0; border-left: 5px solid #f97316; }
      .stock-exit-step-two { order: 5; }
      .stock-exit-quantity-label { order: 6; }
      .stock-exit-stepper { display: grid; grid-template-columns: 52px minmax(0, 1fr) 52px; gap: 8px; align-items: center; }
      .stock-exit-stepper button { min-height: 50px; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; color: #334155; font-size: 1.4rem; font-weight: 900; }
      .stock-exit-stepper input { min-height: 50px; text-align: center; font-size: 1.12rem; font-weight: 900; }
      .stock-exit-more-toggle { order: 7; width: 100%; min-height: 42px; border: 0; background: transparent; color: #475569; font-weight: 850; text-align: left; }
      .stock-exit-scan-label, .stock-exit-barcode-label, .stock-exit-observation-label { display: none !important; order: 8; }
      .stock-exit-quick-form.show-stock-exit-details .stock-exit-scan-label,
      .stock-exit-quick-form.show-stock-exit-details .stock-exit-barcode-label,
      .stock-exit-quick-form.show-stock-exit-details .stock-exit-observation-label { display: grid !important; }
      .stock-exit-summary { order: 9; display: grid; gap: 4px; padding: 13px 14px; border: 1px solid #bbf7d0; border-radius: 10px; background: #f0fdf4; color: #166534; }
      .stock-exit-summary strong { font-size: 1rem; }
      .stock-exit-summary span { font-size: .86rem; font-weight: 750; }
      .stock-exit-warning { order: 10; margin: 0; padding: 12px 14px; border-radius: 10px; background: #fee2e2; color: #991b1b; font-weight: 850; }
      .stock-exit-quick-confirm { order: 11; position: sticky; bottom: 12px; min-height: 54px; color: #fff !important; background: #15803d !important; border-color: #15803d !important; box-shadow: 0 10px 20px rgba(31, 41, 51, .18); }
      .stock-exit-quick-confirm:disabled { color: #64748b !important; background: #e2e8f0 !important; border-color: #cbd5e1 !important; box-shadow: none; }
      @media (min-width: 640px) {
        .stock-exit-quick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
    `;
    document.head.appendChild(style);
  }

  function findStockExitScreen() {
    return Array.from(document.querySelectorAll("section.screen")).find((screen) => {
      const title = normalize(screen.querySelector(".top-bar h1")?.textContent);
      return title === "saida de produto" || title === "retirar produto";
    }) || null;
  }

  function parseAvailableStock(screen) {
    const card = screen.querySelector(".inventory-found-card");
    const text = textOf(card);
    const match = text.match(/Estoque atual:\s*([\d.,]+)/i);
    if (!match) return null;
    const normalized = match[1].replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function getNodes(screen) {
    const form = screen.querySelector(".manual-form.inventory-form");
    if (!form) return null;
    const labels = Array.from(form.querySelectorAll(":scope > label"));
    const userLabel = labels.find((label) => normalize(textOf(label)).startsWith("quem retirou")) || null;
    const scanLabel = labels.find((label) => label.classList.contains("scan-button")) || null;
    const barcodeLabel = labels.find((label) => normalize(textOf(label)).startsWith("codigo de barras")) || null;
    const productLabel = labels.find((label) => label.querySelector("select") && !label.isSameNode(userLabel)) || null;
    const quantityLabel = labels.find((label) => normalize(textOf(label)).startsWith("quantidade retirada")) || null;
    const observationLabel = labels.find((label) => normalize(textOf(label)).startsWith("observacao opcional")) || null;
    const productSelect = productLabel?.querySelector("select") || null;
    const quantityInput = quantityLabel?.querySelector('input[type="number"]') || null;
    const confirmButton = Array.from(form.querySelectorAll(":scope > button")).find((button) => normalize(textOf(button)).includes("confirmar")) || null;
    return { form, userLabel, scanLabel, barcodeLabel, productLabel, quantityLabel, observationLabel, productSelect, quantityInput, confirmButton };
  }

  function ensureStepTitle(form, className, text, beforeNode) {
    let title = form.querySelector(`.${className}`);
    if (!title) {
      title = document.createElement("p");
      title.className = `stock-exit-step-title ${className}`;
      form.insertBefore(title, beforeNode || null);
    }
    setText(title, text);
  }

  function ensureQuickProducts(form, productLabel, select) {
    let grid = form.querySelector(".stock-exit-quick-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "stock-exit-quick-grid";
      form.insertBefore(grid, productLabel);
    }

    const options = Array.from(select.options).filter((option) => option.value);
    const matchedOptions = QUICK_PRODUCTS.map((name) => {
      const target = normalize(name);
      return options.find((option) => normalize(option.textContent) === target) || null;
    }).filter(Boolean);

    const signature = matchedOptions.map((option) => `${option.value}:${option.textContent}`).join("|");
    if (grid.dataset.signature !== signature) {
      grid.dataset.signature = signature;
      grid.innerHTML = "";
      matchedOptions.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stock-exit-quick-product";
        button.dataset.productValue = option.value;
        button.textContent = option.textContent;
        button.addEventListener("click", () => setNativeValue(select, option.value));
        grid.appendChild(button);
      });
    }

    grid.querySelectorAll(".stock-exit-quick-product").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.productValue === select.value);
    });
  }

  function ensureStepper(quantityLabel, input, screen) {
    let wrapper = quantityLabel.querySelector(".stock-exit-stepper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "stock-exit-stepper";
      input.parentNode.insertBefore(wrapper, input);

      const decrease = document.createElement("button");
      decrease.type = "button";
      decrease.setAttribute("aria-label", "Diminuir quantidade");
      decrease.textContent = "−";
      decrease.addEventListener("click", () => {
        const current = Number(input.value) || 1;
        setNativeValue(input, String(Math.max(1, current - 1)));
      });

      const increase = document.createElement("button");
      increase.type = "button";
      increase.setAttribute("aria-label", "Aumentar quantidade");
      increase.textContent = "+";
      increase.addEventListener("click", () => {
        const current = Number(input.value) || 0;
        const available = parseAvailableStock(screen);
        const next = available === null ? current + 1 : Math.min(available, current + 1);
        setNativeValue(input, String(Math.max(1, next)));
      });

      wrapper.append(decrease, input, increase);
    }
  }

  function ensureDetailsToggle(form, confirmButton) {
    let toggle = form.querySelector(".stock-exit-more-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "stock-exit-more-toggle";
      toggle.addEventListener("click", () => {
        const open = form.dataset.detailsOpen !== "1";
        form.dataset.detailsOpen = open ? "1" : "0";
        form.classList.toggle("show-stock-exit-details", open);
        setText(toggle, open ? "Ocultar opções adicionais" : "Usar código de barras ou adicionar observação");
      });
      form.insertBefore(toggle, confirmButton);
    }
    const open = form.dataset.detailsOpen === "1";
    form.classList.toggle("show-stock-exit-details", open);
    setText(toggle, open ? "Ocultar opções adicionais" : "Usar código de barras ou adicionar observação");
  }

  function validateAndSummarize(screen, nodes, showMessage = false) {
    const { form, productSelect, quantityInput, confirmButton } = nodes;
    if (!productSelect || !quantityInput || !confirmButton) return false;

    let summary = form.querySelector(".stock-exit-summary");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "stock-exit-summary";
      form.insertBefore(summary, confirmButton);
    }

    let warning = form.querySelector(".stock-exit-warning");
    const selectedName = productSelect.selectedOptions[0]?.textContent?.trim() || "";
    const quantity = Number(quantityInput.value);
    const available = parseAvailableStock(screen);
    const validQuantity = Number.isFinite(quantity) && quantity > 0;
    const exceedsStock = available !== null && validQuantity && quantity > available;
    const valid = Boolean(productSelect.value) && validQuantity && !exceedsStock && available !== 0;

    if (!productSelect.value) {
      setHtml(summary, "<strong>Escolha um produto</strong><span>A confirmação será liberada depois da seleção.</span>");
    } else if (!validQuantity) {
      setHtml(summary, `<strong>${selectedName}</strong><span>Informe uma quantidade maior que zero.</span>`);
    } else {
      const finalStock = available === null ? null : Math.max(0, available - quantity);
      setHtml(summary, `<strong>Retirar ${quantity} de ${selectedName}</strong><span>${available === null ? "Confira a quantidade e confirme." : `Saldo após a retirada: ${finalStock}`}</span>`);
    }

    if (exceedsStock || available === 0) {
      if (!warning) {
        warning = document.createElement("p");
        warning.className = "stock-exit-warning";
        form.insertBefore(warning, confirmButton);
      }
      setText(warning, available === 0
        ? "Este produto está sem estoque. Faça uma conferência ou entrada antes de retirar."
        : `Quantidade maior que o estoque disponível (${available}).`);
      warning.hidden = false;
    } else if (warning) {
      warning.hidden = true;
    }

    const saving = normalize(textOf(confirmButton)).includes("salvando");
    confirmButton.disabled = saving || !valid;
    if (!saving) setText(confirmButton, "Confirmar retirada");

    if (showMessage && !valid) warning?.scrollIntoView({ behavior: "smooth", block: "center" });
    return valid;
  }

  function apply() {
    injectStyles();
    const screen = findStockExitScreen();
    if (!screen) return;
    const nodes = getNodes(screen);
    if (!nodes?.productSelect || !nodes.quantityInput || !nodes.confirmButton || !nodes.productLabel || !nodes.quantityLabel) return;

    screen.classList.add("stock-exit-quick-screen");
    const title = screen.querySelector(".top-bar h1");
    const subtitle = screen.querySelector(".top-bar p:not(.eyebrow)");
    setText(title, "Retirar Produto");
    setText(subtitle, "Escolha o produto, informe a quantidade e confirme.");

    nodes.form.classList.add("stock-exit-quick-form");
    nodes.userLabel?.classList.add("stock-exit-user-label");
    nodes.scanLabel?.classList.add("stock-exit-scan-label");
    nodes.barcodeLabel?.classList.add("stock-exit-barcode-label");
    nodes.observationLabel?.classList.add("stock-exit-observation-label");
    nodes.productLabel.classList.add("stock-exit-product-label");
    nodes.quantityLabel.classList.add("stock-exit-quantity-label");
    nodes.confirmButton.classList.add("stock-exit-quick-confirm");

    if (nodes.userLabel) replaceLeadingLabelText(nodes.userLabel, "Retirada por");
    replaceLeadingLabelText(nodes.productLabel, "Ou selecione outro produto");
    replaceLeadingLabelText(nodes.quantityLabel, "Quantidade");

    ensureStepTitle(nodes.form, "stock-exit-step-one", "1. Escolha o produto", nodes.productLabel);
    ensureQuickProducts(nodes.form, nodes.productLabel, nodes.productSelect);
    ensureStepTitle(nodes.form, "stock-exit-step-two", "2. Informe a quantidade", nodes.quantityLabel);
    ensureStepper(nodes.quantityLabel, nodes.quantityInput, screen);
    ensureDetailsToggle(nodes.form, nodes.confirmButton);

    if (!nodes.form.dataset.quickListeners) {
      nodes.form.dataset.quickListeners = "1";
      nodes.form.addEventListener("input", () => queueMicrotask(apply));
      nodes.form.addEventListener("change", () => queueMicrotask(apply));
    }

    validateAndSummarize(screen, nodes);
  }

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".stock-exit-quick-confirm") : null;
    if (!button) return;
    const screen = button.closest("section.screen");
    if (!screen) return;
    const nodes = getNodes(screen);
    if (!nodes || validateAndSummarize(screen, nodes, true)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener("load", apply);
  new MutationObserver(() => queueMicrotask(apply)).observe(document.body, { childList: true, subtree: true });
})();
