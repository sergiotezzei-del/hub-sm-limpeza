import type {
  MasterMapHandleSide,
  MasterMapNodeBorderStyle,
  MasterMapNodeShape,
  MasterMapNodeVisualStyle,
  MasterMapNodeWidthPreset,
} from "../masterMapTypes";

export const masterMapOfficialPalette = [
  "#ffffff",
  "#fff7ed",
  "#eff6ff",
  "#ecfdf5",
  "#fefce8",
  "#f8fafc",
  "#1f2937",
] as const;

export const defaultMasterMapVisualStyle: Required<MasterMapNodeVisualStyle> = {
  fillColor: "#ffffff",
  borderColor: "#e5eaf1",
  shape: "ROUNDED",
  borderStyle: "SOLID",
  borderWidth: 1,
  widthPreset: "STANDARD",
  sourcePosition: "AUTO",
  targetPosition: "AUTO",
};

export const masterMapHandleSideLabels: Record<MasterMapHandleSide, string> = {
  AUTO: "Automatico",
  LEFT: "Esquerda",
  RIGHT: "Direita",
  TOP: "Topo",
  BOTTOM: "Base",
};

export const masterMapNodeShapeLabels: Record<MasterMapNodeShape, string> = {
  RECTANGLE: "Retangular",
  ROUNDED: "Arredondado",
};

export const masterMapBorderStyleLabels: Record<MasterMapNodeBorderStyle, string> = {
  SOLID: "Solida",
  DASHED: "Tracejada",
};

export const masterMapWidthPresetLabels: Record<MasterMapNodeWidthPreset, string> = {
  COMPACT: "Estreito",
  STANDARD: "Padrao",
  WIDE: "Largo",
};

export function normalizeMasterMapVisualStyle(style?: MasterMapNodeVisualStyle): Required<MasterMapNodeVisualStyle> {
  return {
    fillColor: normalizeHexColor(style?.fillColor, defaultMasterMapVisualStyle.fillColor),
    borderColor: normalizeHexColor(style?.borderColor, defaultMasterMapVisualStyle.borderColor),
    shape: style?.shape === "RECTANGLE" || style?.shape === "ROUNDED" ? style.shape : defaultMasterMapVisualStyle.shape,
    borderStyle: style?.borderStyle === "DASHED" || style?.borderStyle === "SOLID" ? style.borderStyle : defaultMasterMapVisualStyle.borderStyle,
    borderWidth: style?.borderWidth === 2 || style?.borderWidth === 3 ? style.borderWidth : defaultMasterMapVisualStyle.borderWidth,
    widthPreset: style?.widthPreset === "COMPACT" || style?.widthPreset === "WIDE" || style?.widthPreset === "STANDARD"
      ? style.widthPreset
      : defaultMasterMapVisualStyle.widthPreset,
    sourcePosition: isMasterMapHandleSide(style?.sourcePosition) ? style.sourcePosition : defaultMasterMapVisualStyle.sourcePosition,
    targetPosition: isMasterMapHandleSide(style?.targetPosition) ? style.targetPosition : defaultMasterMapVisualStyle.targetPosition,
  };
}

export function mergeMasterMapVisualStylePatch(
  currentStyle: MasterMapNodeVisualStyle | undefined,
  patch: Partial<Required<MasterMapNodeVisualStyle>>,
) {
  return normalizeMasterMapVisualStyle({
    ...normalizeMasterMapVisualStyle(currentStyle),
    ...patch,
  });
}

export function isValidMasterMapHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function getMasterMapNodeWidth(style?: MasterMapNodeVisualStyle, compact = false) {
  const normalized = normalizeMasterMapVisualStyle(style);
  if (normalized.widthPreset === "COMPACT") return compact ? 214 : 226;
  if (normalized.widthPreset === "WIDE") return compact ? 292 : 340;
  return compact ? 226 : 270;
}

export function getMasterMapTextTone(fillColor: string) {
  const color = normalizeHexColor(fillColor, "#ffffff").slice(1);
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.42
    ? { text: "#ffffff", muted: "#e2e8f0", chip: "rgba(255,255,255,0.16)" }
    : { text: "#1f2937", muted: "#475569", chip: "#f1f5f9" };
}

export function normalizeHexColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim();
  return isValidMasterMapHexColor(trimmed) ? trimmed.toLowerCase() : fallback;
}

function isMasterMapHandleSide(value: unknown): value is MasterMapHandleSide {
  return value === "AUTO" || value === "LEFT" || value === "RIGHT" || value === "TOP" || value === "BOTTOM";
}
