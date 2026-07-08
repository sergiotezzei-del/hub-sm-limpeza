import { useEffect, useState } from "react";
import type { GuardId } from "../../../types";
import {
  activateGuardShift,
  endGuardShift,
  getGuardSyncDiagnostic,
  loadGuardShiftState,
} from "../services/shiftService";
import {
  GuardShiftDuplicateActiveError,
  type GuardScheduleShift,
  type GuardShiftLocation,
  type GuardShiftSession,
} from "../types/shift.types";

type GuardShiftPanelProps = {
  guardLocalId: GuardId;
  guardName: string;
  todayShift: GuardScheduleShift | null;
  nextShift: GuardScheduleShift | null;
  canManage: boolean;
  showTechnicalSync?: boolean;
};

export function GuardSyncDiagnosticPanel() {
  const diagnostic = getGuardSyncDiagnostic();

  return (
    <section className="guard-sync-diagnostic">
      <span>DIAGNÓSTICO SUPABASE</span>
      <strong>Sincronização dos guardas</strong>
      <div className="guard-sync-grid">
        {diagnostic.items.map((item) => (
          <article className="guard-sync-item" key={item.label}>
            <div>
              <p>{item.label}</p>
              {item.detail && <small>{item.detail}</small>}
            </div>
            <em className={item.ok ? "sync-pill ok" : "sync-pill warn"}>{item.ok ? "Sim" : "Não"}</em>
          </article>
        ))}
      </div>
      <p>{diagnostic.fallbackReason}</p>
    </section>
  );
}

export function GuardShiftPanel({ guardLocalId, guardName, todayShift, nextShift, canManage, showTechnicalSync = false }: GuardShiftPanelProps) {
  const [session, setSession] = useState<GuardShiftSession | null>(null);
  const [message, setMessage] = useState("");
  const [technicalMessage, setTechnicalMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const todayKey = todayShift ? `${todayShift.startDate}-${todayShift.startTime}-${todayShift.endTime}` : "none";
  const nextKey = nextShift ? `${nextShift.startDate}-${nextShift.startTime}-${nextShift.endTime}` : "none";

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadGuardShiftState({ guardLocalId, guardName, todayShift, nextShift })
      .then((state) => {
        if (!active) return;
        setSession(state.todaySession);
        setMessage(state.syncMessage ?? "");
        setTechnicalMessage(state.technicalSyncMessage ?? "");
      })
      .catch(() => {
        if (!active) return;
        setMessage("Não foi possível carregar o monitoramento do turno.");
        setTechnicalMessage("");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guardLocalId, guardName, nextKey, todayKey]);

  async function handleActivate() {
    if (!todayShift || saving) return;
    setSaving(true);
    setMessage("Capturando localização...");
    try {
      const location = await getCurrentLocation();
      const result = await activateGuardShift({ guardLocalId, guardName, todayShift, location });
      setSession(result.session);
      setMessage(result.message);
    } catch (error) {
      setMessage(getShiftErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleEnd() {
    if (!session || saving) return;
    setSaving(true);
    setMessage("Capturando localização final...");
    try {
      const location = await getCurrentLocation();
      const result = await endGuardShift({ guardLocalId, guardName, session, location });
      setSession(result.session);
      setMessage(result.message);
    } catch (error) {
      setMessage(getShiftErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <article className="guard-shift-card"><span>MONITORAMENTO</span><strong>Carregando turno...</strong></article>;
  }

  if (!todayShift) {
    return (
      <section className="guard-shift-card">
        <span>MONITORAMENTO</span>
        <strong>Sem turno hoje</strong>
        {nextShift ? <p>Próximo turno: {nextShift.startText}, {nextShift.startTime} às {nextShift.endTime}</p> : <p>Nenhum próximo turno lançado.</p>}
        {message && <small>{message}</small>}
        {showTechnicalSync && technicalMessage && <small>{technicalMessage}</small>}
      </section>
    );
  }

  return (
    <section className="guard-shift-card">
      <span>MONITORAMENTO</span>
      <strong>Turno de hoje: {todayShift.startTime} às {todayShift.endTime}</strong>
      <p>{getSessionSummary(session)}</p>
      {session?.status === "ended" && <p>{getEndedSummary(session)}</p>}
      {message && <small>{message}</small>}
      {showTechnicalSync && technicalMessage && <small>{technicalMessage}</small>}
      {canManage && session?.status === "pending" && (
        <button className="success-button wide-button" type="button" disabled={saving} onClick={handleActivate}>
          {saving ? "Ativando..." : "ATIVAR SERVIÇO"}
        </button>
      )}
      {canManage && session?.status === "active" && (
        <button className="danger-button wide-button" type="button" disabled={saving} onClick={handleEnd}>
          {saving ? "Encerrando..." : "ENCERRAR SERVIÇO"}
        </button>
      )}
    </section>
  );
}

function getCurrentLocation(): Promise<GuardShiftLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => reject(new Error("GEOLOCATION_DENIED")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

function getSessionSummary(session: GuardShiftSession | null) {
  if (!session || session.status === "pending") return "Aguardando ativação do serviço.";
  if (session.status === "active") return `Serviço ativo desde ${formatTime(session.startedAt)}.`;
  if (session.status === "ended") return "Serviço encerrado.";
  return "Serviço encerrado automaticamente.";
}

function getEndedSummary(session: GuardShiftSession) {
  const duration = getDurationLabel(session.startedAt, session.endedAt);
  return `Início: ${formatTime(session.startedAt)}. Término: ${formatTime(session.endedAt)}. Duração: ${duration}.`;
}

function getDurationLabel(startedAt?: string, endedAt?: string) {
  if (!startedAt || !endedAt) return "--";
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return "--";
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function getShiftErrorMessage(error: unknown) {
  if (error instanceof GuardShiftDuplicateActiveError) return "Já existe outro turno ativo para este guarda.";
  if (error instanceof Error && error.message === "GEOLOCATION_UNAVAILABLE") return "Localização indisponível neste aparelho.";
  if (error instanceof Error && error.message === "GEOLOCATION_DENIED") return "Permita a localização para registrar o serviço.";
  return "Não foi possível atualizar o serviço. Tente novamente.";
}

function formatTime(value?: string) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
