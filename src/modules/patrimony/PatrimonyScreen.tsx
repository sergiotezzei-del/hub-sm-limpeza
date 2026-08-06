import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppIcon } from "../../components/AppIcon";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import type { UserPermission } from "../../types";
import {
  assignPatrimonyItem,
  assignPatrimonySpace,
  getPatrimonyErrorMessage,
  loadPatrimonyDataset,
  releasePatrimonySpace,
  returnPatrimonyAssignment,
  saveOrganizationPerson,
  savePatrimonyItem,
} from "./services/patrimonyService";
import type {
  OrganizationPerson,
  OrganizationPersonDraft,
  PatrimonyAssignment,
  PatrimonyDataset,
  PatrimonyItem,
  PatrimonyItemDraft,
  PatrimonyMovement,
  PatrimonyPersonType,
  PatrimonyReturnCondition,
  PatrimonySpace,
  PatrimonySpaceAssignment,
} from "./types/patrimony.types";

type PatrimonyTab = "overview" | "operations" | "spaces" | "records";
type RecordsTab = "people" | "items" | "history";
type OperationMode = "assign" | "return";
type LoadStatus = "idle" | "loading" | "ready" | "error";

type PatrimonyScreenProps = {
  permissions: UserPermission[];
  actorName: string;
  onBack: () => void;
  onLogout: () => void;
};

const emptyDataset: PatrimonyDataset = {
  people: [],
  items: [],
  assignments: [],
  spaces: [],
  spaceAssignments: [],
  movements: [],
};

const personTypeOptions: Array<{ value: PatrimonyPersonType; label: string }> = [
  { value: "funcionario", label: "Funcionário" },
  { value: "corretor_terceirizado", label: "Corretor terceirizado" },
  { value: "consultor_terceirizado", label: "Consultor terceirizado" },
  { value: "prestador", label: "Prestador" },
  { value: "temporario", label: "Temporário" },
  { value: "outro", label: "Outro" },
];

const returnConditionOptions: Array<{ value: PatrimonyReturnCondition; label: string }> = [
  { value: "bom", label: "Bom estado" },
  { value: "danificado", label: "Danificado" },
  { value: "perdido", label: "Perdido" },
];

const movementTypeLabels: Record<string, string> = {
  cadastro: "Cadastro",
  entrada_estoque: "Entrada em estoque",
  entrega: "Entrega",
  devolucao: "Devolução",
  transferencia: "Transferência",
  ajuste: "Ajuste",
  manutencao: "Manutenção",
  baixa: "Baixa",
  alocacao_espaco: "Alocação de espaço",
  liberacao_espaco: "Liberação de espaço",
};

const newPersonDraft = (): OrganizationPersonDraft => ({
  name: "",
  personType: "funcionario",
  department: "",
  jobTitle: "",
  email: "",
  phone: "",
  active: true,
  notes: "",
});

const newItemDraft = (): PatrimonyItemDraft => ({
  code: "",
  name: "",
  category: "",
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

export function PatrimonyScreen({ permissions, actorName, onBack, onLogout }: PatrimonyScreenProps) {
  const canAccess = permissions.includes("patrimonio");
  const [activeTab, setActiveTab] = useState<PatrimonyTab>("overview");
  const [recordsTab, setRecordsTab] = useState<RecordsTab>("people");
  const [operationMode, setOperationMode] = useState<OperationMode>("assign");
  const [dataset, setDataset] = useState<PatrimonyDataset>(emptyDataset);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [notice, setNotice] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const [overviewSearch, setOverviewSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [personStatusFilter, setPersonStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [personDepartmentFilter, setPersonDepartmentFilter] = useState("all");
  const [personDraft, setPersonDraft] = useState<OrganizationPersonDraft>(() => newPersonDraft());

  const [itemSearch, setItemSearch] = useState("");
  const [itemDraft, setItemDraft] = useState<PatrimonyItemDraft>(() => newItemDraft());

  const [assignPersonId, setAssignPersonId] = useState("");
  const [assignItemId, setAssignItemId] = useState("");
  const [assignQuantity, setAssignQuantity] = useState("1");
  const [assignSpaceId, setAssignSpaceId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignmentOperationId, setAssignmentOperationId] = useState(() => crypto.randomUUID());

  const [returnAssignmentId, setReturnAssignmentId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnCondition, setReturnCondition] = useState<PatrimonyReturnCondition>("bom");
  const [returnNotes, setReturnNotes] = useState("");

  const [spacePersonId, setSpacePersonId] = useState("");
  const [spaceNotes, setSpaceNotes] = useState("");
  const [spaceOperationId, setSpaceOperationId] = useState(() => crypto.randomUUID());

  const [historyFilters, setHistoryFilters] = useState({
    personId: "all",
    itemId: "all",
    spaceId: "all",
    movementType: "all",
    from: "",
    to: "",
  });

  const activePeople = useMemo(() => dataset.people.filter((person) => person.active), [dataset.people]);
  const itemById = useMemo(() => new Map(dataset.items.map((item) => [item.id, item])), [dataset.items]);
  const personById = useMemo(() => new Map(dataset.people.map((person) => [person.id, person])), [dataset.people]);
  const spaceById = useMemo(() => new Map(dataset.spaces.map((space) => [space.id, space])), [dataset.spaces]);
  const activeAssignments = useMemo(
    () => dataset.assignments.filter((assignment) => getAssignmentOpenQuantity(assignment) > 0),
    [dataset.assignments],
  );
  const activeSpaceAssignments = useMemo(
    () => dataset.spaceAssignments.filter((assignment) => !assignment.releasedAt),
    [dataset.spaceAssignments],
  );
  const activeSpaceBySpaceId = useMemo(
    () => new Map(activeSpaceAssignments.map((assignment) => [assignment.spaceId, assignment])),
    [activeSpaceAssignments],
  );

  const availableItems = useMemo(
    () => dataset.items.filter((item) => item.active && item.availableQuantity > 0 && !["baixado", "extraviado", "manutencao", "indisponivel"].includes(item.status)),
    [dataset.items],
  );
  const lockers = useMemo(
    () => dataset.spaces.filter((space) => space.active && space.spaceType === "locker").sort((a, b) => a.code.localeCompare(b.code, "pt-BR")),
    [dataset.spaces],
  );
  const tables = useMemo(
    () => dataset.spaces.filter((space) => space.active && space.spaceType === "mesa").sort((a, b) => a.code.localeCompare(b.code, "pt-BR")),
    [dataset.spaces],
  );
  const keyItems = useMemo(
    () => dataset.items.filter((item) => item.active && (item.linkedSpaceId || normalizeText(`${item.category} ${item.name}`).includes("chave"))),
    [dataset.items],
  );

  const selectedAssignItem = itemById.get(assignItemId);
  const selectedAssignPerson = personById.get(assignPersonId);
  const selectedReturnAssignment = activeAssignments.find((assignment) => assignment.id === returnAssignmentId);
  const selectedReturnItem = selectedReturnAssignment ? itemById.get(selectedReturnAssignment.itemId) : undefined;
  const selectedReturnPerson = selectedReturnAssignment ? personById.get(selectedReturnAssignment.personId) : undefined;
  const maxReturnQuantity = selectedReturnAssignment ? getAssignmentOpenQuantity(selectedReturnAssignment) : 0;
  const assignQuantityNumber = Number(assignQuantity);
  const returnQuantityNumber = Number(returnQuantity);

  const assignValid = Boolean(selectedAssignPerson && selectedAssignItem)
    && Number.isFinite(assignQuantityNumber)
    && assignQuantityNumber > 0
    && assignQuantityNumber <= (selectedAssignItem?.availableQuantity ?? 0)
    && (!selectedAssignItem || selectedAssignItem.trackingMode !== "individual" || assignQuantityNumber === 1);
  const returnValid = Boolean(selectedReturnAssignment && selectedReturnItem)
    && Number.isFinite(returnQuantityNumber)
    && returnQuantityNumber > 0
    && returnQuantityNumber <= maxReturnQuantity
    && (!selectedReturnItem || selectedReturnItem.trackingMode !== "individual" || returnQuantityNumber === maxReturnQuantity);

  const overviewRows = useMemo(() => {
    const term = normalizeText(overviewSearch);
    return activeAssignments
      .filter((assignment) => {
        if (!term) return true;
        const person = personById.get(assignment.personId);
        const item = itemById.get(assignment.itemId);
        const haystack = normalizeText(`${person?.name ?? ""} ${person?.department ?? ""} ${item?.name ?? ""} ${item?.code ?? ""} ${item?.category ?? ""}`);
        return haystack.includes(term);
      })
      .slice(0, 80);
  }, [activeAssignments, itemById, overviewSearch, personById]);

  const departments = useMemo(() => {
    const names = dataset.people.map((person) => person.department).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dataset.people]);

  const filteredPeople = useMemo(() => {
    const term = normalizeText(personSearch);
    return dataset.people.filter((person) => {
      const matchesTerm = !term || normalizeText(`${person.name} ${person.department} ${person.jobTitle ?? ""}`).includes(term);
      const matchesStatus = personStatusFilter === "all" || (personStatusFilter === "active" ? person.active : !person.active);
      const matchesDepartment = personDepartmentFilter === "all" || person.department === personDepartmentFilter;
      return matchesTerm && matchesStatus && matchesDepartment;
    });
  }, [dataset.people, personDepartmentFilter, personSearch, personStatusFilter]);

  const filteredItems = useMemo(() => {
    const term = normalizeText(itemSearch);
    return dataset.items.filter((item) => {
      if (!term) return true;
      return normalizeText(`${item.code} ${item.name} ${item.category} ${item.brand ?? ""} ${item.model ?? ""} ${item.serialNumber ?? ""}`).includes(term);
    });
  }, [dataset.items, itemSearch]);

  const filteredMovements = useMemo(() => {
    const fromTime = historyFilters.from ? new Date(`${historyFilters.from}T00:00:00`).getTime() : null;
    const toTime = historyFilters.to ? new Date(`${historyFilters.to}T23:59:59`).getTime() : null;
    return dataset.movements.filter((movement) => {
      const createdAt = new Date(movement.createdAt).getTime();
      return (historyFilters.personId === "all" || movement.personId === historyFilters.personId)
        && (historyFilters.itemId === "all" || movement.itemId === historyFilters.itemId)
        && (historyFilters.spaceId === "all" || movement.spaceId === historyFilters.spaceId)
        && (historyFilters.movementType === "all" || movement.movementType === historyFilters.movementType)
        && (fromTime === null || createdAt >= fromTime)
        && (toTime === null || createdAt <= toTime);
    });
  }, [dataset.movements, historyFilters]);

  const overview = useMemo(() => {
    const activeItemIds = new Set(activeAssignments.map((assignment) => assignment.itemId));
    const activeSpacePersonIds = new Set(activeSpaceAssignments.map((assignment) => assignment.personId));
    const inactiveWithResponsibility = dataset.people.filter((person) => {
      if (person.active) return false;
      return activeAssignments.some((assignment) => assignment.personId === person.id)
        || activeSpacePersonIds.has(person.id);
    }).length;

    return {
      individualItems: dataset.items.filter((item) => item.active && item.trackingMode === "individual").length,
      availableUnits: dataset.items.filter((item) => item.active).reduce((sum, item) => sum + item.availableQuantity, 0),
      activeAssignments: activeAssignments.length,
      attentionItems: dataset.items.filter((item) => item.active && (item.maintenanceQuantity > 0 || item.lostQuantity > 0 || item.status === "manutencao" || item.status === "extraviado")).length,
      lockersFree: lockers.filter((locker) => !activeSpaceBySpaceId.has(locker.id) && locker.status === "disponivel").length,
      lockersOccupied: lockers.filter((locker) => activeSpaceBySpaceId.has(locker.id) || locker.status === "ocupado").length,
      inactiveWithResponsibility,
      activeItemIds,
    };
  }, [activeAssignments, activeSpaceAssignments, activeSpaceBySpaceId, dataset.items, dataset.people, lockers]);

  useEffect(() => {
    if (!canAccess) return;
    void refreshDataset();
  }, [canAccess]);

  useEffect(() => {
    if (!selectedAssignItem) return;
    setAssignQuantity(selectedAssignItem.trackingMode === "individual" ? "1" : clampQuantity(assignQuantity, selectedAssignItem.availableQuantity));
  }, [assignItemId]);

  useEffect(() => {
    if (!selectedReturnAssignment || !selectedReturnItem) return;
    setReturnQuantity(selectedReturnItem.trackingMode === "individual" ? String(maxReturnQuantity) : clampQuantity(returnQuantity, maxReturnQuantity));
  }, [returnAssignmentId]);

  async function refreshDataset(showLoading = true) {
    if (showLoading) setLoadStatus("loading");
    setNotice("");
    try {
      const nextDataset = await loadPatrimonyDataset();
      setDataset(nextDataset);
      setLoadStatus("ready");
    } catch (error) {
      setLoadStatus("error");
      setNotice(getPatrimonyErrorMessage(error));
    }
  }

  function updateAssignForm(update: Partial<{ personId: string; itemId: string; quantity: string; spaceId: string; notes: string }>) {
    if (update.personId !== undefined) setAssignPersonId(update.personId);
    if (update.itemId !== undefined) setAssignItemId(update.itemId);
    if (update.quantity !== undefined) setAssignQuantity(update.quantity);
    if (update.spaceId !== undefined) setAssignSpaceId(update.spaceId);
    if (update.notes !== undefined) setAssignNotes(update.notes);
    setAssignmentOperationId(crypto.randomUUID());
  }

  function updateSpaceForm(update: Partial<{ personId: string; notes: string }>) {
    if (update.personId !== undefined) setSpacePersonId(update.personId);
    if (update.notes !== undefined) setSpaceNotes(update.notes);
    setSpaceOperationId(crypto.randomUUID());
  }

  async function handleSavePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy) return;
    setActionBusy(true);
    setNotice("");
    try {
      const saved = await saveOrganizationPerson(personDraft);
      setNotice(`Pessoa salva: ${saved.name}.`);
      setPersonDraft(newPersonDraft());
      await refreshDataset(false);
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy) return;
    setActionBusy(true);
    setNotice("");
    try {
      const saved = await savePatrimonyItem(itemDraft);
      setNotice(`Item salvo: ${saved.name}.`);
      setItemDraft(newItemDraft());
      await refreshDataset(false);
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAssignItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy || !assignValid || !selectedAssignItem || !selectedAssignPerson) return;
    setActionBusy(true);
    setNotice("");
    try {
      await assignPatrimonyItem({
        operationId: assignmentOperationId,
        itemId: selectedAssignItem.id,
        personId: selectedAssignPerson.id,
        quantity: assignQuantityNumber,
        destinationSpaceId: assignSpaceId || undefined,
        actorName,
        notes: assignNotes,
      });
      setNotice(`Entrega registrada: ${formatQuantity(assignQuantityNumber, selectedAssignItem.unit)} para ${selectedAssignPerson.name}.`);
      setAssignItemId("");
      setAssignQuantity("1");
      setAssignSpaceId("");
      setAssignNotes("");
      setAssignmentOperationId(crypto.randomUUID());
      await refreshDataset(false);
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReturnItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy || !returnValid || !selectedReturnAssignment || !selectedReturnItem || !selectedReturnPerson) return;
    setActionBusy(true);
    setNotice("");
    try {
      await returnPatrimonyAssignment({
        assignmentId: selectedReturnAssignment.id,
        quantity: returnQuantityNumber,
        condition: returnCondition,
        actorName,
        notes: returnNotes,
      });
      setNotice(`Devolução registrada: ${formatQuantity(returnQuantityNumber, selectedReturnItem.unit)} de ${selectedReturnPerson.name}.`);
      setReturnAssignmentId("");
      setReturnQuantity("1");
      setReturnCondition("bom");
      setReturnNotes("");
      await refreshDataset(false);
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAssignLocker(locker: PatrimonySpace) {
    if (actionBusy || !spacePersonId) return;
    const person = personById.get(spacePersonId);
    if (!person) return;
    setActionBusy(true);
    setNotice("");
    try {
      await assignPatrimonySpace({
        operationId: spaceOperationId,
        spaceId: locker.id,
        personId: person.id,
        actorName,
        notes: spaceNotes,
      });
      setNotice(`${locker.code} atribuído para ${person.name}.`);
      setSpaceNotes("");
      setSpaceOperationId(crypto.randomUUID());
      await refreshDataset(false);
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReleaseLocker(assignment: PatrimonySpaceAssignment) {
    if (actionBusy) return;
    setActionBusy(true);
    setNotice("");
    try {
      const space = spaceById.get(assignment.spaceId);
      await releasePatrimonySpace({
        spaceAssignmentId: assignment.id,
        actorName,
        notes: spaceNotes,
      });
      setNotice(`${space?.code ?? "Espaço"} liberado.`);
      setSpaceNotes("");
      await refreshDataset(false);
    } catch (error) {
      setNotice(getPatrimonyErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  if (!canAccess) {
    return (
      <section className="screen">
        <PatrimonyTopBar />
        <div className="screen-action-row">
          <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
          <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
        </div>
        <section className="empty-state">
          <h2>Acesso restrito</h2>
          <p>O módulo de Patrimônio exige permissão específica.</p>
        </section>
      </section>
    );
  }

  return (
    <section className="screen patrimony-screen">
      <PatrimonyTopBar />
      <div className="screen-action-row">
        <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
        <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
      </div>
      {notice && <p className={isSuccessNotice(notice) ? "success-message" : "notice-message"}>{notice}</p>}

      <nav className="patrimony-tabs" aria-label="Áreas de Patrimônio">
        <button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}><AppIcon name="reports" size="sm" className="action-icon" />Visão geral</button>
        <button className={activeTab === "operations" ? "active" : ""} type="button" onClick={() => setActiveTab("operations")}><AppIcon name="save" size="sm" className="action-icon" />Entregar / Devolver</button>
        <button className={activeTab === "spaces" ? "active" : ""} type="button" onClick={() => setActiveTab("spaces")}><AppIcon name="map" size="sm" className="action-icon" />Mesas e lockers</button>
        <button className={activeTab === "records" ? "active" : ""} type="button" onClick={() => setActiveTab("records")}><AppIcon name="stock" size="sm" className="action-icon" />Cadastros e histórico</button>
      </nav>

      {loadStatus === "loading" && <section className="empty-state"><h2>Carregando patrimônio...</h2><p>Buscando dados sincronizados no Supabase.</p></section>}
      {loadStatus === "error" && (
        <section className="empty-state">
          <h2>Não foi possível abrir Patrimônio.</h2>
          <p>{notice || "Saia e entre novamente com o Admin Tezzei."}</p>
          <button className="primary-button" type="button" onClick={() => { void refreshDataset(); }}>Tentar novamente</button>
        </section>
      )}
      {loadStatus === "ready" && (
        <>
          {activeTab === "overview" && (
            <OverviewPanel
              activeAssignments={overviewRows}
              itemById={itemById}
              overview={overview}
              onPrimaryAction={(nextTab) => {
                if (nextTab === "people" || nextTab === "items") {
                  setRecordsTab(nextTab);
                  setActiveTab("records");
                  return;
                }
                setActiveTab("operations");
                setOperationMode(nextTab);
              }}
              people={dataset.people}
              personById={personById}
              search={overviewSearch}
              setSearch={setOverviewSearch}
              spaceAssignments={activeSpaceAssignments}
              spaceById={spaceById}
            />
          )}

          {activeTab === "operations" && (
            <OperationsPanel
              actionBusy={actionBusy}
              activeAssignments={activeAssignments}
              activePeople={activePeople}
              assignItemId={assignItemId}
              assignNotes={assignNotes}
              assignPersonId={assignPersonId}
              assignQuantity={assignQuantity}
              assignSpaceId={assignSpaceId}
              assignValid={assignValid}
              availableItems={availableItems}
              itemById={itemById}
              mode={operationMode}
              onAssignSubmit={handleAssignItem}
              onModeChange={setOperationMode}
              onReturnSubmit={handleReturnItem}
              onUpdateAssign={updateAssignForm}
              peopleById={personById}
              returnAssignmentId={returnAssignmentId}
              returnCondition={returnCondition}
              returnNotes={returnNotes}
              returnQuantity={returnQuantity}
              returnValid={returnValid}
              selectedAssignItem={selectedAssignItem}
              selectedAssignPerson={selectedAssignPerson}
              selectedReturnAssignment={selectedReturnAssignment}
              selectedReturnItem={selectedReturnItem}
              selectedReturnPerson={selectedReturnPerson}
              setReturnAssignmentId={setReturnAssignmentId}
              setReturnCondition={setReturnCondition}
              setReturnNotes={setReturnNotes}
              setReturnQuantity={setReturnQuantity}
              spaces={dataset.spaces}
            />
          )}

          {activeTab === "spaces" && (
            <SpacesPanel
              actionBusy={actionBusy}
              activePeople={activePeople}
              activeSpaceBySpaceId={activeSpaceBySpaceId}
              itemById={itemById}
              keyItems={keyItems}
              lockers={lockers}
              onAssignLocker={handleAssignLocker}
              onReleaseLocker={handleReleaseLocker}
              onUpdateSpaceForm={updateSpaceForm}
              personById={personById}
              spaceNotes={spaceNotes}
              spacePersonId={spacePersonId}
              tables={tables}
              activeAssignments={activeAssignments}
              spaceById={spaceById}
            />
          )}

          {activeTab === "records" && (
            <RecordsPanel
              actionBusy={actionBusy}
              activeAssignments={activeAssignments}
              activePeople={activePeople}
              dataset={dataset}
              departments={departments}
              filteredItems={filteredItems}
              filteredMovements={filteredMovements}
              filteredPeople={filteredPeople}
              historyFilters={historyFilters}
              itemById={itemById}
              itemDraft={itemDraft}
              itemSearch={itemSearch}
              onEditItem={(item) => setItemDraft(itemToDraft(item))}
              onEditPerson={(person) => setPersonDraft(personToDraft(person))}
              onHistoryFiltersChange={setHistoryFilters}
              onItemDraftChange={setItemDraft}
              onItemSearchChange={setItemSearch}
              onPersonDepartmentFilterChange={setPersonDepartmentFilter}
              onPersonDraftChange={setPersonDraft}
              onPersonSearchChange={setPersonSearch}
              onPersonStatusFilterChange={setPersonStatusFilter}
              onResetItemDraft={() => setItemDraft(newItemDraft())}
              onResetPersonDraft={() => setPersonDraft(newPersonDraft())}
              onSaveItem={handleSaveItem}
              onSavePerson={handleSavePerson}
              personById={personById}
              personDepartmentFilter={personDepartmentFilter}
              personDraft={personDraft}
              personSearch={personSearch}
              personStatusFilter={personStatusFilter}
              recordsTab={recordsTab}
              setRecordsTab={setRecordsTab}
              spaceById={spaceById}
            />
          )}
        </>
      )}
    </section>
  );
}

function PatrimonyTopBar() {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">HUB SM</p>
        <h1>Patrimônio</h1>
        <p>Itens, pessoas, lockers e histórico de alocações.</p>
      </div>
      <div className="top-bar-actions">
        <SantaMariaBrand compact showTagline={false} className="panel-corner-brand" />
      </div>
    </header>
  );
}

function OverviewPanel({
  overview,
  activeAssignments,
  people,
  personById,
  itemById,
  spaceAssignments,
  spaceById,
  search,
  setSearch,
  onPrimaryAction,
}: {
  overview: {
    individualItems: number;
    availableUnits: number;
    activeAssignments: number;
    attentionItems: number;
    lockersFree: number;
    lockersOccupied: number;
    inactiveWithResponsibility: number;
  };
  activeAssignments: PatrimonyAssignment[];
  people: OrganizationPerson[];
  personById: Map<string, OrganizationPerson>;
  itemById: Map<string, PatrimonyItem>;
  spaceAssignments: PatrimonySpaceAssignment[];
  spaceById: Map<string, PatrimonySpace>;
  search: string;
  setSearch: (value: string) => void;
  onPrimaryAction: (action: "people" | "items" | "assign" | "return") => void;
}) {
  const occupiedPeople = new Set([
    ...activeAssignments.map((assignment) => assignment.personId),
    ...spaceAssignments.map((assignment) => assignment.personId),
  ]);

  return (
    <section className="patrimony-panel">
      <div className="patrimony-action-row">
        <button className="primary-button" type="button" onClick={() => onPrimaryAction("people")}><AppIcon name="users" size="sm" className="action-icon" />Cadastrar pessoa</button>
        <button className="primary-button" type="button" onClick={() => onPrimaryAction("items")}><AppIcon name="stock" size="sm" className="action-icon" />Cadastrar item</button>
        <button className="secondary-button" type="button" onClick={() => onPrimaryAction("assign")}><AppIcon name="save" size="sm" className="action-icon" />Entregar item</button>
        <button className="secondary-button" type="button" onClick={() => onPrimaryAction("return")}><AppIcon name="back" size="sm" className="action-icon" />Registrar devolução</button>
      </div>

      <section className="patrimony-summary-grid" aria-label="Resumo de patrimônio">
        <SummaryCard label="Itens individuais" value={overview.individualItems} note="Bens identificáveis cadastrados" tone="info" />
        <SummaryCard label="Unidades disponíveis" value={overview.availableUnits} note="Saldo guardado em estoque" tone="success" />
        <SummaryCard label="Entregas ativas" value={overview.activeAssignments} note="Itens com responsável" tone="warning" />
        <SummaryCard label="Manutenção / perdidos" value={overview.attentionItems} note="Itens que pedem atenção" tone={overview.attentionItems > 0 ? "danger" : "success"} />
        <SummaryCard label="Lockers livres" value={overview.lockersFree} note="Disponíveis para atribuir" tone="success" />
        <SummaryCard label="Lockers ocupados" value={overview.lockersOccupied} note="Com ocupação ativa" tone="warning" />
        <SummaryCard label="Inativos com item/espaço" value={overview.inactiveWithResponsibility} note="Revisar antes de encerrar" tone={overview.inactiveWithResponsibility > 0 ? "danger" : "success"} />
      </section>

      <section className="patrimony-card">
        <div className="section-title-row">
          <AppIcon name="search" size="md" className="status-icon icon-info" />
          <h2>Quem está com o quê</h2>
        </div>
        <label className="patrimony-search-label">
          Buscar por pessoa, item, código ou setor
          <input type="search" value={search} placeholder="Ex.: notebook, João, LKR" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="patrimony-active-list">
          {activeAssignments.length === 0 ? (
            <p className="empty-copy">Nenhuma entrega ativa encontrada.</p>
          ) : activeAssignments.map((assignment) => {
            const person = personById.get(assignment.personId);
            const item = itemById.get(assignment.itemId);
            return (
              <article className="patrimony-responsibility-card" key={assignment.id}>
                <div>
                  <strong>{item?.name ?? "Item não encontrado"}</strong>
                  <small>{item?.code ?? "Sem código"} • {formatQuantity(getAssignmentOpenQuantity(assignment), item?.unit ?? "unidade")}</small>
                </div>
                <div>
                  <span>{person?.name ?? "Pessoa não encontrada"}</span>
                  <small>{person?.department ?? "Sem setor"}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="patrimony-card">
        <div className="section-title-row">
          <AppIcon name="users" size="md" className="status-icon icon-info" />
          <h2>Pessoas com responsabilidade ativa</h2>
        </div>
        <div className="patrimony-chip-list">
          {people.filter((person) => occupiedPeople.has(person.id)).length === 0 ? (
            <span className="patrimony-chip muted">Nenhuma responsabilidade ativa</span>
          ) : people.filter((person) => occupiedPeople.has(person.id)).map((person) => (
            <span className="patrimony-chip" key={person.id}>{person.name}</span>
          ))}
        </div>
      </section>

      <section className="patrimony-card">
        <div className="section-title-row">
          <AppIcon name="map" size="md" className="status-icon icon-info" />
          <h2>Espaços ocupados</h2>
        </div>
        <div className="patrimony-chip-list">
          {spaceAssignments.length === 0 ? (
            <span className="patrimony-chip muted">Nenhum espaço ocupado</span>
          ) : spaceAssignments.slice(0, 20).map((assignment) => (
            <span className="patrimony-chip" key={assignment.id}>
              {spaceById.get(assignment.spaceId)?.code ?? "Espaço"} • {personById.get(assignment.personId)?.name ?? "Pessoa"}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}

function OperationsPanel(props: {
  mode: OperationMode;
  onModeChange: (mode: OperationMode) => void;
  activePeople: OrganizationPerson[];
  availableItems: PatrimonyItem[];
  spaces: PatrimonySpace[];
  activeAssignments: PatrimonyAssignment[];
  itemById: Map<string, PatrimonyItem>;
  peopleById: Map<string, OrganizationPerson>;
  actionBusy: boolean;
  assignPersonId: string;
  assignItemId: string;
  assignQuantity: string;
  assignSpaceId: string;
  assignNotes: string;
  assignValid: boolean;
  selectedAssignPerson?: OrganizationPerson;
  selectedAssignItem?: PatrimonyItem;
  onUpdateAssign: (update: Partial<{ personId: string; itemId: string; quantity: string; spaceId: string; notes: string }>) => void;
  onAssignSubmit: (event: FormEvent<HTMLFormElement>) => void;
  returnAssignmentId: string;
  returnQuantity: string;
  returnCondition: PatrimonyReturnCondition;
  returnNotes: string;
  returnValid: boolean;
  selectedReturnAssignment?: PatrimonyAssignment;
  selectedReturnItem?: PatrimonyItem;
  selectedReturnPerson?: OrganizationPerson;
  setReturnAssignmentId: (value: string) => void;
  setReturnQuantity: (value: string) => void;
  setReturnCondition: (value: PatrimonyReturnCondition) => void;
  setReturnNotes: (value: string) => void;
  onReturnSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const availableSpaces = props.spaces.filter((space) => space.active && space.status !== "inativo");
  const selectedItem = props.selectedAssignItem;
  const selectedAssignment = props.selectedReturnAssignment;
  const returnOpenQuantity = selectedAssignment ? getAssignmentOpenQuantity(selectedAssignment) : 0;

  return (
    <section className="patrimony-panel">
      <div className="patrimony-segmented" role="tablist" aria-label="Entrega ou devolução">
        <button className={props.mode === "assign" ? "active" : ""} type="button" onClick={() => props.onModeChange("assign")}>Entregar</button>
        <button className={props.mode === "return" ? "active" : ""} type="button" onClick={() => props.onModeChange("return")}>Devolver</button>
      </div>

      {props.mode === "assign" ? (
        <form className="patrimony-operation-card" onSubmit={props.onAssignSubmit}>
          <h2>Pessoa → Item → Quantidade → Confirmar</h2>
          <label>
            Pessoa
            <select value={props.assignPersonId} disabled={props.actionBusy} onChange={(event) => props.onUpdateAssign({ personId: event.target.value })}>
              <option value="">Selecione a pessoa</option>
              {props.activePeople.map((person) => <option key={person.id} value={person.id}>{person.name} • {person.department}</option>)}
            </select>
          </label>
          <label>
            Item disponível
            <select value={props.assignItemId} disabled={props.actionBusy} onChange={(event) => props.onUpdateAssign({ itemId: event.target.value })}>
              <option value="">Selecione o item</option>
              {props.availableItems.map((item) => <option key={item.id} value={item.id}>{item.code} • {item.name} • {formatQuantity(item.availableQuantity, item.unit)}</option>)}
            </select>
          </label>
          {selectedItem && (
            <article className="patrimony-inline-summary">
              <strong>{selectedItem.name}</strong>
              <span>Disponível: {formatQuantity(selectedItem.availableQuantity, selectedItem.unit)}</span>
              <span>{selectedItem.trackingMode === "individual" ? "Item individual: quantidade fixa 1" : "Controle por quantidade"}</span>
            </article>
          )}
          <div className="patrimony-form-grid">
            <label>
              Quantidade
              <input type="number" min="1" step="1" value={props.assignQuantity} disabled={props.actionBusy || selectedItem?.trackingMode === "individual"} onChange={(event) => props.onUpdateAssign({ quantity: event.target.value })} />
            </label>
            <label>
              Espaço/local opcional
              <select value={props.assignSpaceId} disabled={props.actionBusy} onChange={(event) => props.onUpdateAssign({ spaceId: event.target.value })}>
                <option value="">Sem espaço vinculado</option>
                {availableSpaces.map((space) => <option key={space.id} value={space.id}>{space.code} • {space.name}</option>)}
              </select>
            </label>
          </div>
          <details className="patrimony-details">
            <summary>Mais detalhes</summary>
            <label>
              Observação
              <textarea rows={3} value={props.assignNotes} disabled={props.actionBusy} onChange={(event) => props.onUpdateAssign({ notes: event.target.value })} />
            </label>
          </details>
          {props.selectedAssignPerson && selectedItem && (
            <section className={props.assignValid ? "patrimony-confirm-summary ok" : "patrimony-confirm-summary danger"}>
              <strong>Resumo da entrega</strong>
              <span>{props.selectedAssignPerson.name} receberá {formatQuantity(Number(props.assignQuantity), selectedItem.unit)} de {selectedItem.name}.</span>
              <span>Saldo após entrega: {formatQuantity(selectedItem.availableQuantity - Number(props.assignQuantity || 0), selectedItem.unit)}</span>
            </section>
          )}
          <button className="primary-button wide-button" type="submit" disabled={props.actionBusy || !props.assignValid}>
            <AppIcon name="save" size="sm" className="action-icon" />{props.actionBusy ? "Registrando..." : "Confirmar entrega"}
          </button>
        </form>
      ) : (
        <form className="patrimony-operation-card" onSubmit={props.onReturnSubmit}>
          <h2>Entrega ativa → Quantidade → Estado → Confirmar</h2>
          <label>
            Entrega ativa
            <select value={props.returnAssignmentId} disabled={props.actionBusy} onChange={(event) => props.setReturnAssignmentId(event.target.value)}>
              <option value="">Selecione a entrega</option>
              {props.activeAssignments.map((assignment) => {
                const item = props.itemById.get(assignment.itemId);
                const person = props.peopleById.get(assignment.personId);
                return <option key={assignment.id} value={assignment.id}>{person?.name ?? "Pessoa"} • {item?.name ?? "Item"} • pendente {formatQuantity(getAssignmentOpenQuantity(assignment), item?.unit ?? "unidade")}</option>;
              })}
            </select>
          </label>
          {props.selectedReturnItem && props.selectedReturnPerson && (
            <article className="patrimony-inline-summary">
              <strong>{props.selectedReturnItem.name}</strong>
              <span>Com {props.selectedReturnPerson.name}</span>
              <span>Pendente: {formatQuantity(returnOpenQuantity, props.selectedReturnItem.unit)}</span>
            </article>
          )}
          <div className="patrimony-form-grid">
            <label>
              Quantidade
              <input type="number" min="1" step="1" value={props.returnQuantity} disabled={props.actionBusy || props.selectedReturnItem?.trackingMode === "individual"} onChange={(event) => props.setReturnQuantity(event.target.value)} />
            </label>
            <label>
              Estado
              <select value={props.returnCondition} disabled={props.actionBusy} onChange={(event) => props.setReturnCondition(event.target.value as PatrimonyReturnCondition)}>
                {returnConditionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <details className="patrimony-details">
            <summary>Mais detalhes</summary>
            <label>
              Observação
              <textarea rows={3} value={props.returnNotes} disabled={props.actionBusy} onChange={(event) => props.setReturnNotes(event.target.value)} />
            </label>
          </details>
          {props.selectedReturnItem && props.selectedReturnPerson && (
            <section className={props.returnValid ? "patrimony-confirm-summary ok" : "patrimony-confirm-summary danger"}>
              <strong>Resumo da devolução</strong>
              <span>{props.selectedReturnPerson.name} devolverá {formatQuantity(Number(props.returnQuantity), props.selectedReturnItem.unit)} de {props.selectedReturnItem.name}.</span>
              <span>Estado: {returnConditionOptions.find((option) => option.value === props.returnCondition)?.label}</span>
            </section>
          )}
          <button className="primary-button wide-button" type="submit" disabled={props.actionBusy || !props.returnValid}>
            <AppIcon name="save" size="sm" className="action-icon" />{props.actionBusy ? "Registrando..." : "Confirmar devolução"}
          </button>
        </form>
      )}
    </section>
  );
}

function SpacesPanel(props: {
  lockers: PatrimonySpace[];
  tables: PatrimonySpace[];
  keyItems: PatrimonyItem[];
  activePeople: OrganizationPerson[];
  activeSpaceBySpaceId: Map<string, PatrimonySpaceAssignment>;
  personById: Map<string, OrganizationPerson>;
  itemById: Map<string, PatrimonyItem>;
  spaceById: Map<string, PatrimonySpace>;
  activeAssignments: PatrimonyAssignment[];
  spacePersonId: string;
  spaceNotes: string;
  actionBusy: boolean;
  onUpdateSpaceForm: (update: Partial<{ personId: string; notes: string }>) => void;
  onAssignLocker: (locker: PatrimonySpace) => void;
  onReleaseLocker: (assignment: PatrimonySpaceAssignment) => void;
}) {
  return (
    <section className="patrimony-panel">
      <section className="patrimony-card">
        <div className="section-title-row">
          <AppIcon name="map" size="md" className="status-icon icon-info" />
          <h2>Lockers</h2>
        </div>
        <div className="patrimony-form-grid">
          <label>
            Pessoa para atribuir locker livre
            <select value={props.spacePersonId} disabled={props.actionBusy} onChange={(event) => props.onUpdateSpaceForm({ personId: event.target.value })}>
              <option value="">Selecione a pessoa</option>
              {props.activePeople.map((person) => <option key={person.id} value={person.id}>{person.name} • {person.department}</option>)}
            </select>
          </label>
          <label>
            Observação opcional
            <input type="text" value={props.spaceNotes} disabled={props.actionBusy} onChange={(event) => props.onUpdateSpaceForm({ notes: event.target.value })} />
          </label>
        </div>
        <div className="locker-grid">
          {props.lockers.map((locker) => {
            const assignment = props.activeSpaceBySpaceId.get(locker.id);
            const person = assignment ? props.personById.get(assignment.personId) : undefined;
            const occupied = Boolean(assignment) || locker.status === "ocupado";
            return (
              <article className={`locker-card ${occupied ? "occupied" : locker.status === "manutencao" ? "maintenance" : "free"}`} key={locker.id}>
                <strong>{locker.code.replace("LKR-", "")}</strong>
                <span>{locker.code}</span>
                <small>{occupied ? person?.name ?? "Ocupado" : locker.status === "manutencao" ? "Manutenção" : "Livre"}</small>
                {assignment ? (
                  <button className="ghost-button" type="button" disabled={props.actionBusy} onClick={() => props.onReleaseLocker(assignment)}>Liberar</button>
                ) : (
                  <button className="secondary-button" type="button" disabled={props.actionBusy || !props.spacePersonId || locker.status !== "disponivel"} onClick={() => props.onAssignLocker(locker)}>Atribuir</button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="patrimony-card">
        <div className="section-title-row">
          <AppIcon name="reports" size="md" className="status-icon icon-warning" />
          <h2>Mesas da Locação</h2>
        </div>
        {props.tables.length === 0 ? (
          <p className="empty-copy">Nenhuma mesa real foi cadastrada ainda. O levantamento precisa informar código, posição, ocupante e chave vinculada antes de montar a grade.</p>
        ) : (
          <div className="patrimony-space-list">
            {props.tables.map((space) => {
              const assignment = props.activeSpaceBySpaceId.get(space.id);
              return <SpaceRow key={space.id} assignment={assignment} personById={props.personById} space={space} />;
            })}
          </div>
        )}
      </section>

      <section className="patrimony-card">
        <div className="section-title-row">
          <AppIcon name="security" size="md" className="status-icon icon-info" />
          <h2>Chaves vinculadas</h2>
        </div>
        {props.keyItems.length === 0 ? (
          <p className="empty-copy">Nenhuma chave cadastrada como item individual ainda.</p>
        ) : (
          <div className="patrimony-space-list">
            {props.keyItems.map((item) => {
              const assignment = props.activeAssignments.find((current) => current.itemId === item.id);
              const holder = assignment ? props.personById.get(assignment.personId) : undefined;
              const linkedSpace = item.linkedSpaceId ? props.spaceById.get(item.linkedSpaceId) : undefined;
              return (
                <article className="patrimony-list-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.code} • {linkedSpace ? `${linkedSpace.code} - ${linkedSpace.name}` : "Sem espaço vinculado"}</small>
                  </div>
                  <span className={holder ? "patrimony-status-pill warning" : "patrimony-status-pill success"}>{holder ? `Com ${holder.name}` : "Guardada"}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function RecordsPanel(props: {
  recordsTab: RecordsTab;
  setRecordsTab: (tab: RecordsTab) => void;
  dataset: PatrimonyDataset;
  departments: string[];
  filteredPeople: OrganizationPerson[];
  personDraft: OrganizationPersonDraft;
  personSearch: string;
  personStatusFilter: "all" | "active" | "inactive";
  personDepartmentFilter: string;
  activeAssignments: PatrimonyAssignment[];
  activePeople: OrganizationPerson[];
  actionBusy: boolean;
  onPersonDraftChange: (draft: OrganizationPersonDraft) => void;
  onResetPersonDraft: () => void;
  onEditPerson: (person: OrganizationPerson) => void;
  onSavePerson: (event: FormEvent<HTMLFormElement>) => void;
  onPersonSearchChange: (value: string) => void;
  onPersonStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  onPersonDepartmentFilterChange: (value: string) => void;
  filteredItems: PatrimonyItem[];
  itemDraft: PatrimonyItemDraft;
  itemSearch: string;
  onItemDraftChange: (draft: PatrimonyItemDraft) => void;
  onResetItemDraft: () => void;
  onEditItem: (item: PatrimonyItem) => void;
  onSaveItem: (event: FormEvent<HTMLFormElement>) => void;
  onItemSearchChange: (value: string) => void;
  filteredMovements: PatrimonyMovement[];
  historyFilters: { personId: string; itemId: string; spaceId: string; movementType: string; from: string; to: string };
  onHistoryFiltersChange: (filters: { personId: string; itemId: string; spaceId: string; movementType: string; from: string; to: string }) => void;
  personById: Map<string, OrganizationPerson>;
  itemById: Map<string, PatrimonyItem>;
  spaceById: Map<string, PatrimonySpace>;
}) {
  return (
    <section className="patrimony-panel">
      <div className="patrimony-segmented" role="tablist" aria-label="Cadastros e histórico">
        <button className={props.recordsTab === "people" ? "active" : ""} type="button" onClick={() => props.setRecordsTab("people")}>Pessoas</button>
        <button className={props.recordsTab === "items" ? "active" : ""} type="button" onClick={() => props.setRecordsTab("items")}>Itens</button>
        <button className={props.recordsTab === "history" ? "active" : ""} type="button" onClick={() => props.setRecordsTab("history")}>Histórico</button>
      </div>

      {props.recordsTab === "people" && (
        <section className="patrimony-record-layout">
          <form className="patrimony-card patrimony-form" onSubmit={props.onSavePerson}>
            <div className="section-title-row">
              <AppIcon name="users" size="md" className="status-icon icon-info" />
              <h2>{props.personDraft.id ? "Editar pessoa" : "Cadastrar pessoa"}</h2>
            </div>
            <label>Nome<input required value={props.personDraft.name} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, name: event.target.value })} /></label>
            <div className="patrimony-form-grid">
              <label>
                Tipo
                <select value={props.personDraft.personType} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, personType: event.target.value as PatrimonyPersonType })}>
                  {personTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>Setor<input required value={props.personDraft.department} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, department: event.target.value })} /></label>
            </div>
            <details className="patrimony-details">
              <summary>Campos opcionais</summary>
              <div className="patrimony-form-grid">
                <label>Cargo/função<input value={props.personDraft.jobTitle ?? ""} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, jobTitle: event.target.value })} /></label>
                <label>E-mail<input type="email" value={props.personDraft.email ?? ""} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, email: event.target.value })} /></label>
                <label>Telefone<input value={props.personDraft.phone ?? ""} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, phone: event.target.value })} /></label>
                <label className="checkbox-line"><input type="checkbox" checked={props.personDraft.active ?? true} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, active: event.target.checked })} /> Ativa</label>
              </div>
              <label>Observação<textarea rows={3} value={props.personDraft.notes ?? ""} disabled={props.actionBusy} onChange={(event) => props.onPersonDraftChange({ ...props.personDraft, notes: event.target.value })} /></label>
            </details>
            <div className="button-grid">
              <button className="primary-button" type="submit" disabled={props.actionBusy}><AppIcon name="save" size="sm" className="action-icon" />Salvar pessoa</button>
              <button className="ghost-button" type="button" disabled={props.actionBusy} onClick={props.onResetPersonDraft}>Novo cadastro</button>
            </div>
          </form>
          <section className="patrimony-card">
            <PeopleFilters
              departments={props.departments}
              departmentFilter={props.personDepartmentFilter}
              onDepartmentFilterChange={props.onPersonDepartmentFilterChange}
              onSearchChange={props.onPersonSearchChange}
              onStatusFilterChange={props.onPersonStatusFilterChange}
              search={props.personSearch}
              statusFilter={props.personStatusFilter}
            />
            <div className="patrimony-list">
              {props.filteredPeople.length === 0 ? <p className="empty-copy">Nenhuma pessoa encontrada.</p> : props.filteredPeople.map((person) => (
                <PersonListRow
                  activeAssignments={props.activeAssignments}
                  key={person.id}
                  onEdit={() => props.onEditPerson(person)}
                  person={person}
                  spaceAssignments={props.dataset.spaceAssignments}
                />
              ))}
            </div>
          </section>
        </section>
      )}

      {props.recordsTab === "items" && (
        <section className="patrimony-record-layout">
          <form className="patrimony-card patrimony-form" onSubmit={props.onSaveItem}>
            <div className="section-title-row">
              <AppIcon name="stock" size="md" className="status-icon icon-info" />
              <h2>{props.itemDraft.id ? "Editar item" : "Cadastrar item"}</h2>
            </div>
            <div className="patrimony-segmented compact" role="group" aria-label="Modo de controle">
              <button className={props.itemDraft.trackingMode === "individual" ? "active" : ""} type="button" disabled={props.actionBusy} onClick={() => props.onItemDraftChange({ ...props.itemDraft, trackingMode: "individual", totalQuantity: 1, unit: "Unidade" })}>Individual</button>
              <button className={props.itemDraft.trackingMode === "quantidade" ? "active" : ""} type="button" disabled={props.actionBusy} onClick={() => props.onItemDraftChange({ ...props.itemDraft, trackingMode: "quantidade" })}>Por quantidade</button>
            </div>
            <div className="patrimony-form-grid">
              <label>Código<input required value={props.itemDraft.code} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, code: event.target.value.toUpperCase() })} /></label>
              <label>Categoria<input required value={props.itemDraft.category} disabled={props.actionBusy} placeholder="Notebook, mouse, chave..." onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, category: event.target.value })} /></label>
            </div>
            <label>Nome do item<input required value={props.itemDraft.name} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, name: event.target.value })} /></label>
            <div className="patrimony-form-grid">
              <label>
                Quantidade total
                <input type="number" min="0" step="1" value={props.itemDraft.totalQuantity} disabled={props.actionBusy || props.itemDraft.trackingMode === "individual"} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, totalQuantity: Number(event.target.value) })} />
              </label>
              <label>Unidade<input value={props.itemDraft.unit} disabled={props.actionBusy || props.itemDraft.trackingMode === "individual"} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, unit: event.target.value })} /></label>
            </div>
            <details className="patrimony-details">
              <summary>Campos opcionais</summary>
              <div className="patrimony-form-grid">
                <label>Marca<input value={props.itemDraft.brand ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, brand: event.target.value })} /></label>
                <label>Modelo<input value={props.itemDraft.model ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, model: event.target.value })} /></label>
                <label>Série<input value={props.itemDraft.serialNumber ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, serialNumber: event.target.value })} /></label>
                <label>Data de aquisição<input type="date" value={props.itemDraft.acquisitionDate ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, acquisitionDate: event.target.value })} /></label>
                <label>
                  Espaço de estoque
                  <select value={props.itemDraft.storageSpaceId ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, storageSpaceId: event.target.value })}>
                    <option value="">Sem local fixo</option>
                    {props.dataset.spaces.filter((space) => space.active).map((space) => <option key={space.id} value={space.id}>{space.code} • {space.name}</option>)}
                  </select>
                </label>
                <label>
                  Espaço vinculado
                  <select value={props.itemDraft.linkedSpaceId ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, linkedSpaceId: event.target.value })}>
                    <option value="">Sem vínculo</option>
                    {props.dataset.spaces.filter((space) => space.active).map((space) => <option key={space.id} value={space.id}>{space.code} • {space.name}</option>)}
                  </select>
                </label>
                <label className="checkbox-line"><input type="checkbox" checked={props.itemDraft.active ?? true} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, active: event.target.checked })} /> Ativo</label>
              </div>
              <label>Observação<textarea rows={3} value={props.itemDraft.notes ?? ""} disabled={props.actionBusy} onChange={(event) => props.onItemDraftChange({ ...props.itemDraft, notes: event.target.value })} /></label>
            </details>
            <div className="button-grid">
              <button className="primary-button" type="submit" disabled={props.actionBusy}><AppIcon name="save" size="sm" className="action-icon" />Salvar item</button>
              <button className="ghost-button" type="button" disabled={props.actionBusy} onClick={props.onResetItemDraft}>Novo cadastro</button>
            </div>
          </form>
          <section className="patrimony-card">
            <label className="patrimony-search-label">
              Buscar item
              <input type="search" value={props.itemSearch} placeholder="Código, nome, categoria, marca..." onChange={(event) => props.onItemSearchChange(event.target.value)} />
            </label>
            <div className="patrimony-list">
              {props.filteredItems.length === 0 ? <p className="empty-copy">Nenhum item cadastrado ainda.</p> : props.filteredItems.map((item) => (
                <article className="patrimony-list-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.code} • {item.category} • {item.trackingMode === "individual" ? "Individual" : "Por quantidade"}</small>
                    <small>Total {formatQuantity(item.totalQuantity, item.unit)} • disponível {formatQuantity(item.availableQuantity, item.unit)}</small>
                  </div>
                  <span className={`patrimony-status-pill ${getItemTone(item)}`}>{getItemStatusLabel(item)}</span>
                  <button className="secondary-button" type="button" onClick={() => props.onEditItem(item)}><AppIcon name="edit" size="sm" className="action-icon" />Editar</button>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {props.recordsTab === "history" && (
        <section className="patrimony-card">
          <div className="section-title-row">
            <AppIcon name="reports" size="md" className="status-icon icon-info" />
            <h2>Histórico de movimentações</h2>
          </div>
          <div className="patrimony-filter-grid">
            <label>Pessoa<select value={props.historyFilters.personId} onChange={(event) => props.onHistoryFiltersChange({ ...props.historyFilters, personId: event.target.value })}><option value="all">Todas</option>{props.dataset.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label>Item<select value={props.historyFilters.itemId} onChange={(event) => props.onHistoryFiltersChange({ ...props.historyFilters, itemId: event.target.value })}><option value="all">Todos</option>{props.dataset.items.map((item) => <option key={item.id} value={item.id}>{item.code} • {item.name}</option>)}</select></label>
            <label>Espaço<select value={props.historyFilters.spaceId} onChange={(event) => props.onHistoryFiltersChange({ ...props.historyFilters, spaceId: event.target.value })}><option value="all">Todos</option>{props.dataset.spaces.map((space) => <option key={space.id} value={space.id}>{space.code} • {space.name}</option>)}</select></label>
            <label>Tipo<select value={props.historyFilters.movementType} onChange={(event) => props.onHistoryFiltersChange({ ...props.historyFilters, movementType: event.target.value })}><option value="all">Todos</option>{Object.entries(movementTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>De<input type="date" value={props.historyFilters.from} onChange={(event) => props.onHistoryFiltersChange({ ...props.historyFilters, from: event.target.value })} /></label>
            <label>Até<input type="date" value={props.historyFilters.to} onChange={(event) => props.onHistoryFiltersChange({ ...props.historyFilters, to: event.target.value })} /></label>
          </div>
          <div className="patrimony-list">
            {props.filteredMovements.length === 0 ? <p className="empty-copy">Nenhuma movimentação encontrada.</p> : props.filteredMovements.map((movement) => (
              <MovementRow key={movement.id} itemById={props.itemById} movement={movement} personById={props.personById} spaceById={props.spaceById} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function SummaryCard({ label, value, note, tone }: { label: string; value: number; note: string; tone: "success" | "warning" | "danger" | "info" }) {
  return (
    <article className={`patrimony-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function PeopleFilters(props: {
  search: string;
  statusFilter: "all" | "active" | "inactive";
  departmentFilter: string;
  departments: string[];
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  onDepartmentFilterChange: (value: string) => void;
}) {
  return (
    <div className="patrimony-filter-grid">
      <label>Buscar<input type="search" value={props.search} placeholder="Nome, setor ou função" onChange={(event) => props.onSearchChange(event.target.value)} /></label>
      <label>Status<select value={props.statusFilter} onChange={(event) => props.onStatusFilterChange(event.target.value as "all" | "active" | "inactive")}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
      <label>Setor<select value={props.departmentFilter} onChange={(event) => props.onDepartmentFilterChange(event.target.value)}><option value="all">Todos</option>{props.departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
    </div>
  );
}

function PersonListRow({ person, activeAssignments, spaceAssignments, onEdit }: { person: OrganizationPerson; activeAssignments: PatrimonyAssignment[]; spaceAssignments: PatrimonySpaceAssignment[]; onEdit: () => void }) {
  const itemCount = activeAssignments.filter((assignment) => assignment.personId === person.id).length;
  const spaceCount = spaceAssignments.filter((assignment) => assignment.personId === person.id && !assignment.releasedAt).length;
  return (
    <article className="patrimony-list-row">
      <div>
        <strong>{person.name}</strong>
        <small>{getPersonTypeLabel(person.personType)} • {person.department}</small>
        <small>{itemCount} item(ns) ativo(s) • {spaceCount} espaço(s)</small>
      </div>
      <span className={person.active ? "patrimony-status-pill success" : "patrimony-status-pill muted"}>{person.active ? "Ativa" : "Inativa"}</span>
      <button className="secondary-button" type="button" onClick={onEdit}><AppIcon name="edit" size="sm" className="action-icon" />Editar</button>
    </article>
  );
}

function SpaceRow({ space, assignment, personById }: { space: PatrimonySpace; assignment?: PatrimonySpaceAssignment; personById: Map<string, OrganizationPerson> }) {
  const person = assignment ? personById.get(assignment.personId) : undefined;
  return (
    <article className="patrimony-list-row">
      <div>
        <strong>{space.code} • {space.name}</strong>
        <small>{space.department} • {space.locationDetail ?? "Sem detalhe"}</small>
      </div>
      <span className={assignment ? "patrimony-status-pill warning" : "patrimony-status-pill success"}>{assignment ? `Com ${person?.name ?? "pessoa"}` : "Livre"}</span>
    </article>
  );
}

function MovementRow({ movement, personById, itemById, spaceById }: { movement: PatrimonyMovement; personById: Map<string, OrganizationPerson>; itemById: Map<string, PatrimonyItem>; spaceById: Map<string, PatrimonySpace> }) {
  const person = movement.personId ? personById.get(movement.personId) : undefined;
  const item = movement.itemId ? itemById.get(movement.itemId) : undefined;
  const space = movement.spaceId ? spaceById.get(movement.spaceId) : undefined;
  return (
    <article className="patrimony-list-row">
      <div>
        <strong>{movementTypeLabels[movement.movementType] ?? movement.movementType}</strong>
        <small>{formatDateTime(movement.createdAt)} • {movement.actorName}</small>
        <small>{[person?.name, item?.name, space?.code].filter(Boolean).join(" • ") || "Movimentação patrimonial"}</small>
      </div>
      <span className="patrimony-status-pill muted">{formatQuantity(movement.quantity, item?.unit ?? "unidade")}</span>
    </article>
  );
}

function personToDraft(person: OrganizationPerson): OrganizationPersonDraft {
  return {
    id: person.id,
    name: person.name,
    personType: person.personType,
    department: person.department,
    jobTitle: person.jobTitle ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    active: person.active,
    notes: person.notes ?? "",
  };
}

function itemToDraft(item: PatrimonyItem): PatrimonyItemDraft {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    category: item.category,
    trackingMode: item.trackingMode,
    brand: item.brand ?? "",
    model: item.model ?? "",
    serialNumber: item.serialNumber ?? "",
    unit: item.unit,
    totalQuantity: item.totalQuantity,
    storageSpaceId: item.storageSpaceId ?? "",
    linkedSpaceId: item.linkedSpaceId ?? "",
    acquisitionDate: item.acquisitionDate ?? "",
    active: item.active,
    notes: item.notes ?? "",
  };
}

function getAssignmentOpenQuantity(assignment: PatrimonyAssignment) {
  return Math.max(0, assignment.quantity - assignment.returnedQuantity);
}

function getPersonTypeLabel(type: PatrimonyPersonType) {
  return personTypeOptions.find((option) => option.value === type)?.label ?? "Outro";
}

function getItemStatusLabel(item: PatrimonyItem) {
  if (!item.active) return "Inativo";
  if (item.status === "disponivel") return "Disponível";
  if (item.status === "em_uso") return "Em uso";
  if (item.status === "parcialmente_em_uso") return "Parcial";
  if (item.status === "manutencao") return "Manutenção";
  if (item.status === "extraviado") return "Perdido";
  if (item.status === "baixado") return "Baixado";
  return "Indisponível";
}

function getItemTone(item: PatrimonyItem) {
  if (!item.active || item.status === "baixado" || item.status === "extraviado" || item.status === "indisponivel") return "danger";
  if (item.status === "manutencao") return "warning";
  if (item.availableQuantity > 0) return "success";
  return "warning";
}

function clampQuantity(value: string, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "1";
  return String(Math.min(number, Math.max(1, max)));
}

function formatQuantity(value: number, unit: string) {
  const cleanUnit = unit || "unidade";
  const formatted = Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${formatted} ${value === 1 ? singularizeUnit(cleanUnit) : pluralizeUnit(cleanUnit)}`;
}

function singularizeUnit(unit: string) {
  const lower = unit.toLowerCase();
  if (lower.endsWith("ões")) return unit.slice(0, -3) + "ão";
  if (lower.endsWith("s")) return unit.slice(0, -1);
  return unit;
}

function pluralizeUnit(unit: string) {
  const lower = unit.toLowerCase();
  if (lower.endsWith("s")) return unit;
  if (lower.endsWith("ão")) return unit.slice(0, -2) + "ões";
  return `${unit}s`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isSuccessNotice(message: string) {
  const normalized = normalizeText(message);
  return normalized.includes("salv") || normalized.includes("registr") || normalized.includes("liberad") || normalized.includes("atribuid");
}
