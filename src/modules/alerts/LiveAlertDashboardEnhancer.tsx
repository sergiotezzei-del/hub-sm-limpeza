import { useEffect, useRef, useState } from "react";
import { AlertDashboardEnhancer } from "./AlertDashboardEnhancer";
import { loadAlertTaskIds } from "./alertTaskService";

const TASK_POLL_MS = 10000;

export function LiveAlertDashboardEnhancer() {
  const [revision, setRevision] = useState(0);
  const knownTaskIds = useRef<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkTasks = async () => {
      try {
        const nextIds = stableIds(await loadAlertTaskIds());
        if (cancelled) return;

        const previousIds = knownTaskIds.current;
        if (previousIds === null) {
          knownTaskIds.current = nextIds;
          return;
        }
        if (sameIds(previousIds, nextIds)) return;

        const previousSet = new Set(previousIds);
        const addedIds = nextIds.filter((id) => !previousSet.has(id));
        knownTaskIds.current = nextIds;

        if (addedIds.length > 0) {
          document.dispatchEvent(new CustomEvent("hub:new-alert-tasks", {
            detail: { ids: addedIds },
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

function stableIds(ids: string[]) {
  return [...ids].sort();
}

function sameIds(first: string[], second: string[]) {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}
