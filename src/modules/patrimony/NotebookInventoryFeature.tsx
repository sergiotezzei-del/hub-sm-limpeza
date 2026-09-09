import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  authenticatedSupabaseFetch,
  SUPABASE_URL,
} from "../security/services/supabaseClient";
import {
  assignPatrimonyItem,
  getPatrimonyErrorMessage,
  loadPatrimonyDataset,
  savePatrimonyItem,
} from "./services/patrimonyService";
import type {
  OrganizationPerson,
  PatrimonyAssignment,
  PatrimonyDataset,
  PatrimonyItem,
  PatrimonyPersonType,
} from "./types/patrimony.types";
import "./notebookInventory.css";

const EMPTY_DATASET: PatrimonyDataset = {
  people: [],
  items: [],
  assignments: [],
  spaces: [],
  spaceAssignments: [],
  movements: [],
};

type InventoryPerson = OrganizationPerson & { teamName?: string };
type TeamRow = { id: string; team_name: string | null };
type ModalMode = "person" | "notebook" | "assign" | null;

type PersonDraft = {
  name: string;
  personType: PatrimonyPersonType;
  department: string;
  teamName: string;
  jobTitle: string;
};

type NotebookDraft = {
  code: string;
  brand: string;
  model: string;
  serialNumber: string;
  processor: string;
  ram: string;
  storage: string;
  notes: string;
  personId: string;
};

const emptyPerson = (): PersonDraft => ({
  name: "",
  personType: "funcionario",
  department: "",
  teamName: "",
  jobTitle: "",
});

const emptyNotebook = (): NotebookDraft => ({
  code: "",
  brand: "",
  model: "",
  serialNumber: "",
  processor: "",
  ram: "",
  storage: "",
  notes: "",
  personId: "",
});

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function openQuantity(assignment: PatrimonyAssignment) {
  return Math.max(0, assignment.quantity - assignment.returnedQuantity);
}

function getActorName() {
  try {
    const raw = window.sessionStorage.getItem("hub-sm-active-session");
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.name ?? parsed?.userName ?? "Admin Tezzei");
  } catch {
    return "Admin Tezzei";
  }
}

function isNotebook(item: PatrimonyItem) {
  const text = normalize(`${item.category} ${item.name}`);
  return text.includes("notebook") || text.includes("laptop");
}

function notebookDescription(item: PatrimonyItem) {
  return [item.brand, item.model].filter(Boolean).join(" ") || item.name;
}

function inventoryNotes(draft: NotebookDraft) {
  const details = [
    draft.processor && `Processador: ${draft.processor.trim()}`,
    draft.ram && `RAM: ${draft.ram.trim()}`,
    draft.storage && `Armazenamento: ${draft.storage.trim()}`,
    draft.notes.trim(),
  ].filter(Boolean);
  return details.join(" | ");
}

async function loadTeamMap() {
  const response = await authenticatedSupabaseFetch(
    `${SUPABASE_URL}/rest/v1/organization_people?select=id,team_name`,
    { headers: { "Content-Type": "application/json" } },
  );
  if (!response.ok) throw new Error("Não foi possível carregar as equipes do inventário.");
  const rows = await response.json() as TeamRow[];
  return new Map(rows.map((row) => [row.id, row.team_name ?? ""]));
}

async function saveInventoryPerson(draft: PersonDraft) {
  const id = crypto.randomUUID();
  const response = await authenticatedSupabaseFetch(
    `${SUPABASE_URL}/rest/v1/organization_people?on_conflict=id`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([{
        id,
        name: draft.name.trim(),
        person_type: draft.personType,
        department: draft.department.trim(),
        team_name: draft.teamName.trim() || null,
        job_title: draft.jobTitle.trim() || null,
        active: true,
      }]),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Não foi possível cadastrar a pessoa.");
  }
  return id;
}

export function NotebookInventoryFeature() {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [tabs, setTabs] = useState<HTMLElement | null>(null);
  const [sourceButton, setSourceButton] = useState<HTMLButtonElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [dataset, setDataset] = useState<PatrimonyDataset>(EMPTY_DATASET);
  const [people, setPeople] = useState<InventoryPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [modal, setModal] = useState<ModalMode>(null);
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPerson);
  const [notebookDraft, setNotebookDraft] = useState<NotebookDraft>(emptyNotebook);
  const [assignItemId, setAssignItemId] = useState("");
  const [assignPersonId, setAssignPersonId] = useState("");

  useEffect(() => {
    const sync = () => {
      const nextScreen = document.querySelector<HTMLElement>(".patrimony-screen");
      const nextTabs = nextScreen?.querySelector<HTMLElement>(".patrimony-tabs") ?? null;
      const nextSource = nextTabs
        ? Array.from(nextTabs.querySelectorAll<HTMLButtonElement>("button")).find((button) => normalize(button.textContent ?? "").includes("cadastros e historico")) ?? null
        : null;
      setScreen((current) => current === nextScreen ? current : nextScreen);
      setTabs((current) => current === nextTabs ? current : nextTabs);
      setSourceButton((current) => current === nextSource ? current : nextSource);
      if (!nextScreen || !nextTabs || !nextSource) setActive(false);
    };

    sync();
    const root = document.getElementById("root");
    if (!root) return () => undefined;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!screen || !tabs) {
      setHost(null);
      return () => undefined;
    }
    const element = document.createElement("div");
    element.className = "notebook-inventory-host";
    tabs.insertAdjacentElement("afterend", element);
    setHost(element);
    return () => {
      element.remove();
      setHost(null);
    };
  }, [screen, tabs]);

  useEffect(() => {
    if (!screen || !host) return () => undefined;
    const siblings = Array.from(screen.children) as HTMLElement[];
    siblings.forEach((element) => {
      if (element === host || element === tabs) return;
      if (active && tabs && tabs.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
        element.classList.add("notebook-inventory-native-hidden");
      } else {
        element.classList.remove("notebook-inventory-native-hidden");
      }
    });
    return () => siblings.forEach((element) => element.classList.remove("notebook-inventory-native-hidden"));
  }, [active, host, screen, tabs]);

  useEffect(() => {
    if (!tabs) return () => undefined;
    const handleClick = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (!button || button.hasAttribute("data-notebook-inventory-tab")) return;
      setActive(false);
    };
    tabs.addEventListener("click", handleClick);
    return () => tabs.removeEventListener("click", handleClick);
  }, [tabs]);

  useEffect(() => {
    if (active) void refresh();
  }, [active]);

  const notebookItems = useMemo(
    () => dataset.items.filter((item) => item.active && item.trackingMode === "individual" && isNotebook(item)),
    [dataset.items],
  );
  const activeAssignments = useMemo(
    () => dataset.assignments.filter((assignment) => openQuantity(assignment) > 0),
    [dataset.assignments],
  );
  const notebookAssignmentByItem = useMemo(() => {
    const ids = new Set(notebookItems.map((item) => item.id));
    return new Map(activeAssignments.filter((assignment) => ids.has(assignment.itemId)).map((assignment) => [assignment.itemId, assignment]));
  }, [activeAssignments, notebookItems]);
  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const itemById = useMemo(() => new Map(notebookItems.map((item) => [item.id, item])), [notebookItems]);

  const departments = useMemo(
    () => Array.from(new Set(people.filter((person) => person.active).map((person) => person.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [people],
  );
  const teams = useMemo(
    () => Array.from(new Set(people.filter((person) => person.active).map((person) => person.teamName ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [people],
  );

  const filteredNotebooks = useMemo(() => {
    const term = normalize(search);
    return notebookItems.filter((item) => {
      const assignment = notebookAssignmentByItem.get(item.id);
      const person = assignment ? personById.get(assignment.personId) : undefined;
      const matchesDepartment = departmentFilter === "all" || person?.department === departmentFilter;
      const matchesTeam = teamFilter === "all" || person?.teamName === teamFilter;
      const haystack = normalize(`${item.code} ${item.brand ?? ""} ${item.model ?? ""} ${item.serialNumber ?? ""} ${person?.name ?? ""} ${person?.department ?? ""} ${person?.teamName ?? ""}`);
      return matchesDepartment && matchesTeam && (!term || haystack.includes(term));
    }).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
  }, [departmentFilter, notebookAssignmentByItem, notebookItems, personById, search, teamFilter]);

  const peopleWithNotebook = useMemo(
    () => new Set(Array.from(notebookAssignmentByItem.values()).map((assignment) => assignment.personId)),
    [notebookAssignmentByItem],
  );
  const peopleWithoutNotebook = useMemo(
    () => people.filter((person) => person.active && !peopleWithNotebook.has(person.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [people, peopleWithNotebook],
  );

  const modelCount = useMemo(() => new Set(notebookItems.map((item) => normalize(`${item.brand ?? ""} ${item.model ?? ""}`)).filter(Boolean)).size, [notebookItems]);

  const teamSummary = useMemo(() => {
    const counts = new Map<string, number>();
    notebookItems.forEach((item) => {
      const assignment = notebookAssignmentByItem.get(item.id);
      const person = assignment ? personById.get(assignment.personId) : undefined;
      const label = person?.teamName || person?.department || "Sem responsável";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }, [notebookAssignmentByItem, notebookItems, personById]);

  async function refresh() {
    setLoading(true);
    setNotice("");
    try {
      const [nextDataset, teamMap] = await Promise.all([loadPatrimonyDataset(), loadTeamMap()]);
      setDataset(nextDataset);
      setPeople(nextDataset.people.map((person) => ({ ...person, teamName: teamMap.get(person.id) || undefined })));
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function nextNotebookCode() {
    const numericCodes = notebookItems
      .map((item) => item.code.match(/^NB-(\d+)$/i)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .filter(Number.isFinite);
    const next = numericCodes.length ? Math.max(...numericCodes) + 1 : notebookItems.length + 1;
    return `NB-${String(next).padStart(3, "0")}`;
  }

  function openFeature() {
    sourceButton?.click();
    setActive(true);
  }

  function openNotebook() {
    setNotebookDraft({ ...emptyNotebook(), code: nextNotebookCode() });
    setModal("notebook");
  }

  function openAssign(itemId: string) {
    setAssignItemId(itemId);
    setAssignPersonId("");
    setModal("assign");
  }

  async function handleSavePerson(event: FormEvent) {
    event.preventDefault();
    if (busy || !personDraft.name.trim() || !personDraft.department.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      await saveInventoryPerson(personDraft);
      setPersonDraft(emptyPerson());
      setModal(null);
      setNotice("Pessoa cadastrada para o inventário.");
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNotebook(event: FormEvent) {
    event.preventDefault();
    if (busy || !notebookDraft.code.trim() || !notebookDraft.brand.trim() || !notebookDraft.model.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await savePatrimonyItem({
        code: notebookDraft.code,
        name: "Notebook",
        category: "Notebook",
        trackingMode: "individual",
        brand: notebookDraft.brand,
        model: notebookDraft.model,
        serialNumber: notebookDraft.serialNumber,
        unit: "Unidade",
        totalQuantity: 1,
        notes: inventoryNotes(notebookDraft),
        active: true,
      });
      if (notebookDraft.personId) {
        await assignPatrimonyItem({
          itemId: saved.id,
          personId: notebookDraft.personId,
          quantity: 1,
          actorName: getActorName(),
          notes: "Vínculo realizado durante o inventário de notebooks.",
        });
      }
      setNotebookDraft(emptyNotebook());
      setModal(null);
      setNotice(`${saved.code} inventariado${notebookDraft.personId ? " e vinculado ao responsável" : " como disponível"}.`);
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (busy || !assignItemId || !assignPersonId) return;
    setBusy(true);
    setNotice("");
    try {
      await assignPatrimonyItem({
        itemId: assignItemId,
        personId: assignPersonId,
        quantity: 1,
        actorName: getActorName(),
        notes: "Vínculo realizado pelo inventário de notebooks.",
      });
      const item = itemById.get(assignItemId);
      const person = personById.get(assignPersonId);
      setModal(null);
      setNotice(`${item?.code ?? "Notebook"} vinculado a ${person?.name ?? "responsável"}.`);
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!tabs || !sourceButton) return null;

  const tab = createPortal(
    <button
      className={active ? "active" : ""}
      data-notebook-inventory-tab="true"
      type="button"
      onClick={openFeature}
    >
      Inventário de notebooks
    </button>,
    tabs,
  );

  if (!host) return tab;

  const content = active ? createPortal(
    <section className="notebook-inventory-page">
      <header className="notebook-inventory-head">
        <div>
          <p>PATRIMÔNIO · TI</p>
          <h2>Inventário de Notebooks</h2>
          <span>Quantidade exata por equipamento, responsável, setor, equipe e modelo.</span>
        </div>
        <div className="notebook-inventory-actions">
          <button type="button" onClick={() => { setPersonDraft(emptyPerson()); setModal("person"); }}>+ Pessoa</button>
          <button className="primary" type="button" onClick={openNotebook}>+ Inventariar notebook</button>
        </div>
      </header>

      {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}

      <div className="notebook-inventory-stats">
        <article><strong>{notebookItems.length}</strong><span>Notebooks inventariados</span></article>
        <article><strong>{notebookAssignmentByItem.size}</strong><span>Com responsável</span></article>
        <article><strong>{notebookItems.length - notebookAssignmentByItem.size}</strong><span>Sem responsável / reserva</span></article>
        <article><strong>{modelCount}</strong><span>Modelos diferentes</span></article>
      </div>

      <div className="notebook-inventory-toolbar">
        <label className="grow">
          <span>Buscar</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patrimônio, modelo, série, pessoa ou equipe" />
        </label>
        <label>
          <span>Setor</span>
          <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
            <option value="all">Todos</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </label>
        <label>
          <span>Equipe</span>
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="all">Todas</option>
            {teams.map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { void refresh(); }} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
      </div>

      {teamSummary.length > 0 && (
        <section className="notebook-team-summary">
          <h3>Quantidade por equipe</h3>
          <div>{teamSummary.map(([team, count]) => <span key={team}><b>{count}</b> {team}</span>)}</div>
        </section>
      )}

      <section className="notebook-inventory-list-section">
        <div className="notebook-section-title">
          <h3>Notebooks</h3>
          <small>{filteredNotebooks.length} exibido(s)</small>
        </div>
        <div className="notebook-inventory-list">
          {filteredNotebooks.length === 0 && !loading && (
            <div className="notebook-inventory-empty">Nenhum notebook encontrado com os filtros atuais.</div>
          )}
          {filteredNotebooks.map((item) => {
            const assignment = notebookAssignmentByItem.get(item.id);
            const person = assignment ? personById.get(assignment.personId) : undefined;
            return (
              <article className="notebook-card" key={item.id}>
                <div className="notebook-card-main">
                  <span className="notebook-code">{item.code}</span>
                  <div>
                    <h4>{notebookDescription(item)}</h4>
                    <p>Série: {item.serialNumber || "não informada"}</p>
                  </div>
                </div>
                <div className="notebook-card-owner">
                  <small>Responsável</small>
                  <strong>{person?.name || "Sem responsável"}</strong>
                  <span>{person ? `${person.department}${person.teamName ? ` · ${person.teamName}` : ""}` : "Disponível / reserva"}</span>
                </div>
                <div className="notebook-card-status">
                  <span className={person ? "assigned" : "available"}>{person ? "EM USO" : item.status === "disponivel" ? "DISPONÍVEL" : item.status.toUpperCase()}</span>
                  {!person && item.status === "disponivel" && <button type="button" onClick={() => openAssign(item.id)}>Vincular</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="notebook-without-owner-section">
        <div className="notebook-section-title">
          <h3>Pessoas cadastradas sem notebook</h3>
          <small>{peopleWithoutNotebook.length}</small>
        </div>
        <div className="notebook-people-chips">
          {peopleWithoutNotebook.slice(0, 60).map((person) => (
            <span key={person.id}>{person.name}<small>{person.department}{person.teamName ? ` · ${person.teamName}` : ""}</small></span>
          ))}
          {peopleWithoutNotebook.length === 0 && <p>Nenhuma pessoa pendente.</p>}
        </div>
      </section>
    </section>,
    host,
  ) : null;

  const modalPortal = modal ? createPortal(
    <div className="notebook-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null); }}>
      <div className="notebook-modal" role="dialog" aria-modal="true">
        {modal === "person" && (
          <form onSubmit={handleSavePerson}>
            <header><h3>Cadastrar pessoa</h3><button type="button" onClick={() => setModal(null)} disabled={busy}>×</button></header>
            <label>Nome<input required value={personDraft.name} onChange={(event) => setPersonDraft({ ...personDraft, name: event.target.value })} /></label>
            <label>Tipo<select value={personDraft.personType} onChange={(event) => setPersonDraft({ ...personDraft, personType: event.target.value as PatrimonyPersonType })}><option value="funcionario">Funcionário</option><option value="corretor_terceirizado">Corretor</option><option value="consultor_terceirizado">Consultor</option><option value="outro">Outro</option></select></label>
            <label>Setor<input required value={personDraft.department} onChange={(event) => setPersonDraft({ ...personDraft, department: event.target.value })} placeholder="Ex.: Vendas, Locação, Contratos" /></label>
            <label>Equipe<input value={personDraft.teamName} onChange={(event) => setPersonDraft({ ...personDraft, teamName: event.target.value })} placeholder="Ex.: Equipe Fernando" /></label>
            <label>Função<input value={personDraft.jobTitle} onChange={(event) => setPersonDraft({ ...personDraft, jobTitle: event.target.value })} placeholder="Ex.: Corretor de vendas" /></label>
            <footer><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancelar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar pessoa"}</button></footer>
          </form>
        )}

        {modal === "notebook" && (
          <form onSubmit={handleSaveNotebook}>
            <header><h3>Inventariar notebook</h3><button type="button" onClick={() => setModal(null)} disabled={busy}>×</button></header>
            <div className="notebook-modal-grid">
              <label>Código patrimonial<input required value={notebookDraft.code} onChange={(event) => setNotebookDraft({ ...notebookDraft, code: event.target.value })} /></label>
              <label>Marca<input required value={notebookDraft.brand} onChange={(event) => setNotebookDraft({ ...notebookDraft, brand: event.target.value })} placeholder="Dell, Lenovo, HP..." /></label>
              <label>Modelo<input required value={notebookDraft.model} onChange={(event) => setNotebookDraft({ ...notebookDraft, model: event.target.value })} /></label>
              <label>Número de série<input value={notebookDraft.serialNumber} onChange={(event) => setNotebookDraft({ ...notebookDraft, serialNumber: event.target.value })} /></label>
              <label>Processador<input value={notebookDraft.processor} onChange={(event) => setNotebookDraft({ ...notebookDraft, processor: event.target.value })} placeholder="Opcional" /></label>
              <label>Memória RAM<input value={notebookDraft.ram} onChange={(event) => setNotebookDraft({ ...notebookDraft, ram: event.target.value })} placeholder="Ex.: 8 GB" /></label>
              <label>Armazenamento<input value={notebookDraft.storage} onChange={(event) => setNotebookDraft({ ...notebookDraft, storage: event.target.value })} placeholder="Ex.: SSD 256 GB" /></label>
              <label>Responsável<select value={notebookDraft.personId} onChange={(event) => setNotebookDraft({ ...notebookDraft, personId: event.target.value })}><option value="">Sem responsável / reserva</option>{people.filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}{person.teamName ? ` · ${person.teamName}` : ""}</option>)}</select></label>
            </div>
            <label>Observação<textarea value={notebookDraft.notes} onChange={(event) => setNotebookDraft({ ...notebookDraft, notes: event.target.value })} /></label>
            <footer><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancelar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Registrar notebook"}</button></footer>
          </form>
        )}

        {modal === "assign" && (
          <form onSubmit={handleAssign}>
            <header><h3>Vincular notebook</h3><button type="button" onClick={() => setModal(null)} disabled={busy}>×</button></header>
            <p className="notebook-modal-info">{itemById.get(assignItemId)?.code} · {notebookDescription(itemById.get(assignItemId) ?? ({ name: "Notebook" } as PatrimonyItem))}</p>
            <label>Responsável<select required value={assignPersonId} onChange={(event) => setAssignPersonId(event.target.value)}><option value="">Selecione</option>{people.filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}{person.teamName ? ` · ${person.teamName}` : ""}</option>)}</select></label>
            <footer><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancelar</button><button className="primary" type="submit" disabled={busy || !assignPersonId}>{busy ? "Vinculando..." : "Confirmar vínculo"}</button></footer>
          </form>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{tab}{content}{modalPortal}</>;
}
