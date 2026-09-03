import { useCallback, useEffect, useState } from "react";
import { authenticatedSupabaseFetch, readSupabaseRestError, SUPABASE_URL } from "../security/services/supabaseClient";

type NotebookAudioState = {
  id: "main";
  active: boolean;
  started_at: string | null;
  updated_at: string;
};

type Props = {
  playerOnline: boolean;
  playerMode: number | null;
};

export function RadioNotebookPlayer({ playerOnline, playerMode }: Props) {
  const [state, setState] = useState<NotebookAudioState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_notebook_audio_state?select=id,active,started_at,updated_at&id=eq.main&limit=1`,
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
    const timer = window.setInterval(() => void loadState(), 2500);
    return () => window.clearInterval(timer);
  }, [loadState]);

  const active = Boolean(state?.active);
  const bluetoothReady = active && playerMode === 41;

  const activate = async () => {
    if (busy || active) return;
    setMessage(null);
    setError(null);

    if (!playerOnline) {
      setError("A ponte da Rádio está offline. O notebook da ponte precisa estar ligado.");
      return;
    }

    const confirmed = window.confirm(
      "Ativar SOM DO NOTEBOOK? A automação será pausada e o AudioCast entrará em Bluetooth. Tudo que tocar no Windows poderá sair no som do prédio.",
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_start_notebook_audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      setMessage("Modo notebook ativado. Use SOM SANTAMARIATEM como saída de áudio do Windows.");
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
      setMessage("Voltando para Wi-Fi e para a automação normal da Rádio.");
      await loadState();
    } catch (deactivateError) {
      setError(formatError(deactivateError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={styles.card} aria-label="Som completo do notebook">
      <div style={styles.heading}>
        <div>
          <div style={styles.kicker}>ENTRADA AO VIVO</div>
          <h3 style={styles.title}>Som do notebook</h3>
          <p style={styles.help}>
            Espelha o áudio do Windows pelo Bluetooth do AudioCast. YouTube, navegador, Spotify, vídeos e qualquer outro som do notebook passam a sair no prédio.
          </p>
        </div>
        <span style={{ ...styles.badge, ...(active ? styles.activeBadge : playerOnline ? styles.online : styles.offline) }}>
          {active ? "NOTEBOOK ATIVO" : playerOnline ? "PONTE ONLINE" : "PONTE OFFLINE"}
        </span>
      </div>

      <div style={active ? styles.activeBox : styles.infoBox}>
        <div>
          <strong>{active ? (bluetoothReady ? "AudioCast em Bluetooth" : "Mudando para Bluetooth...") : "Conexão direta com o áudio do Windows"}</strong>
          <div style={styles.meta}>
            {active
              ? "Selecione SOM SANTAMARIATEM como saída de som do Windows."
              : "O pareamento Bluetooth é feito uma única vez. Depois o HUB assume e devolve a Rádio para a automação."}
          </div>
        </div>

        {active ? (
          <button type="button" style={styles.stopButton} disabled={busy} onClick={() => void deactivate()}>
            {busy ? "AGUARDE..." : "VOLTAR À AUTOMAÇÃO"}
          </button>
        ) : (
          <button type="button" style={styles.playButton} disabled={busy || !playerOnline} onClick={() => void activate()}>
            {busy ? "AGUARDE..." : "🔊 ATIVAR SOM DO NOTEBOOK"}
          </button>
        )}
      </div>

      {message ? <div style={styles.success}>{message}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("RADIO_PLAYLIST_ALREADY_ACTIVE")) return "Já existe uma playlist ou outro conteúdo temporário ativo. Encerre-o antes de assumir pelo notebook.";
  if (message.includes("RADIO_TEMPORARY_MODE_ALREADY_ACTIVE")) return "A Rádio já está em outro modo temporário. Volte à automação antes de assumir pelo notebook.";
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
  help: { margin: 0, maxWidth: 820, color: "#64748b", fontSize: 14, lineHeight: 1.45 },
  badge: { borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 },
  online: { background: "#dcfce7", color: "#166534" },
  offline: { background: "#fee2e2", color: "#991b1b" },
  activeBadge: { background: "#ffedd5", color: "#9a3412" },
  infoBox: { marginTop: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0", padding: 14 },
  activeBox: { marginTop: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", padding: 14 },
  meta: { color: "#64748b", fontSize: 12, marginTop: 4, lineHeight: 1.4 },
  playButton: { border: "1px solid #f97316", borderRadius: 12, background: "#fff7ed", color: "#c2410c", padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  stopButton: { border: "1px solid #dc2626", borderRadius: 12, background: "#fff", color: "#b91c1c", padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  success: { marginTop: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534", padding: "9px 11px", fontSize: 13 },
  error: { marginTop: 10, borderRadius: 10, background: "#fef2f2", color: "#991b1b", padding: "9px 11px", fontSize: 13 },
};
