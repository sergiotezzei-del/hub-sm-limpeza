import { useCallback, useEffect, useRef, useState } from "react";
import {
  authenticatedSupabaseFetch,
  getSupabaseClient,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type NotebookSession = {
  id: string;
  title: string;
  status: "queued" | "claimed" | "playing" | "stop_requested";
  last_error: string | null;
};

type Props = {
  playerOnline: boolean;
};

export function RadioNotebookPlayer({ playerOnline }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<NotebookSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_playlist_sessions?select=id,title,status,last_error&source_type=eq.temporary&status=in.(queued,claimed,playing,stop_requested)&order=created_at.desc&limit=5`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) return;
      const rows = (await response.json()) as NotebookSession[];
      setSession(rows.find((row) => row.title.startsWith("Notebook · ")) ?? null);
    } catch {
      // A próxima atualização tenta novamente.
    }
  }, []);

  useEffect(() => {
    void loadSession();
    const timer = window.setInterval(() => void loadSession(), 2500);
    return () => window.clearInterval(timer);
  }, [loadSession]);

  const chooseFile = (next: File | null) => {
    setMessage(null);
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!next.name.toLowerCase().endsWith(".mp3") || next.size <= 0 || next.size > MAX_FILE_BYTES) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setError("Escolha um arquivo MP3 de até 25 MB.");
      return;
    }
    setFile(next);
  };

  const play = async () => {
    if (!file || busy || session) return;
    setMessage(null);
    setError(null);

    if (!playerOnline) {
      setError("A ponte da Rádio está offline. Ligue o notebook da ponte antes de tocar.");
      return;
    }

    const confirmed = window.confirm(
      `Tocar "${file.name}" agora no prédio? A programação normal será interrompida temporariamente e voltará ao terminar.`,
    );
    if (!confirmed) return;

    setBusy(true);
    const sessionId = crypto.randomUUID();
    const storagePath = `notebook/${sessionId}/01-${sanitizeFileName(file.name)}`;
    let uploaded = false;

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error("Supabase indisponível.");

      setProgress("Enviando MP3 do notebook...");
      const { error: uploadError } = await supabase.storage.from("radio-playlists").upload(storagePath, file, {
        cacheControl: "3600",
        contentType: "audio/mpeg",
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      uploaded = true;

      setProgress("Enviando para a Rádio...");
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_play_notebook_file`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          p_id: sessionId,
          p_file_name: file.name,
          p_storage_path: storagePath,
        }),
      });

      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }

      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setProgress("");
      setMessage("MP3 enviado para tocar. Ao terminar, a automação volta sozinha.");
      await loadSession();
    } catch (playError) {
      if (uploaded) {
        try {
          const supabase = await getSupabaseClient();
          await supabase?.storage.from("radio-playlists").remove([storagePath]);
        } catch {
          // Limpeza best-effort.
        }
      }
      setProgress("");
      setError(formatError(playError));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!session || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_request_stop_playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ p_id: session.id }),
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      setMessage("Parada solicitada. A Rádio vai voltar para a automação.");
      await loadSession();
    } catch (stopError) {
      setError(formatError(stopError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={styles.card} aria-label="Tocar música do notebook">
      <div style={styles.heading}>
        <div>
          <div style={styles.kicker}>ACESSO RÁPIDO</div>
          <h3 style={styles.title}>Tocar do notebook</h3>
          <p style={styles.help}>Escolha 1 MP3. Ele toca como arquivo temporário, não entra na biblioteca e é apagado da nuvem ao terminar.</p>
        </div>
        <span style={{ ...styles.badge, ...(playerOnline ? styles.online : styles.offline) }}>
          {playerOnline ? "PONTE ONLINE" : "PONTE OFFLINE"}
        </span>
      </div>

      {session ? (
        <div style={styles.activeBox}>
          <div>
            <strong>{session.title.replace("Notebook · ", "")}</strong>
            <div style={styles.meta}>{statusLabel(session.status)}</div>
          </div>
          <button type="button" style={styles.stopButton} disabled={busy} onClick={() => void stop()}>
            {busy ? "AGUARDE..." : "PARAR E VOLTAR"}
          </button>
        </div>
      ) : (
        <div style={styles.actions}>
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            style={{ display: "none" }}
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" style={styles.chooseButton} disabled={busy} onClick={() => inputRef.current?.click()}>
            {file ? "TROCAR MP3" : "ESCOLHER MP3"}
          </button>
          <div style={styles.fileName}>{file ? file.name : "Nenhum arquivo escolhido"}</div>
          <button type="button" style={styles.playButton} disabled={!file || busy || !playerOnline} onClick={() => void play()}>
            {busy ? "ENVIANDO..." : "▶ TOCAR NO PRÉDIO"}
          </button>
        </div>
      )}

      {progress ? <div style={styles.progress}>{progress}</div> : null}
      {message ? <div style={styles.success}>{message}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "musica.mp3";
}

function statusLabel(status: NotebookSession["status"]) {
  if (status === "queued") return "Preparando para tocar";
  if (status === "claimed") return "Carregando no AudioCast";
  if (status === "playing") return "Tocando no prédio";
  return "Parando e voltando à automação";
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("RADIO_PLAYLIST_ALREADY_ACTIVE")) return "Já existe outro conteúdo tocando na Rádio. Pare-o antes de tocar este MP3.";
  if (message.includes("RADIO_TEMPORARY_MODE_ALREADY_ACTIVE")) return "A Rádio já está em modo temporário. Volte à automação antes de tocar outro arquivo.";
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
  help: { margin: 0, maxWidth: 780, color: "#64748b", fontSize: 14, lineHeight: 1.45 },
  badge: { borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900 },
  online: { background: "#dcfce7", color: "#166534" },
  offline: { background: "#fee2e2", color: "#991b1b" },
  actions: { display: "grid", gridTemplateColumns: "auto minmax(180px,1fr) auto", gap: 10, alignItems: "center", marginTop: 16 },
  chooseButton: { border: "1px solid #cbd5e1", borderRadius: 12, background: "#f8fafc", padding: "12px 14px", fontWeight: 900, cursor: "pointer" },
  fileName: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155", fontSize: 13 },
  playButton: { border: "1px solid #f97316", borderRadius: 12, background: "#fff7ed", color: "#c2410c", padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  activeBox: { marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", padding: 14 },
  meta: { color: "#9a3412", fontSize: 12, marginTop: 3 },
  stopButton: { border: "1px solid #dc2626", borderRadius: 11, background: "#fff", color: "#b91c1c", padding: "10px 13px", fontWeight: 900, cursor: "pointer" },
  progress: { marginTop: 10, color: "#475569", fontSize: 13 },
  success: { marginTop: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534", padding: "9px 11px", fontSize: 13 },
  error: { marginTop: 10, borderRadius: 10, background: "#fef2f2", color: "#991b1b", padding: "9px 11px", fontSize: 13 },
};
