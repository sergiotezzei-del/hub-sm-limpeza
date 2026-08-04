import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { CleaningOrder, InventoryProduct, OrderItem } from "../../../types";

const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;
const PAGE_MARGIN_TWIPS = 540;
const TABLE_WIDTH_TWIPS = 10740;
const COLUMN_WIDTHS = [2300, 1700, 700, 2640, 1750, 1650] as const;
const BODY_FONT_SIZE = 17;
const HEADER_FONT_SIZE = 17;
const TITLE_FONT_SIZE = 30;

const BORDER = { style: BorderStyle.SINGLE, size: 5, color: "000000" };
const TABLE_BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
};
const CELL_BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
};

type CleaningOrderDocumentRow = {
  id: string;
  productName: string;
  unit: string;
  quantity: string;
  observation: string;
};

export function createCleaningOrderDocument(order: CleaningOrder, catalog: InventoryProduct[]) {
  const rows = buildCleaningOrderDocumentRows(order, catalog);
  const title = `Solicitações de Materiais – ${order.data}`;

  const tableRows = [
    new TableRow({
      height: { value: 620, rule: HeightRule.ATLEAST },
      children: [
        createCell(title, TABLE_WIDTH_TWIPS, {
          bold: true,
          columnSpan: 6,
          fontSize: TITLE_FONT_SIZE,
          alignment: AlignmentType.CENTER,
        }),
      ],
    }),
    new TableRow({
      height: { value: 720, rule: HeightRule.ATLEAST },
      tableHeader: true,
      children: [
        createCell("PRODUTO", COLUMN_WIDTHS[0], { bold: true, fontSize: HEADER_FONT_SIZE }),
        createCell("EMBALAGEM\nUn/Lt/Cx/Fd", COLUMN_WIDTHS[1], { bold: true, fontSize: HEADER_FONT_SIZE }),
        createCell("QTD", COLUMN_WIDTHS[2], { bold: true, fontSize: HEADER_FONT_SIZE }),
        createCell("OBSERVAÇÃO", COLUMN_WIDTHS[3], { bold: true, fontSize: HEADER_FONT_SIZE }),
        createCell("QUANTIDADE\nENTREGUE", COLUMN_WIDTHS[4], { bold: true, fontSize: HEADER_FONT_SIZE }),
        createCell("DATA\nENTREGA", COLUMN_WIDTHS[5], { bold: true, fontSize: HEADER_FONT_SIZE }),
      ],
    }),
    ...rows.map((row) => new TableRow({
      height: { value: 310, rule: HeightRule.ATLEAST },
      children: [
        createCell(row.productName, COLUMN_WIDTHS[0]),
        createCell(row.unit, COLUMN_WIDTHS[1]),
        createCell(row.quantity, COLUMN_WIDTHS[2]),
        createCell(row.observation, COLUMN_WIDTHS[3], { alignment: AlignmentType.LEFT }),
        createCell("", COLUMN_WIDTHS[4]),
        createCell("", COLUMN_WIDTHS[5]),
      ],
    })),
  ];

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: BODY_FONT_SIZE },
          paragraph: { spacing: { before: 0, after: 0, line: 220 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: PAGE_MARGIN_TWIPS,
              right: PAGE_MARGIN_TWIPS,
              bottom: PAGE_MARGIN_TWIPS,
              left: PAGE_MARGIN_TWIPS,
            },
          },
        },
        children: [
          new Table({
            width: { size: TABLE_WIDTH_TWIPS, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            borders: TABLE_BORDERS,
            rows: tableRows,
          }),
        ],
      },
    ],
  });
}

export async function downloadCleaningOrderWord(order: CleaningOrder, catalog: InventoryProduct[]) {
  const document = createCleaningOrderDocument(order, catalog);
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = getCleaningOrderWordFileName(order);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getCleaningOrderWordFileName(order: CleaningOrder) {
  const safeDate = order.data.replace(/\//g, "-");
  return `Pedido Sinval - ${safeDate}.docx`;
}

export function buildCleaningOrderDocumentRows(order: CleaningOrder, catalog: InventoryProduct[]): CleaningOrderDocumentRow[] {
  const matchedItemIds = new Set<string>();
  const orderItemsById = new Map(order.itens.map((item) => [item.id, item]));

  const catalogRows = catalog.map((product) => {
    const requestedItem = orderItemsById.get(product.id)
      ?? order.itens.find((item) => !item.manual && normalizeText(item.productName) === normalizeText(product.name));

    if (requestedItem) matchedItemIds.add(requestedItem.id);

    return {
      id: product.id,
      productName: product.name,
      unit: product.unit,
      quantity: requestedItem ? formatQuantity(requestedItem.quantity) : "",
      observation: requestedItem?.observation?.trim() ?? "",
    };
  });

  const additionalRows = order.itens
    .filter((item) => !matchedItemIds.has(item.id))
    .map(orderItemToDocumentRow);

  return [...catalogRows, ...additionalRows];
}

function orderItemToDocumentRow(item: OrderItem): CleaningOrderDocumentRow {
  return {
    id: item.id,
    productName: item.productName,
    unit: item.unit,
    quantity: formatQuantity(item.quantity),
    observation: item.observation?.trim() ?? "",
  };
}

function createCell(
  text: string,
  width: number,
  options: {
    bold?: boolean;
    columnSpan?: number;
    fontSize?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {},
) {
  const children = text.split("\n").map((line, index) => new TextRun({
    text: line,
    bold: options.bold,
    font: "Arial",
    size: options.fontSize ?? BODY_FONT_SIZE,
    break: index === 0 ? undefined : 1,
  }));

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 20, right: 35, bottom: 20, left: 35 },
    borders: CELL_BORDERS,
    children: [
      new Paragraph({
        alignment: options.alignment ?? AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 220 },
        children,
      }),
    ],
  });
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : String(quantity).replace(".", ",");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
