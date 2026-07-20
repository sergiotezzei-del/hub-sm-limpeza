import type { DynamicPagePriority } from "../dynamicPageTypes";
export type { DynamicPageSummary } from "../dynamicPageTypes";
import type { MasterMapDestinationType, MasterMapNodeType, MasterMapStatus } from "../masterMapTypes";

export type MasterMapViewMode = "map" | "list" | "focus" | "impact" | "director";

export type MasterMapFilterState = {
  statuses: MasterMapStatus[];
  nodeTypes: MasterMapNodeType[];
  destinationTypes: MasterMapDestinationType[];
  responsible: string;
  withDynamicPage: boolean;
  withoutDynamicPage: boolean;
  highPriority: boolean;
  overdue: boolean;
  withoutResponsible: boolean;
  withoutNextAction: boolean;
  onlyActive: boolean;
};

export const masterMapViewModeLabels: Record<MasterMapViewMode, string> = {
  map: "Mapa",
  list: "Lista",
  focus: "Foco",
  impact: "Impacto",
  director: "Diretoria",
};

export const defaultMasterMapFilters: MasterMapFilterState = {
  statuses: [],
  nodeTypes: [],
  destinationTypes: [],
  responsible: "",
  withDynamicPage: false,
  withoutDynamicPage: false,
  highPriority: false,
  overdue: false,
  withoutResponsible: false,
  withoutNextAction: false,
  onlyActive: true,
};

export function getMasterMapActiveFilterCount(filters: MasterMapFilterState) {
  return [
    filters.statuses.length > 0,
    filters.nodeTypes.length > 0,
    filters.destinationTypes.length > 0,
    Boolean(filters.responsible.trim()),
    filters.withDynamicPage,
    filters.withoutDynamicPage,
    filters.highPriority,
    filters.overdue,
    filters.withoutResponsible,
    filters.withoutNextAction,
    !filters.onlyActive,
  ].filter(Boolean).length;
}
