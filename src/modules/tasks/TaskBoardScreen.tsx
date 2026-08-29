import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { AppIcon } from "../../components/AppIcon";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import type { ManagedUser, UserPermission } from "../../types";
import { loadAlertTaskIds, setTaskAlertVisibility } from "../alerts/alertTaskService";
import {
  completeHubTask,
  deleteHubTask,
  getHubTaskErrorMessage,
  isServiceRequestTaskDuplicateError,
  loadActiveHubTaskByServiceRequestId,
  loadHubTaskDataset,
  moveHubTask,
  saveHubTask,
} from "./services/taskService";
import { buildTaskSectorOptions } from "./taskSectors";
import type {
  HubTask,
  HubTaskDataset,
  HubTaskDraft,
  HubTaskNavigationDraft,
  HubTaskPriority,
  HubTaskStatus,
} from "./types/task.types";
import "./taskBoard.css";

type TaskBoardScreenProps = {
  permissions: UserPermission[];
  currentUser: ManagedUser;
  managedUsers: ManagedUser[];
  initialDraft?: HubTaskNavigationDraft | null;
  initialFocusTaskId?: string | null;
  onInitialNavigationConsumed?: () => void;
  onBack: () => void;
  onLogout: () => void;
};

type FilterMode = "all" | "mine" | "overdue";
type LoadState = "loading" | "ready" | "error";

const statusOrder: HubTaskStatus[] = ["a_fazer", "em_andamento", "aguardando"];
const statusLabels: Record<HubTaskStatus, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  concluido: "Concluído",
};
const priorityLabels: Record<HubTaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};
const priorityOptions: HubTaskPriority[] = ["baixa", "media", "alta", "urgente"];
const priorityRank: Record<HubTaskPriority, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

const emptyDataset: HubTaskDataset = { tasks: [], events: [] };

function createDraft(currentUser: ManagedUser): HubTaskDraft {
  return {
    title: "",
    description: "",
    status: "a_fazer",
    priority: "media",
    department: "Geral",
    assigneeUserId: currentUser.id,
    dueDate: "",
  };
}

export function TaskBoardScreen({
  permissions,
  currentUser,
  managedUsers,
  initialDraft,
  initialFocusTaskId,
  onInitialNavigationConsumed,
  onBack,
  onLogout,
}: TaskBoardScreenProps) {
  const canAccess = permissions.includes("afazeres");
  const [dataset, setDataset] = useState<HubTaskDataset>(emptyDataset);
  const [alertTaskIds, setAlertTaskIds] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [busyTaskId, setBusyTaskId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<HubTaskDraft>(() => createDraft(currentUser));
  const [pendingFocusTaskId, setPendingFocusTaskId] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [mobileStatus, setMobileStatus] = useState<HubTaskStatus>("a_fazer");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const activeUsers = useMemo(
    () => managedUsers.filter((user) => user.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [managedUsers],
  );
  const userById = useMemo(() => new Map(managedUsers.map((user) => [user.id, user])), [managedUsers]);
  const departments = useMemo(() => buildTaskSectorOptions(dataset.tasks.map((task) => task.department)), [dataset.tasks]);

  const filteredTasks = useMemo(() => {
    return dataset.tasks
      .filter((task) => {
        if (filterMode === "mine" && task.assigneeUserId !== currentUser.id) return false;
        if (filterMode === "overdue" && !isTaskOverdue(task)) return false;
        if (assigneeFilter === "unassigned" && task.assigneeUserId) return false;
        if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && task.assigneeUserId !== assigneeFilter) return false;
        if (departmentFilter !== "all" && task.department !== departmentFilter) return false;
        return true;
      })
      .sort(compareTasks);
  }, [assigneeFilter, currentUser.id, dataset.tasks, departmentFilter, filterMode]);

  const metrics = useMemo(() => ({
    pending: dataset.tasks.length,
    overdue: dataset.tasks.filter(isTaskOverdue).length,
  }), [dataset.tasks]);

  useEffect(() => {
    if (!canAccess) return;
    void refresh();
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess || !initialDraft) return;
    setDraft({
      ...createDraft(currentUser),
      ...initialDraft,
      id: undefined,
      status: initialDraft.status === "concluido" ? "a_fazer" : initialDraft.status || "a_fazer",
      priority: initialDraft.priority || "media",
      assigneeUserId: initialDraft.assigneeUserId || currentUser.id,
      department: initialDraft.department || "Geral",
      dueDate: initialDraft.dueDate || "",
    });
    resetTaskFilters("a_fazer");
    setEditorOpen(true);
    setNotice(initialDraft.notice || "Revise a tarefa antes de salvar.");
    onInitialNavigationConsumed?.();
  }, [canAccess, currentUser, initialDraft, onInitialNavigationConsumed]);

  useEffect(() => {
    if (!canAccess || !initialFocusTaskId) return;
    setPendingFocusTaskId(initialFocusTaskId);
    resetTaskFilters();
    onInitialNavigationConsumed?.();
  }, [canAccess, initialFocusTaskId, onInitialNavigationConsumed]);

  useEffect(() => {
    if (!pendingFocusTaskId || loadState !== "ready") return;
    const linkedTask = dataset.tasks.find((task) => task.id === pendingFocusTaskId);
    if (!linkedTask) {
      setNotice("A tarefa vinculada não está ativa nos Afazeres.");
      setPendingFocusTaskId("");
      return;
    }
    setMobileStatus(linkedTask.status);
    openTask(linkedTask);
    setNotice("Tarefa vinculada ao chamado aberta.");
    setPendingFocusTaskId("");
  }, [dataset.tasks, loadState, pendingFocusTaskId]);

  async function refresh() {
    setLoadState("loading");
    setNotice("");
    try {
      const [nextDataset, nextAlertTaskIds] = await Promise.all([
        loadHubTaskDataset(),
        loadAlertTaskIds(),
      ]);
      setDataset(nextDataset);
      setAlertTaskIds(nextAlertTaskIds);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setNotice(getHubTaskErrorMessage(error));
    }
  }

  function resetTaskFilters(status: HubTaskStatus = "a_fazer") {
    setFilterMode("all");
    setAssigneeFilter("all");
    setDepartmentFilter("all");
    setMobileStatus(status === "concluido" ? "a_fazer" : status);
  }

  function openNewTask() {
    setDraft(createDraft(currentUser));
    setEditorOpen(true);
    setNotice("");
  }

  function openTask(task: HubTask) {
    setDraft({
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status === "concluido" ? "a_fazer" : task.status,
      priority: task.priority,
      department: task.department,
      assigneeUserId: task.assigneeUserId || "",
      dueDate: task.dueDate || "",
      sourceModule: task.sourceModule,
      sourceServiceRequestId: task.sourceServiceRequestId,
    });
    setEditorOpen(true);
    setNotice("");
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyTaskId(draft.id || "new");
    setNotice("");
    try {
      const savedTask = await saveHubTask(draft, { userId: currentUser.id, name: currentUser.name });
      setEditorOpen(false);
      setDraft(createDraft(currentUser));
      resetTaskFilters(savedTask.status);
      await refresh();
    } catch (error) {
      if (draft.sourceServiceRequestId && isServiceRequestTaskDuplicateError(error)) {
        const existingTask = await loadActiveHubTaskByServiceRequestId(draft.sourceServiceRequestId).catch(() => null);
        if (existingTask) {
          await refresh();
          openTask(existingTask);
          setNotice("Este chamado já estava nos Afazeres. Abri a tarefa vinculada.");
          return;
        }
      }
      setNotice(getHubTaskErrorMessage(error));
    } finally {
      setBusyTaskId("");
    }
  }

  async function completeTask(task: HubTask) {
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    setNotice("");
    try {
      await completeHubTask(task.id, currentUser.name);
      setDataset((current) => ({
        ...current,
        tasks: current.tasks.filter((item) => item.id !== task.id),
        events: current.events.filter((event) => event.taskId !== task.id),
      }));
      setAlertTaskIds((current) => current.filter((id) => id !== task.id));
      if (draft.id === task.id) setEditorOpen(false);
      setNotice(`${task.title} concluído e removido dos Afazeres.`);
    } catch (error) {
      setNotice(`Não foi possível concluir a tarefa. ${getHubTaskErrorMessage(error)}`);
    } finally {
      setBusyTaskId("");
    }
  }

  async function deleteTask(task: HubTask) {
    if (!window.confirm(`Excluir a tarefa “${task.title}” definitivamente?`)) return;
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    setNotice("");
    try {
      await deleteHubTask(task.id);
      setDataset((current) => ({
        ...current,
        tasks: current.tasks.filter((item) => item.id !== task.id),
        events: current.events.filter((event) => event.taskId !== task.id),
      }));
      setAlertTaskIds((current) => current.filter((id) => id !== task.id));
      if (draft.id === task.id) setEditorOpen(false);
      setNotice("Tarefa excluída.");
    } catch (error) {
      setNotice(getHubTaskErrorMessage(error));
    } finally {
      setBusyTaskId("");
    }
  }

  async function moveTask(task: HubTask, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    if (direction === 1 && currentIndex === statusOrder.length - 1) {
      await completeTask(task);
      return;
    }
    const nextStatus = statusOrder[currentIndex + direction];
    if (!nextStatus) return;
    await moveTaskToStatus(task, nextStatus);
  }

  async function moveTaskToStatus(task: HubTask, nextStatus: HubTaskStatus) {
    if (nextStatus === "concluido") {
      await completeTask(task);
      return;
    }
    if (busyTaskId || task.status === nextStatus || !statusOrder.includes(nextStatus)) return;
    const previousTasks = dataset.tasks;
    setBusyTaskId(task.id);
    setNotice("");
    setDataset((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item),
    }));
    setMobileStatus(nextStatus);
    try {
      const updated = await moveHubTask(task.id, nextStatus, currentUser.name);
      setDataset((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === updated.id ? updated : item),
      }));
      void refreshEventsOnly();
    } catch (error) {
      setDataset((current) => ({ ...current, tasks: previousTasks }));
      setMobileStatus(task.status);
      setNotice(`Não foi possível mover a tarefa. ${getHubTaskErrorMessage(error)}`);
    } finally {
      setBusyTaskId("");
    }
  }

  async function toggleTaskAlert(task: HubTask) {
    if (busyTaskId) return;
    const visible = !alertTaskIds.includes(task.id);
    setBusyTaskId(task.id);
    setNotice("");
    try {
      await setTaskAlertVisibility(task.id, visible, currentUser.name);
      setAlertTaskIds((current) => visible
        ? [...new Set([...current, task.id])]
        : current.filter((id) => id !== task.id));
      setNotice(visible ? "Afazer adicionado aos Alertas." : "Afazer retirado dos Alertas.");
    } catch (error) {
      setNotice(`Não foi possível alterar o alerta da tarefa. ${getHubTaskErrorMessage(error)}`);
    } finally {
      setBusyTaskId("");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const nextStatus = event.over?.id as HubTaskStatus | undefined;
    if (!nextStatus || !statusOrder.includes(nextStatus)) return;
    const task = dataset.tasks.find((item) => item.id === taskId);
    if (!task) return;
    void moveTaskToStatus(task, nextStatus);
  }

  async function refreshEventsOnly() {
    try {
      const next = await loadHubTaskDataset();
      setDataset(next);
    } catch {
      // A movimentação já foi confirmada. A próxima abertura atualiza o histórico.
    }
  }

  if (!canAccess) {
    return (
      <section className="screen task-board-screen">
        <TaskTopBar onBack={onBack} onLogout={onLogout} />
        <section className="empty-state">
          <h2>Sem acesso aos Afazeres</h2>
          <p>Solicite a permissão ao administrador do HUB.</p>
        </section>
      </section>
    );
  }

  return (
    <section className="screen task-board-screen">
      <TaskTopBar onBack={onBack} onLogout={onLogout} />

      <section className="task-board-heading">
        <div>
          <p className="task-board-eyebrow">Organização diária</p>
          <h1>Afazeres</h1>
          <p>Veja o que precisa ser feito e o que está parado.</p>
        </div>
        <button className="primary-button task-new-button" type="button" onClick={openNewTask}>
          + Nova tarefa
        </button>
      </section>

      <section className="task-metrics" aria-label="Resumo dos afazeres">
        <article><strong>{metrics.pending}</strong><span>Pendentes</span></article>
        <article className={metrics.overdue > 0 ? "task-metric-danger" : ""}><strong>{metrics.overdue}</strong><span>Atrasadas</span></article>
      </section>

      <section className="task-filters" aria-label="Filtros do quadro">
        <div className="task-filter-pills">
          <button type="button" className={filterMode === "all" ? "active" : ""} onClick={() => setFilterMode("all")}>Todas</button>
          <button type="button" className={filterMode === "mine" ? "active" : ""} onClick={() => setFilterMode("mine")}>Minhas</button>
          <button type="button" className={filterMode === "overdue" ? "active" : ""} onClick={() => setFilterMode("overdue")}>Atrasadas</button>
        </div>
        <label>
          <span>Responsável</span>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="unassigned">Sem responsável</option>
            {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label>
          <span>Setor</span>
          <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
            <option value="all">Todos</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </label>
        <button type="button" className="secondary-button task-refresh-button" onClick={() => void refresh()} disabled={loadState === "loading"}>
          Atualizar
        </button>
      </section>

      {notice && <p className="notice-message task-board-notice">{notice}</p>}

      <nav className="task-mobile-tabs" aria-label="Colunas do quadro">
        {statusOrder.map((status) => {
          const count = filteredTasks.filter((task) => task.status === status).length;
          return (
            <button key={status} type="button" className={mobileStatus === status ? "active" : ""} onClick={() => setMobileStatus(status)}>
              {statusLabels[status]} <span>{count}</span>
            </button>
          );
        })}
      </nav>

      {loadState === "loading" && dataset.tasks.length === 0 ? (
        <section className="empty-state"><h2>Carregando afazeres...</h2></section>
      ) : loadState === "error" && dataset.tasks.length === 0 ? (
        <section className="empty-state"><h2>Não foi possível abrir o quadro</h2><button className="primary-button" type="button" onClick={() => void refresh()}>Tentar novamente</button></section>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <section className="task-board-columns">
            {statusOrder.map((status) => (
              <TaskColumn
                key={status}
                status={status}
                tasks={filteredTasks.filter((task) => task.status === status)}
                userById={userById}
                busyTaskId={busyTaskId}
                alertTaskIds={alertTaskIds}
                mobileVisible={mobileStatus === status}
                onOpen={openTask}
                onMove={moveTask}
                onMoveToStatus={moveTaskToStatus}
                onDelete={deleteTask}
                onToggleAlert={toggleTaskAlert}
              />
            ))}
          </section>
        </DndContext>
      )}

      {editorOpen && (
        <div className="task-editor-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyTaskId) setEditorOpen(false);
        }}>
          <section className="task-editor" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
            <header>
              <div>
                <p className="task-board-eyebrow">{draft.id ? "Editar tarefa" : "Nova tarefa"}</p>
                <h2 id="task-editor-title">{draft.id ? draft.title || "Tarefa" : "Cadastrar tarefa"}</h2>
              </div>
              <button type="button" className="task-editor-close" onClick={() => setEditorOpen(false)} disabled={Boolean(busyTaskId)} aria-label="Fechar">×</button>
            </header>

            <form onSubmit={submitTask}>
              <label className="task-editor-full">
                <span>Título *</span>
                <input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={140} required />
              </label>
              <label className="task-editor-full">
                <span>Descrição</span>
                <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={4} maxLength={2000} />
              </label>
              <label>
                <span>Status</span>
                <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as HubTaskStatus }))}>
                  {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
              </label>
              <label>
                <span>Prioridade</span>
                <select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as HubTaskPriority }))}>
                  {priorityOptions.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
                </select>
              </label>
              <label>
                <span>Responsável</span>
                <select value={draft.assigneeUserId} onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}>
                  <option value="">Sem responsável</option>
                  {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <label>
                <span>Prazo</span>
                <input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label>
                <span>Setor</span>
                <select value={draft.department} onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))} required>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>

              {draft.id && (
                <TaskHistory taskId={draft.id} dataset={dataset} />
              )}

              <footer className="task-editor-actions task-editor-full">
                {draft.id && (
                  <button type="button" className="danger-button" onClick={() => {
                    const task = dataset.tasks.find((item) => item.id === draft.id);
                    if (task) void deleteTask(task);
                  }} disabled={Boolean(busyTaskId)}>
                    Excluir
                  </button>
                )}
                <button type="button" className="secondary-button" onClick={() => setEditorOpen(false)} disabled={Boolean(busyTaskId)}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={Boolean(busyTaskId)}>{busyTaskId ? "Salvando..." : "Salvar tarefa"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function TaskTopBar({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  return (
    <header className="task-top-bar">
      <div className="screen-action-row">
        <button type="button" className="ghost-button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
        <button type="button" className="logout-button" onClick={onLogout}>Sair</button>
      </div>
      <SantaMariaBrand compact showTagline={false} className="panel-corner-brand" />
    </header>
  );
}

function TaskColumn({
  status,
  tasks,
  userById,
  busyTaskId,
  alertTaskIds,
  mobileVisible,
  onOpen,
  onMove,
  onMoveToStatus,
  onDelete,
  onToggleAlert,
}: {
  status: HubTaskStatus;
  tasks: HubTask[];
  userById: Map<string, ManagedUser>;
  busyTaskId: string;
  alertTaskIds: string[];
  mobileVisible: boolean;
  onOpen: (task: HubTask) => void;
  onMove: (task: HubTask, direction: -1 | 1) => void;
  onMoveToStatus: (task: HubTask, status: HubTaskStatus) => void;
  onDelete: (task: HubTask) => void;
  onToggleAlert: (task: HubTask) => void;
}) {
  const statusIndex = statusOrder.indexOf(status);
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: Boolean(busyTaskId),
  });

  return (
    <article ref={setNodeRef} className={`task-column task-column-${status} ${mobileVisible ? "task-column-mobile-visible" : ""} ${isOver ? "task-column-drop-active" : ""}`}>
      <header>
        <h2>{statusLabels[status]}</h2>
        <span>{tasks.length}</span>
      </header>
      <div className="task-column-list">
        {tasks.length === 0 ? (
          <p className="task-column-empty">Nenhuma tarefa nesta coluna.</p>
        ) : tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assignee={task.assigneeUserId ? userById.get(task.assigneeUserId) : undefined}
            busy={Boolean(busyTaskId)}
            statusIndex={statusIndex}
            inAlerts={alertTaskIds.includes(task.id)}
            onOpen={onOpen}
            onMove={onMove}
            onMoveToStatus={onMoveToStatus}
            onDelete={onDelete}
            onToggleAlert={onToggleAlert}
          />
        ))}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  assignee,
  busy,
  statusIndex,
  inAlerts,
  onOpen,
  onMove,
  onMoveToStatus,
  onDelete,
  onToggleAlert,
}: {
  task: HubTask;
  assignee?: ManagedUser;
  busy: boolean;
  statusIndex: number;
  inAlerts: boolean;
  onOpen: (task: HubTask) => void;
  onMove: (task: HubTask, direction: -1 | 1) => void;
  onMoveToStatus: (task: HubTask, status: HubTaskStatus) => void;
  onDelete: (task: HubTask) => void;
  onToggleAlert: (task: HubTask) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = isTaskOverdue(task);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
    disabled: busy,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 30 : undefined,
  };
  const nextButtonLabel = task.status === "aguardando" ? "Concluir" : "Avançar";
  const previousButtonLabel = "Voltar";

  return (
    <section ref={setNodeRef} style={style} className={`task-card priority-${task.priority} ${overdue ? "task-card-overdue" : ""} ${isDragging ? "task-card-dragging" : ""} ${expanded ? "task-card-expanded" : "task-card-collapsed"}`}>
      <div className="task-card-summary">
        <button
          type="button"
          className="task-card-drag-title"
          disabled={busy}
          aria-label={`Arrastar tarefa ${task.title}`}
          title="Segure e arraste para outra coluna"
          {...attributes}
          {...listeners}
        >
          {task.title}
        </button>
        <button
          type="button"
          className="task-card-expand"
          onClick={() => setExpanded((current) => !current)}
          disabled={busy}
          aria-expanded={expanded}
          aria-label={expanded ? `Recolher detalhes de ${task.title}` : `Expandir detalhes de ${task.title}`}
        >
          {expanded ? "⌃" : "⌄"}
        </button>
      </div>

      {expanded && (
        <div className="task-card-details">
          <div className="task-card-detail-topline">
            <span className="task-card-priority">{priorityLabels[task.priority]}</span>
            {overdue && <span className="task-card-overdue-label">Atrasada</span>}
            {inAlerts && <span className="task-card-overdue-label">Nos alertas</span>}
          </div>
          {task.description && <p className="task-card-description">{task.description}</p>}
          <div className="task-card-information">
            <span className={`task-card-meta ${!assignee ? "task-card-meta-warning" : ""}`}>{assignee?.name || "Sem responsável"}</span>
            <span className="task-card-meta">{task.department}</span>
            {task.dueDate && <span className={`task-card-date ${overdue ? "overdue" : ""}`}>{overdue ? "Atrasada: " : "Prazo: "}{formatDate(task.dueDate)}</span>}
          </div>

          <div className="task-card-actions" role="group" aria-label={`Ações da tarefa ${task.title}`}>
            <button type="button" onClick={() => onMove(task, -1)} disabled={busy || statusIndex === 0}>{previousButtonLabel}</button>
            <button type="button" onClick={() => onMove(task, 1)} disabled={busy}>{nextButtonLabel}</button>
            <button type="button" onClick={() => onToggleAlert(task)} disabled={busy}>{inAlerts ? "Tirar dos alertas" : "Mostrar nos alertas"}</button>
            <button type="button" onClick={() => onDelete(task)} disabled={busy}>Excluir</button>
            <button type="button" className="task-card-edit" onClick={() => onOpen(task)} disabled={busy}>Editar tarefa</button>
          </div>

          <label className="task-card-move-select">
            <span>Mover para</span>
            <select value={task.status} onChange={(event) => onMoveToStatus(task, event.target.value as HubTaskStatus)} disabled={busy}>
              {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function TaskHistory({ taskId, dataset }: { taskId: string; dataset: HubTaskDataset }) {
  const events = dataset.events.filter((event) => event.taskId === taskId).slice(0, 6);
  if (events.length === 0) return null;
  return (
    <section className="task-history task-editor-full">
      <h3>Histórico recente</h3>
      {events.map((event) => {
        const detail = taskEventDetail(event.details);
        return (
          <article key={event.id}>
            <div>
              <strong>{eventLabel(event.eventType)}</strong>
              {detail && <small>{detail}</small>}
            </div>
            <span>{event.actorName} · {formatDateTime(event.createdAt)}</span>
          </article>
        );
      })}
    </section>
  );
}

function isTaskOverdue(task: HubTask) {
  if (!task.dueDate) return false;
  return task.dueDate < localDateKey(new Date());
}

function compareTasks(a: HubTask, b: HubTask) {
  const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDifference !== 0) return priorityDifference;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    criada: "Tarefa criada",
    editada: "Tarefa editada",
    status_alterado: "Status alterado",
    concluida: "Tarefa concluída",
    reaberta: "Tarefa reaberta",
    arquivada: "Tarefa arquivada",
  };
  return labels[eventType] || eventType;
}

function taskEventDetail(details: Record<string, unknown>) {
  const protocol = typeof details.source_service_request_protocol === "string" ? details.source_service_request_protocol : "";
  const requestId = typeof details.source_service_request_id === "string" ? details.source_service_request_id : "";
  if (protocol) return `Origem: chamado ${protocol}`;
  if (requestId) return "Origem: chamado interno";
  return "";
}
