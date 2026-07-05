(() => {
  function textOf(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function styleScanButtons() {
    document.querySelectorAll('label.scan-button').forEach((label) => {
      const input = label.querySelector('input[type="file"]');
      if (input) input.style.display = 'none';
      label.style.display = 'grid';
      label.style.placeItems = 'center';
      label.style.minHeight = '56px';
      label.style.padding = '14px';
      label.style.border = '2px dashed #f97316';
      label.style.borderRadius = '10px';
      label.style.background = '#fff7ed';
      label.style.color = '#c2410c';
      label.style.fontWeight = '900';
      label.style.textAlign = 'center';
      label.style.cursor = 'pointer';

      if (textOf(label).includes('bipar')) {
        const currentInput = input;
        label.textContent = 'Abrir câmera para ler código';
        if (currentInput) label.appendChild(currentInput);
      }
    });
  }

  function improveUserSelect() {
    document.querySelectorAll('label').forEach((label) => {
      if (!textOf(label).startsWith('Quem retirou')) return;
      const select = label.querySelector('select');
      if (!select || select.querySelector('option[value="Sergio Tezzei"]')) return;
      const option = document.createElement('option');
      option.value = 'Sergio Tezzei';
      option.textContent = 'Sergio Tezzei';
      select.appendChild(option);
    });
  }

  function hideBarcodeFields() {
    document.querySelectorAll('label').forEach((label) => {
      if (!textOf(label).startsWith('Código de barras')) return;
      if (label.dataset.manualReady === '1') return;
      label.dataset.manualReady = '1';
      label.style.display = 'none';

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Digitar código manualmente';
      button.style.width = 'fit-content';
      button.style.minHeight = '34px';
      button.style.padding = '7px 10px';
      button.style.border = '1px solid #cbd5e1';
      button.style.borderRadius = '8px';
      button.style.background = '#fff';
      button.style.color = '#475569';
      button.style.fontSize = '0.78rem';
      button.style.fontWeight = '800';
      button.onclick = () => {
        label.style.display = 'grid';
        button.style.display = 'none';
        const input = label.querySelector('input');
        if (input) input.focus();
      };
      label.parentNode?.insertBefore(button, label);
    });
  }

  function apply() {
    styleScanButtons();
    improveUserSelect();
    hideBarcodeFields();
  }

  window.addEventListener('load', apply);
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
})();
