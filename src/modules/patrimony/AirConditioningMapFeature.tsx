import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../components/AppIcon";
import "./airConditioningMap.css";

type AirUnit = {
  environment: string;
  group: 1 | 2 | 3 | 4;
  number: number;
};

type GroupFilter = "all" | 1 | 2 | 3 | 4;

const AIR_UNITS: AirUnit[] = [
  { environment: "Ar 0", group: 1, number: 0 },
  { environment: "Ar 1", group: 1, number: 1 },
  { environment: "Ar 2 - Ilha 3", group: 1, number: 2 },
  { environment: "Ar 3 - Ilha 3", group: 1, number: 3 },
  { environment: "Ar 4", group: 1, number: 4 },
  { environment: "Ar 5", group: 1, number: 5 },
  { environment: "Ar 6 - Ilha 3", group: 1, number: 6 },
  { environment: "Ar 7 - Ilha 3", group: 1, number: 7 },
  { environment: "Ar 8", group: 1, number: 8 },
  { environment: "Ar 9", group: 1, number: 9 },
  { environment: "Ar 10", group: 1, number: 10 },
  { environment: "Ar 11", group: 1, number: 11 },
  { environment: "Ar 12", group: 1, number: 12 },
  { environment: "Ar 13", group: 1, number: 13 },
  { environment: "Financeiro", group: 1, number: 14 },

  { environment: "Hall servidor", group: 2, number: 0 },
  { environment: "Hall servidor", group: 2, number: 1 },
  { environment: "Ar 18", group: 2, number: 2 },
  { environment: "Ar TI", group: 2, number: 3 },
  { environment: "Diretoria - ar entrada", group: 2, number: 4 },
  { environment: "Diretoria - ar mesa", group: 2, number: 5 },
  { environment: "Ar 22", group: 2, number: 6 },
  { environment: "Cabine 1", group: 2, number: 7 },
  { environment: "Cabine 2", group: 2, number: 8 },
  { environment: "Cabine 3", group: 2, number: 9 },
  { environment: "Cabine 4", group: 2, number: 10 },
  { environment: "Ar 27", group: 2, number: 11 },
  { environment: "Ar 28", group: 2, number: 12 },

  { environment: "Reunião 3", group: 3, number: 0 },
  { environment: "Reunião 4", group: 3, number: 1 },
  { environment: "Reunião 5", group: 3, number: 2 },
  { environment: "Reunião 2", group: 3, number: 3 },
  { environment: "Reunião 6", group: 3, number: 4 },
  { environment: "Reunião 1", group: 3, number: 5 },
  { environment: "Reunião 7", group: 3, number: 6 },
  { environment: "Recepção 1", group: 3, number: 7 },
  { environment: "Recepção 2", group: 3, number: 8 },
  { environment: "Gourmet 1", group: 3, number: 9 },
  { environment: "Locação 3", group: 3, number: 10 },
  { environment: "Aquário", group: 3, number: 11 },

  { environment: "Locação 1", group: 4, number: 0 },
  { environment: "Locação 2", group: 4, number: 1 },
  { environment: "Locação 4", group: 4, number: 2 },
  { environment: "Auditório - fundo esquerdo", group: 4, number: 3 },
  { environment: "Auditório - frente esquerda", group: 4, number: 4 },
  { environment: "Auditório - frente direita", group: 4, number: 5 },
  { environment: "Auditório - fundo direito", group: 4, number: 6 },
  { environment: "Gourmet 2", group: 4, number: 7 },
  { environment: "Gourmet 3", group: 4, number: 8 },
  { environment: "WC feminino", group: 4, number: 9 },
  { environment: "WC masculino", group: 4, number: 10 },
  { environment: "Refeitório", group: 4, number: 11 },
  { environment: "Cofre 1", group: 4, number: 12 },
  { environment: "Hall cofre", group: 4, number: 13 },
  { environment: "Hall cofre", group: 4, number: 14 },
  { environment: "Cofre 2", group: 4, number: 15 },
];

const GROUPS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

export function AirConditioningMapFeature() {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [tabHost, setTabHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextScreen = document.querySelector<HTMLElement>(".patrimony-screen");
      const nextTabs = nextScreen?.querySelector<HTMLElement>(".patrimony-tabs") ?? null;
      setScreen((current) => current === nextScreen ? current : nextScreen);
      setTabHost((current) => current === nextTabs ? current : nextTabs);
      if (!nextScreen || !nextTabs) setActive(false);
    };

    sync();
    const root = document.getElementById("root");
    if (!root) return () => undefined;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!screen) return () => undefined;
    screen.classList.toggle("air-map-view-active", active);
    return () => screen.classList.remove("air-map-view-active");
  }, [active, screen]);

  useEffect(() => {
    if (!tabHost) return () => undefined;
    const handleOtherTab = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (button && !button.hasAttribute("data-air-map-tab")) setActive(false);
    };
    tabHost.addEventListener("click", handleOtherTab);
    return () => tabHost.removeEventListener("click", handleOtherTab);
  }, [tabHost]);

  return (
    <>
      {tabHost && createPortal(
        <button
          className={active ? "active" : ""}
          data-air-map-tab
          type="button"
          onClick={() => setActive(true)}
        >
          <AppIcon name="map" size="sm" className="action-icon" />
          Mapa do ar
        </button>,
        tabHost,
      )}
      {screen && active && createPortal(<AirConditioningMapPanel />, screen)}
    </>
  );
}

function AirConditioningMapPanel() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");

  const filtered = useMemo(() => {
    const term = normalize(search);
    return AIR_UNITS.filter((unit) => {
      const matchesGroup = groupFilter === "all" || unit.group === groupFilter;
      if (!matchesGroup) return false;
      if (!term) return true;
      const haystack = normalize(`${unit.environment} grupo ${unit.group} g${unit.group} numero ${unit.number} n${unit.number}`);
      return haystack.includes(term);
    });
  }, [groupFilter, search]);

  return (
    <section className="patrimony-panel air-conditioning-map-panel" aria-label="Mapa do ar condicionado">
      <section className="air-map-intro">
        <div>
          <p className="air-map-kicker">CONTROLADORA DAIKIN</p>
          <h2>Mapa do Ar Condicionado</h2>
          <p>Consulta rápida do ambiente, grupo e número de cada aparelho mapeado na controladora.</p>
        </div>
        <div className="air-map-summary" aria-label="Resumo do mapeamento">
          <strong>{AIR_UNITS.length}</strong>
          <span>aparelhos</span>
          <small>4 grupos mapeados</small>
        </div>
      </section>

      <section className="air-map-toolbar" aria-label="Busca e filtros">
        <label className="air-map-search">
          <span>Buscar ambiente, grupo ou número</span>
          <input
            type="search"
            value={search}
            placeholder="Ex.: cofre, diretoria, grupo 4, nº 15"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="air-map-filters" role="group" aria-label="Filtrar por grupo">
          <button className={groupFilter === "all" ? "active" : ""} type="button" onClick={() => setGroupFilter("all")}>Todos</button>
          {GROUPS.map((group) => (
            <button className={groupFilter === group ? "active" : ""} key={group} type="button" onClick={() => setGroupFilter(group)}>
              Grupo {group}
            </button>
          ))}
        </div>
      </section>

      <div className="air-map-result-line">
        <span>{filtered.length} aparelho(s) encontrado(s)</span>
        {(search || groupFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setGroupFilter("all"); }}>Limpar filtros</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <section className="air-map-empty">
          <strong>Nenhum ar encontrado.</strong>
          <span>Tente buscar pelo nome do ambiente, grupo ou número.</span>
        </section>
      ) : (
        GROUPS.map((group) => {
          const units = filtered.filter((unit) => unit.group === group);
          if (units.length === 0) return null;
          return (
            <section className="air-map-group" key={group} aria-labelledby={`air-map-group-${group}`}>
              <header>
                <div>
                  <span className="air-map-group-number">G{group}</span>
                  <div>
                    <h3 id={`air-map-group-${group}`}>Grupo {group}</h3>
                    <small>{units.length} aparelho(s)</small>
                  </div>
                </div>
              </header>
              <div className="air-map-grid">
                {units.map((unit) => (
                  <article className="air-map-card" key={`${unit.group}-${unit.number}`}>
                    <strong>{unit.environment}</strong>
                    <div className="air-map-address">
                      <span><small>GRUPO</small><b>{unit.group}</b></span>
                      <span><small>NÚMERO</small><b>{unit.number}</b></span>
                    </div>
                    <code>G{unit.group} · N{unit.number}</code>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="air-map-footnote">Referência: mapeamento manual realizado aparelho por aparelho pela controladora central.</p>
    </section>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/º/g, "")
    .trim();
}
