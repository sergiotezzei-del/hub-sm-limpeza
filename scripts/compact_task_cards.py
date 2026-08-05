from __future__ import annotations

import re
from pathlib import Path

SCREEN = Path("src/modules/tasks/TaskBoardScreen.tsx")
CSS = Path("src/modules/tasks/taskBoard.css")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


def main() -> None:
    screen = SCREEN.read_text(encoding="utf-8")

    screen = replace_once(
        screen,
        'const priorityOptions: HubTaskPriority[] = ["baixa", "media", "alta", "urgente"];',
        '''const priorityOptions: HubTaskPriority[] = ["baixa", "media", "alta", "urgente"];
const priorityRank: Record<HubTaskPriority, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};''',
        "ordem das prioridades",
    )

    new_task_card = r'''function TaskCard({
  task,
  assignee,
  busy,
  statusIndex,
  onOpen,
  onMove,
  onMoveToStatus,
  onArchive,
}: {
  task: HubTask;
  assignee?: ManagedUser;
  busy: boolean;
  statusIndex: number;
  onOpen: (task: HubTask) => void;
  onMove: (task: HubTask, direction: -1 | 1) => void;
  onMoveToStatus: (task: HubTask, status: HubTaskStatus) => void;
  onArchive: (task: HubTask) => void;
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
  const previousButtonLabel = task.status === "concluido" ? "Reabrir" : "Voltar";

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
          </div>
          {task.description && <p className="task-card-description">{task.description}</p>}
          <div className="task-card-information">
            <span className={`task-card-meta ${!assignee ? "task-card-meta-warning" : ""}`}>{assignee?.name || "Sem responsável"}</span>
            <span className="task-card-meta">{task.department}</span>
            {task.dueDate && <span className={`task-card-date ${overdue ? "overdue" : ""}`}>{overdue ? "Atrasada: " : "Prazo: "}{formatDate(task.dueDate)}</span>}
          </div>

          <div className="task-card-actions" role="group" aria-label={`Ações da tarefa ${task.title}`}>
            <button type="button" onClick={() => onMove(task, -1)} disabled={busy || statusIndex === 0}>{previousButtonLabel}</button>
            {task.status === "concluido" ? (
              <button type="button" onClick={() => onArchive(task)} disabled={busy}>Arquivar</button>
            ) : (
              <button type="button" onClick={() => onMove(task, 1)} disabled={busy}>{nextButtonLabel}</button>
            )}
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

function TaskHistory'''

    screen, count = re.subn(
        r'function TaskCard\(\{.*?\n}\n\nfunction TaskHistory',
        new_task_card,
        screen,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError(f"card compacto: esperado 1 trecho, encontrado {count}")

    screen = replace_once(
        screen,
        '''function compareTasks(a: HubTask, b: HubTask) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}''',
        '''function compareTasks(a: HubTask, b: HubTask) {
  const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDifference !== 0) return priorityDifference;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}''',
        "ordenação dos cards",
    )

    SCREEN.write_text(screen, encoding="utf-8")

    css = CSS.read_text(encoding="utf-8")
    css += r'''

/* Cards compactos de Afazeres */
.task-card-collapsed {
  min-height: 0;
}

.task-card-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  align-items: stretch;
  min-height: 54px;
}

.task-card-drag-title {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #14233d;
  cursor: grab;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 850;
  line-height: 1.28;
  padding: 13px 8px 13px 12px;
  text-align: left;
  overflow-wrap: anywhere;
}

.task-card-drag-title:active {
  cursor: grabbing;
}

.task-card-expand {
  border: 0;
  border-left: 1px solid #edf0f5;
  background: #f8fafc;
  color: #45536b;
  cursor: pointer;
  font: inherit;
  font-size: 1.15rem;
  font-weight: 900;
}

.task-card-expand:hover,
.task-card-expand:focus-visible {
  background: #fff2e8;
  color: #bb4a00;
}

.task-card-details {
  border-top: 1px solid #edf0f5;
  padding: 11px;
}

.task-card-detail-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.task-card-overdue-label {
  color: #b93421;
  font-size: 0.68rem;
  font-weight: 900;
  text-transform: uppercase;
}

.task-card-description {
  color: #68748a;
  font-size: 0.82rem;
  line-height: 1.42;
  margin: 0 0 10px;
  overflow-wrap: anywhere;
}

.task-card-information {
  display: grid;
  gap: 5px;
  margin-bottom: 10px;
}

.task-card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  border-top: 1px solid #edf0f5;
  padding-top: 10px;
}

.task-card-actions button {
  min-height: 38px;
  border: 1px solid #d6deea;
  background: #f8fafc;
  color: #33415c;
  border-radius: 9px;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 8px;
}

.task-card-actions .task-card-edit {
  grid-column: 1 / -1;
  background: #fff2e8;
  border-color: #ffc38f;
  color: #ad4707;
}

.task-card-actions button:disabled,
.task-card-drag-title:disabled,
.task-card-expand:disabled {
  cursor: wait;
  opacity: 0.5;
}

.task-card-details .task-card-move-select {
  margin-top: 9px;
  padding: 0;
}

@media (max-width: 680px) {
  .task-card-summary {
    min-height: 58px;
  }

  .task-card-drag-title {
    cursor: default;
    padding-block: 15px;
  }

  .task-card-details .task-card-move-select {
    display: grid;
  }
}
'''
    CSS.write_text(css, encoding="utf-8")


if __name__ == "__main__":
    main()
