import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "../../components/AppIcon";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import { santaMariaRequestSectors } from "../../config/santaMariaSectors";
import { getHubTaskErrorMessage, loadActiveHubTaskByServiceRequestId } from "../tasks/services/taskService";
import type { HubTask } from "../tasks/types/task.types";
import type { ManagedUser, UserPermission } from "../../types";
import {
  getAdminServiceRequestErrorMessage,
  loadServiceRequestDataset,
  updateServiceRequest,
} from "./services/serviceRequestService";
import type {
  ServiceRequest,
  ServiceRequestDataset,
  ServiceRequestStatus,
} from "./types/serviceRequest.types";
import "./serviceRequests.css";

type ServiceRequestsScreenProps = {
  currentUser: ManagedUser;
  permissions: UserPermission[];
  onAddToTasks: (request: ServiceRequest, protocol: string) => void;
  onOpenLinkedTask: (taskId: string) => void;
  onBack: () => void;
  onLogout: () => void;
};

type LoadState = "loading" | "ready" | "error";
type StatusFilter = "all" | ServiceRequestStatus;

const emptyDataset: ServiceRequestDataset = { requests: [], events: [] };

const statusLabels: Record<ServiceRequestStatus, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const statusOrder: ServiceRequestStatus[] = [
  "novo",
  "em_andamento",
  "aguardando",
  "concluido",
  "cancelado",
];

export function ServiceRequestsScreen({
  currentUser,
  permissions,
  onAddToTasks,
  onOpenLinkedTask,
  onBack,
  onLogout,
}: ServiceRequestsScreenProps) {
  const canAccess = permissions.includes("chamados");
  const canUseTasks = permissions.includes("afazeres");
  const [dataset, setDataset] = useState<ServiceRequestDataset>(emptyDataset);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkedTaskByRequestId, setLinkedTaskByRequestId] = useState<Record<string, HubTask | null>>({});
  const [linkedTaskLoadingId, setLinkedTaskLoadingId] = useState("");

  const selectedRequest = useMemo(
    () => dataset.requests.find((request) => request.id === selectedRequestId) ?? null,
    [dataset.requests, selectedRequestId],
  );
  const selectedLinkedTask = selectedRequest ? linkedTaskByRequestId[selectedRequest.id] : null;

  const departments = useMemo(() => {
    const values = [
      ...santaMariaRequestSectors,
      ...dataset.requests.map((request) => request.department),
    ];
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dataset.requests]);

  const metrics = useMemo(() => ({
    novo: dataset.requests.filter((request) => request.status === "novo").length,
    emAndamento: dataset.requests.filter((request) => request.status === "em_andamento").length,
    aguardando: dataset.requests.filter((request) => request.status === "aguardando").length,
    concluido: dataset.requests.filter((request) => request.status === "concluido").length,
  }), [dataset.requests]);

  const filteredRequests = useMemo(() => {
    const query = normalize(searchText.trim());
    return dataset.requests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      if (departmentFilter !== "all" && request.department !== departmentFilter) return false;
      if (!query) return true;
      const searchable = normalize([
        formatProtocol(request.protocolNumber, request.openedAt),
        request.requesterName,
        request.department,
        request.requestText,
      ].join(" "));
      return searchable.includes(query);
    });
  }, [dataset.requests, departmentFilter, searchText, statusFilter]);

  useEffect(() => {
    if (!canAccess) return;
    void refresh();
  }, [canAccess]);

  useEffect(() => {
    if (!selectedRequest) return;
    setNoteDraft(selectedRequest.adminNotes ?? "");
  }, [selectedRequest]);

  useEffect(() => {
    if (!selectedRequest || !canUseTasks) return;
    void refreshLinkedTask(selectedRequest.id);
  }, [canUseTasks, selectedRequest]);

  async function refresh() {
    setLoadState("loading");
    setNotice("");
    try {
      setDataset(await loadServiceRequestDataset());
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setNotice(getAdminServiceRequestErrorMessage(error));
    }
  }

  function openRequest(request: ServiceRequest) {
    setSelectedRequestId(request.id);
    setNoteDraft(request.adminNotes ?? "");
    setNotice("");
  }

  function closeRequest() {
    if (busyRequestId) return;
    setSelectedRequestId(null);
    setNoteDraft("");
  }

  async function changeStatus(request: ServiceRequest, status: ServiceRequestStatus) {
    if (busyRequestId) return;
    setBusyRequestId(request.id);
    setNotice("");
    try {
      const updated = await updateServiceRequest(request.id, {
        status,
        adminNotes: noteDraft,
        actorName: currentUser.name,
      });
      setDataset((current) => ({
        ...current,
        requests: current.requests.map((item) => item.id === updated.id ? updated : item),
      }));
      setNoteDraft(updated.adminNotes ?? "");
      await refreshEventsOnly();
    } catch (error) {
      setNotice(getAdminServiceRequestErrorMessage(error));
    } finally {
      setBusyRequestId("");
    }
  }

  async function saveNote(request: ServiceRequest) {
    if (busyRequestId) return;
    setBusyRequestId(request.id);
    setNotice("");
    try {
      const updated = await updateServiceRequest(request.id, {
        adminNotes: noteDraft,
        actorName: currentUser.name,
      });
      setDataset((current) => ({
        ...current,
        requests: current.requests.map((item) => item.id === updated.id ? updated : item),
      }));
      setNoteDraft(updated.adminNotes ?? "");
      await refreshEventsOnly();
      setNotice("Observação salva.");
    } catch (error) {
      setNotice(getAdminServiceRequestErrorMessage(error));
    } finally {
      setBusyRequestId("");
    }
  }

  async function refreshEventsOnly() {
    try {
      const next = await loadServiceRequestDataset();
      setDataset(next);
    } catch {
      // A alteração principal já foi confirmada. A próxima atualização recarrega o histórico.
    }
  }

  async function refreshLinkedTask(requestId: string) {
    if (linkedTaskLoadingId === requestId) return;
    setLinkedTaskLoadingId(requestId);
    try {
      const linkedTask = await loadActiveHubTaskByServiceRequestId(requestId);
      setLinkedTaskByRequestId((current) => ({ ...current, [requestId]: linkedTask }));
    } catch {
      setLinkedTaskByRequestId((current) => ({ ...current, [requestId]: null }));
    } finally {
      setLinkedTaskLoadingId("");
    }
  }

  async function addRequestToTasks(request: ServiceRequest) {
    if (!canUseTasks || busyRequestId) return;
    const protocol = formatProtocol(request.protocolNumber, request.openedAt);
    setBusyRequestId(`task:${request.id}`);
    setNotice("");
    try {
      const linkedTask = await loadActiveHubTaskByServiceRequestId(request.id);
      if (linkedTask) {
        setLinkedTaskByRequestId((current) => ({ ...current, [request.id]: linkedTask }));
        onOpenLinkedTask(linkedTask.id);
        return;
      }
      onAddToTasks(request, protocol);
    } catch (error) {
      setNotice(`Não foi possível preparar a tarefa. ${getHubTaskErrorMessage(error)}`);
    } finally {
      setBusyRequestId("");
    }
  }

  function openLinkedTask(task: HubTask) {
    setNotice("");
    onOpenLinkedTask(task.id);
  }

  async function copyPublicLink() {
    const url = `${window.location.origin}/chamados`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setNotice(`Link público: ${url}`);
    }
  }

  if (!canAccess) {
    return (
      <section className="screen service-requests-screen">
        <ServiceRequestTopBar onBack={onBack} onLogout={onLogout} />
        <section className="empty-state">
          <h2>Sem acesso aos Chamados</h2>
          <p>Solicite a permissão ao administrador do HUB.</p>
        </section>
      </section>
    );
  }

  return (
    <section className="screen service-requests-screen">
      <ServiceRequestTopBar onBack={onBack} onLogout={onLogout} />

      <section className="service-requests-heading">
        <div>
          <p className="service-request-eyebrow">Atendimento interno</p>
          <h1>Chamados</h1>
          <p>Solicitações abertas pelas pessoas da imobiliária, em ordem de abertura.</p>
        </div>
        <div className="service-requests-heading-actions">
          <button className="secondary-button" type="button" onClick={() => void copyPublicLink()}>
            {linkCopied ? "Link copiado" : "Copiar link público"}
          </button>
          <button className="primary-button" type="button" onClick={() => void refresh()} disabled={loadState === "loading"}>
            Atualizar
          </button>
        </div>
      </section>

      <section className="service-request-metrics" aria-label="Resumo dos chamados">
        <button type="button" className={statusFilter === "novo" ? "active" : ""} onClick={() => setStatusFilter("novo")}>
          <strong>{metrics.novo}</strong><span>Novos</span>
        </button>
        <button type="button" className={statusFilter === "em_andamento" ? "active" : ""} onClick={() => setStatusFilter("em_andamento")}>
          <strong>{metrics.emAndamento}</strong><span>Em andamento</span>
        </button>
        <button type="button" className={statusFilter === "aguardando" ? "active" : ""} onClick={() => setStatusFilter("aguardando")}>
          <strong>{metrics.aguardando}</strong><span>Aguardando</span>
        </button>
        <button type="button" className={statusFilter === "concluido" ? "active" : ""} onClick={() => setStatusFilter("concluido")}>
          <strong>{metrics.concluido}</strong><span>Concluídos</span>
        </button>
      </section>

      <section className="service-request-filters">
        <label className="service-request-search">
          <span>Buscar</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Protocolo, nome ou solicitação"
          />
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">Todos</option>
            {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label>
          <span>Setor</span>
          <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
            <option value="all">Todos</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </label>
        {(statusFilter !== "all" || departmentFilter !== "all" || searchText) && (
          <button className="ghost-button" type="button" onClick={() => {
            setStatusFilter("all");
            setDepartmentFilter("all");
            setSearchText("");
          }}>
            Limpar filtros
          </button>
        )}
      </section>

      {notice && <p className="notice-message service-request-notice" role="status">{notice}</p>}

      {loadState === "loading" && dataset.requests.length === 0 ? (
        <section className="empty-state"><h2>Carregando chamados...</h2></section>
      ) : loadState === "error" && dataset.requests.length === 0 ? (
        <section className="empty-state">
          <h2>Não foi possível abrir os chamados</h2>
          <button className="primary-button" type="button" onClick={() => void refresh()}>Tentar novamente</button>
        </section>
      ) : filteredRequests.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhum chamado encontrado</h2>
          <p>Os novos chamados aparecerão aqui assim que forem enviados.</p>
        </section>
      ) : (
        <section className="service-request-list">
          {filteredRequests.map((request) => (
            <button
              key={request.id}
              type="button"
              className={`service-request-card status-${request.status}`}
              onClick={() => openRequest(request)}
            >
              <span className={`service-request-status status-${request.status}`}>{statusLabels[request.status]}</span>
              <span className="service-request-card-protocol">{formatProtocol(request.protocolNumber, request.openedAt)}</span>
              <strong>{request.requesterName}</strong>
              <span>{request.department}</span>
              <p>{request.requestText}</p>
              <small>{formatDateTime(request.openedAt)}</small>
            </button>
          ))}
        </section>
      )}

      {selectedRequest && (
        <div className="service-request-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeRequest();
        }}>
          <section className="service-request-detail" role="dialog" aria-modal="true" aria-labelledby="service-request-detail-title">
            <header>
              <div>
                <span className={`service-request-status status-${selectedRequest.status}`}>{statusLabels[selectedRequest.status]}</span>
                <p className="service-request-eyebrow">{formatProtocol(selectedRequest.protocolNumber, selectedRequest.openedAt)}</p>
                <h2 id="service-request-detail-title">{selectedRequest.requesterName}</h2>
                <p>{selectedRequest.department} · {formatDateTime(selectedRequest.openedAt)}</p>
              </div>
              <button type="button" className="service-request-close" onClick={closeRequest} disabled={Boolean(busyRequestId)} aria-label="Fechar">×</button>
            </header>

            <section className="service-request-description">
              <h3>Solicitação</h3>
              <p>{selectedRequest.requestText}</p>
            </section>

            <label className="service-request-note">
              <span>Observação interna</span>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Registre informação útil para acompanhar o chamado"
              />
            </label>

            <div className="service-request-detail-actions">
              <button className="secondary-button" type="button" onClick={() => void saveNote(selectedRequest)} disabled={Boolean(busyRequestId)}>
                Salvar observação
              </button>
              {renderStatusActions(selectedRequest, busyRequestId, changeStatus)}
            </div>

            {canUseTasks && (
              <section className="service-request-task-link" aria-label="Vínculo com Afazeres">
                <div>
                  <strong>{selectedLinkedTask ? "Já adicionado aos Afazeres" : "Gerar tarefa nos Afazeres"}</strong>
                  <p>
                    {selectedLinkedTask
                      ? "Este chamado já tem uma tarefa ativa vinculada."
                      : "Abre o formulário de Nova tarefa já preenchido para revisão antes de salvar."}
                  </p>
                </div>
                {selectedLinkedTask ? (
                  <button className="primary-button" type="button" onClick={() => openLinkedTask(selectedLinkedTask)} disabled={Boolean(busyRequestId)}>
                    Abrir nos Afazeres
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void addRequestToTasks(selectedRequest)}
                    disabled={Boolean(busyRequestId) || linkedTaskLoadingId === selectedRequest.id}
                  >
                    {linkedTaskLoadingId === selectedRequest.id
                      ? "Verificando..."
                      : busyRequestId === `task:${selectedRequest.id}`
                        ? "Abrindo Afazeres..."
                        : "Adicionar aos Afazeres"}
                  </button>
                )}
              </section>
            )}

            <ServiceRequestHistory requestId={selectedRequest.id} dataset={dataset} />
          </section>
        </div>
      )}
    </section>
  );
}

function ServiceRequestTopBar({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  return (
    <header className="service-request-top-bar">
      <div className="module-top-actions">
        <button type="button" className="ghost-button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
        <button type="button" className="logout-button" onClick={onLogout}>Sair</button>
      </div>
      <SantaMariaBrand compact showTagline={false} className="panel-corner-brand" />
    </header>
  );
}

function renderStatusActions(
  request: ServiceRequest,
  busyRequestId: string,
  onChange: (request: ServiceRequest, status: ServiceRequestStatus) => Promise<void>,
) {
  const busy = busyRequestId === request.id;

  if (request.status === "concluido" || request.status === "cancelado") {
    return (
      <button className="primary-button" type="button" onClick={() => void onChange(request, "novo")} disabled={busy}>
        Reabrir chamado
      </button>
    );
  }

  return (
    <>
      {request.status === "novo" && (
        <button className="primary-button" type="button" onClick={() => void onChange(request, "em_andamento")} disabled={busy}>
          Iniciar atendimento
        </button>
      )}
      {request.status === "aguardando" && (
        <button className="primary-button" type="button" onClick={() => void onChange(request, "em_andamento")} disabled={busy}>
          Retomar atendimento
        </button>
      )}
      {request.status !== "aguardando" && (
        <button className="secondary-button" type="button" onClick={() => void onChange(request, "aguardando")} disabled={busy}>
          Aguardar
        </button>
      )}
      <button className="primary-button" type="button" onClick={() => void onChange(request, "concluido")} disabled={busy}>
        Concluir
      </button>
      <button className="danger-button" type="button" onClick={() => void onChange(request, "cancelado")} disabled={busy}>
        Cancelar
      </button>
    </>
  );
}

function ServiceRequestHistory({ requestId, dataset }: { requestId: string; dataset: ServiceRequestDataset }) {
  const events = dataset.events.filter((event) => event.requestId === requestId).slice(0, 12);
  if (events.length === 0) return null;

  return (
    <section className="service-request-history">
      <h3>Histórico</h3>
      {events.map((event) => (
        <article key={event.id}>
          <strong>{eventLabel(event.eventType, event.toStatus)}</strong>
          <span>{event.actorName} · {formatDateTime(event.createdAt)}</span>
          {event.note && <p>{event.note}</p>}
        </article>
      ))}
    </section>
  );
}

function eventLabel(eventType: string, toStatus?: ServiceRequestStatus) {
  if (eventType === "criado") return "Chamado aberto";
  if (eventType === "anotacao") return "Observação atualizada";
  if (eventType === "status_alterado" && toStatus) return `Status: ${statusLabels[toStatus]}`;
  return "Chamado atualizado";
}

function formatProtocol(protocolNumber: number, openedAt: string) {
  const year = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(openedAt));
  return `CH-${year}-${String(protocolNumber).padStart(6, "0")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
