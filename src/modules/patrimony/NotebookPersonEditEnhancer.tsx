import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadPatrimonyDataset } from "./services/patrimonyService";
import {
  getInventoryEditErrorMessage,
  loadInventoryPersonAudit,
  updateInventoryPersonWithAudit,
  type InventoryPersonAuditEntry,
} from "./services/inventoryPersonEditService";
import type {
  OrganizationPerson,
  PatrimonyAssignment,
  PatrimonyDataset,
  PatrimonyItem,
  PatrimonyPersonType,
} from "./types/patrimony.types";
import "./inventoryPersonEdit.css";

const EMPTY_DATASET: PatrimonyDataset = {
  people: [],
  items: [],
  assignments: [],
  spaces: [],
  spaceAssignments: [],
  movements: [],
};

type EditDraft = {
  name: string;
  personType: PatrimonyPersonType;
  department: string;
  teamName: string;
  jobTitle: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isNotebook(item: PatrimonyItem) {
  const text = normalize(`${item.category} ${item.name}`);
  return item.active && item.trackingMode === "individual" && (text.includes("notebook") || text.includes("laptop"));
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

function personToDraft(person: OrganizationPerson): EditDraft {
  return {
    name: person.name,
    personType: person.personType,
    department: person.department,
    teamName: person.teamName ?? "",
    jobTitle: person.jobTitle ?? "",
  };
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function NotebookPersonEditEnhancer() {
  const datasetRef = useRef<PatrimonyDataset>(EMPTY_DATASET);
  const [dataset, setDataset] = useState<PatrimonyDataset>(EMPTY_DATASET);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [notebookItemId, setNotebookItemId] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<InventoryPersonAuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshDataset() {
    const next = await loadPatrimonyDataset();
    datasetRef.current = next;
    setDataset(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    const refreshWhenVisible = () => {
      if (!document.querySelector(".patrimony-screen")) return;
      void loadPatrimonyDataset().then((next) => {
        if (cancelled) return;
        datasetRef.current = next;
        setDataset(next);
      }).catch(() => undefined);
    };
    refreshWhenVisible();
    const observer = new MutationObserver(refreshWhenVisible);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".notebook-directory-list article").forEach((article) => {
        if (article.querySelector("[data-inventory-person-edit='true']")) return;
        const strong = article.querySelector("strong");
        if (!strong?.textContent?.trim()) return;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Editar";
        button.className = "inventory-person-edit-button";
        button.dataset.inventoryPersonEdit = "true";
        button.addEventListener("click", () => {
          void openEditor(strong.textContent?.trim() ?? "", article.querySelector("span")?.textContent ?? "");
        });
        const deleteButton = article.querySelector<HTMLButtonElement>("button.danger-link");
        if (deleteButton) article.insertBefore(button, deleteButton);
        else article.appendChild(button);
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const notebookItems = useMemo(
    () => dataset.items.filter(isNotebook).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })),
    [dataset.items],
  );

  const activeAssignments = useMemo(
    () => dataset.assignments.filter((assignment) => openQuantity(assignment) > 0),
    [dataset.assignments],
  );

  const assignmentByNotebook = useMemo(() => {
    const notebookIds = new Set(notebookItems.map((item) => item.id));
    return new Map(activeAssignments.filter((assignment) => notebookIds.has(assignment.itemId)).map((assignment) => [assignment.itemId, assignment]));
  }, [activeAssignments, notebookItems]);

  const currentPerson = editingPersonId ? dataset.people.find((person) => person.id === editingPersonId) : undefined;
  const selectedNotebookAssignment = notebookItemId ? assignmentByNotebook.get(notebookItemId) : undefined;
  const selectedNotebookOwner = selectedNotebookAssignment
    ? dataset.people.find((person) => person.id === selectedNotebookAssignment.personId)
    : undefined;

  const departments = useMemo(
    () => Array.from(new Set(dataset.people.map((person) => person.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [dataset.people],
  );
  const teams = useMemo(
    () => Array.from(new Set(dataset.people.map((person) => person.teamName ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [dataset.people],
  );

  async function openEditor(name: string, details: string) {
    setError("");
    setMessage("");
    try {
      const next = await refreshDataset();
      const exact = next.people.filter((person) => person.active && person.name === name);
      let person = exact[0];
      if (exact.length > 1) {
        person = exact.find((candidate) => details.includes(candidate.department)) ?? exact[0];
      }
      if (!person) {
        setError(`Não encontrei o cadastro de ${name}. Atualize a tela e tente novamente.`);
        return;
      }
      const notebookIds = new Set(next.items.filter(isNotebook).map((item) => item.id));
      const currentAssignment = next.assignments.find(
        (assignment) => assignment.personId === person.id && notebookIds.has(assignment.itemId) && openQuantity(assignment) > 0,
      );
      setEditingPersonId(person.id);
      setDraft(personToDraft(person));
      setNotebookItemId(currentAssignment?.itemId ?? "");
      setReason("");
      setHistory([]);
      setLoadingHistory(true);
      void loadInventoryPersonAudit(person.id)
        .then(setHistory)
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false));
    } catch (openError) {
      setError(getInventoryEditErrorMessage(openError));
    }
  }

  async function handleSave() {
    if (!editingPersonId || !draft || busy) return;
    if (!draft.name.trim() || !draft.department.trim()) {
      setError("Nome e setor são obrigatórios.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Informe o motivo da alteração.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateInventoryPersonWithAudit({
        personId: editingPersonId,
        name: draft.name,
        personType: draft.personType,
        department: draft.department,
        teamName: draft.teamName,
        jobTitle: draft.jobTitle,
        notebookItemId: notebookItemId || undefined,
        actorName: getActorName(),
        reason,
      });
      const next = await refreshDataset();
      const refreshedPerson = next.people.find((person) => person.id === editingPersonId);
      if (refreshedPerson) setDraft(personToDraft(refreshedPerson));
      const refreshedHistory = await loadInventoryPersonAudit(editingPersonId);
      setHistory(refreshedHistory);
      setReason("");
      setMessage("Alteração salva e registrada no histórico.");
      window.dispatchEvent(new CustomEvent("hub:organization-directory-updated"));
      const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notebook-inventory-toolbar button"))
        .find((button) => normalize(button.textContent ?? "").includes("atualizar"));
      refreshButton?.click();
    } catch (saveError) {
      setError(getInventoryEditErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  if (!editingPersonId || !draft) return error ? createPortal(
    <div className="inventory-edit-floating-error" role="alert" onClick={() => setError("")}>{error}</div>,
    document.body,
  ) : null;

  const currentNotebookAssignment = activeAssignments.find(
    (assignment) => assignment.personId === editingPersonId && notebookItems.some((item) => item.id === assignment.itemId),
  );
  const currentNotebook = currentNotebookAssignment
    ? notebookItems.find((item) => item.id === currentNotebookAssignment.itemId)
    : undefined;
  const transferWarning = selectedNotebookOwner && selectedNotebookOwner.id !== editingPersonId
    ? `${selectedNotebookOwner.name} está com este notebook hoje. Ao salvar, o vínculo será transferido para ${draft.name}.`
    : "";
  const replacingWarning = currentNotebook && notebookItemId && currentNotebook.id !== notebookItemId
    ? `${currentNotebook.code} ficará disponível/reserva após a correção.`
    : "";

  return createPortal(
    <div className="inventory-person-edit-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) setEditingPersonId(null);
    }}>
      <section className="inventory-person-edit-modal" role="dialog" aria-modal="true" aria-label={`Editar ${currentPerson?.name ?? draft.name}`}>
        <header>
          <div>
            <h3>Editar cadastro</h3>
            <p>{currentPerson?.name ?? draft.name}</p>
          </div>
          <button type="button" onClick={() => setEditingPersonId(null)} disabled={busy}>×</button>
        </header>

        <div className="inventory-edit-rule">
          Toda alteração exige um motivo e fica registrada com data, hora, responsável, antes e depois.
        </div>
        {error && <div className="inventory-edit-error" role="alert">{error}</div>}
        {message && <div className="inventory-edit-success" role="status">{message}</div>}

        <div className="inventory-edit-grid">
          <label>
            Nome
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Equipe / gerente
            <select value={draft.teamName} onChange={(event) => setDraft({ ...draft, teamName: event.target.value })}>
              <option value="">Sem equipe / gerente</option>
              {teams.map((team) => <option key={team} value={team}>{team.replace(/^Equipe\s+/i, "")}</option>)}
            </select>
          </label>
          <label>
            Setor
            <select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>
              <option value="">Selecione</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label>
            Função
            <input value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} />
          </label>
          <label>
            Tipo
            <select value={draft.personType} onChange={(event) => setDraft({ ...draft, personType: event.target.value as PatrimonyPersonType })}>
              <option value="funcionario">Funcionário</option>
              <option value="corretor_terceirizado">Corretor</option>
              <option value="consultor_terceirizado">Consultor</option>
              <option value="prestador">Prestador</option>
              <option value="temporario">Temporário</option>
              <option value="outro">Outro</option>
            </select>
          </label>
        </div>

        <label className="inventory-edit-notebook-field">
          Notebook vinculado
          <select value={notebookItemId} onChange={(event) => setNotebookItemId(event.target.value)}>
            <option value="">Sem notebook / reserva</option>
            {notebookItems.map((item) => {
              const assignment = assignmentByNotebook.get(item.id);
              const owner = assignment ? dataset.people.find((person) => person.id === assignment.personId) : undefined;
              const ownerLabel = owner ? ` · hoje: ${owner.name}` : " · disponível";
              return <option key={item.id} value={item.id}>{item.code} · {item.name}{item.serialNumber ? ` · série ${item.serialNumber}` : ""}{ownerLabel}</option>;
            })}
          </select>
        </label>

        {(transferWarning || replacingWarning) && (
          <div className="inventory-edit-warning">
            {transferWarning && <p>{transferWarning}</p>}
            {replacingWarning && <p>{replacingWarning}</p>}
          </div>
        )}

        <label className="inventory-edit-reason">
          Motivo da alteração <strong>obrigatório</strong>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: notebook foi cadastrado na pessoa errada"
          />
        </label>

        <section className="inventory-edit-history">
          <div className="inventory-edit-history-title">
            <h4>Histórico de alterações</h4>
            <span>{history.length}</span>
          </div>
          {loadingHistory && <p>Carregando histórico...</p>}
          {!loadingHistory && history.length === 0 && <p>Nenhuma alteração registrada ainda.</p>}
          {!loadingHistory && history.map((entry) => (
            <article key={entry.id}>
              <div><strong>{formatDate(entry.createdAt)}</strong><span>{entry.actorName}</span></div>
              <p>{entry.changeSummary}</p>
              <small>Motivo: {entry.reason}</small>
            </article>
          ))}
        </section>

        <footer>
          <button type="button" onClick={() => setEditingPersonId(null)} disabled={busy}>Cancelar</button>
          <button className="primary" type="button" onClick={() => { void handleSave(); }} disabled={busy || reason.trim().length < 3}>
            {busy ? "Salvando..." : "Salvar alterações"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
