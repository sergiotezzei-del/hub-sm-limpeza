import {
  authenticatedSupabaseFetch,
  SUPABASE_URL,
} from "../../security/services/supabaseClient";
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

    // Inline critical print CSS: about:blank popups can print before an external
    // stylesheet has loaded. Keep the approved, versioned term text untouched.
    const printStyles = `<style>
      #uniform-print-toolbar { position: sticky; top: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; padding: 12px; margin: 0 0 16px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; font: 14px Arial, sans-serif; color: #1f2937; }
      #uniform-print-button { padding: 11px 18px; border: 0; border-radius: 7px; background: #c45b14; color: #fff; font: 700 15px Arial, sans-serif; cursor: pointer; }
      @page { size: A4 portrait; margin: 8mm 9mm 8mm; }
      @media print {
        #uniform-print-toolbar { display: none !important; }
        html, body { margin: 0 !important; padding: 0 !important; width: auto !important; background: #fff !important; }
        body { font-size: 8.8pt !important; line-height: 1.16 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .term-page { min-height: 0 !important; width: 100% !important; }
        .term-header { grid-template-columns: 48px 1fr !important; gap: 8px !important; align-items: center !important; margin-bottom: 5px !important; break-inside: avoid; }
        .term-logo { width: 45px !important; max-height: 39px !important; }
        .term-company { font-size: 8.2pt !important; line-height: 1.15 !important; padding-top: 0 !important; }
        h1 { margin: 7px 0 7px !important; font-size: 11.5pt !important; }
        p { margin: 0 0 4px !important; }
        .term-fields { margin: 6px 0 7px !important; gap: 1px !important; }
        .term-section-title { margin: 7px 0 4px !important; }
        table { margin: 3px 0 6px !important; }
        th, td { padding: 3px 4px !important; font-size: 8.2pt !important; line-height: 1.12 !important; overflow-wrap: anywhere; }
        th:nth-child(1) { width: 40% !important; }
        th:nth-child(2) { width: 13% !important; }
        th:nth-child(3) { width: 15% !important; }
        th:nth-child(4) { width: 32% !important; }
        tr { break-inside: avoid; }
        .signature-block { margin-top: 7px !important; break-inside: avoid; }
        .signature-line { margin-top: 16px !important; }
      }
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
      const message = error instanceof Error ? error.message : "Não foi possível preparar o recibo.";
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo não disponível</title></head><body style="font-family:Arial,sans-serif;padding:24px"><h2>Recibo não disponível</h2><p>${escapeHtml(message)}</p><p>Volte ao HUB e corrija o cadastro antes de tentar novamente.</p></body></html>`);
      printWindow.document.close();
    }
    throw error;
  }
}

async function loadLegalIdentity(personId: string): Promise<{ fullName: string; cpf: string }> {
  const response = await authenticatedSupabaseFetch(
    `${SUPABASE_URL}/rest/v1/organization_people?id=eq.${encodeURIComponent(personId)}&select=full_name&limit=1`,
  );
  if (!response.ok) throw new Error("Não foi possível consultar o nome completo. Verifique seu acesso ao cadastro documental.");
  const people = await response.json() as Array<{ full_name: string | null }>;
  const fullName = people[0]?.full_name?.trim();
  if (!fullName) throw new Error("Nome completo não cadastrado. Vá em Patrimônio → Dados para documentos, preencha e tente reimprimir.");

  const detailResponse = await authenticatedSupabaseFetch(
    `${SUPABASE_URL}/rest/v1/organization_person_private_details?person_id=eq.${encodeURIComponent(personId)}&select=cpf&limit=1`,
  );
  if (!detailResponse.ok) throw new Error("Não foi possível consultar os dados documentais com segurança.");
  const details = await detailResponse.json() as Array<{ cpf: string | null }>;
  return { fullName, cpf: details[0]?.cpf?.trim() ?? "" };
}

export async function buildUniformDeliveryTermHtml(data: UniformTermPrintData) {
  const [response, legalIdentity] = await Promise.all([
    fetch(data.template.printTemplatePath, { cache: "force-cache" }),
    loadLegalIdentity(data.person.id),
  ]);
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

  // CPF is optional in the approved template; when absent, remove only that empty
  // optional field rather than asking the employee to complete the receipt by hand.
  const preparedTemplate = legalIdentity.cpf ? templateHtml : templateHtml.replace(
    /<p><strong>CPF \(opcional, se a empresa desejar\):<\/strong>\s*{{CPF_COLABORADOR}}<\/p>/i,
    "",
  );

  return replaceTokens(preparedTemplate, {
    "{{LOGO_SRC}}": data.template.logoPath || "/santa-maria-logo-transparent.png",
    "{{NOME_COLABORADOR}}": escapeHtml(legalIdentity.fullName),
    "{{SETOR}}": escapeHtml(data.person.department || "Não informado"),
    "{{EQUIPE}}": escapeHtml(data.person.teamName || "Sem equipe"),
    "{{DATA_ENTREGA}}": escapeHtml(deliveredDate),
    "{{ITENS_ENTREGUES_ROWS}}": rows || emptyRow(),
    "{{CPF_COLABORADOR}}": escapeHtml(legalIdentity.cpf),
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
