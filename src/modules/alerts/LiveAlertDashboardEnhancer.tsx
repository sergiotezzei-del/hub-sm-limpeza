import { useEffect, useRef, useState } from "react";
import { AlertDashboardEnhancer } from "./AlertDashboardEnhancer";
import { loadAlertTasks } from "./alertTaskService";
import { loadAlertServiceRequests } from "./alertServiceRequestService";
import { loadAttentionEvents } from "./attentionEventService";

const ALERT_POLL_MS = 10000;

type AlertSnapshot = {
  key: string;
  title: string;
  body: string;
};

export function LiveAlertDashboardEnhancer() {
  const [revision, setRevision] = useState(0);
  const knownItems = useRef<AlertSnapshot[] | null>(null);
  const knownDate = useRef(getLocalDateKey());

  useEffect(() => {
    let cancelled = false;

    const checkItems = async () => {
      const nextDate = getLocalDateKey();
      if (nextDate !== knownDate.current) {
        knownDate.current = nextDate;
        knownItems.current = null;
        setRevision((current) => current + 1);
      }

      try {
        const [tasks, requests, events] = await Promise.all([
          loadAlertTasks(),
          loadAlertServiceRequests(),
          loadAttentionEvents(),
        ]);
        if (cancelled) return;

        const nextItems = stableItems([
          ...tasks.map((task) => ({
            key: `task:${task.id}`,
            title: `Afazer: ${task.title}`,
            body: task.dueDate ? `Prazo ${formatDate(task.dueDate)} · ${task.department}` : task.department,
          })),
          ...requests.map((request) => ({
            key: `request:${request.id}`,
            title: `Novo chamado — ${request.requesterName}`,
            body: `${request.department}: ${request.requestText}`,
          })),
          ...events.map((event) => ({
            key: `event:${event.id}`,
            title: event.title,
            body: event.description || "Novo aviso operacional no HUB.",
          })),
        ]);

        const previousItems = knownItems.current;
        if (previousItems === null) {
          knownItems.current = nextItems;
          return;
        }
        if (sameItems(previousItems, nextItems)) return;

        const previousKeys = new Set(previousItems.map((item) => item.key));
        const addedItems = nextItems.filter((item) => !previousKeys.has(item.key));
        knownItems.current = nextItems;

        addedItems.forEach((item) => {
          document.dispatchEvent(new CustomEvent("hub:show-alert-toast", {
            detail: item,
          }));
        });

        setRevision((current) => current + 1);
      } catch {
        // O painel principal mantém o tratamento normal de erro de cada fonte.
      }
    };

    const onFocus = () => { void checkItems(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkItems();
    };

    void checkItems();
    const timer = window.setInterval(() => { void checkItems(); }, ALERT_POLL_MS);
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

function stableItems(items: AlertSnapshot[]) {
  return [...items].sort((first, second) => first.key.localeCompare(second.key));
}

function sameItems(first: AlertSnapshot[], second: AlertSnapshot[]) {
  return first.length === second.length
    && first.every((item, index) => item.key === second[index].key
      && item.title === second[index].title
      && item.body === second[index].body);
}

function getLocalDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
