import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MouseEvent } from "react";
import { AppIcon } from "../../components/AppIcon";
import type { MasterMapNode as MasterMapNodeRecord, MasterMapStatus, MasterMapTargetScreen } from "./masterMapTypes";

export type MasterMapNodeData = {
  node: MasterMapNodeRecord;
  childrenCount: number;
  editMode: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  onOpenDetails: (nodeId: string) => void;
  onOpenModule: (targetScreen: MasterMapTargetScreen) => void;
  onOpenDynamicPage: (pageId: string) => void;
  onOpenExternalUrl: (url: string) => void;
  onToggleCollapse: (nodeId: string) => void;
};

export type MasterMapFlowNode = Node<MasterMapNodeData, "masterMapNode">;

const statusLabels: Record<MasterMapStatus, string> = {
  NOT_STARTED: "Nao iniciado",
  IN_PROGRESS: "Em desenvolvimento",
  COMPLETED: "Concluido",
};

export function MasterMapNodeCard({ data, selected }: NodeProps<MasterMapFlowNode>) {
  const { node, childrenCount, editMode, dimmed, highlighted, onOpenDetails, onOpenModule, onOpenDynamicPage, onOpenExternalUrl, onToggleCollapse } = data;
  const hasChildren = childrenCount > 0;
  const hasDynamicPage = node.destinationType === "DYNAMIC_PAGE" && Boolean(node.dynamicPageId);

  function handlePrimaryClick() {
    if (hasDynamicPage && node.dynamicPageId) {
      onOpenDynamicPage(node.dynamicPageId);
      return;
    }
    onOpenDetails(node.id);
  }

  function stopNodeAction(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  return (
    <article
      className={`master-map-node master-map-node-${node.status.toLowerCase().replace(/_/g, "-")} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${highlighted ? "highlighted" : ""}`}
      onDoubleClick={handlePrimaryClick}
    >
      <Handle className="master-map-handle" type="target" position={Position.Left} />
      <div className="master-map-node-head">
        <span className="module-icon-circle" aria-hidden="true">
          <AppIcon name={node.iconKey} size="lg" className="module-icon" />
        </span>
        <span className="master-map-node-status">
          <span className={`master-map-status-dot status-${node.status.toLowerCase().replace(/_/g, "-")}`} />
          {statusLabels[node.status]}
        </span>
      </div>
      <h3>{node.title}</h3>
      {hasDynamicPage && <span className="master-map-page-indicator">Pagina dinamica</span>}
      {node.description && <p>{node.description}</p>}
      <div className="master-map-node-meta">
        {node.responsible && <span>Resp.: {node.responsible}</span>}
        {hasChildren && <span>{childrenCount} item(ns)</span>}
        {node.destinationType === "PLANNED_MODULE" && <span>Modulo planejado</span>}
      </div>
      {node.nextAction && <small className="master-map-next-action">Proxima acao: {node.nextAction}</small>}
      <div className="master-map-node-actions nodrag nopan">
        {hasDynamicPage && node.dynamicPageId && <button className="secondary-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenDynamicPage(node.dynamicPageId as string))}>Abrir pagina</button>}
        <button className="ghost-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenDetails(node.id))}>Detalhes</button>
        {node.destinationType === "EXISTING_SCREEN" && node.targetScreen && <button className="secondary-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenModule(node.targetScreen as MasterMapTargetScreen))}>Abrir modulo</button>}
        {node.destinationType === "EXTERNAL_URL" && node.externalUrl && <button className="secondary-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenExternalUrl(node.externalUrl as string))}>Abrir link</button>}
        {hasChildren && <button className="ghost-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onToggleCollapse(node.id))}>{node.isCollapsed ? "Abrir ramo" : "Fechar ramo"}</button>}
        {editMode && <span className="master-map-edit-hint">Arraste para mover</span>}
      </div>
      <Handle className="master-map-handle" type="source" position={Position.Right} />
    </article>
  );
}
