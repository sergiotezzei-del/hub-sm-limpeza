import { AppIcon } from "../../../components/AppIcon";
import type { MasterMapNode } from "../masterMapTypes";
import type { MasterMapHandleSide, MasterMapNodeBorderStyle, MasterMapNodeShape, MasterMapNodeVisualStyle, MasterMapNodeVisualStyleField, MasterMapNodeWidthPreset } from "../masterMapTypes";
import {
  masterMapAlignmentLabels,
  masterMapConnectionModeLabels,
  masterMapLayoutModeLabels,
  masterMapLayoutScopeLabels,
  masterMapNodeDensityLabels,
  masterMapSpacingLabels,
  type MasterMapAlignmentAction,
  type MasterMapConnectionMode,
  type MasterMapLayoutMode,
  type MasterMapLayoutPreferences,
  type MasterMapLayoutScope,
  type MasterMapNodeDensity,
  type MasterMapSpacingPreset,
} from "./masterMapLayoutTypes";
import {
  masterMapBorderStyleLabels,
  masterMapHandleSideLabels,
  masterMapNodeShapeLabels,
  masterMapOfficialPalette,
  masterMapWidthPresetLabels,
} from "./masterMapVisualStyle";

export function MasterMapLayoutPanel({
  open,
  preferences,
  selectedNode,
  selectedNodes,
  referenceNodeId,
  visualStyle,
  visualStyleDirtyFields,
  editable,
  calculating,
  previewActive,
  undoAvailable,
  affectedCount,
  collisionCount,
  onChange,
  onReferenceChange,
  onVisualStyleChange,
  onApplyReferenceStyle,
  onClose,
  onPreview,
  onAlignmentPreview,
  onApply,
  onCancelPreview,
  onUndo,
}: {
  open: boolean;
  preferences: MasterMapLayoutPreferences;
  selectedNode: MasterMapNode | null;
  selectedNodes: MasterMapNode[];
  referenceNodeId: string;
  visualStyle: Required<MasterMapNodeVisualStyle>;
  visualStyleDirtyFields: Set<MasterMapNodeVisualStyleField>;
  editable: boolean;
  calculating: boolean;
  previewActive: boolean;
  undoAvailable: boolean;
  affectedCount: number;
  collisionCount: number;
  onChange: (preferences: MasterMapLayoutPreferences) => void;
  onReferenceChange: (nodeId: string) => void;
  onVisualStyleChange: (field: MasterMapNodeVisualStyleField, value: Required<MasterMapNodeVisualStyle>[MasterMapNodeVisualStyleField]) => void;
  onApplyReferenceStyle: () => void;
  onClose: () => void;
  onPreview: () => void;
  onAlignmentPreview: (action: MasterMapAlignmentAction) => void;
  onApply: () => void;
  onCancelPreview: () => void;
  onUndo: () => void;
}) {
  if (!open) return null;

  function update<K extends keyof MasterMapLayoutPreferences>(key: K, value: MasterMapLayoutPreferences[K]) {
    onChange({ ...preferences, [key]: value });
  }

  function updateStyle<K extends MasterMapNodeVisualStyleField>(key: K, value: Required<MasterMapNodeVisualStyle>[K]) {
    onVisualStyleChange(key, value);
  }

  const canAlign = selectedNodes.length >= 2;
  const canDistribute = selectedNodes.length >= 3;

  return (
    <aside className="master-map-layout-panel" aria-label="Organizar mapa">
      <div className="master-map-panel-head">
        <div>
          <p className="eyebrow">Organizacao visual</p>
          <h2>Organizar mapa</h2>
          <p>Escolha um layout, veja a previa e salve apenas quando estiver correto.</p>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
      </div>

      <section className="master-map-layout-section">
        <div>
          <p className="eyebrow">Organizacao</p>
          <h3>Layout do mapa</h3>
        </div>
      </section>

      <div className="master-map-layout-grid">
        <label>
          Layout
          <select
            value={preferences.layoutMode}
            onChange={(event) => update("layoutMode", event.target.value as MasterMapLayoutMode)}
          >
            {(Object.keys(masterMapLayoutModeLabels) as MasterMapLayoutMode[]).map((mode) => (
              <option key={mode} value={mode}>{masterMapLayoutModeLabels[mode]}</option>
            ))}
          </select>
        </label>

        <label>
          Escopo
          <select
            value={preferences.scope}
            onChange={(event) => update("scope", event.target.value as MasterMapLayoutScope)}
          >
            {(Object.keys(masterMapLayoutScopeLabels) as MasterMapLayoutScope[]).map((scope) => (
              <option key={scope} value={scope}>{masterMapLayoutScopeLabels[scope]}</option>
            ))}
          </select>
        </label>

        <label>
          Espacamento
          <select
            value={preferences.spacing}
            onChange={(event) => update("spacing", event.target.value as MasterMapSpacingPreset)}
          >
            {(Object.keys(masterMapSpacingLabels) as MasterMapSpacingPreset[]).map((spacing) => (
              <option key={spacing} value={spacing}>{masterMapSpacingLabels[spacing]}</option>
            ))}
          </select>
        </label>

        <label>
          Cards
          <select
            value={preferences.nodeDensity}
            onChange={(event) => update("nodeDensity", event.target.value as MasterMapNodeDensity)}
          >
            {(Object.keys(masterMapNodeDensityLabels) as MasterMapNodeDensity[]).map((density) => (
              <option key={density} value={density}>{masterMapNodeDensityLabels[density]}</option>
            ))}
          </select>
        </label>

        <label>
          Conexoes
          <select
            value={preferences.connectionMode}
            onChange={(event) => update("connectionMode", event.target.value as MasterMapConnectionMode)}
          >
            {(Object.keys(masterMapConnectionModeLabels) as MasterMapConnectionMode[]).map((mode) => (
              <option key={mode} value={mode}>{masterMapConnectionModeLabels[mode]}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="master-map-layout-section">
        <div>
          <p className="eyebrow">Alinhamento</p>
          <h3>{selectedNodes.length ? `${selectedNodes.length} quadro(s) selecionado(s)` : "Selecione quadros no mapa"}</h3>
          <p className="master-map-muted">Use Ctrl/Cmd + clique nos quadros para selecionar em lote.</p>
        </div>
        <label className="master-map-layout-wide-label">
          Quadro de referencia
          <select
            value={referenceNodeId}
            disabled={!canAlign}
            onChange={(event) => onReferenceChange(event.target.value)}
          >
            {selectedNodes.map((node) => (
              <option key={node.id} value={node.id}>{node.title}</option>
            ))}
          </select>
        </label>
        <div className="master-map-layout-button-grid">
          {(["align-left", "align-center-x", "align-right", "align-top", "align-center-y", "align-bottom"] as MasterMapAlignmentAction[]).map((action) => (
            <button key={action} className="secondary-button" type="button" disabled={!canAlign || calculating || previewActive} onClick={() => onAlignmentPreview(action)}>
              {masterMapAlignmentLabels[action]}
            </button>
          ))}
          <button className="secondary-button" type="button" disabled={!canDistribute || calculating || previewActive} onClick={() => onAlignmentPreview("distribute-x")}>
            {masterMapAlignmentLabels["distribute-x"]}
          </button>
          <button className="secondary-button" type="button" disabled={!canDistribute || calculating || previewActive} onClick={() => onAlignmentPreview("distribute-y")}>
            {masterMapAlignmentLabels["distribute-y"]}
          </button>
        </div>
      </section>

      <section className="master-map-layout-section">
        <div>
          <p className="eyebrow">Quadro</p>
          <h3>Estilo e conectores</h3>
          <p className="master-map-muted">
            {visualStyleDirtyFields.size
              ? `${visualStyleDirtyFields.size} campo(s) alterado(s) nesta sessao. Em lote, somente esses campos serao aplicados.`
              : "Em lote, apenas os campos alterados nesta sessao serao aplicados."}
          </p>
        </div>
        <div className="master-map-color-palette" aria-label="Paleta oficial do HUB SM">
          {masterMapOfficialPalette.map((color) => (
            <button
              key={color}
              className="master-map-color-swatch"
              type="button"
              style={{ background: color }}
              aria-label={`Usar cor ${color}`}
              disabled={!selectedNodes.length || previewActive}
              onClick={() => updateStyle("fillColor", color)}
            />
          ))}
        </div>
        <div className="master-map-layout-grid">
          <label>
            Preenchimento
            <input
              type="text"
              value={visualStyle.fillColor}
              disabled={!selectedNodes.length || previewActive}
              onChange={(event) => updateStyle("fillColor", event.target.value)}
            />
          </label>
          <label>
            Borda
            <input
              type="text"
              value={visualStyle.borderColor}
              disabled={!selectedNodes.length || previewActive}
              onChange={(event) => updateStyle("borderColor", event.target.value)}
            />
          </label>
          <label>
            Formato
            <select value={visualStyle.shape} disabled={!selectedNodes.length || previewActive} onChange={(event) => updateStyle("shape", event.target.value as MasterMapNodeShape)}>
              {(Object.keys(masterMapNodeShapeLabels) as MasterMapNodeShape[]).map((shape) => <option key={shape} value={shape}>{masterMapNodeShapeLabels[shape]}</option>)}
            </select>
          </label>
          <label>
            Estilo da borda
            <select value={visualStyle.borderStyle} disabled={!selectedNodes.length || previewActive} onChange={(event) => updateStyle("borderStyle", event.target.value as MasterMapNodeBorderStyle)}>
              {(Object.keys(masterMapBorderStyleLabels) as MasterMapNodeBorderStyle[]).map((style) => <option key={style} value={style}>{masterMapBorderStyleLabels[style]}</option>)}
            </select>
          </label>
          <label>
            Espessura
            <select value={String(visualStyle.borderWidth)} disabled={!selectedNodes.length || previewActive} onChange={(event) => updateStyle("borderWidth", Number(event.target.value) as 1 | 2 | 3)}>
              <option value="1">1 px</option>
              <option value="2">2 px</option>
              <option value="3">3 px</option>
            </select>
          </label>
          <label>
            Largura
            <select value={visualStyle.widthPreset} disabled={!selectedNodes.length || previewActive} onChange={(event) => updateStyle("widthPreset", event.target.value as MasterMapNodeWidthPreset)}>
              {(Object.keys(masterMapWidthPresetLabels) as MasterMapNodeWidthPreset[]).map((preset) => <option key={preset} value={preset}>{masterMapWidthPresetLabels[preset]}</option>)}
            </select>
          </label>
          <label>
            Saida da linha
            <select value={visualStyle.sourcePosition} disabled={!selectedNodes.length || previewActive} onChange={(event) => updateStyle("sourcePosition", event.target.value as MasterMapHandleSide)}>
              {(Object.keys(masterMapHandleSideLabels) as MasterMapHandleSide[]).map((side) => <option key={side} value={side}>{masterMapHandleSideLabels[side]}</option>)}
            </select>
          </label>
          <label>
            Entrada da linha
            <select value={visualStyle.targetPosition} disabled={!selectedNodes.length || previewActive} onChange={(event) => updateStyle("targetPosition", event.target.value as MasterMapHandleSide)}>
              {(Object.keys(masterMapHandleSideLabels) as MasterMapHandleSide[]).map((side) => <option key={side} value={side}>{masterMapHandleSideLabels[side]}</option>)}
            </select>
          </label>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={!selectedNodes.length || previewActive || calculating}
          onClick={onApplyReferenceStyle}
        >
          Aplicar estilo completo do quadro de referencia
        </button>
        <p className="master-map-muted">Use Pre-visualizar para testar estilo e handles. Nada e salvo antes de Aplicar e salvar.</p>
      </section>

      <div className="master-map-layout-help">
        <p><strong>Previa:</strong> move os cards somente na tela, sem gravar no Supabase.</p>
        <p><strong>Aplicar e salvar:</strong> grava as posicoes dos {affectedCount || "nos"} afetados em lote.</p>
        {preferences.scope === "branch" && (
          <p>{selectedNode ? `Ramificacao selecionada: ${selectedNode.title}` : "Selecione um quadro antes de organizar uma ramificacao."}</p>
        )}
        {collisionCount > 0 && <p className="error">Foram detectadas {collisionCount} sobreposicoes. Ajuste o espacamento antes de salvar.</p>}
      </div>

      <div className="master-map-layout-actions">
        <button className="secondary-button" type="button" disabled={calculating} onClick={onPreview}>
          <AppIcon name="map" size="sm" className="action-icon" />
          {calculating ? "Calculando organizacao..." : "Pre-visualizar"}
        </button>
        <button className="primary-button" type="button" disabled={!editable || !previewActive || collisionCount > 0 || calculating} onClick={onApply}>
          Aplicar e salvar
        </button>
        <button className="ghost-button" type="button" disabled={!previewActive || calculating} onClick={onCancelPreview}>
          Cancelar
        </button>
        <button className="ghost-button" type="button" disabled={!editable || !undoAvailable || calculating} onClick={onUndo}>
          Desfazer ultima organizacao
        </button>
      </div>
    </aside>
  );
}
