import { useCallback, useEffect, useMemo, useState } from "react";
import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

const TEST_FILE = "radio-sm-voz-teste.mp3";
const TEST_MESSAGE = "Atenção. Teste da Rádio Santa Maria. Nosso sistema de comunicação interna está funcionando.";
const TEST_DURATION_SECONDS = 9;

type RadioAnnouncement = {
  id: string;
  title: string;
  message: string | null;
  local_file: string;
  duration_seconds: number;
  scheduled_for: string;
  status: "queued" | "claimed" | "completed" | "failed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  last_error: string | null;
};

type RadioPlayerState = {
  id: "main";
  device_name: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  player_status: string | null;
  volume: number | null;
  mute: boolean;
  mode: number | null;
  current_ms: number | null;
  total_ms: number | null;
  updated_at: string;
  last_error: string | null;
};

type PlayerCommand = "pause" | "resume" | "next" | "previous" | "volume" | "mute" | "unmute";

export function RadioTestPage() {
  const [rows, setRows] = useState<RadioAnnouncement[]>([]);
  const [player, setPlayer] = useState<RadioPlayerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [controlBusy, setControlBusy] = useState<PlayerCommand | null>(null);
  const [volumeDraft, setVolumeDraft] = useState(36);
  const [editingVolume, setEditingVolume] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    const response = await authenticatedSupabaseFetch(
      `${SUPABASE_URL}/rest/v1/radio_announcements?select=id,title,message,local_file,duration_seconds,scheduled_for,status,created_at,completed_at,last_error&order=created_at.desc&limit=8`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      const details = await readSupabaseRestError(response);
      throw new Error(details.message || `HTTP ${response.status}`);
    }
    setRows((await response.json()) as RadioAnnouncement[]);
  }, []);

  const loadPlayer = useCallback(async () => {
    const response = await authenticatedSupabaseFetch(
      `${SUPABASE_URL}/rest/v1/radio_player_state?select=id,device_name,title,artist,album,player_status,volume,mute,mode,current_ms,total_ms,updated_at,last_error&id=eq.main&limit=1`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      const details = await readSupabaseRestError(response);
      throw new Error(details.message || `HTTP ${response.status}`);
    }
    const data = (await response.json()) as RadioPlayerState[];
    const next = data[0] ?? null;
    setPlayer(next);
    if (next?.volume !== null && next?.volume !== undefined && !editingVolume) {
      setVolumeDraft(next.volume);
    }
  }, [editingVolume]);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadRows(), loadPlayer()]);
      setError(null);
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadPlayer, loadRows]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const playerOnline = useMemo(() => {
    if (!player?.updated_at) return false;
    return Date.now() - new Date(player.updated_at).getTime() < 12000;
  }, [player]);

  const isPlaying = player?.player_status === "play";
  const progress = player?.total_ms && player.total_ms > 0
    ? Math.max(0, Math.min(100, ((player.current_ms ?? 0) / player.total_ms) * 100))
    : 0;

  const sendPlayerCommand = async (command: PlayerCommand, value?: number) => {
    if (controlBusy) return;
    setControlBusy(command);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/radio_player_commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ command, value: command === "volume" ? Math.round(value ?? volumeDraft) : null }),
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      window.setTimeout(() => void loadPlayer(), 700);
    } catch (sendError) {
      setError(formatError(sendError));
    } finally {
      window.setTimeout(() => setControlBusy(null), 500);
    }
  };

  const sendTest = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/radio_announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          title: "Teste Rádio Santa Maria",
          message: TEST_MESSAGE,
          local_file: TEST_FILE,
          duration_seconds: TEST_DURATION_SECONDS,
          scheduled_for: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      setMessage("Comunicado enviado para a fila. A ponte local deve reproduzir em poucos segundos.");
      await loadRows();
    } catch (sendError) {
      setError(formatError(sendError));
    } finally {
      setSending(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>HUB SANTA MARIA</div>
            <h1 style={styles.title}>Rádio Santa Maria</h1>
            <p style={styles.subtitle}>Som ambiente, controle do Spotify e comunicados internos.</p>
          </div>
          <div style={{ ...styles.onlineBadge, ...(playerOnline ? styles.onlineOk : styles.onlineOff) }}>
            <span style={{ ...styles.dot, background: playerOnline ? "#22c55e" : "#ef4444" }} />
            {playerOnline ? "SOM ONLINE" : "PONTE OFFLINE"}
          </div>
        </header>

        <section style={styles.playerCard}>
          <div style={styles.nowPlayingGrid}>
            <div style={styles.coverPlaceholder} aria-hidden="true">♫</div>
            <div style={styles.trackInfo}>
              <div style={styles.sourceLine}>{sourceLabel(player?.mode)} · {player?.device_name || "SOM SANTAMARIATEM"}</div>
              <h2 style={styles.trackTitle}>{player?.title || (playerOnline ? "Sem informação da música" : "Aguardando conexão")}</h2>
              <div style={styles.artist}>{player?.artist || "—"}</div>
              {player?.album ? <div style={styles.album}>{player.album}</div> : null}
            </div>
          </div>

          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <div style={styles.timeRow}>
            <span>{formatDuration(player?.current_ms)}</span>
            <span>{formatDuration(player?.total_ms)}</span>
          </div>

          <div style={styles.transport}>
            <button type="button" style={styles.roundButton} disabled={!playerOnline || Boolean(controlBusy)} onClick={() => void sendPlayerCommand("previous")} title="Anterior">⏮</button>
            <button
              type="button"
              style={{ ...styles.playButton, opacity: !playerOnline || controlBusy ? 0.55 : 1 }}
              disabled={!playerOnline || Boolean(controlBusy)}
              onClick={() => void sendPlayerCommand(isPlaying ? "pause" : "resume")}
              title={isPlaying ? "Pausar" : "Tocar"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button type="button" style={styles.roundButton} disabled={!playerOnline || Boolean(controlBusy)} onClick={() => void sendPlayerCommand("next")} title="Próxima">⏭</button>
          </div>

          <div style={styles.volumeRow}>
            <button
              type="button"
              style={styles.iconButton}
              disabled={!playerOnline || Boolean(controlBusy)}
              onClick={() => void sendPlayerCommand(player?.mute ? "unmute" : "mute")}
              title={player?.mute ? "Ativar som" : "Silenciar"}
            >
              {player?.mute ? "🔇" : "🔊"}
            </button>
            <input
              aria-label="Volume do sistema de som"
              type="range"
              min={0}
              max={100}
              value={volumeDraft}
              disabled={!playerOnline}
              style={styles.volumeSlider}
              onPointerDown={() => setEditingVolume(true)}
              onChange={(event) => setVolumeDraft(Number(event.target.value))}
              onPointerUp={() => {
                setEditingVolume(false);
                void sendPlayerCommand("volume", volumeDraft);
              }}
              onKeyUp={() => void sendPlayerCommand("volume", volumeDraft)}
            />
            <strong style={styles.volumeValue}>{volumeDraft}%</strong>
          </div>

          <div style={styles.playerFooter}>
            <span>Status: {playerStatusLabel(player?.player_status)}</span>
            <span>Atualização: {player?.updated_at ? formatClock(player.updated_at) : "—"}</span>
          </div>
        </section>

        {message ? <div style={styles.success}>{message}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}

        <section style={styles.sectionCard}>
          <div style={styles.sectionHeading}>
            <div>
              <div style={styles.sectionEyebrow}>COMUNICADOS</div>
              <h2 style={styles.sectionTitle}>Avisos da Rádio Santa Maria</h2>
            </div>
          </div>
          <p style={styles.testText}>{TEST_MESSAGE}</p>
          <div style={styles.fileLine}>Teste atual: <code>{TEST_FILE}</code></div>
          <button type="button" style={{ ...styles.actionButton, opacity: sending ? 0.65 : 1 }} onClick={() => void sendTest()} disabled={sending}>
            {sending ? "Enviando..." : "Disparar comunicado de teste"}
          </button>
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.listHeader}>
            <div>
              <div style={styles.sectionEyebrow}>HISTÓRICO</div>
              <h2 style={styles.sectionTitle}>Últimos comunicados</h2>
            </div>
            <button type="button" style={styles.refreshButton} onClick={() => void refresh()}>Atualizar</button>
          </div>

          {loading ? (
            <p>Carregando...</p>
          ) : rows.length === 0 ? (
            <p style={styles.muted}>Nenhum comunicado enviado ainda.</p>
          ) : (
            <div style={styles.list}>
              {rows.map((row) => (
                <article key={row.id} style={styles.row}>
                  <div>
                    <strong>{row.title}</strong>
                    <div style={styles.rowMeta}>{formatDate(row.created_at)} · {row.local_file}</div>
                    {row.last_error ? <div style={styles.rowError}>{row.last_error}</div> : null}
                  </div>
                  <span style={statusStyle(row.status)}>{statusLabel(row.status)}</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <p style={styles.note}>
          Os controles do player atuam no Spotify/reprodução normal. Durante um comunicado, o AudioCast usa um canal separado para o aviso e devolve a música ao terminar.
        </p>
      </section>
    </main>
  );
}

function sourceLabel(mode: number | null | undefined) {
  return mode === 31 ? "SPOTIFY" : "ÁUDIO AMBIENTE";
}

function playerStatusLabel(status: string | null | undefined) {
  if (status === "play") return "Tocando";
  if (status === "pause") return "Pausado";
  if (status === "stop") return "Parado";
  return status || "Sem informação";
}

function statusLabel(status: RadioAnnouncement["status"]) {
  if (status === "queued") return "NA FILA";
  if (status === "claimed") return "TOCANDO";
  if (status === "completed") return "CONCLUÍDO";
  if (status === "failed") return "FALHOU";
  return "CANCELADO";
}

function statusStyle(status: RadioAnnouncement["status"]): React.CSSProperties {
  const base: React.CSSProperties = { borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" };
  if (status === "completed") return { ...base, background: "#dcfce7", color: "#166534" };
  if (status === "failed") return { ...base, background: "#fee2e2", color: "#991b1b" };
  if (status === "claimed") return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  if (status === "queued") return { ...base, background: "#fef3c7", color: "#92400e" };
  return { ...base, background: "#e5e7eb", color: "#374151" };
}

function formatDuration(value: number | null | undefined) {
  if (!value || value < 0) return "0:00";
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatClock(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SUPABASE_AUTH_SESSION_REQUIRED")) {
    return "Sessão do HUB não encontrada. Entre no HUB como administrador e abra /radio novamente.";
  }
  return `Não foi possível concluir a operação: ${message}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#eef0f2", padding: "28px 14px 48px", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
  shell: { width: "min(900px, 100%)", margin: "0 auto", display: "grid", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, padding: "4px 2px 8px" },
  kicker: { fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", color: "#6b7280" },
  title: { margin: "5px 0 0", fontSize: 34, lineHeight: 1.05 },
  subtitle: { margin: "8px 0 0", color: "#6b7280" },
  onlineBadge: { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 11px", borderRadius: 999, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" },
  onlineOk: { background: "#dcfce7", color: "#166534" },
  onlineOff: { background: "#fee2e2", color: "#991b1b" },
  dot: { width: 8, height: 8, borderRadius: 999 },
  playerCard: { background: "#111827", color: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 14px 34px rgba(17,24,39,.16)" },
  nowPlayingGrid: { display: "grid", gridTemplateColumns: "88px minmax(0,1fr)", gap: 18, alignItems: "center" },
  coverPlaceholder: { width: 88, height: 88, borderRadius: 16, display: "grid", placeItems: "center", fontSize: 38, background: "linear-gradient(145deg,#374151,#1f2937)", border: "1px solid #4b5563" },
  trackInfo: { minWidth: 0 },
  sourceLine: { fontSize: 10, fontWeight: 900, letterSpacing: ".12em", color: "#9ca3af" },
  trackTitle: { margin: "7px 0 4px", fontSize: 24, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  artist: { color: "#e5e7eb", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  album: { marginTop: 3, color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  progressTrack: { marginTop: 20, height: 4, borderRadius: 99, background: "#374151", overflow: "hidden" },
  progressFill: { height: "100%", background: "#f3f4f6", borderRadius: 99 },
  timeRow: { display: "flex", justifyContent: "space-between", marginTop: 5, color: "#9ca3af", fontSize: 10 },
  transport: { display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 10 },
  roundButton: { width: 42, height: 42, borderRadius: 999, border: "1px solid #4b5563", background: "#1f2937", color: "#fff", fontSize: 18, cursor: "pointer" },
  playButton: { width: 58, height: 58, borderRadius: 999, border: 0, background: "#fff", color: "#111827", fontSize: 23, cursor: "pointer", fontWeight: 900 },
  volumeRow: { display: "grid", gridTemplateColumns: "40px minmax(0,1fr) 48px", alignItems: "center", gap: 10, marginTop: 18 },
  iconButton: { width: 38, height: 38, borderRadius: 10, border: "1px solid #4b5563", background: "#1f2937", color: "#fff", cursor: "pointer" },
  volumeSlider: { width: "100%", accentColor: "#fff" },
  volumeValue: { textAlign: "right", fontSize: 13 },
  playerFooter: { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid #374151", color: "#9ca3af", fontSize: 11 },
  sectionCard: { background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 7px 24px rgba(15,23,42,.06)" },
  sectionHeading: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionEyebrow: { fontSize: 10, fontWeight: 900, letterSpacing: ".13em", color: "#9ca3af" },
  sectionTitle: { margin: "4px 0 0", fontSize: 19 },
  testText: { margin: "14px 0 8px", lineHeight: 1.5 },
  fileLine: { marginBottom: 14, fontSize: 12, color: "#6b7280" },
  actionButton: { border: 0, borderRadius: 10, padding: "11px 15px", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer" },
  success: { padding: 12, borderRadius: 10, background: "#dcfce7", color: "#166534", fontSize: 14 },
  error: { padding: 12, borderRadius: 10, background: "#fee2e2", color: "#991b1b", fontSize: 14 },
  listHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  refreshButton: { border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "7px 10px", cursor: "pointer" },
  list: { marginTop: 14, display: "grid", gap: 8 },
  row: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  rowMeta: { marginTop: 4, fontSize: 12, color: "#6b7280" },
  rowError: { marginTop: 5, fontSize: 12, color: "#b91c1c" },
  muted: { color: "#6b7280" },
  note: { margin: "2px 3px 0", color: "#6b7280", fontSize: 12, lineHeight: 1.5 },
};
