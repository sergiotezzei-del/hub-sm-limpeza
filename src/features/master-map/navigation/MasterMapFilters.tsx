import type { MasterMapDestinationType, MasterMapNodeType, MasterMapStatus } from "../masterMapTypes";
import { masterMapDestinationLabels, masterMapNodeTypeLabels, masterMapStatusLabels } from "../graph/masterMapGraphUtils";
import { defaultMasterMapFilters, type MasterMapFilterState } from "../types/masterMapNavigationTypes";

const statuses: MasterMapStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
const nodeTypes: MasterMapNodeType[] = ["root", "module", "submodule", "project", "task", "physical", "integration", "milestone"];
const destinationTypes: MasterMapDestinationType[] = ["NONE", "DYNAMIC_PAGE", "EXISTING_SCREEN", "EXTERNAL_URL", "PLANNED_MODULE"];

export function MasterMapFilters({
  open,
  filters,
  responsibleOptions,
  onChange,
  onClose,
}: {
  open: boolean;
  filters: MasterMapFilterState;
  responsibleOptions: string[];
  onChange: (filters: MasterMapFilterState) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  function toggleArrayFilter<T extends string>(field: "statuses" | "nodeTypes" | "destinationTypes", value: T) {
    const currentValues = filters[field] as T[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((current) => current !== value)
      : [...currentValues, value];
    onChange({ ...filters, [field]: nextValues });
  }

  return (
    <section className="master-map-filter-panel" aria-label="Filtros do Mapa Mestre">
      <div className="master-map-panel-head">
        <div>
          <p className="eyebrow">Filtros</p>
          <h2>Refinar quadros</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
      </div>

      <div className="master-map-filter-grid">
        <fieldset>
          <legend>Status</legend>
          {statuses.map((status) => (
            <label key={status} className="master-map-check-row">
              <input checked={filters.statuses.includes(status)} type="checkbox" onChange={() => toggleArrayFilter("statuses", status)} />
              {masterMapStatusLabels[status]}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Tipo de quadro</legend>
          {nodeTypes.map((nodeType) => (
            <label key={nodeType} className="master-map-check-row">
              <input checked={filters.nodeTypes.includes(nodeType)} type="checkbox" onChange={() => toggleArrayFilter("nodeTypes", nodeType)} />
              {masterMapNodeTypeLabels[nodeType]}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Destino</legend>
          {destinationTypes.map((destinationType) => (
            <label key={destinationType} className="master-map-check-row">
              <input checked={filters.destinationTypes.includes(destinationType)} type="checkbox" onChange={() => toggleArrayFilter("destinationTypes", destinationType)} />
              {masterMapDestinationLabels[destinationType]}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Situacao</legend>
          <label>Responsavel
            <input
              list="master-map-responsibles"
              placeholder="Todos"
              value={filters.responsible}
              onChange={(event) => onChange({ ...filters, responsible: event.target.value })}
            />
          </label>
          <datalist id="master-map-responsibles">
            {responsibleOptions.map((responsible) => <option key={responsible} value={responsible} />)}
          </datalist>
          <label className="master-map-check-row">
            <input checked={filters.withDynamicPage} type="checkbox" onChange={(event) => onChange({ ...filters, withDynamicPage: event.target.checked, withoutDynamicPage: event.target.checked ? false : filters.withoutDynamicPage })} />
            Com pagina dinamica
          </label>
          <label className="master-map-check-row">
            <input checked={filters.withoutDynamicPage} type="checkbox" onChange={(event) => onChange({ ...filters, withoutDynamicPage: event.target.checked, withDynamicPage: event.target.checked ? false : filters.withDynamicPage })} />
            Sem pagina dinamica
          </label>
          <label className="master-map-check-row">
            <input checked={filters.highPriority} type="checkbox" onChange={(event) => onChange({ ...filters, highPriority: event.target.checked })} />
            Alta prioridade
          </label>
          <label className="master-map-check-row">
            <input checked={filters.overdue} type="checkbox" onChange={(event) => onChange({ ...filters, overdue: event.target.checked })} />
            Prazo vencido
          </label>
          <label className="master-map-check-row">
            <input checked={filters.withoutResponsible} type="checkbox" onChange={(event) => onChange({ ...filters, withoutResponsible: event.target.checked })} />
            Sem responsavel
          </label>
          <label className="master-map-check-row">
            <input checked={filters.withoutNextAction} type="checkbox" onChange={(event) => onChange({ ...filters, withoutNextAction: event.target.checked })} />
            Sem proxima acao
          </label>
          <label className="master-map-check-row">
            <input checked={filters.onlyActive} type="checkbox" onChange={(event) => onChange({ ...filters, onlyActive: event.target.checked })} />
            Somente ativos
          </label>
        </fieldset>
      </div>

      <div className="master-map-panel-actions">
        <button className="secondary-button" type="button" onClick={() => onChange(defaultMasterMapFilters)}>Limpar filtros</button>
        <button className="primary-button" type="button" onClick={onClose}>Aplicar</button>
      </div>
    </section>
  );
}
