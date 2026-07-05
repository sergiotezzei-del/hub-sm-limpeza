(() => {
  const INVENTORY_KEY = 'hub-sm-inventory-products';
  const BOOTSTRAP_KEY = 'hub-sm-limpeza-stock-bootstrap-2026-06-24';

  const entries = [
    { id: 'agua-sanitaria', name: 'Água Sanitária', unit: 'Litro', currentStock: 8 },
    { id: 'alcool-comum', name: 'Álcool Comum', unit: 'Litro', currentStock: 5 },
    { id: 'bom-ar', name: 'Bom Ar', unit: 'Unidade', currentStock: 2 },
    { id: 'detergente', name: 'Detergente', unit: 'Unidade', currentStock: 10 },
    { id: 'esponja', name: 'Esponja', unit: 'Unidade', currentStock: 5 },
    { id: 'flanela', name: 'Flanela', unit: 'Unidade', currentStock: 4 },
    { id: 'sactif-multiuso-5l', name: 'Sactif Mult Uso 5L', unit: 'Galão', currentStock: 1 },
    { id: 'luva', name: 'Luva', unit: 'Par', currentStock: 2 },
    { id: 'papel-higienico', name: 'Papel Higiênico', unit: 'Fardo', currentStock: 6 },
    { id: 'papel-toalha', name: 'Papel Toalha', unit: 'Caixa', currentStock: 15 },
    { id: 'rajalim', name: 'Rajalim', unit: 'Litro', currentStock: 10 },
    { id: 'sabao-em-po', name: 'Sabão em Pó', unit: 'Caixa', currentStock: 1 },
    { id: 'sabao-em-barra', name: 'Sabão em Barra', unit: 'Pacote', currentStock: 1 },
    { id: 'saco-lixo-100l', name: 'Saco de Lixo 100L', unit: 'Unidade/Pacote', currentStock: 1 },
    { id: 'saco-lixo-20l', name: 'Saco de Lixo 20L', unit: 'Unidade/Pacote', currentStock: 1 },
    { id: 'querosene', name: 'Querosene', unit: 'Litro', currentStock: 12 },
  ];

  function loadInventory() {
    try {
      const raw = localStorage.getItem(INVENTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function shouldApply(currentInventory) {
    if (localStorage.getItem(BOOTSTRAP_KEY) === '1') return false;
    const byId = new Map(currentInventory.map((item) => [item.id, item]));
    return entries.some((entry) => Number(byId.get(entry.id)?.currentStock || 0) === 0);
  }

  function applyBootstrap() {
    const currentInventory = loadInventory();
    if (!shouldApply(currentInventory)) return;

    const byId = new Map(currentInventory.map((item) => [item.id, item]));
    entries.forEach((entry) => {
      const current = byId.get(entry.id) || {};
      byId.set(entry.id, {
        ...current,
        id: entry.id,
        name: current.name || entry.name,
        unit: current.unit || entry.unit,
        currentStock: entry.currentStock,
        minStock: Number(current.minStock || 0),
      });
    });

    localStorage.setItem(INVENTORY_KEY, JSON.stringify(Array.from(byId.values())));
    localStorage.setItem(BOOTSTRAP_KEY, '1');
  }

  applyBootstrap();
})();
