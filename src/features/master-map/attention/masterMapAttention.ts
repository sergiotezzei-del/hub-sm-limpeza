import type { MasterMapNode } from "../masterMapTypes";
import type { DynamicPageSummary } from "../types/masterMapNavigationTypes";
import { createPageSummaryMap, getMasterMapNextAction, getMasterMapResponsible, isMasterMapPageOverdue } from "../graph/masterMapGraphUtils";

export type MasterMapAttentionReason =
  | "OVERDUE"
  | "HIGH_PRIORITY"
  | "IN_PROGRESS_WITHOUT_RESPONSIBLE"
  | "IN_PROGRESS_WITHOUT_NEXT_ACTION"
  | "WITHOUT_RESPONSIBLE"
  | "WITHOUT_NEXT_ACTION"
  | "PLANNED_NOT_STARTED";

export type MasterMapAttentionItem = {
  node: MasterMapNode;
  pageSummary?: DynamicPageSummary;
  reasons: MasterMapAttentionReason[];
};

export const masterMapAttentionReasonLabels: Record<MasterMapAttentionReason, string> = {
  OVERDUE: "Prazo vencido",
  HIGH_PRIORITY: "Alta prioridade",
  IN_PROGRESS_WITHOUT_RESPONSIBLE: "Em andamento sem responsavel",
  IN_PROGRESS_WITHOUT_NEXT_ACTION: "Em andamento sem proxima acao",
  WITHOUT_RESPONSIBLE: "Sem responsavel",
  WITHOUT_NEXT_ACTION: "Sem proxima acao",
  PLANNED_NOT_STARTED: "Modulo planejado nao iniciado",
};

export function getMasterMapAttentionItems(nodes: MasterMapNode[], pageSummaries: DynamicPageSummary[]): MasterMapAttentionItem[] {
  const pageSummaryByNode = createPageSummaryMap(pageSummaries);

  return nodes
    .map((node) => {
      const pageSummary = pageSummaryByNode.get(node.id);
      const reasons: MasterMapAttentionReason[] = [];
      const responsible = getMasterMapResponsible(node, pageSummary);
      const nextAction = getMasterMapNextAction(node, pageSummary);
      const status = pageSummary?.status ?? node.status;

      if (isMasterMapPageOverdue(pageSummary)) reasons.push("OVERDUE");
      if (pageSummary?.priority === "HIGH" && status !== "COMPLETED") reasons.push("HIGH_PRIORITY");
      if (status === "IN_PROGRESS" && !responsible) reasons.push("IN_PROGRESS_WITHOUT_RESPONSIBLE");
      if (status === "IN_PROGRESS" && !nextAction) reasons.push("IN_PROGRESS_WITHOUT_NEXT_ACTION");
      if (!responsible) reasons.push("WITHOUT_RESPONSIBLE");
      if (!nextAction) reasons.push("WITHOUT_NEXT_ACTION");
      if (node.destinationType === "PLANNED_MODULE" && node.status === "NOT_STARTED") reasons.push("PLANNED_NOT_STARTED");

      return { node, pageSummary, reasons };
    })
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => getAttentionWeight(b) - getAttentionWeight(a));
}

function getAttentionWeight(item: MasterMapAttentionItem) {
  let weight = 0;
  if (item.reasons.includes("OVERDUE")) weight += 20;
  if (item.reasons.includes("HIGH_PRIORITY")) weight += 12;
  if (item.node.status === "IN_PROGRESS") weight += 6;
  if (item.node.status === "NOT_STARTED") weight += 2;
  return weight;
}
