import { useEffect, useRef, useState } from "react";
import { AlertDashboardEnhancer } from "./AlertDashboardEnhancer";
import { loadAlertTasks, type AlertTask } from "./alertTaskService";

const TASK_POLL_MS = 10000;

type TaskSnapshot = Pick<AlertTask, "id" | "title">;

export function LiveAlertDashboardEnhancer() {
  const [revision, setRevision] = useState(0);
  const knownTasks = useRef<TaskSnapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkTasks = async () => {
      try {
        const tasks = await loadAlertTasks();
        if (cancelled) return;

        const nextTasks = stableTasks(tasks.map(({ id, title }) => ({ id, title })));
        const previousTasks = knownTasks.current;
        if (previousTasks === null) {
          knownTasks.current = nextTasks;
          return;
        }
        if (sameTasks(previousTasks, nextTasks)) return;

        const previousIds = new Set(previousTasks.map((task) => task.id));
        const addedTasks = nextTasks.filter((task) => !previousIds.has(task.id));
        knownTasks.current = nextTasks;

        if (addedTasks.length > 0) {
          document.dispatchEvent(new CustomEvent("hub:new-alert-tasks", {
            detail: { tasks: addedTasks },
          }));
        }

        setRevision((current) => current + 1);
      } catch {
        // A tela de Alertas continua exibindo seu tratamento normal de erro.
      }
    };

    void checkTasks();
    const timer = window.setInterval(() => { void checkTasks(); }, TASK_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return <AlertDashboardEnhancer key={revision} />;
}

function stableTasks(tasks: TaskSnapshot[]) {
  return [...tasks].sort((first, second) => first.id.localeCompare(second.id));
}

function sameTasks(first: TaskSnapshot[], second: TaskSnapshot[]) {
  return first.length === second.length
    && first.every((task, index) => task.id === second[index].id && task.title === second[index].title);
}
