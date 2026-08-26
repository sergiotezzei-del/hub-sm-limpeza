import { useEffect, useRef, useState } from "react";
import { AlertDashboardEnhancer } from "./AlertDashboardEnhancer";
import { loadAlertTasks, type AlertTask } from "./alertTaskService";

const TASK_POLL_MS = 10000;

type TaskSnapshot = Pick<AlertTask, "id" | "title">;

export function LiveAlertDashboardEnhancer() {
  const [revision, setRevision] = useState(0);
  const knownTasks = useRef<TaskSnapshot[] | null>(null);
  const knownDate = useRef(getLocalDateKey());

  useEffect(() => {
    let cancelled = false;

    const checkTasks = async () => {
      const nextDate = getLocalDateKey();
      if (nextDate !== knownDate.current) {
        knownDate.current = nextDate;
        knownTasks.current = null;
        setRevision((current) => current + 1);
      }

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

    const onFocus = () => { void checkTasks(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkTasks();
    };

    void checkTasks();
    const timer = window.setInterval(() => { void checkTasks(); }, TASK_POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <AlertDashboardEnhancer key={revision} />;
}

function stableTasks(tasks: TaskSnapshot[]) {
  return [...tasks].sort((first, second) => first.id.localeCompare(second.id));
}

function sameTasks(first: TaskSnapshot[], second: TaskSnapshot[]) {
  return first.length === second.length
    && first.every((task, index) => task.id === second[index].id && first[index].title === second[index].title);
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
