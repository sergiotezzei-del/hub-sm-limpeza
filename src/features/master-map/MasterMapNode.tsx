import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AppIcon } from "../../components/AppIcon";
import type { MasterMapNode as MasterMapNodeRecord, MasterMapStatus, MasterMapTargetScreen } from "./masterMapTypes";

export type MasterMapNodeData = {
  node: MasterMapNodeRecord;
  childrenCount: number;
  editMode: boolean;
  onOpenDetails: (nodeId: string) => void;
  onOpenModule: (targetScreen: MasterMapTargetScreen) => void;
  onToggleCollapse: (nodeId: string) => void;
};

export type MasterMapFlowNode = Node<MasterMapNodeData, "masterMapNode">;

const statusLabels: Record<MasterMapStatus, string> = {
  NOT_STARTED: "Não iniciado",
  IN_PROGRESS: "Em desenvolvimento",
  COMPLETED: "Concluído",
};

export function MasterMapNodeCard({ data, selected }: NodeProps<MasterMapFlowNode>) {
  const { node, childrenCount, editMode, onOpenDetails, onOpenModule, onToggleCollapse } = data;
  const hasChildren = childrenCount > 0;

  return (
    <article className={`master-map-node master-map-node-${node.status.toLowerCase().replace(/_/g, "-")} ${selected ? "selected" : ""}`}>
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
      {node.description && <p>{node.description}</p>}
      <div className="master-map-node-meta">
        {node.responsible && <span>Resp.: {node.responsible}</span>}
        {hasChildren && <span>{childrenCount} item(ns)</span>}
      </div>
      {node.nextAction && <small className="master-map-next-action">Próxima ação: {node.nextAction}</small>}
      <div className="master-map-node-actions nodrag">
        <button className="ghost-button" type="button" onClick={() => onOpenDetails(node.id)}>Detalhes</button>
        {node.targetScreen && <button className="secondary-button" type="button" onClick={() => onOpenModule(node.targetScreen as MasterMapTargetScreen)}>Abrir módulo</button>}
        {hasChildren && <button className="ghost-button" type="button" onClick={() => onToggleCollapse(node.id)}>{node.isCollapsed ? "Abrir ramo" : "Fechar ramo"}</button>}
        {editMode && <span className="master-map-edit-hint">Arraste para mover</span>}
      </div>
      <Handle className="master-map-handle" type="source" position={Position.Right} />
    </article>
  );
}
