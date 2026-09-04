import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedSupabaseFetch, readSupabaseRestError, SUPABASE_URL } from "../security/services/supabaseClient";

type SourceKind = "system" | "spotify" | "edge" | "chrome" | "microphone";

type NotebookAudioState = {
  id: "main";
  active: boolean;
  started_at: string | null;
  status: "idle" | "requested" | "starting" | "streaming" | "stopping" | "error";
  source_kind: SourceKind;
  source_process_name: string | null;
  source_label: string | null;
  last_error: string | null;
  bridge_updated_at: string | null;
  updated_at: string;
};

type Props = {
  playerOnline: boolean;
};

const SOURCES: Array<{ kind: SourceKind; label: string; help: string }> = [
  {
    kind: "microphone",
    label: "🎙️ Microfone do notebook",
    help: "Use o microfone do notebook para falar ao vivo no sistema de som do prédio. A automação continua como base e volta quando você encerrar.",
  },
  {
    kind: "edge",
    label: "YouTube / navegador · Microsoft Edge",
    help: "Envia somente o áudio do Edge. WhatsApp, sons do Windows e outros aplicativos ficam no notebook.",
  },
  {
    kind: "spotify",
    label: "Spotify",
    help: "Envia somente o Spotify. Navegador, WhatsApp e demais aplicativos continuam particulares no notebook.",
  },
  {
    kind: "chrome",
    label: "YouTube / navegador · Google Chrome",
    help: "Envia somente o áudio do Chrome. Outros aplicativos não entram na Rádio.",
  },
  {
    kind: "system",
    label: "Som inteiro do notebook",
    help: "Envia tudo que estiver tocando no Windows. Use apenas quando realmente quiser compartilhar todos os sons.",
  },
];

export function RadioNotebookPlayer({ playerOnline }: Props) {
  const [state, setState] = useState<NotebookAudioState | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceKind>("microphone");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_notebook_audio_state?select=id,active,started_at,status,source_kind,source_process_name,source_label,last_error,bridge_updated_at,updated_at&id=eq.main&limit=1`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) return;
      const rows = (await response.json()) as NotebookAudioState[];
      setState(rows[0] ?? null);
    } catch {
      // A próxima atualização tenta novamente.
    }
  }, []);

  useEffect(() => {
    void loadState();
    const timer = window.setInterval(() => void loadState(), 2000);
    return () => window.clearInterval(timer);
  }, [loadState]);

  const status = state?.status ?? "idle";
  const active = Boolean(state?.active) || status === "starting" || status === "streaming" || status === "stopping";
  const selected = useMemo(
    () => SOURCES.find((source) => source.kind === selectedSource) ?? SOURCES[0],
    [selectedSource],
  );
  const activeKind = state?.source_kind ?? selectedSource;
  const activeLabel = state?.source_label || sourceLabel(activeKind);
  const microphoneActive = active && activeKind === "microphone";

  const activate = async () => {
    if (busy || active) return;
    setMessage(null);
    setError(null);

    if (!playerOnline) {
      setError("A ponte da Rádio está offline. O notebook da ponte precisa estar ligado.");
      return;
    }

    const confirmed = window.confirm(
      selectedSource === "microphone"
        ? "Colocar o microfone do notebook AO VIVO no prédio?\n\nEnquanto estiver ativo, tudo que o microfone captar será enviado para a Rádio."
        : `Transmitir somente: ${selected.label}?\n\nA automação continua conectada. Esse áudio entrará por cima pela rede local.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_start_notebook_audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ p_source_kind: selectedSource }),
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      setMessage(
        selectedSource === "microphone"
          ? "Microfone solicitado. Quando aparecer MICROFONE AO VIVO, você já pode falar."
          : `Solicitado: ${selected.label}. Os demais sons do notebook não serão enviados.`,
      );
      await loadState();
    } catch (activateError) {
      setError(formatError(activateError));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (busy || !active) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_stop_notebook_audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      setMessage(
        microphoneActive
          ? "Microfone encerrado. A automação volta a ser ouvida normalmente."
          : "Transmissão encerrada. A automação continua conectada e volta a ser ouvida normalmente.",
      );
      await loadState();
    } catch (deactivateError) {
      setError(formatError(deactivateError));
    } finally {
      setBusy(false);
    }
  };

  const stateError = status === "error" ? state?.last_error : null;

  return (
    <section style={styles.card} aria-label="Áudio e microfone do notebook pela rede">
      <div style={styles.heading}>
        <div>
          <div style={styles.kicker}>ENTRADA AO VIVO PELA REDE</div>
          <h3 style={styles.title}>Som e microfone do notebook</h3>
          <p style={styles.help}>
            Escolha uma fonte para entrar na Rádio: microfone para falar ao vivo, Spotify, navegador ou o som completo do Windows.
          </p>
        </div>
        <span style={{ ...styles.badge, ...(active ? styles.activeBadge : playerOnline ? styles.online : styles.offline) }}>
          {microphoneActive ? "MICROFONE AO VIVO" : active ? "NOTEBOOK AO VIVO" : playerOnline ? "PONTE ONLINE" : "PONTE OFFLINE"}
        </span>
      </div>

      {!active ? (
        <div style={styles.sourceArea}>
          <label style={styles.sourceLabel} htmlFor="radio-notebook-source">O que você quer mandar para a Rádio?</label>
          <select
            id="radio-notebook-source"
            value={selectedSource}
            onChange={(event) => {
              setSelectedSource(event.target.value as SourceKind);
              setMessage(null);
              setError(null);
            }}
            style={styles.select}
            disabled={busy}
          >
            {SOURCES.map((source) => (
              <option key={source.kind} value={source.kind}>{source.label}</option>
            ))}
          </select>
          <div style={styles.sourceHelp}>{selected.help}</div>
          {selectedSource === "microphone" ? (
            <div style={styles.warning}>
              Evite deixar o notebook perto de uma caixa de som para não gerar microfonia. Use VOLTAR À AUTOMAÇÃO assim que terminar de falar.
            </div>
          ) : null}
          {(selectedSource === "edge" || selectedSource === "chrome") ? (
            <div style={styles.warning}>
              Se o WhatsApp estiver aberto dentro deste mesmo navegador, o áudio dele também pertence ao navegador. Para manter o WhatsApp particular, use o aplicativo do WhatsApp ou outro navegador.
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={active ? styles.activeBox : styles.infoBox}>
        <div>
          <strong>{active ? activeLabel : statusTitle(status)}</strong>
          <div style={styles.meta}>{active ? statusHelp(status, activeLabel, activeKind) : "A automação e o AudioCast continuam na rede normal da Santa Maria."}</div>
        </div>

        {active ? (
          <button type="button" style={styles.stopButton} disabled={busy || status === "stopping"} onClick={() => void deactivate()}>
            {busy || status === "stopping" ? "ENCERRANDO..." : "VOLTAR À AUTOMAÇÃO"}
          </button>
        ) : (
          <button type="button" style={selectedSource === "microphone" ? styles.micButton : styles.playButton} disabled={busy || !playerOnline} onClick={() => void activate()}>
            {busy ? "AGUARDE..." : selectedSource === "microphone" ? "🎙️ FALAR AO VIVO" : `🔊 TRANSMITIR ${shortLabel(selectedSource)}`}
          </button>
        )}
      </div>

      {message ? <div style={styles.success}>{message}</div> : null}
      {stateError ? <div style={styles.error}>{stateError}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}

function sourceLabel(kind: SourceKind) {
  return SOURCES.find((source) => source.kind === kind)?.label.replace("🎙️ ", "") ?? "Som do notebook";
}

function shortLabel(kind: SourceKind) {
  if (kind === "spotify") return "SPOTIFY";
  if (kind === "edge") return "EDGE";
  if (kind === "chrome") return "CHROME";
  if (kind === "microphone") return "MICROFONE";
  return "SOM INTEIRO";
}

function statusTitle(status: NotebookAudioState["status"]) {
  if (status === "requested") return "Solicitação enviada para a ponte";
  if (status === "starting") return "Preparando captura selecionada...";
  if (status === "streaming") return "Áudio entrando pela rede";
  if (status === "stopping") return "Encerrando transmissão ao vivo...";
  if (status === "error") return "Transmissão não iniciada";
  return "Automação conectada normalmente";
}

function statusHelp(status: NotebookAudioState["status"], label: string, kind: SourceKind) {
  if (status === "requested" || status === "starting") {
    return kind === "microphone" ? "Preparando o microfone do notebook..." : `Preparando somente ${label}. A Rádio continua em Wi‑Fi.`;
  }
  if (status === "streaming") {
    return kind === "microphone" ? "O microfone do notebook está AO VIVO no prédio." : `Somente ${label} está sendo enviado para o prédio.`;
  }
  if (status === "stopping") return "O stream está sendo fechado; a programação base permanece preservada.";
  if (status === "error") return "A automação normal não foi alterada.";
  return "Automação conectada normalmente.";
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("RADIO_PLAYLIST_ALREADY_ACTIVE")) return "Já existe uma playlist ou outro conteúdo temporário ativo. Encerre-o antes de assumir pelo notebook.";
  if (message.includes("RADIO_TEMPORARY_MODE_ALREADY_ACTIVE")) return "A Rádio já está em outro modo temporário. Volte à automação antes de assumir pelo notebook.";
  if (message.includes("RADIO_NOTEBOOK_SOURCE_INVALID")) return "Fonte de áudio inválida.";
  return message;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    margin: "18px 12px 0",
    padding: 20,
    border: "1px solid #dbe3ef",
    borderRadius: 18,
    background: "#fff",
    boxShadow: "0 8px 24px rgba(15,23,42,.05)",
  },
  heading: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  kicker: { fontSize: 11, fontWeight: 900, letterSpacing: ".08em", color: "#f97316" },
  title: { margin: "5px 0 4px", fontSize: 22, color: "#0f172a" },
  help: { margin: 0, maxWidth: 900, color: "#64748b", fontSize: 14, lineHeight: 1.45 },
  badge: { borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 },
  online: { background: "#dcfce7", color: "#166534" },
  offline: { background: "#fee2e2", color: "#991b1b" },
  activeBadge: { background: "#ffedd5", color: "#9a3412" },
  sourceArea: { marginTop: 16, display: "grid", gap: 7, maxWidth: 720 },
  sourceLabel: { fontSize: 12, fontWeight: 900, color: "#334155" },
  select: { width: "100%", minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 12, background: "#fff", padding: "0 12px", color: "#0f172a", fontSize: 14, fontWeight: 800 },
  sourceHelp: { color: "#64748b", fontSize: 12, lineHeight: 1.45 },
  warning: { border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.4 },
  infoBox: { marginTop: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0", padding: 14 },
  activeBox: { marginTop: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", padding: 14 },
  meta: { color: "#64748b", fontSize: 12, marginTop: 4, lineHeight: 1.4 },
  playButton: { border: "1px solid #f97316", borderRadius: 12, background: "#fff7ed", color: "#c2410c", padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  micButton: { border: "1px solid #dc2626", borderRadius: 12, background: "#fff1f2", color: "#b91c1c", padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  stopButton: { border: "1px solid #dc2626", borderRadius: 12, background: "#fff", color: "#b91c1c", padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  success: { marginTop: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534", padding: "9px 11px", fontSize: 13 },
  error: { marginTop: 10, borderRadius: 10, background: "#fef2f2", color: "#991b1b", padding: "9px 11px", fontSize: 13 },
};
