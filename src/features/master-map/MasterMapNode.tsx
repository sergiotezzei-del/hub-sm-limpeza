import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { CSSProperties, MouseEvent } from "react";
import { AppIcon } from "../../components/AppIcon";
import type { MasterMapHandleVariant, MasterMapNodeDensity } from "./layout/masterMapLayoutTypes";
import { getMasterMapNodeWidth, getMasterMapTextTone, normalizeMasterMapVisualStyle } from "./layout/masterMapVisualStyle";
import type { MasterMapHandleSide, MasterMapNode as MasterMapNodeRecord, MasterMapStatus, MasterMapTargetScreen } from "./masterMapTypes";

export type MasterMapNodeData = {
  node: MasterMapNodeRecord;
  childrenCount: number;
  editMode: boolean;
  density: MasterMapNodeDensity;
  handleVariant: MasterMapHandleVariant;
  dimmed?: boolean;
  highlighted?: boolean;
  onOpenDetails: (nodeId: string) => void;
  onOpenModule: (targetScreen: MasterMapTargetScreen) => void;
  onOpenDynamicPage: (pageId: string) => void;
  onOpenExternalUrl: (url: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onSelectNode: (nodeId: string, additive?: boolean) => void;
};

export type MasterMapFlowNode = Node<MasterMapNodeData, "masterMapNode">;

const statusLabels: Record<MasterMapStatus, string> = {
  NOT_STARTED: "Nao iniciado",
  IN_PROGRESS: "Em desenvolvimento",
  COMPLETED: "Concluido",
};

export function MasterMapNodeCard({ data, selected }: NodeProps<MasterMapFlowNode>) {
  const { node, childrenCount, editMode, density, handleVariant, dimmed, highlighted, onOpenDetails, onOpenModule, onOpenDynamicPage, onOpenExternalUrl, onToggleCollapse, onSelectNode } = data;
  const hasChildren = childrenCount > 0;
  const hasDynamicPage = node.destinationType === "DYNAMIC_PAGE" && Boolean(node.dynamicPageId);
  const compact = density === "compact";
  const visualStyle = normalizeMasterMapVisualStyle(node.metadata.visualStyle);
  const handlePositions = getHandlePositions(handleVariant, visualStyle.targetPosition, visualStyle.sourcePosition);
  const tone = getMasterMapTextTone(visualStyle.fillColor);
  const nodeStyle = {
    "--master-map-node-fill": visualStyle.fillColor,
    "--master-map-node-border": visualStyle.borderColor,
    "--master-map-node-border-width": `${visualStyle.borderWidth}px`,
    "--master-map-node-border-style": visualStyle.borderStyle.toLowerCase(),
    "--master-map-node-text": tone.text,
    "--master-map-node-muted": tone.muted,
    "--master-map-node-chip": tone.chip,
    width: `${getMasterMapNodeWidth(visualStyle, compact)}px`,
    borderRadius: visualStyle.shape === "RECTANGLE" ? "4px" : "8px",
  } as CSSProperties;

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

  function handleNodeMouseDown(event: MouseEvent<HTMLElement>) {
    if (!editMode || (!event.ctrlKey && !event.metaKey)) return;
    event.stopPropagation();
  }

  function handleNodeClick(event: MouseEvent<HTMLElement>) {
    if (!editMode || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectNode(node.id, true);
  }

  return (
    <article
      className={`master-map-node master-map-node-${node.status.toLowerCase().replace(/_/g, "-")} master-map-node-${density} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${highlighted ? "highlighted" : ""}`}
      style={nodeStyle}
      onClick={handleNodeClick}
      onDoubleClick={handlePrimaryClick}
      onMouseDown={handleNodeMouseDown}
    >
      <Handle className="master-map-handle" type="target" position={handlePositions.target} />
      <div className="master-map-node-head">
        <span className="module-icon-circle" aria-hidden="true">
          <AppIcon name={node.iconKey} size={compact ? "md" : "lg"} className="module-icon" />
        </span>
        <span className="master-map-node-status">
          <span className={`master-map-status-dot status-${node.status.toLowerCase().replace(/_/g, "-")}`} />
          {statusLabels[node.status]}
        </span>
      </div>
      <h3>{node.title}</h3>
      {hasDynamicPage && <span className="master-map-page-indicator">Pagina dinamica</span>}
      {!compact && node.description && <p>{node.description}</p>}
      <div className="master-map-node-meta">
        {!compact && node.responsible && <span>Resp.: {node.responsible}</span>}
        {hasChildren && <span>{childrenCount} item(ns)</span>}
        {!compact && node.destinationType === "PLANNED_MODULE" && <span>Modulo planejado</span>}
      </div>
      {!compact && node.nextAction && <small className="master-map-next-action">Proxima acao: {node.nextAction}</small>}
      {!compact && (
        <div className="master-map-node-actions nodrag nopan">
          {hasDynamicPage && node.dynamicPageId && <button className="secondary-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenDynamicPage(node.dynamicPageId as string))}>Abrir pagina</button>}
          <button className="ghost-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenDetails(node.id))}>Detalhes</button>
          {node.destinationType === "EXISTING_SCREEN" && node.targetScreen && <button className="secondary-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenModule(node.targetScreen as MasterMapTargetScreen))}>Abrir modulo</button>}
          {node.destinationType === "EXTERNAL_URL" && node.externalUrl && <button className="secondary-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onOpenExternalUrl(node.externalUrl as string))}>Abrir link</button>}
          {hasChildren && <button className="ghost-button nodrag nopan" type="button" onClick={(event) => stopNodeAction(event, () => onToggleCollapse(node.id))}>{node.isCollapsed ? "Abrir ramo" : "Fechar ramo"}</button>}
          {editMode && <span className="master-map-edit-hint">Arraste para mover</span>}
        </div>
      )}
      {compact && editMode && <small className="master-map-edit-hint">Arraste para mover</small>}
      <Handle className="master-map-handle" type="source" position={handlePositions.source} />
    </article>
  );
}

function getHandlePositions(variant: MasterMapHandleVariant, targetSide: MasterMapHandleSide, sourceSide: MasterMapHandleSide) {
  const automatic = getAutomaticHandlePositions(variant);
  return {
    target: targetSide === "AUTO" ? automatic.target : getPositionFromSide(targetSide),
    source: sourceSide === "AUTO" ? automatic.source : getPositionFromSide(sourceSide),
  };
}

function getAutomaticHandlePositions(variant: MasterMapHandleVariant) {
  if (variant === "vertical") return { target: Position.Top, source: Position.Bottom };
  if (variant === "mind-left") return { target: Position.Right, source: Position.Left };
  return { target: Position.Left, source: Position.Right };
}

function getPositionFromSide(side: MasterMapHandleSide) {
  if (side === "TOP") return Position.Top;
  if (side === "BOTTOM") return Position.Bottom;
  if (side === "RIGHT") return Position.Right;
  return Position.Left;
}
