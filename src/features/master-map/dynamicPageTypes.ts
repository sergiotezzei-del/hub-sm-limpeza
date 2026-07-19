import type { MasterMapEdge, MasterMapNode, MasterMapStatus } from "./masterMapTypes";

export type DynamicPageType =
  | "PROJECT"
  | "PROCESS"
  | "DECISION"
  | "RISK"
  | "TEST"
  | "EQUIPMENT"
  | "INTEGRATION"
  | "MEETING"
  | "MODULE"
  | "DOCUMENTATION";

export type DynamicPageBlockType =
  | "TEXT"
  | "CHECKLIST"
  | "DECISION"
  | "RISK"
  | "QUESTION"
  | "TEST"
  | "EVIDENCE"
  | "LINK"
  | "NOTE"
  | "WARNING"
  | "METRIC"
  | "NEXT_ACTION";

export type DynamicPagePriority = "LOW" | "MEDIUM" | "HIGH";

export type DynamicPage = {
  id: string;
  mapId: string;
  nodeId: string;
  pageType: DynamicPageType;
  title: string;
  summary: string;
  objective: string;
  status: MasterMapStatus;
  responsible: string;
  priority: DynamicPagePriority;
  startDate?: string;
  dueDate?: string;
  nextAction: string;
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type DynamicPageSummary = {
  id: string;
  mapId: string;
  nodeId: string;
  priority: DynamicPagePriority;
  dueDate?: string;
  status: MasterMapStatus;
  responsible: string;
  nextAction: string;
  updatedAt: string;
};

export type DynamicPageBlockContent = Record<string, unknown>;

export type DynamicPageBlock = {
  id: string;
  pageId: string;
  blockType: DynamicPageBlockType;
  position: number;
  title: string;
  content: DynamicPageBlockContent;
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type DynamicPageTemplate = {
  id: string;
  pageType: DynamicPageType;
  name: string;
  description: string;
  initialBlocks: Array<{
    block_type?: DynamicPageBlockType;
    blockType?: DynamicPageBlockType;
    title?: string;
    content?: DynamicPageBlockContent;
  }>;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DynamicPagePayload = {
  page: DynamicPage;
  blocks: DynamicPageBlock[];
  node?: MasterMapNode;
};

export type DynamicPageCreatePayload = DynamicPagePayload & {
  edge?: MasterMapEdge | null;
};

export const dynamicPageTypeLabels: Record<DynamicPageType, string> = {
  PROJECT: "Projeto",
  PROCESS: "Processo",
  DECISION: "Decisao",
  RISK: "Risco",
  TEST: "Teste",
  EQUIPMENT: "Equipamento",
  INTEGRATION: "Integracao",
  MEETING: "Reuniao",
  MODULE: "Modulo",
  DOCUMENTATION: "Documentacao",
};

export const dynamicPageBlockTypeLabels: Record<DynamicPageBlockType, string> = {
  TEXT: "Texto",
  CHECKLIST: "Checklist",
  DECISION: "Decisao",
  RISK: "Risco",
  QUESTION: "Pergunta",
  TEST: "Teste",
  EVIDENCE: "Evidencia",
  LINK: "Link",
  NOTE: "Nota",
  WARNING: "Aviso",
  METRIC: "Metrica",
  NEXT_ACTION: "Proxima acao",
};

export const dynamicPagePriorityLabels: Record<DynamicPagePriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Media",
  HIGH: "Alta",
};
