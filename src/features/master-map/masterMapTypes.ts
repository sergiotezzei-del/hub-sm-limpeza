import type { AppIconName } from "../../components/AppIcon";

export type MasterMapStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type MasterMapRelationType =
  | "BELONGS_TO"
  | "DEPENDS_ON"
  | "CONNECTS_WITH"
  | "TRIGGERS"
  | "INTEGRATES_WITH";

export type MasterMapNodeType =
  | "root"
  | "module"
  | "submodule"
  | "project"
  | "task"
  | "physical"
  | "integration"
  | "milestone";

export type MasterMapTargetScreen =
  | "cleaning-dashboard"
  | "current-stock"
  | "stock-exit-history"
  | "product-register"
  | "copa-cafe-menu"
  | "security-menu"
  | "security-guards"
  | "security-monitoring"
  | "security-parking"
  | "security-guards-payment"
  | "users-permissions"
  | "system-status"
  | "master-map";

export type MasterMapDestinationType =
  | "NONE"
  | "DYNAMIC_PAGE"
  | "EXISTING_SCREEN"
  | "EXTERNAL_URL"
  | "PLANNED_MODULE";

export type MasterMapHandleSide = "AUTO" | "LEFT" | "RIGHT" | "TOP" | "BOTTOM";
export type MasterMapNodeShape = "RECTANGLE" | "ROUNDED";
export type MasterMapNodeBorderStyle = "SOLID" | "DASHED";
export type MasterMapNodeWidthPreset = "COMPACT" | "STANDARD" | "WIDE";

export type MasterMapNodeVisualStyle = {
  fillColor?: string;
  borderColor?: string;
  shape?: MasterMapNodeShape;
  borderStyle?: MasterMapNodeBorderStyle;
  borderWidth?: 1 | 2 | 3;
  widthPreset?: MasterMapNodeWidthPreset;
  sourcePosition?: MasterMapHandleSide;
  targetPosition?: MasterMapHandleSide;
};

export type MasterMapNodeVisualStyleField = keyof Required<MasterMapNodeVisualStyle>;

export type MasterMap = {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MasterMapNodeMetadata = {
  parentId?: string;
  dependencies?: string[];
  startDate?: string;
  validatedAt?: string;
  pr?: string;
  commit?: string;
  documentUrl?: string;
  evidenceUrl?: string;
  realTest?: string;
  observations?: string;
  visualStyle?: MasterMapNodeVisualStyle;
  outlineOrder?: number;
};

export type MasterMapNode = {
  id: string;
  mapId: string;
  title: string;
  description: string;
  nodeType: MasterMapNodeType;
  iconKey: AppIconName;
  moduleKey?: string;
  status: MasterMapStatus;
  responsible?: string;
  nextAction?: string;
  targetScreen?: MasterMapTargetScreen;
  destinationType: MasterMapDestinationType;
  dynamicPageId?: string;
  externalUrl?: string;
  plannedModuleKey?: string;
  positionX: number;
  positionY: number;
  isCollapsed: boolean;
  isActive: boolean;
  metadata: MasterMapNodeMetadata;
  createdAt: string;
  updatedAt: string;
};

export type MasterMapEdge = {
  id: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: MasterMapRelationType;
  label?: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MasterMapData = {
  maps: MasterMap[];
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  remoteReadable: boolean;
  remoteEditable: boolean;
  message?: string;
};

export type MasterMapSaveStatus = "idle" | "saving" | "saved" | "error";
