import { mkdir, writeFile } from "node:fs/promises";
import { Packer } from "docx";
import { createCleaningOrderDocument } from "../.tmp-order-doc/modules/cleaning/services/cleaningOrderDocument.js";

const catalog = [
  ["agua-sanitaria", "Água Sanitária", "Litro"],
  ["alcool-comum", "Álcool Comum", "Litro"],
  ["alcool-gel", "Álcool Gel", "Galão"],
  ["bom-ar", "Bom Ar", "Unidade"],
  ["copo-descartavel-200ml", "Copo Descartável 200ml", "Caixa"],
  ["detergente", "Detergente", "Unidade"],
  ["esponja", "Esponja", "Unidade"],
  ["flanela", "Flanela", "Unidade"],
  ["luva", "Luva", "Par"],
  ["pano-de-chao", "Pano de Chão", "Unidade"],
  ["papel-higienico", "Papel Higiênico", "Fardo"],
  ["papel-toalha", "Papel Toalha", "Caixa"],
  ["perfex", "Perfex", "Rolo"],
  ["querosene", "Querosene", "Litro"],
  ["rajalim", "Rajalim", "Litro"],
  ["sabao-em-barra", "Sabão em Barra", "Pacote"],
  ["sabao-em-po", "Sabão em Pó", "Caixa"],
  ["sabonete-liquido", "Sabonete Líquido", "Galão"],
  ["saco-lixo-20l", "Saco de Lixo 20L", "Unidade/Pacote"],
  ["saco-lixo-60l", "Saco de Lixo 60L", "Unidade/Pacote"],
  ["saco-lixo-100l", "Saco de Lixo 100L", "Unidade/Pacote"],
  ["veneno", "Veneno", "Unidade"],
  ["sactif-multiuso-5l", "Sactif Mult Uso 5L", "Galão"],
].map(([id, name, unit]) => ({ id, name, unit, currentStock: 0, minStock: 0 }));

const order = {
  id: "sample-order",
  data: "04/08/2026",
  hora: "10:30",
  solicitante: "Neia",
  status: "Novo",
  itens: [
    { id: "agua-sanitaria", productName: "Água Sanitária", unit: "Litro", quantity: 8 },
    { id: "bom-ar", productName: "Bom Ar", unit: "Unidade", quantity: 4 },
    { id: "copo-descartavel-200ml", productName: "Copo Descartável 200ml", unit: "Caixa", quantity: 2 },
    { id: "detergente", productName: "Detergente", unit: "Unidade", quantity: 10 },
    { id: "esponja", productName: "Esponja", unit: "Unidade", quantity: 3 },
    { id: "luva", productName: "Luva", unit: "Par", quantity: 1, observation: "Tamanho GG" },
    { id: "papel-higienico", productName: "Papel Higiênico", unit: "Fardo", quantity: 3 },
    { id: "papel-toalha", productName: "Papel Toalha", unit: "Caixa", quantity: 12 },
    { id: "rajalim", productName: "Rajalim", unit: "Litro", quantity: 8 },
    { id: "sabao-em-po", productName: "Sabão em Pó", unit: "Caixa", quantity: 1 },
    { id: "sabao-em-barra", productName: "Sabão em Barra", unit: "Pacote", quantity: 1 },
    { id: "sabonete-liquido", productName: "Sabonete Líquido", unit: "Galão", quantity: 1 },
    { id: "saco-lixo-100l", productName: "Saco de Lixo 100L", unit: "Unidade/Pacote", quantity: 1 },
    { id: "saco-lixo-20l", productName: "Saco de Lixo 20L", unit: "Unidade/Pacote", quantity: 1 },
    { id: "saco-lixo-60l", productName: "Saco de Lixo 60L", unit: "Unidade/Pacote", quantity: 1 },
    { id: "querosene", productName: "Querosene", unit: "Litro", quantity: 12, observation: "Removedor" },
    { id: "manual-vassoura", productName: "Vassoura de Palha", unit: "Produto não cadastrado", quantity: 1, manual: true },
  ],
};

await mkdir("artifacts", { recursive: true });
const buffer = await Packer.toBuffer(createCleaningOrderDocument(order, catalog));
await writeFile("artifacts/Pedido Sinval - Exemplo.docx", buffer);
console.log(`Amostra criada com ${buffer.length} bytes.`);
