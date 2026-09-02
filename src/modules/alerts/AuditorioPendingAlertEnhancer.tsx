import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadAuditorioDashboard } from "../auditorio/services/auditorioService";
import type { AuditorioReservation } from "../auditorio/types/auditorio.types";
import "./auditorioPendingAlert.css";

const REFRESH_MS = 10000;
const DISMISSED_STORAGE_KEY = "hub-sm-auditorio-pending-alert-dismissed";

export function AuditorioPendingAlertEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reservations, setReservations] = useState<AuditorioReservation[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => readDismissedIds());
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

  const visibleReservations = reservations.filter((reservation) => !dismissedIds.has(reservation.id));
  if (!host || visibleReservations.length === 0) return null;

  const dismissAlert = (reservationId: string) => {
    setDismissedIds((current) => {
      const next = new Set(current);
      next.add(reservationId);
      saveDismissedIds(next);
      return next;
    });
  };

  return createPortal(
    <>
      {visibleReservations.map((reservation) => (
        <article className="hub-alert-card is-auditorio is-auditorio-pending" key={`auditorio-pendente:${reservation.id}`}>
          <div className="hub-alert-card-status">
            <span>AGUARDANDO APROVAÇÃO — AUDITÓRIO</span>
            <time>#{reservation.protocolNumber}</time>
          </div>
          <h3>{reservation.eventName}</h3>
          <p>{reservation.requesterName}{reservation.requesterDepartment ? ` · ${reservation.requesterDepartment}` : ""}</p>
          <small>{formatDate(reservation.eventDate)} · {reservation.startTime} às {reservation.endTime} · {reservation.peopleCount} pessoa(s)</small>
          <div className="auditorio-pending-alert-actions">
            <button className="hub-alert-done-button" type="button" onClick={() => openAuditorioReservation(reservation)}>
              VER SOLICITAÇÃO
            </button>
            <button
              className="hub-alert-done-button auditorio-pending-alert-done"
              type="button"
              onClick={() => dismissAlert(reservation.id)}
            >
              FEITO
            </button>
          </div>
        </article>
      ))}
    </>,
    host,
  );
}

function openAuditorioReservation(reservation: AuditorioReservation) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".module-card"));
  const auditorioCard = cards.find((card) => card.querySelector(".module-card-title")?.textContent?.trim() === "Auditório");
  if (!auditorioCard) return;

  auditorioCard.click();
  openReservationDetailsWhenReady(reservation);
}

function openReservationDetailsWhenReady(reservation: AuditorioReservation) {
  let attempts = 0;
  const maxAttempts = 80;

  const tryOpen = () => {
    attempts += 1;
    const screen = document.querySelector<HTMLElement>(".auditorio-admin-screen");
    if (!screen) {
      if (attempts < maxAttempts) window.setTimeout(tryOpen, 100);
      return;
    }

    const tabButtons = Array.from(screen.querySelectorAll<HTMLButtonElement>(".auditorio-admin-tabs button"));
    const requestsTab = tabButtons.find((button) => button.textContent?.trim() === "Solicitações");
    if (requestsTab && !requestsTab.classList.contains("active")) {
      requestsTab.click();
      if (attempts < maxAttempts) window.setTimeout(tryOpen, 100);
      return;
    }

    const requestCards = Array.from(screen.querySelectorAll<HTMLElement>(".auditorio-request-card"));
    const targetCard = requestCards.find((card) => {
      const text = card.textContent ?? "";
      return text.includes(reservation.protocol)
        || (text.includes(reservation.eventName) && text.includes(reservation.requesterName));
    });
    const openButton = targetCard
      ? Array.from(targetCard.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Abrir detalhes")
      : null;

    if (openButton) {
      openButton.click();
      return;
    }

    if (attempts < maxAttempts) window.setTimeout(tryOpen, 100);
  };

  window.setTimeout(tryOpen, 50);
}

function readDismissedIds() {
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveDismissedIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {
    // O FEITO continua removendo visualmente mesmo sem persistência local.
  }
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
