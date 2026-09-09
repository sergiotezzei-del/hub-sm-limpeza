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

type FontKey = "F1" | "F2" | "F3" | "F4";
type PdfColor = [number, number, number];
type PdfRun = { x: number; y: number; size: number; font: FontKey; text: string; color?: PdfColor };
type PdfPage = { runs: PdfRun[] };
type PdfLogo = { bytes: Uint8Array; width: number; height: number };
type InventoryRow = {
  code: string;
  model: string;
  person: string;
  department: string;
  team: string;
  offsiteUse: boolean;
};

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

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

  const pages: PdfPage[] = [{ runs: [] }];
  let pageIndex = 0;
  let y = TOP;

  const currentPage = () => pages[pageIndex];
  const newPage = () => {
    pages.push({ runs: [] });
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
  const addSection = (title: string) => {
    y -= 6;
    add(title, { size: 11, font: "F2", gap: 16, color: NAVY });
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

  ensureSpace(75);
  addSection("Levantamento completo");
  const header = [
    fit("Patrim.", 8),
    fit("Modelo", 20),
    fit("Pessoa", 23),
    fit("Setor", 15),
    fit("Equipe", 18),
    fit("Fora prédio", 12),
  ].join(" | ");
  const divider = "-".repeat(header.length);

  const addTableHeader = () => {
    add(header, { size: 6.4, font: "F4", gap: 10, color: NAVY });
    add(divider, { size: 6.4, font: "F3", gap: 9, color: GRAY });
  };

  addTableHeader();
  rows.forEach((row) => {
    if (y - 12 < BOTTOM) {
      newPage();
      add("RELATÓRIO DO INVENTÁRIO DE NOTEBOOKS - continuação", { size: 9, font: "F2", gap: 15, color: NAVY });
      addTableHeader();
    }
    const line = [
      fit(row.code, 8),
      fit(row.model, 20),
      fit(row.person, 23),
      fit(row.department, 15),
      fit(row.team, 18),
      fit(row.offsiteUse ? "Sim" : "Não", 12),
    ].join(" | ");
    add(line, { size: 6.4, font: "F3", gap: 10, color: NAVY });
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
