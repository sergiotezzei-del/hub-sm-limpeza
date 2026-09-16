import type {
  OrganizationPerson,
  PatrimonyItem,
  UniformDeliveryBatch,
  UniformDeliveryBatchItem,
  UniformDeliveryTerm,
  UniformTermTemplateVersion,
} from "../types/patrimony.types";

export type UniformTermPrintData = {
  person: OrganizationPerson;
  batch: UniformDeliveryBatch;
  term: UniformDeliveryTerm;
  template: UniformTermTemplateVersion;
  batchItems: UniformDeliveryBatchItem[];
  itemById: Map<string, PatrimonyItem>;
};

export async function openUniformDeliveryTermForPrint(data: UniformTermPrintData) {
  // Open the tab before the first await, while the click's user activation is still valid.
  // With `noopener`, window.open() can return null even when a tab has been opened,
  // preventing the app from writing the receipt to it.
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("O navegador bloqueou o recibo. Abra o HUB no Chrome ou Safari e permita abrir novas abas.");
  }

  // This is an application-generated, same-origin document, not an external page.
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write("<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Carregando recibo</title></head><body style=\"font-family:Arial,sans-serif;padding:24px\">Preparando recibo de entrega...</body></html>");
  printWindow.document.close();

  try {
    const html = await buildUniformDeliveryTermHtml(data);
    if (printWindow.closed) {
      throw new Error("A aba do recibo foi fechada. Clique em Imprimir termo novamente.");
    }

    // Mobile browsers commonly block print() called after an asynchronous fetch.
    // A visible button in the receipt runs print() directly from the user's tap.
    const printStyles = `<style>
      #uniform-print-toolbar { position: sticky; top: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; padding: 12px; margin: 0 0 16px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; font: 14px Arial, sans-serif; color: #1f2937; }
      #uniform-print-button { padding: 11px 18px; border: 0; border-radius: 7px; background: #c45b14; color: #fff; font: 700 15px Arial, sans-serif; cursor: pointer; }
      @media print { #uniform-print-toolbar { display: none !important; } }
    </style>`;
    const toolbar = `<div id="uniform-print-toolbar" role="region" aria-label="Impressão do recibo"><button type="button" id="uniform-print-button">Imprimir ou salvar PDF</button><span>No celular, escolha a impressora ou Salvar em PDF.</span></div>`;
    const printableHtml = html
      .replace(/<\/head>/i, `${printStyles}</head>`)
      .replace(/<body([^>]*)>/i, (bodyTag) => `${bodyTag}${toolbar}`);

    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();
    const printButton = printWindow.document.getElementById("uniform-print-button");
    if (!printButton) throw new Error("Não foi possível preparar o botão de impressão do recibo.");
    printButton.addEventListener("click", () => {
      printWindow.focus();
      printWindow.print();
    });
    printWindow.focus();
  } catch (error) {
    if (!printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write("<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Erro no recibo</title></head><body style=\"font-family:Arial,sans-serif;padding:24px\">Não foi possível preparar o recibo. Volte ao HUB e tente novamente.</body></html>");
      printWindow.document.close();
    }
    throw error;
  }
}

export async function buildUniformDeliveryTermHtml(data: UniformTermPrintData) {
  const response = await fetch(data.template.printTemplatePath, { cache: "force-cache" });
  if (!response.ok) throw new Error("Template do termo indisponível.");
  const templateHtml = await response.text();
  const deliveredDate = formatDate(data.batch.deliveredAt);
  const rows = data.batchItems
    .map((line) => {
      const item = data.itemById.get(line.itemId);
      return [
        "<tr>",
        `<td>${escapeHtml(item?.name ?? "Uniforme não encontrado")}</td>`,
        `<td>${escapeHtml(formatQuantity(line.quantity))}</td>`,
        `<td>${escapeHtml(item?.uniformSize ?? "Não informado")}</td>`,
        `<td>${escapeHtml(line.observation || item?.uniformDescription || "")}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return replaceTokens(templateHtml, {
    "{{LOGO_SRC}}": data.template.logoPath || "/santa-maria-logo-transparent.png",
    "{{NOME_COLABORADOR}}": escapeHtml(data.person.name),
    "{{SETOR}}": escapeHtml(data.person.department || "Não informado"),
    "{{EQUIPE}}": escapeHtml(data.person.teamName || "Sem equipe"),
    "{{DATA_ENTREGA}}": escapeHtml(deliveredDate),
    "{{ITENS_ENTREGUES_ROWS}}": rows || emptyRow(),
    "{{CPF_COLABORADOR}}": "________________",
  });
}

function emptyRow() {
  return "<tr><td colspan=\"4\">Nenhum item informado.</td></tr>";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function replaceTokens(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (output, [token, value]) => output.split(token).join(value),
    template,
  );
}
