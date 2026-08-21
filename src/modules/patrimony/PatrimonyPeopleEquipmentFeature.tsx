import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../components/AppIcon";
import {
  assignPatrimonyItem,
  getPatrimonyErrorMessage,
  loadPatrimonyDataset,
  returnPatrimonyAssignment,
  saveOrganizationPerson,
  savePatrimonyItem,
} from "./services/patrimonyService";
import type {
  OrganizationPersonDraft,
  PatrimonyAssignment,
  PatrimonyDataset,
  PatrimonyItemDraft,
  PatrimonyReturnCondition,
} from "./types/patrimony.types";
import "./patrimonyPeopleEquipment.css";

const EMPTY_DATASET: PatrimonyDataset = {
  people: [],
  items: [],
  assignments: [],
  spaces: [],
  spaceAssignments: [],
  movements: [],
};

const EMPTY_PERSON = (): OrganizationPersonDraft => ({
  name: "",
  personType: "funcionario",
  department: "",
  jobTitle: "",
  email: "",
  phone: "",
  active: true,
  notes: "",
});

const EMPTY_EQUIPMENT = (): PatrimonyItemDraft => ({
  code: "",
  name: "Celular",
  category: "Celular",
  trackingMode: "individual",
  brand: "",
  model: "",
  serialNumber: "",
  unit: "Unidade",
  totalQuantity: 1,
  storageSpaceId: "",
  linkedSpaceId: "",
  acquisitionDate: "",
  active: true,
  notes: "",
});

type ModalMode = "person" | "equipment" | "assign" | "return" | null;

type ReturnDraft = {
  assignmentId: string;
  condition: PatrimonyReturnCondition;
  notes: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function openQuantity(assignment: PatrimonyAssignment) {
  return Math.max(0, assignment.quantity - assignment.returnedQuantity);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : value;
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

export function PatrimonyPeopleEquipmentFeature() {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [tabs, setTabs] = useState<HTMLElement | null>(null);
  const [sourceButton, setSourceButton] = useState<HTMLButtonElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [dataset, setDataset] = useState<PatrimonyDataset>(EMPTY_DATASET);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalMode>(null);
  const [personDraft, setPersonDraft] = useState<OrganizationPersonDraft>(EMPTY_PERSON);
  const [equipmentDraft, setEquipmentDraft] = useState<PatrimonyItemDraft>(EMPTY_EQUIPMENT);
  const [assignPersonId, setAssignPersonId] = useState("");
  const [assignItemId, setAssignItemId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [returnDraft, setReturnDraft] = useState<ReturnDraft>({ assignmentId: "", condition: "bom", notes: "" });

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
    element.className = "patrimony-people-equipment-host";
    tabs.insertAdjacentElement("afterend", element);
    setHost(element);
    return () => {
      element.remove();
      setHost(null);
    };
  }, [screen, tabs]);

  useEffect(() => {
    if (!screen || !host) return () => undefined;
    screen.classList.toggle("people-equipment-view", active);
    const siblings = Array.from(screen.children) as HTMLElement[];
    siblings.forEach((element) => {
      if (element === host || element === tabs) return;
      if (active && tabs && tabs.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
        element.classList.add("people-equipment-native-hidden");
      } else {
        element.classList.remove("people-equipment-native-hidden");
      }
    });
    return () => siblings.forEach((element) => element.classList.remove("people-equipment-native-hidden"));
  }, [active, host, screen, tabs]);

  useEffect(() => {
    if (!tabs) return () => undefined;
    const handleClick = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (!button || button.hasAttribute("data-people-equipment-tab")) return;
      setActive(false);
    };
    tabs.addEventListener("click", handleClick);
    return () => tabs.removeEventListener("click", handleClick);
  }, [tabs]);

  useEffect(() => {
    if (active) void refresh();
  }, [active]);

  const personById = useMemo(() => new Map(dataset.people.map((person) => [person.id, person])), [dataset.people]);
  const itemById = useMemo(() => new Map(dataset.items.map((item) => [item.id, item])), [dataset.items]);
  const activeAssignments = useMemo(() => dataset.assignments.filter((assignment) => openQuantity(assignment) > 0), [dataset.assignments]);
  const assignmentsByPerson = useMemo(() => {
    const map = new Map<string, PatrimonyAssignment[]>();
    activeAssignments.forEach((assignment) => map.set(assignment.personId, [...(map.get(assignment.personId) ?? []), assignment]));
    return map;
  }, [activeAssignments]);

  const availableEquipment = useMemo(() => dataset.items.filter((item) => {
    if (!item.active || item.availableQuantity <= 0 || item.trackingMode !== "individual") return false;
    const text = normalize(`${item.category} ${item.name}`);
    return !text.includes("chave") && !item.linkedSpaceId;
  }), [dataset.items]);

  const filteredPeople = useMemo(() => {
    const term = normalize(search);
    return dataset.people
      .filter((person) => person.active)
      .filter((person) => {
        if (!term) return true;
        const assignments = assignmentsByPerson.get(person.id) ?? [];
        const equipmentText = assignments.map((assignment) => {
          const item = itemById.get(assignment.itemId);
          return `${item?.name ?? ""} ${item?.brand ?? ""} ${item?.model ?? ""} ${item?.code ?? ""}`;
        }).join(" ");
        return normalize(`${person.name} ${person.department} ${person.jobTitle ?? ""} ${equipmentText}`).includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [assignmentsByPerson, dataset.people, itemById, search]);

  const equipmentInUse = useMemo(() => new Set(activeAssignments.map((assignment) => assignment.itemId)).size, [activeAssignments]);
  const peopleWithEquipment = useMemo(() => new Set(activeAssignments.map((assignment) => assignment.personId)).size, [activeAssignments]);

  async function refresh() {
    setLoading(true);
    try {
      setDataset(await loadPatrimonyDataset());
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openFeature() {
    sourceButton?.click();
    setActive(true);
  }

  function openAssign(personId = "") {
    setAssignPersonId(personId);
    setAssignItemId("");
    setAssignNotes("");
    setModal("assign");
  }

  function openReturn(assignmentId: string) {
    setReturnDraft({ assignmentId, condition: "bom", notes: "" });
    setModal("return");
  }

  async function handleSavePerson(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await saveOrganizationPerson(personDraft);
      setPersonDraft(EMPTY_PERSON());
      setModal(null);
      setNotice(`${saved.name} cadastrado como pessoa da organização. Nenhum acesso ao HUB foi criado.`);
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEquipment(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await savePatrimonyItem({ ...equipmentDraft, trackingMode: "individual", totalQuantity: 1 });
      setEquipmentDraft(EMPTY_EQUIPMENT());
      setModal(null);
      setNotice(`${saved.code} · ${saved.name} cadastrado como patrimônio individual.`);
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (busy || !assignPersonId || !assignItemId) return;
    setBusy(true);
    setNotice("");
    try {
      await assignPatrimonyItem({
        itemId: assignItemId,
        personId: assignPersonId,
        quantity: 1,
        actorName: getActorName(),
        notes: assignNotes,
      });
      const person = personById.get(assignPersonId);
      const item = itemById.get(assignItemId);
      setModal(null);
      setNotice(`${item?.name ?? "Equipamento"} entregue para ${person?.name ?? "a pessoa selecionada"}.`);
      await refresh();
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReturn(event: FormEvent) {
    event.preventDefault();
    if (busy || !returnDraft.assignmentId) return;
    const assignment = activeAssignments.find((entry) => entry.id === returnDraft.assignmentId);
    if (!assignment) return;
    setBusy(true);
    setNotice("");
    try {
      await returnPatrimonyAssignment({
        assignmentId: assignment.id,
        quantity: openQuantity(assignment),
        condition: returnDraft.condition,
        actorName: getActorName(),
        notes: returnDraft.notes,
      });
      setModal(null);
      setNotice("Devolução registrada no histórico do patrimônio.");
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
      data-people-equipment-tab="true"
      type="button"
      onClick={openFeature}
    >
      <AppIcon name="users" size="sm" className="action-icon" />
      Pessoas e equipamentos
    </button>,
    tabs,
  );

  if (!host) return tab;

  const content = active ? createPortal(
    <section className="people-equipment-page">
      <header className="people-equipment-head">
        <div>
          <p>BENS E MATERIAIS</p>
          <h2>Pessoas e Equipamentos</h2>
          <span>Controle de quem está responsável por cada equipamento, sem criar usuário de sistema.</span>
        </div>
        <div className="people-equipment-actions">
          <button type="button" onClick={() => { setPersonDraft(EMPTY_PERSON()); setModal("person"); }}>+ Pessoa</button>
          <button type="button" onClick={() => { setEquipmentDraft(EMPTY_EQUIPMENT()); setModal("equipment"); }}>+ Equipamento</button>
          <button className="primary" type="button" onClick={() => openAssign()}>Entregar equipamento</button>
        </div>
      </header>

      {notice && <div className="people-equipment-notice" role="status">{notice}</div>}

      <div className="people-equipment-stats">
        <div><strong>{peopleWithEquipment}</strong><span>Pessoas com equipamento</span></div>
        <div><strong>{equipmentInUse}</strong><span>Equipamentos em uso</span></div>
        <div><strong>{availableEquipment.length}</strong><span>Disponíveis para entrega</span></div>
      </div>

      <div className="people-equipment-toolbar">
        <label>
          <span>Buscar</span>
          <input value={search} placeholder="Pessoa, setor, função ou equipamento" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="button" onClick={() => { void refresh(); }} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
      </div>

      <div className="people-equipment-list">
        {filteredPeople.length === 0 && !loading && (
          <div className="people-equipment-empty">
            <strong>Nenhuma pessoa encontrada.</strong>
            <span>Cadastre a pessoa primeiro e depois entregue o equipamento.</span>
          </div>
        )}

        {filteredPeople.map((person) => {
          const assignments = assignmentsByPerson.get(person.id) ?? [];
          return (
            <article className="people-equipment-person" key={person.id}>
              <div className="people-equipment-person-head">
                <div className="people-equipment-avatar">{person.name.trim().slice(0, 1).toUpperCase()}</div>
                <div>
                  <h3>{person.name}</h3>
                  <p>{person.jobTitle || "Função não informada"} · {person.department}</p>
                  <small>{person.managedUserId ? "Vinculado a usuário do sistema" : "Cadastro interno · sem acesso ao HUB"}</small>
                </div>
                <button type="button" onClick={() => openAssign(person.id)}>+ Entregar</button>
              </div>

              <div className="people-equipment-held">
                {assignments.length === 0 ? (
                  <p className="people-equipment-none">Nenhum equipamento em posse.</p>
                ) : assignments.map((assignment) => {
                  const item = itemById.get(assignment.itemId);
                  if (!item) return null;
                  return (
                    <div className="people-equipment-item" key={assignment.id}>
                      <div className="people-equipment-item-icon">▣</div>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{[item.brand, item.model].filter(Boolean).join(" ") || item.category}</span>
                        <small>{item.code}{item.serialNumber ? ` · Série ${item.serialNumber}` : ""} · entregue em {formatDate(assignment.assignedAt)}</small>
                      </div>
                      <button type="button" onClick={() => openReturn(assignment.id)}>Devolver</button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {modal === "person" && createPortal(
        <div className="people-equipment-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <form className="people-equipment-modal" onSubmit={handleSavePerson}>
            <header><div><small>CADASTRO INTERNO</small><h2>Nova pessoa</h2></div><button type="button" onClick={() => setModal(null)}>×</button></header>
            <p className="people-equipment-explainer">Este cadastro identifica a pessoa dentro do patrimônio. Ele não cria login ou acesso ao HUB.</p>
            <label>Nome<input required value={personDraft.name} onChange={(e) => setPersonDraft({ ...personDraft, name: e.target.value })} /></label>
            <div className="people-equipment-grid2">
              <label>Setor<input required value={personDraft.department} onChange={(e) => setPersonDraft({ ...personDraft, department: e.target.value })} /></label>
              <label>Função<input value={personDraft.jobTitle ?? ""} onChange={(e) => setPersonDraft({ ...personDraft, jobTitle: e.target.value })} placeholder="Ex.: Gerente" /></label>
            </div>
            <div className="people-equipment-grid2">
              <label>Telefone <small>(opcional)</small><input value={personDraft.phone ?? ""} onChange={(e) => setPersonDraft({ ...personDraft, phone: e.target.value })} /></label>
              <label>E-mail <small>(opcional)</small><input type="email" value={personDraft.email ?? ""} onChange={(e) => setPersonDraft({ ...personDraft, email: e.target.value })} /></label>
            </div>
            <label>Observação <small>(opcional)</small><textarea value={personDraft.notes ?? ""} onChange={(e) => setPersonDraft({ ...personDraft, notes: e.target.value })} /></label>
            <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar pessoa"}</button></footer>
          </form>
        </div>, document.body,
      )}

      {modal === "equipment" && createPortal(
        <div className="people-equipment-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <form className="people-equipment-modal" onSubmit={handleSaveEquipment}>
            <header><div><small>PATRIMÔNIO INDIVIDUAL</small><h2>Novo equipamento</h2></div><button type="button" onClick={() => setModal(null)}>×</button></header>
            <div className="people-equipment-grid2">
              <label>Código patrimonial<input required value={equipmentDraft.code} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, code: e.target.value })} placeholder="Ex.: CEL-001" /></label>
              <label>Categoria<input required value={equipmentDraft.category} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, category: e.target.value })} /></label>
            </div>
            <label>Nome do equipamento<input required value={equipmentDraft.name} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, name: e.target.value })} placeholder="Ex.: Celular corporativo" /></label>
            <div className="people-equipment-grid2">
              <label>Marca<input value={equipmentDraft.brand ?? ""} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, brand: e.target.value })} /></label>
              <label>Modelo<input value={equipmentDraft.model ?? ""} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, model: e.target.value })} /></label>
            </div>
            <div className="people-equipment-grid2">
              <label>Número de série<input value={equipmentDraft.serialNumber ?? ""} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, serialNumber: e.target.value })} /></label>
              <label>Data de aquisição<input type="date" value={equipmentDraft.acquisitionDate ?? ""} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, acquisitionDate: e.target.value })} /></label>
            </div>
            <label>Identificação adicional <small>(opcional)</small><textarea value={equipmentDraft.notes ?? ""} onChange={(e) => setEquipmentDraft({ ...equipmentDraft, notes: e.target.value })} placeholder="IMEI, número da linha, observações ou outra identificação." /></label>
            <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar equipamento"}</button></footer>
          </form>
        </div>, document.body,
      )}

      {modal === "assign" && createPortal(
        <div className="people-equipment-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <form className="people-equipment-modal" onSubmit={handleAssign}>
            <header><div><small>RESPONSABILIDADE</small><h2>Entregar equipamento</h2></div><button type="button" onClick={() => setModal(null)}>×</button></header>
            <label>Pessoa<select required value={assignPersonId} onChange={(e) => setAssignPersonId(e.target.value)}><option value="">Selecione...</option>{dataset.people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.department}{p.jobTitle ? ` · ${p.jobTitle}` : ""}</option>)}</select></label>
            <label>Equipamento<select required value={assignItemId} onChange={(e) => setAssignItemId(e.target.value)}><option value="">Selecione...</option>{availableEquipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}{item.model ? ` · ${item.model}` : ""}</option>)}</select></label>
            {assignPersonId && personById.get(assignPersonId) && <div className="people-equipment-person-preview"><strong>{personById.get(assignPersonId)?.name}</strong><span>{personById.get(assignPersonId)?.jobTitle || "Função não informada"} · {personById.get(assignPersonId)?.department}</span></div>}
            <label>Observação da entrega <small>(opcional)</small><textarea value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} /></label>
            <p className="people-equipment-explainer">O equipamento ficará vinculado à pessoa. Setor e função são puxados do cadastro dela; não é necessário mapa ou mesa.</p>
            <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className="primary" type="submit" disabled={busy || !assignPersonId || !assignItemId}>{busy ? "Registrando..." : "Confirmar entrega"}</button></footer>
          </form>
        </div>, document.body,
      )}

      {modal === "return" && createPortal(
        <div className="people-equipment-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <form className="people-equipment-modal" onSubmit={handleReturn}>
            <header><div><small>DEVOLUÇÃO</small><h2>Devolver equipamento</h2></div><button type="button" onClick={() => setModal(null)}>×</button></header>
            {(() => {
              const assignment = activeAssignments.find((entry) => entry.id === returnDraft.assignmentId);
              const item = assignment ? itemById.get(assignment.itemId) : undefined;
              const person = assignment ? personById.get(assignment.personId) : undefined;
              return <div className="people-equipment-return-summary"><strong>{item?.code} · {item?.name}</strong><span>Responsável atual: {person?.name}</span></div>;
            })()}
            <label>Condição<select value={returnDraft.condition} onChange={(e) => setReturnDraft({ ...returnDraft, condition: e.target.value as PatrimonyReturnCondition })}><option value="bom">Bom estado</option><option value="danificado">Danificado</option><option value="perdido">Perdido</option></select></label>
            <label>Observação <small>(opcional)</small><textarea value={returnDraft.notes} onChange={(e) => setReturnDraft({ ...returnDraft, notes: e.target.value })} /></label>
            <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className="primary" type="submit" disabled={busy}>{busy ? "Registrando..." : "Confirmar devolução"}</button></footer>
          </form>
        </div>, document.body,
      )}
    </section>,
    host,
  ) : null;

  return <>{tab}{content}</>;
}
