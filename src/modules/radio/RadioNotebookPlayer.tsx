import { useCallback, useEffect, useState } from "react";
import { authenticatedSupabaseFetch, readSupabaseRestError, SUPABASE_URL } from "../security/services/supabaseClient";

type NotebookAudioState = {
  id: "main";
  active: boolean;
  started_at: string | null;
  status: "idle" | "requested" | "starting" | "streaming" | "stopping" | "error";
  last_error: string | null;
  bridge_updated_at: string | null;
  updated_at: string;
};

type Props = {
  playerOnline: boolean;
};

export function RadioNotebookPlayer({ playerOnline }: Props) {
  const [state, setState] = useState<NotebookAudioState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_notebook_audio_state?select=id,active,started_at,status,last_error,bridge_updated_at,updated_at&id=eq.main&limit=1`,
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

  const activate = async () => {
    if (busy || active) return;
    setMessage(null);
    setError(null);

    if (!playerOnline) {
      setError("A ponte da Rádio está offline. O notebook da ponte precisa estar ligado.");
      return;
    }

    const confirmed = window.confirm(
      "Ativar SOM DO NOTEBOOK PELA REDE? O áudio que estiver tocando no Windows será enviado pela rede local e entrará por cima da automação. Bluetooth não será usado.",
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
      setMessage("Solicitado. A ponte vai capturar o som do Windows e transmitir pela rede local.");
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
      setMessage("Encerrando o som do notebook. A automação continua conectada e volta a ser ouvida normalmente.");
      await loadState();
    } catch (deactivateError) {
      setError(formatError(deactivateError));
    } finally {
      setBusy(false);
    }
  };

  const stateError = status === "error" ? state?.last_error : null;

  return (
    <section style={styles.card} aria-label="Som completo do notebook pela rede">
      <div style={styles.heading}>
        <div>
          <div style={styles.kicker}>ENTRADA AO VIVO PELA REDE</div>
          <h3 style={styles.title}>Som do notebook</h3>
          <p style={styles.help}>
            Captura o áudio que o Windows já está reproduzindo e envia pela rede local para a Rádio. YouTube, navegador, Spotify, vídeos e outros sons entram por cima da automação, sem Bluetooth e sem trocar a fonte principal do AudioCast.
          </p>
        </div>
        <span style={{ ...styles.badge, ...(active ? styles.activeBadge : playerOnline ? styles.online : styles.offline) }}>
          {active ? "NOTEBOOK AO VIVO" : playerOnline ? "PONTE ONLINE" : "PONTE OFFLINE"}
        </span>
      </div>

      <div style={active ? styles.activeBox : styles.infoBox}>
        <div>
          <strong>{statusTitle(status)}</strong>
          <div style={styles.meta}>{statusHelp(status)}</div>
        </div>

        {active ? (
          <button type="button" style={styles.stopButton} disabled={busy || status === "stopping"} onClick={() => void deactivate()}>
            {busy || status === "stopping" ? "ENCERRANDO..." : "VOLTAR À AUTOMAÇÃO"}
          </button>
        ) : (
          <button type="button" style={styles.playButton} disabled={busy || !playerOnline} onClick={() => void activate()}>
            {busy ? "AGUARDE..." : "🔊 ATIVAR SOM DO NOTEBOOK"}
          </button>
        )}
      </div>

      {message ? <div style={styles.success}>{message}</div> : null}
      {stateError ? <div style={styles.error}>{stateError}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}

function statusTitle(status: NotebookAudioState["status"]) {
  if (status === "requested") return "Solicitação enviada para a ponte";
  if (status === "starting") return "Capturando o áudio do Windows...";
  if (status === "streaming") return "Áudio do notebook entrando pela rede";
  if (status === "stopping") return "Encerrando transmissão ao vivo...";
  if (status === "error") return "Transmissão não iniciada";
  return "Automação conectada normalmente";
}

function statusHelp(status: NotebookAudioState["status"]) {
  if (status === "requested" || status === "starting") return "A Rádio continua em Wi‑Fi. A ponte está preparando o stream de áudio local.";
  if (status === "streaming") return "Tudo que você ouvir no Windows está sendo enviado pela rede e entra por cima da programação normal.";
  if (status === "stopping") return "O stream está sendo fechado; a programação base permanece preservada.";
  if (status === "error") return "Veja o erro abaixo. A automação normal não foi alterada.";
  return "Nenhum pareamento é necessário. O notebook e o AudioCast continuam na mesma rede da Santa Maria.";
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
  help: { margin: 0, maxWidth: 900, color: "#64748b", fontSize: 14, lineHeight: 1.45 },
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
