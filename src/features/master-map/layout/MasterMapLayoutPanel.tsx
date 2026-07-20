import { AppIcon } from "../../../components/AppIcon";
import type { MasterMapNode } from "../masterMapTypes";
import {
  masterMapConnectionModeLabels,
  masterMapLayoutModeLabels,
  masterMapLayoutScopeLabels,
  masterMapNodeDensityLabels,
  masterMapSpacingLabels,
  type MasterMapConnectionMode,
  type MasterMapLayoutMode,
  type MasterMapLayoutPreferences,
  type MasterMapLayoutScope,
  type MasterMapNodeDensity,
  type MasterMapSpacingPreset,
} from "./masterMapLayoutTypes";

export function MasterMapLayoutPanel({
  open,
  preferences,
  selectedNode,
  editable,
  calculating,
  previewActive,
  undoAvailable,
  affectedCount,
  collisionCount,
  onChange,
  onClose,
  onPreview,
  onApply,
  onCancelPreview,
  onUndo,
}: {
  open: boolean;
  preferences: MasterMapLayoutPreferences;
  selectedNode: MasterMapNode | null;
  editable: boolean;
  calculating: boolean;
  previewActive: boolean;
  undoAvailable: boolean;
  affectedCount: number;
  collisionCount: number;
  onChange: (preferences: MasterMapLayoutPreferences) => void;
  onClose: () => void;
  onPreview: () => void;
  onApply: () => void;
  onCancelPreview: () => void;
  onUndo: () => void;
}) {
  if (!open) return null;

  function update<K extends keyof MasterMapLayoutPreferences>(key: K, value: MasterMapLayoutPreferences[K]) {
    onChange({ ...preferences, [key]: value });
  }

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
