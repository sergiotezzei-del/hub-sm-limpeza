import { loadEquipmentModels } from "./equipmentModelService";
import { loadPatrimonyDataset } from "./patrimonyService";
import { loadPersonNotebookUsage } from "./personNotebookUsageService";
import type { PatrimonyAssignment, PatrimonyItem } from "../types/patrimony.types";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 34;
const TOP = 806;
const BOTTOM = 42;
const ORANGE: PdfColor = [0.81, 0.28, 0.04];
const NAVY: PdfColor = [0.06, 0.15, 0.27];
const GRAY: PdfColor = [0.36, 0.43, 0.53];
const WHITE: PdfColor = [1, 1, 1];
const ROW_ALT: PdfColor = [0.965, 0.974, 0.984];
const BORDER: PdfColor = [0.83, 0.86, 0.9];
const ORANGE_SOFT: PdfColor = [0.992, 0.944, 0.905];
const STATUS_SOFT: PdfColor = [0.94, 0.955, 0.965];
const STATUS_OK: PdfColor = [0.10, 0.47, 0.28];

type FontKey = "F1" | "F2" | "F3" | "F4";
type PdfColor = [number, number, number];
type PdfRun = { x: number; y: number; size: number; font: FontKey; text: string; color?: PdfColor };
type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: PdfColor;
  stroke?: PdfColor;
  lineWidth?: number;
};
type PdfLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: PdfColor;
  lineWidth?: number;
};
type PdfPage = { runs: PdfRun[]; rects: PdfRect[]; lines: PdfLine[] };
type PdfLogo = { bytes: Uint8Array; width: number; height: number };
type InventoryRow = {
  code: string;
  model: string;
  person: string;
  department: string;
  team: string;
  offsiteUse: boolean;
};

type TableColumn = {
  label: string;
  width: number;
};

const TABLE_COLUMNS: TableColumn[] = [
  { label: "Patrimônio", width: 56 },
  { label: "Modelo", width: 118 },
  { label: "Pessoa", width: 122 },
  { label: "Setor", width: 88 },
  { label: "Equipe", width: 91 },
  { label: "Uso externo", width: 52 },
];
const TABLE_HEADER_HEIGHT = 24;
const TABLE_ROW_HEIGHT = 20;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function openQuantity(assignment: PatrimonyAssignment) {
  return Math.max(0, assignment.quantity - assignment.returnedQuantity);
}

function isNotebook(item: PatrimonyItem) {
  const text = normalize(`${item.category} ${item.name}`);
  return text.includes("notebook") || text.includes("laptop");
}

function teamLabel(value?: string) {
  if (!value) return "Sem equipe";
  return value.replace(/^equipe\s+/i, "").trim() || value;
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

function fit(value: string, width: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= width) return clean.padEnd(width, " ");
  if (width <= 1) return clean.slice(0, width);
  return `${clean.slice(0, width - 1)}…`;
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
  if (font === "F2" || font === "F4") units *= 1.035;
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

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function createPdfPage(): PdfPage {
  return { runs: [], rects: [], lines: [] };
}

export async function downloadNotebookInventoryPdf() {
  const [dataset, models, offsiteByPersonId, logo] = await Promise.all([
    loadPatrimonyDataset(),
    loadEquipmentModels(),
    loadPersonNotebookUsage(),
    loadBrandLogo().catch(() => undefined),
  ]);
  const modelById = new Map(models.map((model) => [model.id, model]));
  const personById = new Map(dataset.people.map((person) => [person.id, person]));

  const activeAssignmentByItem = new Map<string, PatrimonyAssignment>();
  dataset.assignments
    .filter((assignment) => openQuantity(assignment) > 0)
    .forEach((assignment) => {
      if (!activeAssignmentByItem.has(assignment.itemId)) activeAssignmentByItem.set(assignment.itemId, assignment);
    });

  const rows: InventoryRow[] = dataset.items
    .filter((item) => item.active && item.trackingMode === "individual" && isNotebook(item))
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }))
    .map((item) => {
      const assignment = activeAssignmentByItem.get(item.id);
      const person = assignment ? personById.get(assignment.personId) : undefined;
      const model = item.equipmentModelId ? modelById.get(item.equipmentModelId) : undefined;
      return {
        code: item.code,
        model: model?.name || item.model || item.name || "Sem modelo",
        person: person?.name || "Sem pessoa",
        department: person?.department || "Sem setor",
        team: teamLabel(person?.teamName),
        offsiteUse: person ? Boolean(offsiteByPersonId.get(person.id)) : false,
      };
    });

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
  add("IMOBILIÁRIA", { size: 8, font: "F2", gap: 16, color: GRAY });
  add("RELATÓRIO DO INVENTÁRIO DE NOTEBOOKS", { size: 16, font: "F2", gap: 22, color: NAVY });
  add(`Gerado em: ${formatDateTime()}`, { size: 8, gap: 14, color: GRAY });
  add(`Total inventariado: ${rows.length} notebook(s)`, { size: 11, font: "F2", gap: 19, color: NAVY });

  addSummaryColumns(currentPage().runs, y, rows);
  const summaryRows = Math.max(
    countBy(rows.map((row) => row.model)).length,
    countBy(rows.map((row) => row.department)).length,
    countBy(rows.map((row) => row.team)).length,
  );
  y -= 24 + summaryRows * 12;

  const addTableTitle = (continuation = false) => {
    ensureSpace(52);
    y -= 7;
    const title = continuation ? "Levantamento completo · continuação" : "Levantamento completo";
    currentPage().runs.push({ x: LEFT, y, size: continuation ? 10.5 : 12, font: "F2", text: title, color: NAVY });
    if (!continuation) {
      const countText = `${rows.length} registros`;
      currentPage().runs.push({
        x: PAGE_WIDTH - LEFT - estimateTextWidth(countText, 7.3, "F2"),
        y: y + 1,
        size: 7.3,
        font: "F2",
        text: countText,
        color: GRAY,
      });
    }
    currentPage().lines.push({ x1: LEFT, y1: y - 8, x2: PAGE_WIDTH - LEFT, y2: y - 8, color: ORANGE, lineWidth: 1.8 });
    y -= 23;
  };

  const columnStarts = () => {
    const starts: number[] = [];
    let x = LEFT;
    TABLE_COLUMNS.forEach((column) => {
      starts.push(x);
      x += column.width;
    });
    return starts;
  };

  const addTableHeader = () => {
    const page = currentPage();
    const starts = columnStarts();
    const top = y;
    const bottom = top - TABLE_HEADER_HEIGHT;
    page.rects.push({ x: LEFT, y: bottom, width: PAGE_WIDTH - LEFT * 2, height: TABLE_HEADER_HEIGHT, fill: NAVY });
    TABLE_COLUMNS.forEach((column, index) => {
      const x = starts[index];
      page.runs.push({
        x: x + 6,
        y: bottom + 8,
        size: 7.05,
        font: "F2",
        text: fitToWidth(column.label, column.width - 12, 7.05, "F2"),
        color: WHITE,
      });
      if (index > 0) {
        page.lines.push({ x1: x, y1: bottom + 5, x2: x, y2: top - 5, color: [0.35, 0.44, 0.55], lineWidth: 0.35 });
      }
    });
    y = bottom;
  };

  const addTableRow = (row: InventoryRow, rowIndex: number) => {
    const page = currentPage();
    const starts = columnStarts();
    const top = y;
    const bottom = top - TABLE_ROW_HEIGHT;

    if (rowIndex % 2 === 1) {
      page.rects.push({ x: LEFT, y: bottom, width: PAGE_WIDTH - LEFT * 2, height: TABLE_ROW_HEIGHT, fill: ROW_ALT });
    }
    page.lines.push({ x1: LEFT, y1: bottom, x2: PAGE_WIDTH - LEFT, y2: bottom, color: BORDER, lineWidth: 0.45 });

    const codeBadgeWidth = 43;
    const codeBadgeHeight = 12;
    const codeBadgeY = bottom + (TABLE_ROW_HEIGHT - codeBadgeHeight) / 2;
    page.rects.push({ x: starts[0] + 6, y: codeBadgeY, width: codeBadgeWidth, height: codeBadgeHeight, fill: ORANGE_SOFT });
    page.runs.push({
      x: starts[0] + 9,
      y: bottom + 7,
      size: 6.8,
      font: "F2",
      text: fitToWidth(row.code, codeBadgeWidth - 6, 6.8, "F2"),
      color: ORANGE,
    });

    const values = [row.model, row.person, row.department, row.team];
    values.forEach((value, valueIndex) => {
      const columnIndex = valueIndex + 1;
      const font: FontKey = columnIndex === 2 ? "F2" : "F1";
      const size = columnIndex === 2 ? 6.75 : 6.65;
      page.runs.push({
        x: starts[columnIndex] + 6,
        y: bottom + 7,
        size,
        font,
        text: fitToWidth(value, TABLE_COLUMNS[columnIndex].width - 12, size, font),
        color: NAVY,
      });
    });

    const statusColumnX = starts[5];
    const statusText = row.offsiteUse ? "SIM" : "NÃO";
    const statusWidth = row.offsiteUse ? 28 : 30;
    const statusHeight = 12;
    const statusX = statusColumnX + (TABLE_COLUMNS[5].width - statusWidth) / 2;
    const statusY = bottom + (TABLE_ROW_HEIGHT - statusHeight) / 2;
    const statusFill = row.offsiteUse ? ORANGE_SOFT : STATUS_SOFT;
    const statusColor = row.offsiteUse ? ORANGE : STATUS_OK;
    page.rects.push({ x: statusX, y: statusY, width: statusWidth, height: statusHeight, fill: statusFill });
    page.runs.push({
      x: statusX + (statusWidth - estimateTextWidth(statusText, 6.45, "F2")) / 2,
      y: bottom + 7,
      size: 6.45,
      font: "F2",
      text: statusText,
      color: statusColor,
    });

    y = bottom;
  };

  addTableTitle(false);
  addTableHeader();

  rows.forEach((row, rowIndex) => {
    if (y - TABLE_ROW_HEIGHT < BOTTOM + 8) {
      newPage();
      addTableTitle(true);
      addTableHeader();
    }
    addTableRow(row, rowIndex);
  });

  pages.forEach((page, index) => {
    page.runs.push({
      x: LEFT,
      y: 20,
      size: 7,
      font: "F1",
      text: `Página ${index + 1} de ${pages.length} · Inventário oficial do HUB SM`,
      color: GRAY,
    });
  });

  const blob = buildPdf(pages, logo);
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inventario-notebooks-${stamp}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);

  return { total: rows.length };
}

function addSummaryColumns(runs: PdfRun[], startY: number, rows: InventoryRow[]) {
  const summaries = [
    { title: "Resumo por modelo", values: countBy(rows.map((row) => row.model)) },
    { title: "Resumo por setor", values: countBy(rows.map((row) => row.department)) },
    { title: "Resumo por equipe", values: countBy(rows.map((row) => row.team)) },
  ];
  const usableWidth = PAGE_WIDTH - LEFT * 2;
  const gap = 12;
  const columnWidth = (usableWidth - gap * 2) / 3;

  summaries.forEach((summary, columnIndex) => {
    const x = LEFT + columnIndex * (columnWidth + gap);
    runs.push({ x, y: startY, size: 9.2, font: "F2", text: summary.title, color: ORANGE });
    summary.values.forEach(([name, quantity], index) => {
      runs.push({
        x,
        y: startY - 16 - index * 12,
        size: 7.4,
        font: "F1",
        text: `${quantity}  ${fit(name, 24).trimEnd()}`,
        color: NAVY,
      });
    });
  });
}

async function loadBrandLogo(): Promise<PdfLogo> {
  const response = await fetch("/santa-maria-logo-transparent.png", { cache: "force-cache" });
  if (!response.ok) throw new Error("Logo indisponível");
  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const maxWidth = 360;
  const maxHeight = 180;
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao converter logo")), "image/jpeg", 0.9);
  });
  return {
    bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
    width,
    height,
  };
}

function buildPdf(pages: PdfPage[], logo?: PdfLogo) {
  const objects = new Map<number, string>();
  const catalogId = 1;
  const pagesId = 2;
  const fontNormalId = 3;
  const fontBoldId = 4;
  const fontMonoId = 5;
  const fontMonoBoldId = 6;
  const logoId = logo ? 7 : undefined;

  objects.set(fontNormalId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.set(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.set(fontMonoId, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  objects.set(fontMonoBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>");

  if (logo && logoId) {
    const imageHex = `${bytesToHex(logo.bytes)}>`;
    objects.set(
      logoId,
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${imageHex.length} >>\nstream\n${imageHex}\nendstream`,
    );
  }

  const pageIds: number[] = [];
  let nextId = logo ? 8 : 7;
  pages.forEach((page, pageIndex) => {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);

    let stream = "";
    if (logo && logoId && pageIndex === 0) {
      const boxWidth = 92;
      const boxHeight = 58;
      const scale = Math.min(boxWidth / logo.width, boxHeight / logo.height);
      const drawWidth = logo.width * scale;
      const drawHeight = logo.height * scale;
      const x = PAGE_WIDTH - LEFT - drawWidth;
      const y = PAGE_HEIGHT - 34 - drawHeight;
      stream += `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Logo Do Q\n`;
    }

    stream += page.rects.map(rectToPdf).join("");
    stream += page.lines.map(lineToPdf).join("");
    stream += page.runs.map((run) => {
      const color = run.color ?? NAVY;
      return `BT ${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg /${run.font} ${run.size.toFixed(2)} Tf 1 0 0 1 ${run.x.toFixed(2)} ${run.y.toFixed(2)} Tm <${toWinAnsiHex(run.text)}> Tj ET\n`;
    }).join("");

    objects.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const xObject = logo && logoId && pageIndex === 0 ? ` /XObject << /Logo ${logoId} 0 R >>` : "";
    objects.set(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontNormalId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontMonoId} 0 R /F4 ${fontMonoBoldId} 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`,
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
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
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

function bytesToHex(bytes: Uint8Array) {
  let output = "";
  bytes.forEach((byte) => {
    output += byte.toString(16).padStart(2, "0").toUpperCase();
  });
  return output;
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
    const mapped = WIN_ANSI_MAP[character];
    bytes.push(mapped ?? 0x3f);
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