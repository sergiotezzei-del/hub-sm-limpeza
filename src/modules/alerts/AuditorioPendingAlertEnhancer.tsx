import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadAuditorioDashboard } from "../auditorio/services/auditorioService";
import type { AuditorioReservation } from "../auditorio/types/auditorio.types";

const REFRESH_MS = 10000;

export function AuditorioPendingAlertEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reservations, setReservations] = useState<AuditorioReservation[]>([]);
  const knownPendingIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    const syncHost = () => {
      const next = root.querySelector<HTMLElement>(".hub-alert-panel .hub-alert-cards") ?? null;
      setHost((current) => current === next ? current : next);
    };

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host) {
      setReservations([]);
      return;
    }

    let active = true;
    let busy = false;

    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const dashboard = await loadAuditorioDashboard();
        if (!active) return;

        const pending = dashboard.reservations
          .filter((reservation) => reservation.status === "pendente")
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt));

        const nextIds = new Set(pending.map((reservation) => reservation.id));
        if (knownPendingIds.current !== null) {
          pending
            .filter((reservation) => !knownPendingIds.current?.has(reservation.id))
            .forEach((reservation) => {
              document.dispatchEvent(new CustomEvent("hub:show-alert-toast", {
                detail: {
                  key: `auditorio-pendente:${reservation.id}`,
                  title: `Nova solicitação de Auditório — ${reservation.requesterName}`,
                  body: `${reservation.eventName} · ${formatDate(reservation.eventDate)} · ${reservation.startTime} às ${reservation.endTime}`,
                },
              }));
            });
        }
        knownPendingIds.current = nextIds;
        setReservations(pending);
      } catch {
        // A central principal continua funcionando mesmo se o Auditório falhar temporariamente.
      } finally {
        busy = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    const onFocus = () => { void refresh(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [host]);

  if (!host || reservations.length === 0) return null;

  return createPortal(
    <>
      {reservations.map((reservation) => (
        <article className="hub-alert-card is-auditorio is-auditorio-pending" key={`auditorio-pendente:${reservation.id}`}>
          <div className="hub-alert-card-status">
            <span>AGUARDANDO APROVAÇÃO — AUDITÓRIO</span>
            <time>#{reservation.protocolNumber}</time>
          </div>
          <h3>{reservation.eventName}</h3>
          <p>{reservation.requesterName}{reservation.requesterDepartment ? ` · ${reservation.requesterDepartment}` : ""}</p>
          <small>{formatDate(reservation.eventDate)} · {reservation.startTime} às {reservation.endTime} · {reservation.peopleCount} pessoa(s)</small>
          <button className="hub-alert-done-button" type="button" onClick={openAuditorioModule}>
            VER SOLICITAÇÃO
          </button>
        </article>
      ))}
    </>,
    host,
  );
}

function openAuditorioModule() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".module-card"));
  const auditorioCard = cards.find((card) => card.querySelector(".module-card-title")?.textContent?.trim() === "Auditório");
  auditorioCard?.click();
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
