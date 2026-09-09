import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadEquipmentModels } from "./services/equipmentModelService";
import { loadPatrimonyDataset } from "./services/patrimonyService";
import { loadPersonNotebookUsage } from "./services/personNotebookUsageService";
import {
  getNotebookItemEditErrorMessage,
  loadNotebookItemAudit,
  updateInventoryNotebookWithAudit,
  type NotebookItemAuditEntry,
} from "./services/notebookItemEditService";
import type { PatrimonyEquipmentModel, PatrimonyItem } from "./types/patrimony.types";
import "./notebookItemEdit.css";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

function extractObservation(item: PatrimonyItem, model?: PatrimonyEquipmentModel) {
  const notes = item.notes?.trim() ?? "";
  if (!notes) return "";
  const marker = "Observação:";
  const markerIndex = notes.indexOf(marker);
  if (markerIndex >= 0) return notes.slice(markerIndex + marker.length).trim();
  if (model?.description && notes === model.description.trim()) return "";
  return notes;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function openQuantity(quantity: number, returnedQuantity: number) {
  return Math.max(0, quantity - returnedQuantity);
}

export function NotebookItemEditEnhancer() {
  const [item, setItem] = useState<PatrimonyItem | null>(null);
  const [models, setModels] = useState<PatrimonyEquipmentModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [observation, setObservation] = useState("");
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [offsiteUse, setOffsiteUse] = useState(false);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<NotebookItemAuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".notebook-card").forEach((card) => {
        const status = card.querySelector<HTMLElement>(".notebook-card-status");
        if (!status || status.querySelector("[data-notebook-item-edit='true']")) return;
        const code = card.querySelector<HTMLElement>(".notebook-code")?.textContent?.trim();
        if (!code) return;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Editar";
        button.className = "notebook-item-edit-button";
        button.dataset.notebookItemEdit = "true";
        button.addEventListener("click", () => { void openEditor(code); });
        status.appendChild(button);
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const activeModels = useMemo(
    () => models.filter((model) => model.active && normalize(model.category) === "notebook"),
    [models],
  );

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId),
    [modelId, models],
  );

  async function openEditor(code: string) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const [dataset, nextModels, usageByPersonId] = await Promise.all([
        loadPatrimonyDataset(),
        loadEquipmentModels(),
        loadPersonNotebookUsage(),
      ]);
      const notebook = dataset.items.find((entry) => entry.active && entry.code === code);
      if (!notebook) {
        setError(`Não encontrei o notebook ${code}. Atualize a tela e tente novamente.`);
        return;
      }
      const currentModel = notebook.equipmentModelId
        ? nextModels.find((model) => model.id === notebook.equipmentModelId)
        : nextModels.find((model) => normalize(model.name) === normalize(notebook.name));
      const assignment = dataset.assignments.find(
        (entry) => entry.itemId === notebook.id && openQuantity(entry.quantity, entry.returnedQuantity) > 0,
      );
      const owner = assignment ? dataset.people.find((entry) => entry.id === assignment.personId) : undefined;
      setItem(notebook);
      setModels(nextModels);
      setModelId(currentModel?.id ?? notebook.equipmentModelId ?? "");
      setSerialNumber(notebook.serialNumber ?? "");
      setObservation(extractObservation(notebook, currentModel));
      setPersonId(owner?.id ?? "");
      setPersonName(owner?.name ?? "");
      setOffsiteUse(owner ? Boolean(usageByPersonId.get(owner.id)) : false);
      setReason("");
      setHistory([]);
      void loadNotebookItemAudit(notebook.id).then(setHistory).catch(() => setHistory([]));
    } catch (openError) {
      setError(getNotebookItemEditErrorMessage(openError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!item || !modelId || busy) return;
    if (reason.trim().length < 3) {
      setError("Informe o motivo da alteração.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateInventoryNotebookWithAudit({
        itemId: item.id,
        equipmentModelId: modelId,
        serialNumber,
        observation,
        offsiteUse: personId ? offsiteUse : false,
        actorName: getActorName(),
        reason,
      });
      const [dataset, nextHistory, usageByPersonId] = await Promise.all([
        loadPatrimonyDataset(),
        loadNotebookItemAudit(item.id),
        loadPersonNotebookUsage(),
      ]);
      const updated = dataset.items.find((entry) => entry.id === item.id);
      if (updated) setItem(updated);
      if (personId) setOffsiteUse(Boolean(usageByPersonId.get(personId)));
      setHistory(nextHistory);
      setReason("");
      setMessage("Notebook atualizado e alteração registrada no histórico.");
      window.dispatchEvent(new CustomEvent("hub:organization-directory-updated"));
      const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".notebook-inventory-toolbar button"))
        .find((button) => normalize(button.textContent ?? "").includes("atualizar"));
      refreshButton?.click();
    } catch (saveError) {
      setError(getNotebookItemEditErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return error ? createPortal(
      <div className="notebook-item-edit-floating-error" role="alert" onClick={() => setError("")}>{error}</div>,
      document.body,
    ) : null;
  }

  return createPortal(
    <div className="notebook-item-edit-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) setItem(null);
    }}>
      <section className="notebook-item-edit-modal" role="dialog" aria-modal="true" aria-label={`Editar ${item.code}`}>
        <header>
          <div>
            <h3>Editar notebook</h3>
            <p>{item.code} · o vínculo com a pessoa será mantido</p>
          </div>
          <button type="button" onClick={() => setItem(null)} disabled={busy}>×</button>
        </header>

        <div className="notebook-item-edit-rule">
          Aqui você corrige o equipamento e informa se a pessoa utiliza o notebook fora do prédio. Toda alteração fica registrada.
        </div>

        {error && <div className="notebook-item-edit-error" role="alert">{error}</div>}
        {message && <div className="notebook-item-edit-success" role="status">{message}</div>}

        <label>
          Modelo do notebook
          <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={loading || busy}>
            <option value="">Selecione</option>
            {activeModels.map((model) => (
              <option key={model.id} value={model.id}>{model.name} — {model.description}</option>
            ))}
          </select>
        </label>

        {selectedModel && (
          <div className="notebook-item-edit-selected-model">
            <strong>{selectedModel.name}</strong>
            <span>{selectedModel.description}</span>
          </div>
        )}

        <div className="notebook-item-edit-grid">
          <label>
            Número de série <small>(opcional)</small>
            <input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} disabled={busy} />
          </label>
          <label>
            Observação <small>(opcional)</small>
            <input value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Ex.: marca na tampa" disabled={busy} />
          </label>
          <label>
            Uso fora do prédio
            <select value={offsiteUse ? "sim" : "nao"} onChange={(event) => setOffsiteUse(event.target.value === "sim")} disabled={busy || !personId}>
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
            <small>{personId ? `Pessoa: ${personName}` : "Notebook sem pessoa vinculada"}</small>
          </label>
        </div>

        <label className="notebook-item-edit-reason">
          Por que foi editado? <strong>obrigatório</strong>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: pessoa passou a utilizar o notebook fora do prédio"
            disabled={busy}
          />
        </label>

        <section className="notebook-item-edit-history">
          <div><h4>Histórico deste notebook</h4><span>{history.length}</span></div>
          {history.length === 0 && <p>Nenhuma edição registrada ainda.</p>}
          {history.map((entry) => (
            <article key={entry.id}>
              <strong>{formatDate(entry.createdAt)} · {entry.actorName}</strong>
              <p>{entry.changeSummary}</p>
              <small>Motivo: {entry.reason}</small>
            </article>
          ))}
        </section>

        <footer>
          <button type="button" onClick={() => setItem(null)} disabled={busy}>Cancelar</button>
          <button className="primary" type="button" onClick={() => { void handleSave(); }} disabled={busy || !modelId || reason.trim().length < 3}>
            {busy ? "Salvando..." : "Salvar alteração"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
