import { normalizeMasterMapText } from "../graph/masterMapGraphUtils";

export type MasterMapOutlineTextItem = {
  id: string;
  title: string;
  level: number;
  lineNumber: number;
  parentTempId: string | null;
};

export type MasterMapOutlineTextParseResult = {
  items: MasterMapOutlineTextItem[];
  errors: string[];
  warnings: string[];
};

export function parseMasterMapOutlineText(input: string): MasterMapOutlineTextParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rawLines = input.replace(/\r/g, "").split("\n");
  const normalizedLines = rawLines
    .map((line, index) => {
      const leading = line.match(/^[\t ]*/)?.[0] ?? "";
      const indentSize = leading.replace(/\t/g, "    ").length;
      return {
        lineNumber: index + 1,
        indentSize,
        title: line.trim(),
      };
    })
    .filter((line) => line.title.length > 0);

  if (!normalizedLines.length) {
    return { items: [], errors: ["Informe ao menos um titulo."], warnings };
  }

  const positiveIndents = normalizedLines.map((line) => line.indentSize).filter((indent) => indent > 0);
  const indentUnit = positiveIndents.length ? Math.min(...positiveIndents) : 4;
  const items: MasterMapOutlineTextItem[] = [];
  const stack: MasterMapOutlineTextItem[] = [];
  const titleFrequency = new Map<string, number>();

  normalizedLines.forEach((line, index) => {
    if (line.indentSize > 0 && line.indentSize % indentUnit !== 0) {
      errors.push(`Linha ${line.lineNumber}: indentacao irregular.`);
    }

    const level = line.indentSize > 0 ? Math.round(line.indentSize / indentUnit) : 0;
    const previousLevel = index === 0 ? 0 : items[items.length - 1]?.level ?? 0;
    if (level > previousLevel + 1) {
      errors.push(`Linha ${line.lineNumber}: nivel pulou de ${previousLevel} para ${level}.`);
    }

    const normalizedTitle = normalizeMasterMapText(line.title);
    titleFrequency.set(normalizedTitle, (titleFrequency.get(normalizedTitle) ?? 0) + 1);

    const parent = level > 0 ? stack[level - 1] ?? null : null;
    if (level > 0 && !parent) {
      errors.push(`Linha ${line.lineNumber}: item sem pai valido.`);
    }

    const item: MasterMapOutlineTextItem = {
      id: createTempId(),
      title: line.title,
      level,
      lineNumber: line.lineNumber,
      parentTempId: parent?.id ?? null,
    };
    items.push(item);
    stack[level] = item;
    stack.length = level + 1;
  });

  titleFrequency.forEach((count, title) => {
    if (count > 1 && title) warnings.push(`Titulo repetido possivel: "${title}" aparece ${count} vezes.`);
  });

  return { items, errors, warnings };
}

function createTempId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
