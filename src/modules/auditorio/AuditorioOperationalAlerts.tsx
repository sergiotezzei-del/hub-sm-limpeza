import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseAccessToken } from "../security/services/supabaseClient";
import { loadAuditorioDashboard } from "./services/auditorioService";
import type { AuditorioReservation } from "./types/auditorio.types";
import "./auditorio.css";

const REFRESH_MS = 60000;

export function AuditorioOperationalAlerts() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reservations, setReservations] = useState<AuditorioReservation[]>([]);

  useEffect(() => {
    const syncHost = () => {
      setHost(document.querySelector<HTMLElement>(".hub-alert-panel .hub-alert-cards"));
    };
    syncHost();
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(syncHost);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host) return;
    let active = true;

    const refresh = async () => {
      if (!getSupabaseAccessToken()) return;
      try {
        const dashboard = await loadAuditorioDashboard();
        if (active) setReservations(dashboard.reservations);
      } catch {
        if (active) setReservations([]);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [host]);

  const operationalCards = useMemo(() => {
    const now = new Date();

    return reservations
      .filter((reservation) => reservation.status === "aprovado" && new Date(reservation.reservationEnd) >= now)
      .sort((first, second) => first.eventDate.localeCompare(second.eventDate) || first.setupTime.localeCompare(second.setupTime))
      .map((reservation) => ({
        reservation,
        label: formatAlertDateLabel(reservation.eventDate),
      }));
  }, [reservations]);

  if (!host || operationalCards.length === 0) return null;

  return createPortal(
    <>
      {operationalCards.map(({ reservation, label }) => (
        <article className="hub-alert-card auditorio-operational-card" key={reservation.id}>
          <div className="hub-alert-card-header">
            <span className="hub-alert-card-status">{label} — AUDITÓRIO</span>
            <span>{reservation.setupTime}</span>
          </div>
          <strong>{reservation.eventName}</strong>
          <p>{reservation.peopleCount} pessoas</p>
          <p>{formatFood(reservation)}</p>
        </article>
      ))}
    </>,
    host,
  );
}

function formatFood(reservation: AuditorioReservation) {
  if (reservation.foodType === "nao") return "Sem alimentação informada";
  if (reservation.foodResponsibleLabel) return `${reservation.foodTypeLabel} por ${reservation.foodResponsibleLabel}`;
  return reservation.foodTypeLabel;
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatAlertDateLabel(eventDate: string) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (eventDate === toDateInput(today)) return "HOJE";
  if (eventDate === toDateInput(tomorrow)) return "AMANHÃ";

  const [year, month, day] = eventDate.split("-");
  if (!year || !month || !day) return eventDate;
  return `${day}/${month}`;
}
