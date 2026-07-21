import { AppIcon } from "../../../components/AppIcon";
import type { MasterMap, MasterMapSaveStatus } from "../masterMapTypes";
import { masterMapViewModeLabels, type MasterMapViewMode } from "../types/masterMapNavigationTypes";

export function MasterMapNavigationBar({
  maps,
  activeMapId,
  viewMode,
  searchQuery,
  activeFilterCount,
  attentionCount,
  filtersOpen,
  attentionOpen,
  canEdit,
  editMode,
  saveStatus,
  onMapChange,
  onViewModeChange,
  onSearchChange,
  onToggleFilters,
  onToggleAttention,
  onClearNavigation,
  onSearchSubmit,
  onCenter,
  onFullscreen,
  onZoomIn,
  onZoomOut,
  onToggleEditMode,
  onAddNode,
  onAddChildNode,
  onAddQuickSibling,
  onAddQuickChild,
  onOpenBranchText,
  onOpenLayoutPanel,
  onOpenShortcutHelp,
  onUndoLayout,
  onUndoOutline,
  undoLayoutAvailable,
  undoOutlineAvailable,
}: {
  maps: MasterMap[];
  activeMapId: string;
  viewMode: MasterMapViewMode;
  searchQuery: string;
  activeFilterCount: number;
  attentionCount: number;
  filtersOpen: boolean;
  attentionOpen: boolean;
  canEdit: boolean;
  editMode: boolean;
  saveStatus: MasterMapSaveStatus;
  onMapChange: (mapId: string) => void;
  onViewModeChange: (mode: MasterMapViewMode) => void;
  onSearchChange: (query: string) => void;
  onToggleFilters: () => void;
  onToggleAttention: () => void;
  onClearNavigation: () => void;
  onSearchSubmit: () => void;
  onCenter: () => void;
  onFullscreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleEditMode: () => void;
  onAddNode: () => void;
  onAddChildNode: () => void;
  onAddQuickSibling: () => void;
  onAddQuickChild: () => void;
  onOpenBranchText: () => void;
  onOpenLayoutPanel: () => void;
  onOpenShortcutHelp: () => void;
  onUndoLayout: () => void;
  onUndoOutline: () => void;
  undoLayoutAvailable: boolean;
  undoOutlineAvailable: boolean;
}) {
  const saveLabel = saveStatus === "saving" ? "Salvando..." : saveStatus === "saved" ? "Salvo" : saveStatus === "error" ? "Erro ao salvar" : "Pronto";
  const hasNavigationState = Boolean(searchQuery.trim()) || activeFilterCount > 0;

  function renderActionButtons() {
    return (
      <>
        <button className="ghost-button" type="button" onClick={onCenter}>Centralizar</button>
        <button className="ghost-button master-map-zoom-button" type="button" onClick={onZoomOut} aria-label="Diminuir zoom">-</button>
        <button className="ghost-button master-map-zoom-button" type="button" onClick={onZoomIn} aria-label="Aumentar zoom">+</button>
        <button className="secondary-button" type="button" onClick={onFullscreen}><AppIcon name="map" size="sm" className="action-icon" />Tela cheia</button>
        <button className="secondary-button" type="button" disabled={!canEdit} onClick={onOpenLayoutPanel}>
          <AppIcon name="settings" size="sm" className="action-icon" />
          Organizar mapa
        </button>
        {undoLayoutAvailable && (
          <button className="ghost-button" type="button" disabled={!canEdit} onClick={onUndoLayout}>
            Desfazer organizacao
          </button>
        )}
        {undoOutlineAvailable && (
          <button className="ghost-button" type="button" disabled={!canEdit} onClick={onUndoOutline}>
            Desfazer outline
          </button>
        )}
        <button className={editMode ? "primary-button" : "secondary-button"} type="button" disabled={!canEdit} onClick={onToggleEditMode}>
          {editMode ? "Modo edicao" : "Modo visualizacao"}
        </button>
        <button className="ghost-button" type="button" onClick={onOpenShortcutHelp}>Atalhos</button>
        {editMode && (
          <>
            <button className="primary-button" type="button" onClick={onAddQuickSibling}>+ Quadro</button>
            <button className="secondary-button" type="button" onClick={onAddQuickChild}>+ Filho</button>
            <button className="secondary-button" type="button" onClick={onOpenBranchText}>Criar por texto</button>
            <button className="secondary-button" type="button" onClick={onAddNode}><AppIcon name="edit" size="sm" className="action-icon" />Criar no</button>
            <button className="secondary-button" type="button" onClick={onAddChildNode}>Criar filho</button>
          </>
        )}
        <span className={`master-map-save-state master-map-save-${saveStatus}`}>{saveLabel}</span>
      </>
    );
  }

  return (
    <section className="master-map-nav-bar" aria-label="Central de navegacao do Mapa Mestre">
      <div className="master-map-nav-row primary">
        <label>
          Mapa
          <select value={activeMapId} onChange={(event) => onMapChange(event.target.value)}>
            {maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
          </select>
        </label>

        <label>
          Modo
          <select value={viewMode} onChange={(event) => onViewModeChange(event.target.value as MasterMapViewMode)}>
            {(Object.keys(masterMapViewModeLabels) as MasterMapViewMode[]).map((mode) => (
              <option key={mode} value={mode}>{masterMapViewModeLabels[mode]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="master-map-nav-row search">
        <label className="master-map-search-field">
          Buscar quadro
          <input
            data-master-map-search
            aria-label="Buscar quadro no Mapa Mestre"
            placeholder="Buscar por titulo, responsavel, acao..."
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearchSubmit();
            }}
          />
        </label>
        <button className={filtersOpen ? "primary-button" : "secondary-button"} type="button" onClick={onToggleFilters}>
          <AppIcon name="settings" size="sm" className="action-icon" />
          Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        <button className={attentionOpen ? "primary-button" : "secondary-button"} type="button" onClick={onToggleAttention}>
          <AppIcon name="warning" size="sm" className="action-icon" />
          Precisa da minha atencao{attentionCount > 0 ? ` (${attentionCount})` : ""}
        </button>
        <button className="ghost-button" type="button" disabled={!hasNavigationState} onClick={onClearNavigation}>
          Limpar
        </button>
      </div>

      <div className="master-map-nav-row actions">
        {renderActionButtons()}
      </div>

      <details className="master-map-mobile-actions">
        <summary>Acoes do mapa</summary>
        <div className="master-map-nav-row actions">{renderActionButtons()}</div>
      </details>
    </section>
  );
}
