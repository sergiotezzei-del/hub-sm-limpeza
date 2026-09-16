import type { PatrimonyAssignment, PatrimonyItem, OrganizationPerson } from "../types/patrimony.types";
import type { UniformsDataset } from "./uniformsService";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 34;
const TOP = 806;
const BOTTOM = 42;

type FontKey = "F1" | "F2";
type PdfColor = [number, number, number];
type PdfRun = { x: number; y: number; size: number; font: FontKey; text: string; color?: PdfColor };
type PdfRect = { x: number; y: number; width: number; height: number; fill?: PdfColor; stroke?: PdfColor; lineWidth?: number };
type PdfLine = { x1: number; y1: number; x2: number; y2: number; color: PdfColor; lineWidth?: number };
type PdfPage = { runs: PdfRun[]; rects: PdfRect[]; lines: PdfLine[] };
type CurrentUniformRow = {
  person: string;
  department: string;
  team: string;
  product: string;
  size: string;
  quantity: number;
  deliveredAt: string;
  termStatus: string;
};

const ORANGE: PdfColor = [0.81, 0.28, 0.04];
const NAVY: PdfColor = [0.06, 0.15, 0.27];
const GRAY: PdfColor = [0.36, 0.43, 0.53];
const WHITE: PdfColor = [1, 1, 1];
const ROW_ALT: PdfColor = [0.965, 0.974, 0.984];
const BORDER: PdfColor = [0.83, 0.86, 0.9];

function isUniform(item: PatrimonyItem) {
  return normalize(`${item.category} ${item.code}`).includes("uniforme") || item.code.startsWith("UNI-");
}

function openQuantity(assignment: PatrimonyAssignment) {
  return Math.max(0, assignment.quantity - assignment.returnedQuantity);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function teamLabel(person?: OrganizationPerson) {
  return person?.teamName || "Sem equipe";
}

function estimateTextWidth(value: string, size: number, font: FontKey = "F1") {
  let units = 0;
  for (const character of value) {
    if (/\s/.test(character)) units += 0.28;
    else if (/[ilI1.,'`]/.test(character)) units += 0.28;
    else if (/[MW@%&]/.test(character)) units += 0.82;
    else if (/[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/.test(character)) units += 0.61;
    else units += 0.52;
  }
  if (font === "F2") units *= 1.035;
  return units * size;
}

function fitToWidth(value: string, maxWidth: number, size: number, font: FontKey = "F1") {
  const clean = value.replace(/\s+/g, " ").trim();
  if (estimateTextWidth(clean, size, font) <= maxWidth) return clean;
  const suffix = "...";
  let output = clean;
  while (output.length > 1 && estimateTextWidth(`${output}${suffix}`, size, font) > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output.trimEnd()}${suffix}`;
}

function createPdfPage(): PdfPage {
  return { runs: [], rects: [], lines: [] };
}

export async function downloadUniformInventoryPdf(data: UniformsDataset) {
  const peopleById = new Map(data.patrimony.people.map((person) => [person.id, person]));
  const itemById = new Map(data.patrimony.items.map((item) => [item.id, item]));
  const batchItemByAssignmentId = new Map(data.batchItems.map((item) => [item.patrimonyAssignmentId, item]));
  const batchById = new Map(data.batches.map((batch) => [batch.id, batch]));
  const termByBatchId = new Map(data.terms.map((term) => [term.batchId, term]));
  const uniformItems = data.patrimony.items
    .filter(isUniform)
    .sort((a, b) => `${a.name} ${a.uniformSize ?? ""}`.localeCompare(`${b.name} ${b.uniformSize ?? ""}`, "pt-BR", { numeric: true }));

  const currentRows: CurrentUniformRow[] = data.patrimony.assignments
    .filter((assignment) => {
      const item = itemById.get(assignment.itemId);
      return Boolean(item && openQuantity(assignment) > 0 && isUniform(item));
    })
    .map((assignment) => {
      const item = itemById.get(assignment.itemId);
      const person = peopleById.get(assignment.personId);
      const batchItem = batchItemByAssignmentId.get(assignment.id);
      const batch = batchItem ? batchById.get(batchItem.batchId) : undefined;
      const term = batch ? termByBatchId.get(batch.id) : undefined;
      return {
        person: person?.name || "Pessoa não encontrada",
        department: person?.department || "Sem setor",
        team: teamLabel(person),
        product: item?.name || "Uniforme",
        size: item?.uniformSize || "-",
        quantity: openQuantity(assignment),
        deliveredAt: assignment.assignedAt,
        termStatus: term?.status === "assinado" ? "Assinado" : "Aguardando assinatura",
      };
    })
    .sort((a, b) => a.person.localeCompare(b.person, "pt-BR") || a.product.localeCompare(b.product, "pt-BR"));

  const totals = {
    received: sum(uniformItems.map((item) => item.totalQuantity)),
    available: sum(uniformItems.map((item) => item.availableQuantity)),
    damaged: sum(uniformItems.map((item) => item.maintenanceQuantity)),
    lost: sum(uniformItems.map((item) => item.lostQuantity)),
  };
  const delivered = Math.max(0, totals.received - totals.available - totals.damaged - totals.lost);

  const pages: PdfPage[] = [createPdfPage()];
  let pageIndex = 0;
  let y = TOP;
  const currentPage = () => pages[pageIndex];
  const newPage = () => {
    pages.push(createPdfPage());
    pageIndex += 1;
    y = TOP;
  };
  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };
  const add = (text: string, options?: { size?: number; font?: FontKey; x?: number; gap?: number; color?: PdfColor }) => {
    const size = options?.size ?? 9;
    const gap = options?.gap ?? size + 3;
    ensureSpace(gap);
    currentPage().runs.push({
      x: options?.x ?? LEFT,
      y,
      size,
      font: options?.font ?? "F1",
      text,
      color: options?.color ?? NAVY,
    });
    y -= gap;
  };

  add("SANTA MARIA", { size: 15, font: "F2", gap: 17, color: ORANGE });
  add("INVENTÁRIO DE UNIFORMES", { size: 16, font: "F2", gap: 22, color: NAVY });
  add(`Gerado em: ${formatDateTime()}`, { size: 8, gap: 16, color: GRAY });

  addSummary(currentPage(), y, [
    ["Total recebido", totals.received],
    ["Disponível", totals.available],
    ["Entregue", delivered],
    ["Danificado", totals.damaged],
    ["Perdido", totals.lost],
  ]);
  y -= 48;

  addSectionTitle("Resumo por produto e tamanho");
  addStockTable(uniformItems);

  addSectionTitle("Levantamento atual");
  addCurrentTable(currentRows);

  pages.forEach((page, index) => {
    page.runs.push({
      x: LEFT,
      y: 20,
      size: 7,
      font: "F1",
      text: `Página ${index + 1} de ${pages.length} · Inventário de Uniformes HUB SM`,
      color: GRAY,
    });
  });

  const blob = buildPdf(pages);
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inventario-uniformes-${stamp}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);

  return { total: currentRows.length };

  function addSectionTitle(title: string) {
    ensureSpace(36);
    y -= 7;
    currentPage().runs.push({ x: LEFT, y, size: 11.5, font: "F2", text: title, color: NAVY });
    currentPage().lines.push({ x1: LEFT, y1: y - 8, x2: PAGE_WIDTH - LEFT, y2: y - 8, color: ORANGE, lineWidth: 1.5 });
    y -= 23;
  }

  function addStockTable(items: PatrimonyItem[]) {
    const columns = [
      { label: "Produto", width: 190 },
      { label: "Tam.", width: 48 },
      { label: "Recebido", width: 58 },
      { label: "Entregue", width: 58 },
      { label: "Disponível", width: 62 },
      { label: "Danif.", width: 49 },
      { label: "Perdido", width: 50 },
    ];
    addTableHeader(columns);
    items.forEach((item, rowIndex) => {
      const lineDelivered = Math.max(0, item.totalQuantity - item.availableQuantity - item.maintenanceQuantity - item.lostQuantity);
      addTableRow(columns, [
        item.name,
        item.uniformSize || "-",
        formatNumber(item.totalQuantity),
        formatNumber(lineDelivered),
        formatNumber(item.availableQuantity),
        formatNumber(item.maintenanceQuantity),
        formatNumber(item.lostQuantity),
      ], rowIndex);
    });
    y -= 10;
  }

  function addCurrentTable(rows: CurrentUniformRow[]) {
    const columns = [
      { label: "Pessoa", width: 94 },
      { label: "Setor", width: 68 },
      { label: "Equipe", width: 68 },
      { label: "Produto", width: 104 },
      { label: "Tam.", width: 36 },
      { label: "Qtd.", width: 32 },
      { label: "Entrega", width: 50 },
      { label: "Termo", width: 64 },
    ];
    addTableHeader(columns);
    if (rows.length === 0) {
      addTableRow(columns, ["Sem vínculos atuais", "", "", "", "", "", "", ""], 0);
      return;
    }
    rows.forEach((row, rowIndex) => {
      addTableRow(columns, [
        row.person,
        row.department,
        row.team,
        row.product,
        row.size,
        formatNumber(row.quantity),
        formatDate(row.deliveredAt),
        row.termStatus,
      ], rowIndex);
    });
  }

  function addTableHeader(columns: Array<{ label: string; width: number }>) {
    ensureSpace(28);
    const page = currentPage();
    const top = y;
    const height = 22;
    const bottom = top - height;
    page.rects.push({ x: LEFT, y: bottom, width: PAGE_WIDTH - LEFT * 2, height, fill: NAVY });
    let x = LEFT;
    columns.forEach((column, index) => {
      page.runs.push({
        x: x + 5,
        y: bottom + 7,
        size: 6.9,
        font: "F2",
        text: fitToWidth(column.label, column.width - 9, 6.9, "F2"),
        color: WHITE,
      });
      if (index > 0) page.lines.push({ x1: x, y1: bottom + 4, x2: x, y2: top - 4, color: [0.35, 0.44, 0.55], lineWidth: 0.35 });
      x += column.width;
    });
    y = bottom;
  }

  function addTableRow(columns: Array<{ label: string; width: number }>, values: string[], rowIndex: number) {
    const rowHeight = 19;
    if (y - rowHeight < BOTTOM + 8) {
      newPage();
      addTableHeader(columns);
    }
    const page = currentPage();
    const top = y;
    const bottom = top - rowHeight;
    if (rowIndex % 2 === 1) page.rects.push({ x: LEFT, y: bottom, width: PAGE_WIDTH - LEFT * 2, height: rowHeight, fill: ROW_ALT });
    page.lines.push({ x1: LEFT, y1: bottom, x2: PAGE_WIDTH - LEFT, y2: bottom, color: BORDER, lineWidth: 0.45 });
    let x = LEFT;
    values.forEach((value, index) => {
      const font: FontKey = index === 0 ? "F2" : "F1";
      page.runs.push({
        x: x + 5,
        y: bottom + 6.8,
        size: 6.55,
        font,
        text: fitToWidth(value, columns[index].width - 10, 6.55, font),
        color: NAVY,
      });
      x += columns[index].width;
    });
    y = bottom;
  }
}

function addSummary(page: PdfPage, startY: number, values: Array<[string, number]>) {
  const gap = 9;
  const width = (PAGE_WIDTH - LEFT * 2 - gap * 4) / 5;
  values.forEach(([label, value], index) => {
    const x = LEFT + index * (width + gap);
    page.rects.push({ x, y: startY - 36, width, height: 36, fill: ROW_ALT, stroke: BORDER });
    page.runs.push({ x: x + 7, y: startY - 14, size: 6.7, font: "F1", text: fitToWidth(label, width - 14, 6.7), color: GRAY });
    page.runs.push({ x: x + 7, y: startY - 29, size: 13, font: "F2", text: formatNumber(value), color: NAVY });
  });
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function buildPdf(pages: PdfPage[]) {
  const objects = new Map<number, string>();
  const catalogId = 1;
  const pagesId = 2;
  const fontNormalId = 3;
  const fontBoldId = 4;
  objects.set(fontNormalId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.set(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const pageIds: number[] = [];
  let nextId = 5;
  pages.forEach((page) => {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    let stream = "";
    stream += page.rects.map(rectToPdf).join("");
    stream += page.lines.map(lineToPdf).join("");
    stream += page.runs.map((run) => {
      const color = run.color ?? NAVY;
      return `BT ${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg /${run.font} ${run.size.toFixed(2)} Tf 1 0 0 1 ${run.x.toFixed(2)} ${run.y.toFixed(2)} Tm <${toWinAnsiHex(run.text)}> Tj ET\n`;
    }).join("");
    objects.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    objects.set(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontNormalId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  });

  objects.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  objects.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const maxId = nextId - 1;
  let pdf = "%PDF-1.4\n%HUBSM\n";
  const offsets = new Array<number>(maxId + 1).fill(0);
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects.get(id) ?? "<<>>"}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function rectToPdf(rect: PdfRect) {
  const commands = ["q"];
  if (rect.fill) commands.push(`${rect.fill[0].toFixed(3)} ${rect.fill[1].toFixed(3)} ${rect.fill[2].toFixed(3)} rg`);
  if (rect.stroke) commands.push(`${rect.stroke[0].toFixed(3)} ${rect.stroke[1].toFixed(3)} ${rect.stroke[2].toFixed(3)} RG`);
  commands.push(`${(rect.lineWidth ?? 0.5).toFixed(2)} w`);
  commands.push(`${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re`);
  commands.push(rect.fill && rect.stroke ? "B" : rect.stroke ? "S" : "f");
  commands.push("Q");
  return `${commands.join(" ")}\n`;
}

function lineToPdf(line: PdfLine) {
  return `q ${line.color[0].toFixed(3)} ${line.color[1].toFixed(3)} ${line.color[2].toFixed(3)} RG ${(line.lineWidth ?? 0.5).toFixed(2)} w ${line.x1.toFixed(2)} ${line.y1.toFixed(2)} m ${line.x2.toFixed(2)} ${line.y2.toFixed(2)} l S Q\n`;
}

function toWinAnsiHex(value: string) {
  const normalized = value.replace(/[–—]/g, "-").replace(/…/g, "...");
  const bytes: number[] = [];
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
      continue;
    }
    bytes.push(WIN_ANSI_MAP[character] ?? 0x3f);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const WIN_ANSI_MAP: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
};
