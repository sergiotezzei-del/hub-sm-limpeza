import { useEffect, useRef, useState } from "react";
import type { GuardId } from "../../../types";
import {
  activateGuardShift,
  endGuardShift,
  getGuardSyncDiagnostic,
  getPendingGuardRemoteSyncDiagnostic,
  loadGuardShiftState,
  loadGuardRemoteSyncDiagnostic,
} from "../services/shiftService";
import { loadCurrentGuardRoundState, registerGuardRoundPoint } from "../services/roundService";
import type { GuardRoundCurrentState } from "../types/round.types";
import {
  GuardShiftDuplicateActiveError,
  type GuardScheduleShift,
  type GuardSyncDiagnosticItem,
  type GuardShiftLocation,
  type GuardShiftSession,
} from "../types/shift.types";
import type { GuardRoundPoint } from "../types/round.types";

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
  const [remoteDiagnostic, setRemoteDiagnostic] = useState(() => getPendingGuardRemoteSyncDiagnostic());
  const diagnosticItems = [...diagnostic.items, ...remoteDiagnostic.items];

  useEffect(() => {
    let active = true;
    loadGuardRemoteSyncDiagnostic()
      .then((remoteState) => {
        if (active) setRemoteDiagnostic(remoteState);
      })
      .catch(() => {
        if (!active) return;
        setRemoteDiagnostic({
          validated: false,
          remoteReadable: false,
          remoteProtected: false,
          message: "Não foi possível consultar o histórico remoto agora.",
          items: [
            {
              label: "Sincronização remota validada",
              ok: false,
              value: "Não",
              detail: "Falha ao consultar shift_sessions e audit_logs.",
            },
          ],
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="guard-sync-diagnostic">
      <span>DIAGNÓSTICO SUPABASE</span>
      <strong>Sincronização dos guardas</strong>
      <div className="guard-sync-grid">
        {diagnosticItems.map((item) => (
          <article className="guard-sync-item" key={item.label}>
            <div>
              <p>{item.label}</p>
              {item.detail && <small>{item.detail}</small>}
            </div>
            <em className={getSyncPillClass(item)}>{getSyncPillValue(item)}</em>
          </article>
        ))}
      </div>
      <p>{remoteDiagnostic.message}</p>
    </section>
  );
}

function getSyncPillClass(item: GuardSyncDiagnosticItem) {
  return `sync-pill ${item.tone ?? (item.ok ? "ok" : "warn")}`;
}

function getSyncPillValue(item: GuardSyncDiagnosticItem) {
  return item.value ?? (item.ok ? "Sim" : "Não");
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
    <>
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
      {canManage && session?.status === "active" && (
        <GuardRoundCurrentPanel guardLocalId={guardLocalId} guardName={guardName} session={session} />
      )}
    </>
  );
}

function GuardRoundCurrentPanel({ guardLocalId, guardName, session }: { guardLocalId: GuardId; guardName: string; session: GuardShiftSession }) {
  const [roundState, setRoundState] = useState<GuardRoundCurrentState | null>(null);
  const [message, setMessage] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadCurrentGuardRoundState({ guardLocalId, guardName, session })
      .then((state) => {
        if (!active) return;
        setRoundState(state);
        setMessage("");
      })
      .catch(() => {
        if (!active) return;
        setRoundState(null);
        setMessage("Não foi possível carregar a ronda atual.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guardLocalId, guardName, session]);

  async function handleRegisterPoint() {
    if (!roundState?.expectedPoint || saving) return;
    setSaving(true);
    setMessage("Capturando localização...");
    try {
      const location = await getCurrentLocation();
      const result = await registerGuardRoundPoint({ guardLocalId, guardName, session, location, checkinSource: "manual" });
      setRoundState(result.state);
      setMessage(`Ponto registrado manualmente. ${formatRoundCheckinStatusLabel(result.checkin.status)}.`);
    } catch (error) {
      if (error instanceof Error && error.message === "ROUND_SEQUENCE_COMPLETE") {
        setMessage("Todas as rondas programadas deste turno foram registradas.");
      } else {
        setMessage(getShiftErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleQrTokenRead(rawToken: string) {
    if (!roundState || saving) return false;
    const token = extractQrToken(rawToken);
    const point = roundState.points.find((current) => current.qrToken === token);

    if (!point) {
      setScannerMessage("QR Code não reconhecido.");
      return false;
    }

    setScannerOpen(false);
    await registerPointFromQr(point);
    return true;
  }

  async function registerPointFromQr(point: GuardRoundPoint) {
    setSaving(true);
    setMessage("QR Code lido. Capturando localização...");
    try {
      const locationResult = await getOptionalCurrentLocation();
      const result = await registerGuardRoundPoint({ guardLocalId, guardName, session, point, location: locationResult.location, checkinSource: "qr" });
      setRoundState(result.state);
      const locationWarning = locationResult.location ? "" : " Localização não capturada.";
      setMessage(`${formatQrCheckinResultMessage(result.checkin.status)}${locationWarning}`);
    } catch (error) {
      if (error instanceof Error && error.message === "ROUND_SEQUENCE_COMPLETE") {
        setMessage("Todas as rondas programadas deste turno foram registradas.");
      } else {
        setMessage("Não foi possível registrar o QR Code. Tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="guard-round-card"><span>RONDA ATUAL</span><strong>Carregando ronda...</strong></section>;
  }

  if (!roundState?.schedule) {
    return (
      <section className="guard-round-card">
        <span>RONDA ATUAL</span>
        <strong>Todas as rondas programadas deste turno foram registradas.</strong>
        {message && <small>{message}</small>}
      </section>
    );
  }

  return (
    <section className="guard-round-card">
      <div className="guard-round-head">
        <span>RONDA ATUAL</span>
        <em>{roundState.source}</em>
      </div>
      <strong>Próximo horário: {roundState.schedule.scheduledTime}</strong>
      <p>Ponto atual esperado: <b>{roundState.expectedPoint?.name ?? "Sequência concluída"}</b></p>
      <div className="guard-round-progress" aria-label="Sequência de pontos da ronda">
        {roundState.points.map((point) => {
          const completed = roundState.checkins.some((checkin) => checkin.roundPointId === point.id || checkin.pointSequenceOrder === point.sequenceOrder);
          const current = roundState.expectedPoint?.sequenceOrder === point.sequenceOrder;
          return <span className={completed ? "done" : current ? "current" : ""} key={point.id}>{point.sequenceOrder}. {point.name}</span>;
        })}
      </div>
      <small>{roundState.completedPoints}/{roundState.points.length} pontos registrados</small>
      {message && <small>{message}</small>}
      <button className="primary-button wide-button guard-qr-button" type="button" disabled={saving || !roundState.expectedPoint} onClick={() => { setScannerMessage(""); setScannerOpen(true); }}>
        LER QR CODE DA RONDA
      </button>
      <details className="manual-round-fallback">
        <summary>Registro manual de contingência</summary>
        <button className="ghost-button wide-button" type="button" disabled={saving || !roundState.expectedPoint} onClick={handleRegisterPoint}>
          {saving ? "Registrando..." : "Registrar manualmente"}
        </button>
      </details>
      {scannerOpen && (
        <QrCodeReaderModal
          message={scannerMessage}
          onTokenRead={handleQrTokenRead}
          onCancel={() => setScannerOpen(false)}
        />
      )}
    </section>
  );
}

function QrCodeReaderModal({ message, onTokenRead, onCancel }: { message: string; onTokenRead: (token: string) => Promise<boolean>; onCancel: () => void }) {
  const [readerId] = useState(() => `round-qr-reader-${Math.random().toString(16).slice(2)}`);
  const [status, setStatus] = useState("Solicitando permissão da câmera...");
  const [tokenDraft, setTokenDraft] = useState("");
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const onTokenReadRef = useRef(onTokenRead);
  const processingRef = useRef(false);
  const scannerStartedRef = useRef(false);

  useEffect(() => {
    onTokenReadRef.current = onTokenRead;
  }, [onTokenRead]);

  useEffect(() => {
    function handleCameraTeardownRejection(event: PromiseRejectionEvent) {
      const message = String(event.reason?.message ?? event.reason ?? "");
      if (message.includes("play() request was interrupted") && message.includes("media was removed")) {
        event.preventDefault();
      }
    }

    window.addEventListener("unhandledrejection", handleCameraTeardownRejection);
    return () => window.removeEventListener("unhandledrejection", handleCameraTeardownRejection);
  }, []);

  useEffect(() => {
    let disposed = false;

    import("html5-qrcode")
      .then(async ({ Html5Qrcode }) => {
        if (disposed) return;
        const scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;
        scannerStartedRef.current = false;

        try {
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            async (decodedText) => {
              if (processingRef.current) return;
              processingRef.current = true;
              setStatus("QR Code lido. Validando ponto...");
              const accepted = await onTokenReadRef.current(decodedText);
              if (!accepted) processingRef.current = false;
            },
            () => undefined,
          );
          scannerStartedRef.current = true;
          if (disposed) {
            stopQrScanner(scanner, scannerStartedRef.current);
            return;
          }
          if (!disposed) setStatus("Aponte a câmera para o QR Code do ponto de ronda.");
        } catch {
          if (!disposed) setStatus("Não foi possível acessar a câmera. Verifique a permissão ou informe o token do QR Code.");
        }
      })
      .catch(() => {
        if (!disposed) setStatus("Leitor de QR Code indisponível neste aparelho.");
      });

    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      const scannerStarted = scannerStartedRef.current;
      scannerRef.current = null;
      scannerStartedRef.current = false;
      if (scanner) {
        stopQrScanner(scanner, scannerStarted);
      }
    };
  }, [readerId]);

  async function handleTokenSubmit() {
    if (!tokenDraft.trim() || processingRef.current) return;
    processingRef.current = true;
    setStatus("Validando token informado...");
    const accepted = await onTokenReadRef.current(tokenDraft);
    if (!accepted) processingRef.current = false;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog qr-reader-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-reader-title">
        <h2 id="qr-reader-title">Ler QR Code</h2>
        <p>Aponte a câmera para o QR Code do ponto de ronda.</p>
        <div className="qr-reader-frame" id={readerId} />
        <p className="qr-reader-status">{message || status}</p>
        <details className="qr-token-fallback">
          <summary>Informar token se a câmera falhar</summary>
          <label>
            Token do QR Code
            <input type="text" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="round-point-entrada-principal" />
          </label>
          <button className="secondary-button" type="button" onClick={handleTokenSubmit}>Usar token</button>
        </details>
        <div className="button-grid">
          <button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}

function stopQrScanner(scanner: import("html5-qrcode").Html5Qrcode, scannerStarted: boolean) {
  const clearScanner = () => {
    try {
      scanner.clear();
    } catch {
      // Scanner may already be cleared by the camera library.
    }
  };

  if (!scannerStarted) {
    clearScanner();
    return;
  }

  try {
    void scanner.stop()
      .catch(() => undefined)
      .finally(clearScanner);
  } catch {
    clearScanner();
  }
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

async function getOptionalCurrentLocation() {
  try {
    return { location: await getCurrentLocation() };
  } catch {
    return { location: undefined };
  }
}

function extractQrToken(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    return url.searchParams.get("qr_token")
      ?? url.searchParams.get("token")
      ?? url.searchParams.get("qr")
      ?? value;
  } catch {
    const match = value.match(/round-point-[a-z0-9-]+/i);
    return match?.[0] ?? value;
  }
}

function formatRoundCheckinStatusLabel(status: "on_time" | "late" | "out_of_sequence") {
  if (status === "on_time") return "No horário";
  if (status === "late") return "Atrasado";
  return "Fora da sequência";
}

function formatQrCheckinResultMessage(status: "on_time" | "late" | "out_of_sequence") {
  if (status === "late") return "Ponto registrado fora do horário da ronda.";
  if (status === "out_of_sequence") return "Ponto registrado fora da sequência esperada.";
  return "Ponto registrado com sucesso. No horário.";
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
