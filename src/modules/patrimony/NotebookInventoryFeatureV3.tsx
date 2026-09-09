import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getEquipmentModelErrorMessage,
  loadEquipmentModels,
  saveEquipmentModel,
  setEquipmentModelActive,
} from "./services/equipmentModelService";
import {
  getOrganizationDirectoryErrorMessage,
  updatePersonPlacement,
} from "./services/organizationDirectoryService";
import {
  assignPatrimonyItem,
  getPatrimonyErrorMessage,
  loadPatrimonyDataset,
  saveOrganizationPerson,
  savePatrimonyItem,
  setOrganizationPersonActive,
} from "./services/patrimonyService";
import type {
  OrganizationPersonDraft,
  PatrimonyAssignment,
  PatrimonyDataset,
  PatrimonyEquipmentModel,
  PatrimonyItem,
  PatrimonyPersonType,
} from "./types/patrimony.types";
import "./notebookInventory.css";
import "./notebookInventoryCatalog.css";

const EMPTY_DATASET: PatrimonyDataset = {
  people: [],
  items: [],
  assignments: [],
  spaces: [],
  spaceAssignments: [],
  movements: [],
};

const MANAGER_TEAMS = new Set([
  "adriana",
  "andreia",
  "angela",
  "cacilda",
  "eliane",
  "fabio",
  "fernando",
  "julio",
  "peres",
  "perez",
  "priscila",
  "ramzy",
  "ze alberto",
]);

type ModalMode = "people" | "person-new" | "models" | "model-new" | "notebook" | "assign" | null;
type ModelReturn = "models" | "notebook";

type PersonDraft = {
  name: string;
  personType: PatrimonyPersonType;
  department: string;
  teamName: string;
  jobTitle: string;
};

type ModelDraft = {
  name: string;
  description: string;
};

type NotebookDraft = {
  modelId: string;
  teamName: string;
  department: string;
  personId: string;
  serialNumber: string;
  notes: string;
};

const emptyPerson = (): PersonDraft => ({
  name: "",
  personType: "funcionario",
  department: "",
  teamName: "",
  jobTitle: "",
});

const emptyModel = (): ModelDraft => ({ name: "", description: "" });
const emptyNotebook = (): NotebookDraft => ({
  modelId: "",
  teamName: "",
  department: "",
  personId: "",
  serialNumber: "",
  notes: "",
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

function teamManagerLabel(teamName: string) {
  const raw = teamName.replace(/^equipe\s+/i, "").trim() || teamName;
  return normalize(raw) === "peres" ? "Perez" : raw;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function isKnownDepartment(value?: string) {
  const clean = normalize(value ?? "");
  return Boolean(clean) && clean !== "a definir" && clean !== "nao informado";
}

function isManagerTeam(teamName: string) {
  return MANAGER_TEAMS.has(normalize(teamManagerLabel(teamName)));
}

export function NotebookInventoryFeatureV3() {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [tabs, setTabs] = useState<HTMLElement | null>(null);
  const [sourceButton, setSourceButton] = useState<HTMLButtonElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [dataset, setDataset] = useState<PatrimonyDataset>(EMPTY_DATASET);
  const [models, setModels] = useState<PatrimonyEquipmentModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [directorySearch, setDirectorySearch] = useState("");
  const [modal, setModal] = useState<ModalMode>(null);
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPerson);
  const [modelDraft, setModelDraft] = useState<ModelDraft>(emptyModel);
  const [modelReturn, setModelReturn] = useState<ModelReturn>("models");
  const [notebookDraft, setNotebookDraft] = useState<NotebookDraft>(emptyNotebook);
  const [assignItemId, setAssignItemId] = useState("");
  const [assignTeamName, setAssignTeamName] = useState("");
  const [assignDepartment, setAssignDepartment] = useState("");
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

  const people = useMemo(
    () => dataset.people.filter((person) => person.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [dataset.people],
  );
  const activeModels = useMemo(
    () => models.filter((model) => model.active && normalize(model.category) === "notebook"),
    [models],
  );
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const personById = useMemo(() => new Map(dataset.people.map((person) => [person.id, person])), [dataset.people]);
  const notebookItems = useMemo(
    () => dataset.items.filter((item) => item.active && item.trackingMode === "individual" && isNotebook(item)),
    [dataset.items],
  );
  const itemById = useMemo(() => new Map(notebookItems.map((item) => [item.id, item])), [notebookItems]);
  const activeAssignments = useMemo(
    () => dataset.assignments.filter((assignment) => openQuantity(assignment) > 0),
    [dataset.assignments],
  );
  const notebookAssignmentByItem = useMemo(() => {
    const ids = new Set(notebookItems.map((item) => item.id));
    return new Map(activeAssignments.filter((assignment) => ids.has(assignment.itemId)).map((assignment) => [assignment.itemId, assignment]));
  }, [activeAssignments, notebookItems]);

  const departments = useMemo(
    () => uniqueSorted(people.map((person) => person.department).filter((department) => isKnownDepartment(department))),
    [people],
  );
  const teams = useMemo(
    () => uniqueSorted(people.map((person) => person.teamName ?? "").filter((team) => team && isManagerTeam(team))),
    [people],
  );

  const filteredNotebooks = useMemo(() => {
    const term = normalize(search);
    return notebookItems.filter((item) => {
      const assignment = notebookAssignmentByItem.get(item.id);
      const person = assignment ? personById.get(assignment.personId) : undefined;
      const model = item.equipmentModelId ? modelById.get(item.equipmentModelId) : undefined;
      const matchesDepartment = departmentFilter === "all" || person?.department === departmentFilter;
      const matchesTeam = teamFilter === "all" || person?.teamName === teamFilter;
      const haystack = normalize(`${item.code} ${item.serialNumber ?? ""} ${item.notes ?? ""} ${model?.name ?? ""} ${model?.description ?? ""} ${person?.name ?? ""} ${person?.department ?? ""} ${person?.teamName ?? ""}`);
      return matchesDepartment && matchesTeam && (!term || haystack.includes(term));
    }).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
  }, [departmentFilter, modelById, notebookAssignmentByItem, notebookItems, personById, search, teamFilter]);

  const peopleWithNotebook = useMemo(
    () => new Set(Array.from(notebookAssignmentByItem.values()).map((assignment) => assignment.personId)),
    [notebookAssignmentByItem],
  );
  const peopleWithoutNotebook = useMemo(
    () => people.filter((person) => !peopleWithNotebook.has(person.id)),
    [people, peopleWithNotebook],
  );
  const directoryPeople = useMemo(() => {
    const term = normalize(directorySearch);
    return people.filter((person) => !term || normalize(`${person.name} ${person.department} ${person.teamName ?? ""} ${person.jobTitle ?? ""}`).includes(term));
  }, [directorySearch, people]);
  const modelCount = useMemo(
    () => new Set(notebookItems.map((item) => item.equipmentModelId || normalize(`${item.brand ?? ""} ${item.model ?? ""}`)).filter(Boolean)).size,
    [notebookItems],
  );

  async function refresh() {
    setLoading(true);
    try {
      const [nextDataset, nextModels] = await Promise.all([loadPatrimonyDataset(), loadEquipmentModels()]);
      setDataset(nextDataset);
      setModels(nextModels);
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
    setNotice("");
    setNotebookDraft({ ...emptyNotebook(), modelId: activeModels[0]?.id ?? "" });
    setModal("notebook");
  }

  function openAssign(itemId: string) {
    setNotice("");
    setAssignItemId(itemId);
    setAssignTeamName("");
    setAssignDepartment("");
    setAssignPersonId("");
    setModal("assign");
  }

  function selectNotebookPerson(personId: string) {
    const person = people.find((entry) => entry.id === personId);
    setNotebookDraft((current) => ({
      ...current,
      personId,
      teamName: person?.teamName || current.teamName,
      department: person && isKnownDepartment(person.department) ? person.department : current.department,
    }));
  }

  function selectAssignPerson(personId: string) {
    const person = people.find((entry) => entry.id === personId);
    setAssignPersonId(personId);
    if (person?.teamName) setAssignTeamName(person.teamName);
    if (person && isKnownDepartment(person.department)) setAssignDepartment(person.department);
  }

  async function persistPlacement(personId: string, department: string, teamName: string) {
    const person = personById.get(personId);
    if (!person) return;
    const desiredDepartment = department.trim();
    const desiredTeam = teamName.trim();
    const sameDepartment = person.department === desiredDepartment;
    const sameTeam = (person.teamName ?? "") === desiredTeam;
    if (sameDepartment && sameTeam) return;
    await updatePersonPlacement({ personId, department: desiredDepartment, teamName: desiredTeam });
  }

  async function handleSavePerson(event: FormEvent) {
    event.preventDefault();
    if (busy || !personDraft.name.trim() || !personDraft.department.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const draft: OrganizationPersonDraft = {
        name: personDraft.name,
        personType: personDraft.personType,
        department: personDraft.department,
        teamName: personDraft.teamName,
        jobTitle: personDraft.jobTitle,
        active: true,
      };
      await saveOrganizationPerson(draft);
      setPersonDraft(emptyPerson());
      setModal("people");
      setNotice("Pessoa adicionada ao diretório da empresa.");
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivatePerson(personId: string) {
    if (busy) return;
    if (peopleWithNotebook.has(personId)) {
      setNotice("Esta pessoa está com notebook vinculado. Transfira ou devolva o equipamento antes de excluir.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await setOrganizationPersonActive(personId, false);
      setNotice("Pessoa removida da lista ativa. O histórico foi preservado.");
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveModel(event: FormEvent) {
    event.preventDefault();
    if (busy || !modelDraft.name.trim() || !modelDraft.description.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await saveEquipmentModel({
        name: modelDraft.name,
        description: modelDraft.description,
        category: "Notebook",
        active: true,
      });
      setModelDraft(emptyModel());
      await refresh();
      if (modelReturn === "notebook") {
        setNotebookDraft((current) => ({ ...current, modelId: saved.id }));
        setModal("notebook");
      } else {
        setModal("models");
      }
      setNotice("Modelo salvo. Ele já está disponível para selecionar.");
    } catch (error) {
      setNotice(getEquipmentModelErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivateModel(modelId: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await setEquipmentModelActive(modelId, false);
      setNotice("Modelo removido das novas seleções. Máquinas já cadastradas continuam preservadas.");
      await refresh();
    } catch (error) {
      setNotice(getEquipmentModelErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNotebook(event: FormEvent) {
    event.preventDefault();
    if (busy || !notebookDraft.modelId) return;
    const selectedModel = modelById.get(notebookDraft.modelId);
    if (!selectedModel) {
      setNotice("Selecione um modelo de notebook.");
      return;
    }
    if (notebookDraft.personId && !notebookDraft.department.trim()) {
      setNotice("Selecione o setor da pessoa.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      if (notebookDraft.personId) {
        await persistPlacement(notebookDraft.personId, notebookDraft.department, notebookDraft.teamName);
      }
      const notes = [
        selectedModel.description,
        notebookDraft.notes.trim() ? `Observação: ${notebookDraft.notes.trim()}` : "",
      ].filter(Boolean).join(" · ");
      const saved = await savePatrimonyItem({
        code: nextNotebookCode(),
        name: selectedModel.name,
        category: "Notebook",
        trackingMode: "individual",
        equipmentModelId: selectedModel.id,
        brand: selectedModel.brand,
        model: selectedModel.model || selectedModel.name,
        serialNumber: notebookDraft.serialNumber,
        unit: "Unidade",
        totalQuantity: 1,
        notes,
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
      setNotice(`${saved.code} cadastrado${notebookDraft.personId ? " e vinculado à pessoa" : " como reserva"}.`);
      await refresh();
    } catch (error) {
      setNotice(getOrganizationDirectoryErrorMessage(error) || getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (busy || !assignItemId || !assignPersonId) return;
    if (!assignDepartment.trim()) {
      setNotice("Selecione o setor da pessoa.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await persistPlacement(assignPersonId, assignDepartment, assignTeamName);
      await assignPatrimonyItem({
        itemId: assignItemId,
        personId: assignPersonId,
        quantity: 1,
        actorName: getActorName(),
        notes: "Vínculo realizado pelo inventário de notebooks.",
      });
      const person = personById.get(assignPersonId);
      setModal(null);
      setNotice(`${itemById.get(assignItemId)?.code ?? "Notebook"} vinculado a ${person?.name ?? "pessoa"}.`);
      await refresh();
    } catch (error) {
      setNotice(getOrganizationDirectoryErrorMessage(error) || getPatrimonyErrorMessage(error));
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
          <span>Escolha o modelo, a equipe/gerente, a pessoa e o setor.</span>
        </div>
        <div className="notebook-inventory-actions">
          <button type="button" onClick={() => { setNotice(""); setDirectorySearch(""); setModal("people"); }}>Pessoas</button>
          <button type="button" onClick={() => { setNotice(""); setModelReturn("models"); setModal("models"); }}>Modelos</button>
          <button className="primary" type="button" onClick={openNotebook}>+ Inventariar notebook</button>
        </div>
      </header>

      {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}

      <div className="notebook-inventory-stats">
        <article><strong>{notebookItems.length}</strong><span>Notebooks inventariados</span></article>
        <article><strong>{notebookAssignmentByItem.size}</strong><span>Com pessoa</span></article>
        <article><strong>{notebookItems.length - notebookAssignmentByItem.size}</strong><span>Reserva / sem pessoa</span></article>
        <article><strong>{modelCount}</strong><span>Modelos em uso</span></article>
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
          <span>Equipe / gerente</span>
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="all">Todos</option>
            {teams.map((team) => <option key={team} value={team}>{teamManagerLabel(team)}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { void refresh(); }} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
      </div>

      <section className="notebook-inventory-list-section">
        <div className="notebook-section-title">
          <h3>Notebooks</h3>
          <small>{filteredNotebooks.length} exibido(s)</small>
        </div>
        <div className="notebook-inventory-list">
          {filteredNotebooks.length === 0 && !loading && <div className="notebook-inventory-empty">Nenhum notebook encontrado com os filtros atuais.</div>}
          {filteredNotebooks.map((item) => {
            const assignment = notebookAssignmentByItem.get(item.id);
            const person = assignment ? personById.get(assignment.personId) : undefined;
            const model = item.equipmentModelId ? modelById.get(item.equipmentModelId) : undefined;
            return (
              <article className="notebook-card" key={item.id}>
                <div className="notebook-card-main">
                  <span className="notebook-code">{item.code}</span>
                  <div>
                    <h4>{model?.name || notebookDescription(item)}</h4>
                    <p>{model?.description || item.notes || "Descrição não informada"}</p>
                    <p>Série: {item.serialNumber || "não informada"}</p>
                  </div>
                </div>
                <div className="notebook-card-owner">
                  <small>Pessoa</small>
                  <strong>{person?.name || "Sem pessoa"}</strong>
                  <span>{person ? `${person.department}${person.teamName ? ` · Gerente: ${teamManagerLabel(person.teamName)}` : ""}` : "Disponível / reserva"}</span>
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
          {peopleWithoutNotebook.slice(0, 140).map((person) => (
            <span key={person.id}>
              {person.name}
              <small>{isKnownDepartment(person.department) ? person.department : "Setor a definir"}{person.teamName ? ` · Gerente: ${teamManagerLabel(person.teamName)}` : ""}</small>
            </span>
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
        {modal === "people" && (
          <div className="notebook-directory-panel">
            <header>
              <div><h3>Pessoas da empresa</h3><p>{people.length} nomes disponíveis no diretório.</p></div>
              <button type="button" onClick={() => setModal(null)} disabled={busy}>×</button>
            </header>
            {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}
            <div className="notebook-directory-toolbar">
              <input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Buscar nome, setor ou gerente" />
              <button className="primary" type="button" onClick={() => { setPersonDraft(emptyPerson()); setNotice(""); setModal("person-new"); }}>+ Nova pessoa</button>
            </div>
            <div className="notebook-directory-list">
              {directoryPeople.map((person) => (
                <article key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                    <span>{isKnownDepartment(person.department) ? person.department : "Setor a definir"}{person.teamName ? ` · Gerente: ${teamManagerLabel(person.teamName)}` : ""}{person.jobTitle ? ` · ${person.jobTitle}` : ""}</span>
                  </div>
                  <button type="button" className="danger-link" onClick={() => { void handleDeactivatePerson(person.id); }} disabled={busy}>Excluir</button>
                </article>
              ))}
              {directoryPeople.length === 0 && <p className="notebook-inventory-empty">Nenhuma pessoa encontrada.</p>}
            </div>
          </div>
        )}

        {modal === "person-new" && (
          <form onSubmit={handleSavePerson}>
            <header><div><h3>Nova pessoa</h3><p>Cadastre somente se o nome ainda não estiver na lista.</p></div><button type="button" onClick={() => setModal("people")} disabled={busy}>×</button></header>
            {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}
            <label>Nome<input required value={personDraft.name} onChange={(event) => setPersonDraft({ ...personDraft, name: event.target.value })} /></label>
            <div className="notebook-modal-grid">
              <label>Equipe / gerente<select value={personDraft.teamName} onChange={(event) => setPersonDraft({ ...personDraft, teamName: event.target.value })}><option value="">Sem equipe / gerente</option>{teams.map((team) => <option key={team} value={team}>{teamManagerLabel(team)}</option>)}</select></label>
              <label>Setor<select required value={personDraft.department} onChange={(event) => setPersonDraft({ ...personDraft, department: event.target.value })}><option value="">Selecione</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
              <label>Função<input value={personDraft.jobTitle} onChange={(event) => setPersonDraft({ ...personDraft, jobTitle: event.target.value })} /></label>
              <label>Tipo<select value={personDraft.personType} onChange={(event) => setPersonDraft({ ...personDraft, personType: event.target.value as PatrimonyPersonType })}><option value="funcionario">Funcionário</option><option value="corretor_terceirizado">Corretor</option><option value="consultor_terceirizado">Consultor</option><option value="prestador">Prestador</option><option value="outro">Outro</option></select></label>
            </div>
            <footer><button type="button" onClick={() => setModal("people")} disabled={busy}>Voltar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar pessoa"}</button></footer>
          </form>
        )}

        {modal === "models" && (
          <div className="notebook-directory-panel">
            <header><div><h3>Modelos de notebook</h3><p>Cadastre uma vez e reutilize nas próximas máquinas.</p></div><button type="button" onClick={() => setModal(null)} disabled={busy}>×</button></header>
            {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}
            <div className="notebook-directory-toolbar models-toolbar"><span>{activeModels.length} modelo(s) disponível(is)</span><button className="primary" type="button" onClick={() => { setModelReturn("models"); setModelDraft(emptyModel()); setNotice(""); setModal("model-new"); }}>+ Novo modelo</button></div>
            <div className="notebook-model-list">
              {activeModels.map((model) => (
                <article key={model.id}><div><strong>{model.name}</strong><span>{model.description}</span></div><button type="button" className="danger-link" onClick={() => { void handleDeactivateModel(model.id); }} disabled={busy}>Excluir</button></article>
              ))}
              {activeModels.length === 0 && <p className="notebook-inventory-empty">Nenhum modelo ativo.</p>}
            </div>
          </div>
        )}

        {modal === "model-new" && (
          <form onSubmit={handleSaveModel}>
            <header><div><h3>Outro modelo</h3><p>Cadastre uma vez. Depois ele ficará salvo na lista.</p></div><button type="button" onClick={() => setModal(modelReturn)} disabled={busy}>×</button></header>
            {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}
            <label>Nome do modelo<input required value={modelDraft.name} onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })} placeholder="Ex.: Dell Latitude 5420" /></label>
            <label>Descrição completa<textarea required value={modelDraft.description} onChange={(event) => setModelDraft({ ...modelDraft, description: event.target.value })} placeholder="Ex.: Intel Core i5 11ª geração · 8 GB RAM · SSD 256 GB" /></label>
            <footer><button type="button" onClick={() => setModal(modelReturn)} disabled={busy}>Voltar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar e selecionar"}</button></footer>
          </form>
        )}

        {modal === "notebook" && (
          <form onSubmit={handleSaveNotebook}>
            <header><div><h3>Inventariar notebook</h3><p>O código patrimonial será gerado automaticamente.</p></div><button type="button" onClick={() => setModal(null)} disabled={busy}>×</button></header>
            {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}
            <label>Modelo
              <select required value={notebookDraft.modelId} onChange={(event) => {
                if (event.target.value === "__new__") {
                  setModelReturn("notebook");
                  setModelDraft(emptyModel());
                  setNotice("");
                  setModal("model-new");
                } else {
                  setNotebookDraft({ ...notebookDraft, modelId: event.target.value });
                }
              }}>
                <option value="">Selecione</option>
                {activeModels.map((model) => <option key={model.id} value={model.id}>{model.name} — {model.description}</option>)}
                <option value="__new__">+ Outro modelo / cadastrar novo</option>
              </select>
            </label>
            {notebookDraft.modelId && modelById.get(notebookDraft.modelId) && (
              <div className="notebook-selected-model"><strong>{modelById.get(notebookDraft.modelId)?.name}</strong><span>{modelById.get(notebookDraft.modelId)?.description}</span></div>
            )}
            <div className="notebook-modal-grid">
              <label>Equipe / gerente
                <select value={notebookDraft.teamName} onChange={(event) => setNotebookDraft({ ...notebookDraft, teamName: event.target.value })}>
                  <option value="">Sem equipe / gerente</option>
                  {teams.map((team) => <option key={team} value={team}>{teamManagerLabel(team)}</option>)}
                </select>
              </label>
              <label>Nome da pessoa
                <select value={notebookDraft.personId} onChange={(event) => selectNotebookPerson(event.target.value)}>
                  <option value="">Sem pessoa / reserva</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
              <label>Setor
                <select value={notebookDraft.department} onChange={(event) => setNotebookDraft({ ...notebookDraft, department: event.target.value })}>
                  <option value="">Selecione o setor</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
            </div>
            <div className="notebook-modal-grid compact-grid">
              <label>Número de série <small>(opcional)</small><input value={notebookDraft.serialNumber} onChange={(event) => setNotebookDraft({ ...notebookDraft, serialNumber: event.target.value })} /></label>
              <label>Observação <small>(opcional)</small><input value={notebookDraft.notes} onChange={(event) => setNotebookDraft({ ...notebookDraft, notes: event.target.value })} placeholder="Ex.: marca na tampa" /></label>
            </div>
            <footer><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancelar</button><button className="primary" type="submit" disabled={busy || !notebookDraft.modelId}>{busy ? "Salvando..." : "Registrar notebook"}</button></footer>
          </form>
        )}

        {modal === "assign" && (
          <form onSubmit={handleAssign}>
            <header><h3>Vincular notebook</h3><button type="button" onClick={() => setModal(null)} disabled={busy}>×</button></header>
            {notice && <div className="notebook-inventory-notice" role="status">{notice}</div>}
            <p className="notebook-modal-info">{itemById.get(assignItemId)?.code} · {notebookDescription(itemById.get(assignItemId) ?? ({ name: "Notebook" } as PatrimonyItem))}</p>
            <div className="notebook-modal-grid">
              <label>Equipe / gerente<select value={assignTeamName} onChange={(event) => setAssignTeamName(event.target.value)}><option value="">Sem equipe / gerente</option>{teams.map((team) => <option key={team} value={team}>{teamManagerLabel(team)}</option>)}</select></label>
              <label>Nome da pessoa<select required value={assignPersonId} onChange={(event) => selectAssignPerson(event.target.value)}><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <label>Setor<select value={assignDepartment} onChange={(event) => setAssignDepartment(event.target.value)}><option value="">Selecione o setor</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            </div>
            <footer><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancelar</button><button className="primary" type="submit" disabled={busy || !assignPersonId}>{busy ? "Vinculando..." : "Confirmar vínculo"}</button></footer>
          </form>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{tab}{content}{modalPortal}</>;
}
