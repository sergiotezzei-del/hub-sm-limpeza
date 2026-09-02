import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  authenticatedSupabaseFetch,
  getSupabaseClient,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

const HUB_SESSION_KEY = "hub-sm-active-session";
const MAX_TRACKS = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type PlaylistSession = {
  id: string;
  title: string;
  status: "queued" | "claimed" | "playing" | "stop_requested" | "completed" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  last_error: string | null;
};

export function RadioPlaylistEnhancer() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<PlaylistSession | null>(null);
  const [title, setTitle] = useState("Playlist temporária");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      if (!isTezzeiAdminSession()) {
        setVisible(false);
        return;
      }
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      const radioDialog = document.querySelector('[role="dialog"][aria-label="Rádio Santa Maria"]');
      setVisible(path === "/radio" || Boolean(radioDialog));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("focus", sync);
    };
  }, []);

  const loadActiveSession = useCallback(async () => {
    if (!visible) {
      setActiveSession(null);
      return;
    }

    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_playlist_sessions?select=id,title,status,created_at,started_at,last_error&status=in.(queued,claimed,playing,stop_requested)&order=created_at.desc&limit=1`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) return;
      const rows = (await response.json()) as PlaylistSession[];
      setActiveSession(rows[0] ?? null);
    } catch {
      // O painel continua utilizável; a próxima leitura tenta novamente.
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    void loadActiveSession();
    const timer = window.setInterval(() => void loadActiveSession(), 2000);
    return () => window.clearInterval(timer);
  }, [loadActiveSession, visible]);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const chooseFiles = (list: FileList | null) => {
    setError(null);
    setMessage(null);
    if (!list) {
      setFiles([]);
      return;
    }

    const selected = Array.from(list);
    if (selected.length > MAX_TRACKS) {
      setError(`Escolha no máximo ${MAX_TRACKS} músicas por playlist.`);
      setFiles([]);
      return;
    }

    const invalid = selected.find((file) => !file.name.toLowerCase().endsWith(".mp3") || file.size <= 0 || file.size > MAX_FILE_BYTES);
    if (invalid) {
      setError(`A faixa ${invalid.name} precisa ser MP3 e ter até 25 MB.`);
      setFiles([]);
      return;
    }

    setFiles(selected);
  };

  const startPlaylist = async () => {
    if (busy || activeSession) return;
    setError(null);
    setMessage(null);

    if (!title.trim()) {
      setError("Dê um nome para a playlist.");
      return;
    }
    if (files.length === 0) {
      setError("Escolha pelo menos um arquivo MP3.");
      return;
    }

    setBusy(true);
    const sessionId = crypto.randomUUID();
    const uploadedPaths: string[] = [];

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error("Supabase indisponível.");

      const tracks: Array<{ position: number; file_name: string; storage_path: string }> = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const position = index + 1;
        const safeName = sanitizeFileName(file.name);
        const storagePath = `${sessionId}/${String(position).padStart(2, "0")}-${safeName}`;
        setProgress(`Enviando ${position} de ${files.length}: ${file.name}`);

        const { error: uploadError } = await supabase.storage
          .from("radio-playlists")
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: "audio/mpeg",
            upsert: false,
          });

        if (uploadError) throw new Error(uploadError.message);
        uploadedPaths.push(storagePath);
        tracks.push({ position, file_name: file.name, storage_path: storagePath });
      }

      setProgress("Preparando a Rádio Santa Maria...");
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_create_playlist_session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ p_id: sessionId, p_title: title.trim(), p_tracks: tracks }),
      });

      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }

      setFiles([]);
      setProgress("");
      setMessage("Playlist enviada. A automação será pausada e a playlist entrará em seguida.");
      await loadActiveSession();
    } catch (startError) {
      if (uploadedPaths.length) {
        try {
          const supabase = await getSupabaseClient();
          await supabase?.storage.from("radio-playlists").remove(uploadedPaths);
        } catch {
          // Limpeza best-effort; não mascara o erro original.
        }
      }
      setError(formatPlaylistError(startError));
      setProgress("");
    } finally {
      setBusy(false);
    }
  };

  const stopPlaylist = async () => {
    if (!activeSession || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/radio_request_stop_playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ p_id: activeSession.id }),
      });
      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }
      setMessage("Parada solicitada. A Rádio Santa Maria vai voltar para a automação.");
      await loadActiveSession();
    } catch (stopError) {
      setError(formatPlaylistError(stopError));
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return createPortal(
    <>
      <style>{playlistCss}</style>
      <button
        type="button"
        className={activeSession ? "radio-playlist-launch is-active" : "radio-playlist-launch"}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">♫</span>
        {activeSession ? "PLAYLIST HUB • ATIVA" : "PLAYLIST HUB"}
      </button>

      {open ? (
        <div className="radio-playlist-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="radio-playlist-panel" role="dialog" aria-modal="true" aria-label="Playlist temporária da Rádio Santa Maria">
            <header className="radio-playlist-header">
              <div>
                <span>RÁDIO SANTA MARIA</span>
                <h2>Playlist temporária</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </header>

            {activeSession ? (
              <div className="radio-playlist-active-card">
                <div className="radio-playlist-status-line">
                  <span className="radio-playlist-live-dot" />
                  <strong>{playlistStatus(activeSession.status)}</strong>
                </div>
                <h3>{activeSession.title}</h3>
                <p>A programação normal está preservada. Ao parar esta playlist, a automação volta.</p>
                {activeSession.last_error ? <div className="radio-playlist-error">{activeSession.last_error}</div> : null}
                <button
                  type="button"
                  className="radio-playlist-stop"
                  disabled={busy || activeSession.status === "stop_requested"}
                  onClick={() => void stopPlaylist()}
                >
                  {activeSession.status === "stop_requested" ? "VOLTANDO À AUTOMAÇÃO..." : "PARAR E VOLTAR À AUTOMAÇÃO"}
                </button>
              </div>
            ) : (
              <div className="radio-playlist-form">
                <label>
                  <span>Nome da playlist</span>
                  <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
                </label>

                <label className="radio-playlist-file-box">
                  <strong>Escolher músicas MP3</strong>
                  <small>Até {MAX_TRACKS} faixas · 25 MB por faixa</small>
                  <input
                    type="file"
                    accept=".mp3,audio/mpeg"
                    multiple
                    disabled={busy}
                    onChange={(event) => chooseFiles(event.target.files)}
                  />
                </label>

                {files.length ? (
                  <div className="radio-playlist-files">
                    <div className="radio-playlist-files-summary">
                      <strong>{files.length} faixa{files.length === 1 ? "" : "s"}</strong>
                      <span>{formatBytes(totalSize)}</span>
                    </div>
                    {files.map((file, index) => (
                      <div className="radio-playlist-file" key={`${file.name}-${file.size}-${index}`}>
                        <span>{index + 1}. {file.name}</span>
                        <small>{formatBytes(file.size)}</small>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="radio-playlist-start"
                  disabled={busy || files.length === 0}
                  onClick={() => void startPlaylist()}
                >
                  {busy ? "PREPARANDO..." : "ENVIAR E TOCAR NO HUB"}
                </button>
              </div>
            )}

            {progress ? <div className="radio-playlist-progress">{progress}</div> : null}
            {message ? <div className="radio-playlist-message">{message}</div> : null}
            {error ? <div className="radio-playlist-error">{error}</div> : null}

            <p className="radio-playlist-note">
              A playlist usa o canal temporário da Rádio Santa Maria. Vinhetas continuam separadas da programação normal.
            </p>
          </section>
        </div>
      ) : null}
    </>,
    document.body,
  );
}

function isTezzeiAdminSession() {
  try {
    const raw = window.sessionStorage.getItem(HUB_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { currentUser?: unknown };
    return parsed.currentUser === "tezzei";
  } catch {
    return false;
  }
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\.]+/, "")
    .slice(-120);
  return cleaned.toLowerCase().endsWith(".mp3") ? cleaned : `${cleaned || "faixa"}.mp3`;
}

function playlistStatus(status: PlaylistSession["status"]) {
  if (status === "queued") return "PREPARANDO";
  if (status === "claimed") return "BAIXANDO FAIXAS";
  if (status === "playing") return "TOCANDO NO HUB";
  if (status === "stop_requested") return "ENCERRANDO";
  return status.toUpperCase();
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPlaylistError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes("RADIO_PLAYLIST_ALREADY_ACTIVE")) return "Já existe uma playlist temporária ativa.";
  if (value.includes("SUPABASE_AUTH_SESSION_REQUIRED")) return "Sessão do HUB não encontrada. Entre novamente como administrador.";
  return `Não foi possível iniciar a playlist: ${value}`;
}

const playlistCss = `
.radio-playlist-launch {
  position: fixed;
  z-index: 11020;
  top: 16px;
  right: 16px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 9px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, .10);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .03em;
}
.radio-playlist-launch.is-active {
  color: #fff;
  background: #ea580c;
  border-color: #ea580c;
}
.radio-playlist-backdrop {
  position: fixed;
  z-index: 12000;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgba(15, 23, 42, .35);
  backdrop-filter: blur(2px);
}
.radio-playlist-panel {
  width: min(410px, 100%);
  height: 100%;
  overflow: auto;
  padding: 22px;
  color: #111827;
  background: #f8fafc;
  box-shadow: -16px 0 40px rgba(15, 23, 42, .18);
}
.radio-playlist-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.radio-playlist-header span {
  color: #9a3412;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .13em;
}
.radio-playlist-header h2 {
  margin: 4px 0 0;
  font-size: 24px;
}
.radio-playlist-header button {
  width: 34px;
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  background: #fff;
  font-size: 23px;
  line-height: 1;
}
.radio-playlist-form,
.radio-playlist-active-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 7px 22px rgba(15, 23, 42, .06);
}
.radio-playlist-form label:not(.radio-playlist-file-box) {
  display: grid;
  gap: 6px;
}
.radio-playlist-form label > span {
  color: #475569;
  font-size: 11px;
  font-weight: 900;
}
.radio-playlist-form input[type="text"],
.radio-playlist-form input:not([type]) {
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #fff;
}
.radio-playlist-file-box {
  display: grid;
  gap: 5px;
  padding: 14px;
  border: 1px dashed #fb923c;
  border-radius: 12px;
  background: #fff7ed;
}
.radio-playlist-file-box strong {
  font-size: 13px;
}
.radio-playlist-file-box small {
  color: #64748b;
  font-size: 10px;
}
.radio-playlist-file-box input {
  width: 100%;
  margin-top: 5px;
  font-size: 11px;
}
.radio-playlist-files {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
}
.radio-playlist-files-summary,
.radio-playlist-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.radio-playlist-files-summary {
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 11px;
}
.radio-playlist-file {
  min-width: 0;
  color: #475569;
  font-size: 10px;
}
.radio-playlist-file span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.radio-playlist-file small {
  flex: 0 0 auto;
}
.radio-playlist-start,
.radio-playlist-stop {
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 900;
}
.radio-playlist-start {
  color: #fff;
  background: #111827;
}
.radio-playlist-stop {
  color: #fff;
  background: #dc2626;
}
.radio-playlist-start:disabled,
.radio-playlist-stop:disabled {
  opacity: .55;
}
.radio-playlist-active-card h3 {
  margin: 0;
  font-size: 19px;
}
.radio-playlist-active-card p {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}
.radio-playlist-status-line {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #c2410c;
  font-size: 10px;
  letter-spacing: .05em;
}
.radio-playlist-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, .12);
}
.radio-playlist-progress,
.radio-playlist-message,
.radio-playlist-error {
  margin-top: 12px;
  padding: 10px 11px;
  border-radius: 9px;
  font-size: 11px;
  line-height: 1.4;
}
.radio-playlist-progress {
  color: #1d4ed8;
  background: #eff6ff;
}
.radio-playlist-message {
  color: #166534;
  background: #f0fdf4;
}
.radio-playlist-error {
  color: #991b1b;
  background: #fef2f2;
}
.radio-playlist-note {
  margin: 16px 2px 0;
  color: #64748b;
  font-size: 10px;
  line-height: 1.5;
}
@media (max-width: 720px) {
  .radio-playlist-launch {
    top: auto;
    right: 12px;
    bottom: 12px;
  }
  .radio-playlist-panel {
    width: 100%;
    padding: 18px;
  }
}
`;
