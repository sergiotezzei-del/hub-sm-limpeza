import { AppIcon } from "../../components/AppIcon";
import type { MasterMap, MasterMapSaveStatus } from "./masterMapTypes";

export function MasterMapToolbar({
  maps,
  activeMapId,
  canEdit,
  editMode,
  saveStatus,
  onMapChange,
  onToggleEditMode,
  onAddNode,
  onAddChildNode,
  onZoomIn,
  onZoomOut,
  onCenter,
  onFullscreen,
}: {
  maps: MasterMap[];
  activeMapId: string;
  canEdit: boolean;
  editMode: boolean;
  saveStatus: MasterMapSaveStatus;
  onMapChange: (mapId: string) => void;
  onToggleEditMode: () => void;
  onAddNode: () => void;
  onAddChildNode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onFullscreen: () => void;
}) {
  const saveLabel = saveStatus === "saving" ? "Salvando..." : saveStatus === "saved" ? "Salvo" : saveStatus === "error" ? "Erro ao salvar" : "Pronto";

  return (
    <section className="master-map-toolbar" aria-label="Controles do Mapa Mestre">
      <label>
        Mapa
        <select value={activeMapId} onChange={(event) => onMapChange(event.target.value)}>
          {maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
        </select>
      </label>
      <div className="master-map-toolbar-actions">
        <button className="secondary-button" type="button" onClick={onFullscreen}><AppIcon name="map" size="sm" className="action-icon" />Tela cheia</button>
        <button className="ghost-button" type="button" onClick={onCenter}>Centralizar</button>
        <button className="ghost-button master-map-zoom-button" type="button" onClick={onZoomOut} aria-label="Diminuir zoom">-</button>
        <button className="ghost-button master-map-zoom-button" type="button" onClick={onZoomIn} aria-label="Aumentar zoom">+</button>
        <button className={editMode ? "primary-button" : "secondary-button"} type="button" disabled={!canEdit} onClick={onToggleEditMode}>{editMode ? "Modo edição" : "Modo visualização"}</button>
      </div>
      {editMode && (
        <div className="master-map-toolbar-actions">
          <button className="secondary-button" type="button" onClick={onAddNode}><AppIcon name="edit" size="sm" className="action-icon" />Criar nó</button>
          <button className="secondary-button" type="button" onClick={onAddChildNode}>Criar nó filho</button>
        </div>
      )}
      <span className={`master-map-save-state master-map-save-${saveStatus}`}>{saveLabel}</span>
    </section>
  );
}
