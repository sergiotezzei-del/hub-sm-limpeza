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
  const html = await buildUniformDeliveryTermHtml(data);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!printWindow) throw new Error("O navegador bloqueou a janela de impressão.");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 350);
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
