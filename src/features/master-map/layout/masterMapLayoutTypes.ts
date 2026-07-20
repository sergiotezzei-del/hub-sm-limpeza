import type { MasterMapEdge, MasterMapNode } from "../masterMapTypes";

export type MasterMapLayoutMode = "manual" | "horizontal" | "vertical" | "mind" | "tree-horizontal" | "tree-vertical";
export type MasterMapLayoutScope = "map" | "branch";
export type MasterMapSpacingPreset = "compact" | "comfortable" | "wide";
export type MasterMapNodeDensity = "compact" | "detailed";
export type MasterMapConnectionMode = "hierarchy" | "operational" | "all";
export type MasterMapHandleVariant = "horizontal" | "vertical" | "mind-left" | "mind-right";
export type MasterMapAlignmentAction =
  | "align-left"
  | "align-center-x"
  | "align-right"
  | "align-top"
  | "align-center-y"
  | "align-bottom"
  | "distribute-x"
  | "distribute-y";

export type MasterMapLayoutPreferences = {
  layoutMode: MasterMapLayoutMode;
  scope: MasterMapLayoutScope;
  spacing: MasterMapSpacingPreset;
  nodeDensity: MasterMapNodeDensity;
  connectionMode: MasterMapConnectionMode;
};

export type MasterMapNodeDimension = {
  id: string;
  width: number;
  height: number;
};

export type MasterMapPositionPatch = {
  id: string;
  positionX: number;
  positionY: number;
};

export type MasterMapLayoutSpacing = {
  nodeGap: number;
  layerGap: number;
  edgeGap: number;
  branchMargin: number;
};

export type MasterMapLayoutInput = {
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  affectedNodeIds: Set<string>;
  dimensions: Map<string, MasterMapNodeDimension>;
  preferences: MasterMapLayoutPreferences;
  anchorNodeId?: string;
};

export type MasterMapLayoutResult = {
  positions: MasterMapPositionPatch[];
  affectedNodeIds: Set<string>;
};

export const masterMapLayoutModeLabels: Record<MasterMapLayoutMode, string> = {
  manual: "Livre / Manual",
  horizontal: "Horizontal",
  vertical: "Vertical",
  mind: "Mapa mental balanceado",
  "tree-horizontal": "Arvore horizontal",
  "tree-vertical": "Arvore vertical",
};

export const masterMapLayoutScopeLabels: Record<MasterMapLayoutScope, string> = {
  map: "Mapa inteiro",
  branch: "Ramificacao selecionada",
};

export const masterMapSpacingLabels: Record<MasterMapSpacingPreset, string> = {
  compact: "Compacto",
  comfortable: "Confortavel",
  wide: "Amplo",
};

export const masterMapNodeDensityLabels: Record<MasterMapNodeDensity, string> = {
  compact: "Compacto",
  detailed: "Detalhado",
};

export const masterMapConnectionModeLabels: Record<MasterMapConnectionMode, string> = {
  hierarchy: "Hierarquia",
  operational: "Operacionais",
  all: "Todas",
};

export const masterMapAlignmentLabels: Record<MasterMapAlignmentAction, string> = {
  "align-left": "Alinhar esquerda",
  "align-center-x": "Centralizar horizontal",
  "align-right": "Alinhar direita",
  "align-top": "Alinhar topo",
  "align-center-y": "Centralizar vertical",
  "align-bottom": "Alinhar base",
  "distribute-x": "Distribuir horizontal",
  "distribute-y": "Distribuir vertical",
};

export const masterMapSpacingPresets: Record<MasterMapSpacingPreset, MasterMapLayoutSpacing> = {
  compact: {
    nodeGap: 34,
    layerGap: 110,
    edgeGap: 18,
    branchMargin: 56,
  },
  comfortable: {
    nodeGap: 64,
    layerGap: 170,
    edgeGap: 28,
    branchMargin: 96,
  },
  wide: {
    nodeGap: 96,
    layerGap: 240,
    edgeGap: 44,
    branchMargin: 140,
  },
};

export const defaultMasterMapLayoutPreferences: MasterMapLayoutPreferences = {
  layoutMode: "manual",
  scope: "map",
  spacing: "comfortable",
  nodeDensity: "detailed",
  connectionMode: "hierarchy",
};

export const defaultMobileMasterMapLayoutPreferences: MasterMapLayoutPreferences = {
  ...defaultMasterMapLayoutPreferences,
  nodeDensity: "compact",
  connectionMode: "hierarchy",
};
