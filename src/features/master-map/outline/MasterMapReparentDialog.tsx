import { useEffect, useMemo, useState } from "react";
import { buildMasterMapHierarchy, getMasterMapDescendants } from "../graph/masterMapGraphUtils";
import type { MasterMapEdge, MasterMapNode } from "../masterMapTypes";

export function MasterMapReparentDialog({
  node,
  nodes,
  edges,
  open,
  onClose,
  onSubmit,
}: {
  node: MasterMapNode | null;
  nodes: MasterMapNode[];
  edges: MasterMapEdge[];
  open: boolean;
  onClose: () => void;
  onSubmit: (nodeId: string, newParentId: string | null) => void;
}) {
  const hierarchy = useMemo(() => buildMasterMapHierarchy(nodes, edges), [edges, nodes]);
  const blockedParentIds = useMemo(() => {
    if (!node) return new Set<string>();
    const descendants = getMasterMapDescendants(node.id, nodes, edges);
    return new Set([node.id, ...descendants.map((current) => current.id)]);
  }, [edges, node, nodes]);
  const currentParentId = node ? hierarchy.parentByChild.get(node.id) ?? null : null;
  const [newParentId, setNewParentId] = useState<string>("");

  useEffect(() => {
    if (open) setNewParentId(currentParentId ?? "__root__");
  }, [currentParentId, open]);

  if (!open || !node) return null;

  const resolvedParentId = newParentId === "__root__" ? null : newParentId || currentParentId;
  const currentParent = currentParentId ? nodes.find((current) => current.id === currentParentId) : null;
  const nextParent = resolvedParentId ? nodes.find((current) => current.id === resolvedParentId) : null;
  const validOptions = nodes.filter((current) => current.isActive && !blockedParentIds.has(current.id));

  function submit() {
    if (!node) return;
    if (!window.confirm(`Alterar pai de "${node.title}"?\n\nPai atual: ${currentParent?.title ?? "Sem pai"}\nNovo pai: ${nextParent?.title ?? "Sem pai"}`)) return;
    onSubmit(node.id, resolvedParentId);
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog master-map-reparent-dialog" role="dialog" aria-modal="true" aria-label="Alterar pai hierarquico">
        <div className="master-map-panel-head">
          <div>
            <p className="eyebrow">Outline</p>
            <h2>Alterar pai hierarquico</h2>
            <p>Esta acao muda somente a hierarquia visual. Conexoes operacionais sao preservadas.</p>
          </div>
        </div>

        <dl className="master-map-details-list">
          <div><dt>Quadro</dt><dd>{node.title}</dd></div>
          <div><dt>Pai atual</dt><dd>{currentParent?.title ?? "Sem pai"}</dd></div>
        </dl>

        <label>
          Novo pai
          <select value={newParentId || currentParentId || "__root__"} onChange={(event) => setNewParentId(event.target.value)}>
            <option value="__root__">Sem pai</option>
            {validOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.title}</option>
            ))}
          </select>
        </label>

        <div className="master-map-panel-actions">
          <button className="primary-button" type="button" onClick={submit}>Confirmar alteracao</button>
          <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
