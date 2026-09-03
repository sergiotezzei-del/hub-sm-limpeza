import { useCallback, useEffect, useMemo, useState } from "react";
import {
  authenticatedSupabaseFetch,
  getSupabaseClient,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";
import "./radioStudio.css";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TRACKS = 30;

type StudioTab = "library" | "program" | "content" | "properties" | "health";

type LibraryPlaylist = {
  id: string;
  title: string;
  description: string | null;
  is_archived: boolean;
  play_count: number;
  last_played_at: string | null;
  created_at: string;
};

type LibraryTrack = {
  id: string;
  playlist_id: string;
  position: number;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
};

type ContentKind = "jingle" | "announcement" | "property" | "training" | "event";

type ContentItem = {
  id: string;
  kind: ContentKind;
  title: string;
  script_text: string | null;
  status: "draft" | "ready" | "archived";
  audio_file_name: string | null;
  audio_storage_path: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  property_code: string | null;
  property_url: string | null;
  play_count: number;
  last_played_at: string | null;
  created_at: string;
};

type ProgramEntry = {
  id: string;
  title: string;
  target_type: "playlist" | "content";
  playlist_id: string | null;
  content_id: string | null;
  schedule_type: "once" | "weekly";
  run_at: string | null;
  weekdays: number[];
  local_time: string | null;
  timezone: string;
  active: boolean;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
};

type ProgramLog = {
  id: number;
  created_at: string;
  program_id: string | null;
  session_id: string | null;
  status: "queued" | "failed" | "skipped";
  message: string | null;
};

type RuntimeState = {
  id: "main";
  operating_mode: "automation" | "temporary";
  temporary_started_at: string | null;
  resume_on_exit: boolean;
  updated_at: string;
};

type PlaylistSession = {
  id: string;
  title: string;
  status: "draft" | "queued" | "claimed" | "playing" | "stop_requested" | "completed" | "failed" | "cancelled";
  source_type?: "temporary" | "library_playlist" | "content_item";
  source_id?: string | null;
  triggered_by?: "manual" | "schedule";
  created_at: string;
  started_at: string | null;
  last_error: string | null;
};

export type StudioPlayerState = {
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

type Props = {
  player: StudioPlayerState | null;
  playerOnline: boolean;
};

const DAY_OPTIONS = [
  { value: 1, label: "SEG" },
  { value: 2, label: "TER" },
  { value: 3, label: "QUA" },
  { value: 4, label: "QUI" },
  { value: 5, label: "SEX" },
  { value: 6, label: "SÁB" },
  { value: 0, label: "DOM" },
];

export function RadioStudioPanel({ player, playerOnline }: Props) {
  const [tab, setTab] = useState<StudioTab>("library");
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [programs, setPrograms] = useState<ProgramEntry[]>([]);
  const [programLogs, setProgramLogs] = useState<ProgramLog[]>([]);
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [session, setSession] = useState<PlaylistSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [libraryTitle, setLibraryTitle] = useState("");
  const [libraryDescription, setLibraryDescription] = useState("");
  const [libraryFiles, setLibraryFiles] = useState<File[]>([]);

  const [contentKind, setContentKind] = useState<Exclude<ContentKind, "property">>("jingle");
  const [contentTitle, setContentTitle] = useState("");
  const [contentScript, setContentScript] = useState("");
  const [contentFile, setContentFile] = useState<File | null>(null);

  const [propertyTitle, setPropertyTitle] = useState("");
  const [propertyCode, setPropertyCode] = useState("");
  const [propertyUrl, setPropertyUrl] = useState("");
  const [propertyScript, setPropertyScript] = useState("");
  const [propertyFile, setPropertyFile] = useState<File | null>(null);

  const [programTitle, setProgramTitle] = useState("");
  const [programTargetType, setProgramTargetType] = useState<"playlist" | "content">("playlist");
  const [programTargetId, setProgramTargetId] = useState("");
  const [programScheduleType, setProgramScheduleType] = useState<"once" | "weekly">("weekly");
  const [programRunAt, setProgramRunAt] = useState("");
  const [programTime, setProgramTime] = useState("09:00");
  const [programDays, setProgramDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [programActive, setProgramActive] = useState(false);

  const loadStudio = useCallback(async () => {
    try {
      const [playlistRes, trackRes, contentRes, programRes, logRes, runtimeRes, sessionRes] = await Promise.all([
        studioFetch("radio_library_playlists?select=id,title,description,is_archived,play_count,last_played_at,created_at&order=is_archived.asc,created_at.desc"),
        studioFetch("radio_library_tracks?select=id,playlist_id,position,file_name,storage_path,file_size_bytes&order=playlist_id,position"),
        studioFetch("radio_content_items?select=id,kind,title,script_text,status,audio_file_name,audio_storage_path,file_size_bytes,duration_seconds,property_code,property_url,play_count,last_played_at,created_at&order=status.asc,created_at.desc"),
        studioFetch("radio_program_entries?select=id,title,target_type,playlist_id,content_id,schedule_type,run_at,weekdays,local_time,timezone,active,last_run_at,last_error,created_at&order=active.desc,created_at.desc"),
        studioFetch("radio_program_log?select=id,created_at,program_id,session_id,status,message&order=created_at.desc&limit=12"),
        studioFetch("radio_runtime_state?select=id,operating_mode,temporary_started_at,resume_on_exit,updated_at&id=eq.main&limit=1"),
        studioFetch("radio_playlist_sessions?select=id,title,status,source_type,source_id,triggered_by,created_at,started_at,last_error&status=in.(queued,claimed,playing,stop_requested)&order=created_at.desc&limit=1"),
      ]);

      setPlaylists(playlistRes as LibraryPlaylist[]);
      setTracks(trackRes as LibraryTrack[]);
      setContents(contentRes as ContentItem[]);
      setPrograms(programRes as ProgramEntry[]);
      setProgramLogs(logRes as ProgramLog[]);
      setRuntime(((runtimeRes as RuntimeState[])[0]) ?? null);
      setSession(((sessionRes as PlaylistSession[])[0]) ?? null);
      setError(null);
    } catch (loadError) {
      setError(formatStudioError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStudio();
  }, [loadStudio]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (tab === "health" || tab === "program") void loadStudio();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadStudio, tab]);

  const tracksByPlaylist = useMemo(() => {
    const map = new Map<string, LibraryTrack[]>();
    tracks.forEach((track) => {
      const list = map.get(track.playlist_id) ?? [];
      list.push(track);
      map.set(track.playlist_id, list);
    });
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [tracks]);

  const readyContents = useMemo(() => contents.filter((item) => item.status === "ready"), [contents]);
  const nonPropertyContents = useMemo(() => contents.filter((item) => item.kind !== "property"), [contents]);
  const propertyContents = useMemo(() => contents.filter((item) => item.kind === "property"), [contents]);
  const activePlaylists = useMemo(() => playlists.filter((item) => !item.is_archived), [playlists]);

  useEffect(() => {
    const options = programTargetType === "playlist" ? activePlaylists : readyContents;
    if (!options.some((item) => item.id === programTargetId)) {
      setProgramTargetId(options[0]?.id ?? "");
    }
  }, [activePlaylists, programTargetId, programTargetType, readyContents]);

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const createLibrary = async () => {
    if (busy) return;
    clearFeedback();
    if (!libraryTitle.trim()) return setError("Dê um nome para a playlist.");
    if (!libraryFiles.length) return setError("Escolha pelo menos um MP3.");
    if (libraryFiles.length > MAX_TRACKS) return setError(`Máximo de ${MAX_TRACKS} músicas por playlist.`);
    const invalid = libraryFiles.find((file) => !validMp3(file));
    if (invalid) return setError(`${invalid.name} precisa ser MP3 e ter até 25 MB.`);

    const playlistId = crypto.randomUUID();
    const uploaded: string[] = [];
    setBusy("create-library");
    try {
      const supabase = await requireStorage();
      const payload = [];
      for (let index = 0; index < libraryFiles.length; index += 1) {
        const file = libraryFiles[index];
        const path = `library/${playlistId}/${String(index + 1).padStart(2, "0")}-${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from("radio-playlists").upload(path, file, {
          cacheControl: "3600",
          contentType: "audio/mpeg",
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);
        uploaded.push(path);
        payload.push({ position: index + 1, file_name: file.name, storage_path: path, file_size_bytes: file.size });
      }

      await studioRpc("radio_create_library_playlist", {
        p_id: playlistId,
        p_title: libraryTitle.trim(),
        p_description: libraryDescription.trim(),
        p_tracks: payload,
      });
      setLibraryTitle("");
      setLibraryDescription("");
      setLibraryFiles([]);
      setMessage("Playlist salva na biblioteca. Nada foi tocado.");
      await loadStudio();
    } catch (createError) {
      if (uploaded.length) {
        try {
          const supabase = await requireStorage();
          await supabase.storage.from("radio-playlists").remove(uploaded);
        } catch { /* limpeza best effort */ }
      }
      setError(formatStudioError(createError));
    } finally {
      setBusy(null);
    }
  };

  const addTracks = async (playlist: LibraryPlaylist, files: FileList | null) => {
    if (!files?.length || busy) return;
    clearFeedback();
    const selected = Array.from(files);
    const current = tracksByPlaylist.get(playlist.id) ?? [];
    if (current.length + selected.length > MAX_TRACKS) return setError(`Essa playlist pode ter no máximo ${MAX_TRACKS} músicas.`);
    const invalid = selected.find((file) => !validMp3(file));
    if (invalid) return setError(`${invalid.name} precisa ser MP3 e ter até 25 MB.`);

    setBusy(`add-${playlist.id}`);
    const uploaded: string[] = [];
    try {
      const supabase = await requireStorage();
      const payload = [];
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        const position = current.length + index + 1;
        const path = `library/${playlist.id}/${String(position).padStart(2, "0")}-${crypto.randomUUID().slice(0, 8)}-${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from("radio-playlists").upload(path, file, {
          cacheControl: "3600",
          contentType: "audio/mpeg",
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);
        uploaded.push(path);
        payload.push({ position, file_name: file.name, storage_path: path, file_size_bytes: file.size });
      }
      await studioRpc("radio_add_library_tracks", { p_playlist_id: playlist.id, p_tracks: payload });
      setMessage("Músicas adicionadas. Nada foi tocado.");
      await loadStudio();
    } catch (addError) {
      if (uploaded.length) {
        try {
          const supabase = await requireStorage();
          await supabase.storage.from("radio-playlists").remove(uploaded);
        } catch { /* limpeza best effort */ }
      }
      setError(formatStudioError(addError));
    } finally {
      setBusy(null);
    }
  };

  const moveTrack = async (playlistId: string, trackId: string, direction: -1 | 1) => {
    if (busy) return;
    const current = [...(tracksByPlaylist.get(playlistId) ?? [])];
    const index = current.findIndex((item) => item.id === trackId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    setBusy(`move-${trackId}`);
    clearFeedback();
    try {
      await studioRpc("radio_reorder_library_playlist", { p_playlist_id: playlistId, p_track_ids: current.map((item) => item.id) });
      await loadStudio();
    } catch (moveError) {
      setError(formatStudioError(moveError));
    } finally {
      setBusy(null);
    }
  };

  const removeTrack = async (track: LibraryTrack) => {
    if (busy || !window.confirm(`Remover “${track.file_name}” desta playlist?`)) return;
    setBusy(`remove-${track.id}`);
    clearFeedback();
    try {
      const path = await studioRpc("radio_remove_library_track", { p_track_id: track.id });
      if (typeof path === "string" && path) {
        const supabase = await requireStorage();
        await supabase.storage.from("radio-playlists").remove([path]);
      }
      setMessage("Música removida da biblioteca.");
      await loadStudio();
    } catch (removeError) {
      setError(formatStudioError(removeError));
    } finally {
      setBusy(null);
    }
  };

  const togglePlaylistArchive = async (playlist: LibraryPlaylist) => {
    if (busy) return;
    setBusy(`archive-${playlist.id}`);
    clearFeedback();
    try {
      await studioMutation(`radio_library_playlists?id=eq.${playlist.id}`, "PATCH", { is_archived: !playlist.is_archived });
      setMessage(playlist.is_archived ? "Playlist reativada." : "Playlist arquivada.");
      await loadStudio();
    } catch (archiveError) {
      setError(formatStudioError(archiveError));
    } finally {
      setBusy(null);
    }
  };

  const playPlaylist = async (playlist: LibraryPlaylist) => {
    if (busy || !window.confirm(`ATENÇÃO: isso vai tocar “${playlist.title}” no prédio agora. Confirmar?`)) return;
    setBusy(`play-${playlist.id}`);
    clearFeedback();
    try {
      await studioRpc("radio_start_library_playlist", { p_playlist_id: playlist.id });
      setMessage("Playlist enviada para reprodução.");
      await loadStudio();
    } catch (playError) {
      setError(formatStudioError(playError));
    } finally {
      setBusy(null);
    }
  };

  const saveContent = async (kind: ContentKind) => {
    if (busy) return;
    clearFeedback();
    const isProperty = kind === "property";
    const title = isProperty ? propertyTitle.trim() : contentTitle.trim();
    const script = isProperty ? propertyScript.trim() : contentScript.trim();
    const file = isProperty ? propertyFile : contentFile;
    if (!title) return setError("Informe um título.");
    if (file && !validMp3(file)) return setError("O áudio precisa ser MP3 e ter até 25 MB.");

    const id = crypto.randomUUID();
    let uploadedPath: string | null = null;
    setBusy(isProperty ? "save-property" : "save-content");
    try {
      if (file) {
        const supabase = await requireStorage();
        uploadedPath = `content/${id}/${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from("radio-playlists").upload(uploadedPath, file, {
          cacheControl: "3600",
          contentType: "audio/mpeg",
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);
      }

      await studioMutation("radio_content_items", "POST", {
        id,
        kind,
        title,
        script_text: script || null,
        status: uploadedPath ? "ready" : "draft",
        audio_file_name: file?.name ?? null,
        audio_storage_path: uploadedPath,
        file_size_bytes: file?.size ?? null,
        property_code: isProperty ? (propertyCode.trim() || null) : null,
        property_url: isProperty ? (propertyUrl.trim() || null) : null,
      });

      if (isProperty) {
        setPropertyTitle("");
        setPropertyCode("");
        setPropertyUrl("");
        setPropertyScript("");
        setPropertyFile(null);
      } else {
        setContentTitle("");
        setContentScript("");
        setContentFile(null);
      }
      setMessage(uploadedPath ? "Conteúdo salvo e pronto. Nada foi tocado." : "Roteiro salvo como rascunho. Falta anexar o áudio MP3.");
      await loadStudio();
    } catch (saveError) {
      if (uploadedPath) {
        try {
          const supabase = await requireStorage();
          await supabase.storage.from("radio-playlists").remove([uploadedPath]);
        } catch { /* limpeza best effort */ }
      }
      setError(formatStudioError(saveError));
    } finally {
      setBusy(null);
    }
  };

  const attachAudio = async (item: ContentItem, files: FileList | null) => {
    const file = files?.[0];
    if (!file || busy) return;
    clearFeedback();
    if (!validMp3(file)) return setError("O áudio precisa ser MP3 e ter até 25 MB.");
    setBusy(`attach-${item.id}`);
    let path: string | null = null;
    try {
      const supabase = await requireStorage();
      path = `content/${item.id}/${crypto.randomUUID().slice(0, 8)}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("radio-playlists").upload(path, file, {
        cacheControl: "3600",
        contentType: "audio/mpeg",
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      await studioMutation(`radio_content_items?id=eq.${item.id}`, "PATCH", {
        status: "ready",
        audio_file_name: file.name,
        audio_storage_path: path,
        file_size_bytes: file.size,
      });
      if (item.audio_storage_path) await supabase.storage.from("radio-playlists").remove([item.audio_storage_path]);
      setMessage("Áudio anexado. Conteúdo pronto para programação.");
      await loadStudio();
    } catch (attachError) {
      if (path) {
        try {
          const supabase = await requireStorage();
          await supabase.storage.from("radio-playlists").remove([path]);
        } catch { /* limpeza best effort */ }
      }
      setError(formatStudioError(attachError));
    } finally {
      setBusy(null);
    }
  };

  const playContent = async (item: ContentItem) => {
    if (item.status !== "ready" || busy || !window.confirm(`ATENÇÃO: isso vai tocar “${item.title}” no prédio agora. Confirmar?`)) return;
    setBusy(`play-content-${item.id}`);
    clearFeedback();
    try {
      await studioRpc("radio_start_content_item", { p_content_id: item.id });
      setMessage("Conteúdo enviado para reprodução.");
      await loadStudio();
    } catch (playError) {
      setError(formatStudioError(playError));
    } finally {
      setBusy(null);
    }
  };

  const archiveContent = async (item: ContentItem) => {
    if (busy) return;
    setBusy(`archive-content-${item.id}`);
    clearFeedback();
    try {
      await studioMutation(`radio_content_items?id=eq.${item.id}`, "PATCH", { status: item.status === "archived" ? (item.audio_storage_path ? "ready" : "draft") : "archived" });
      await loadStudio();
    } catch (archiveError) {
      setError(formatStudioError(archiveError));
    } finally {
      setBusy(null);
    }
  };

  const createProgram = async () => {
    if (busy) return;
    clearFeedback();
    if (!programTitle.trim()) return setError("Dê um nome para a programação.");
    if (!programTargetId) return setError("Escolha o conteúdo que será programado.");
    if (programScheduleType === "once" && !programRunAt) return setError("Escolha data e hora.");
    if (programScheduleType === "weekly" && (!programTime || !programDays.length)) return setError("Escolha horário e pelo menos um dia da semana.");

    setBusy("create-program");
    try {
      const payload = {
        title: programTitle.trim(),
        target_type: programTargetType,
        playlist_id: programTargetType === "playlist" ? programTargetId : null,
        content_id: programTargetType === "content" ? programTargetId : null,
        schedule_type: programScheduleType,
        run_at: programScheduleType === "once" ? new Date(programRunAt).toISOString() : null,
        weekdays: programScheduleType === "weekly" ? programDays : [],
        local_time: programScheduleType === "weekly" ? `${programTime}:00` : null,
        timezone: "America/Sao_Paulo",
        active: programActive,
      };
      await studioMutation("radio_program_entries", "POST", payload);
      setProgramTitle("");
      setProgramActive(false);
      setMessage(programActive ? "Programação criada e ATIVA." : "Programação salva DESATIVADA. Nada será tocado até você ativar.");
      await loadStudio();
    } catch (programError) {
      setError(formatStudioError(programError));
    } finally {
      setBusy(null);
    }
  };

  const toggleProgram = async (entry: ProgramEntry) => {
    if (busy) return;
    if (!entry.active && !window.confirm("Ativar esta programação? Quando chegar o horário, ela poderá tocar automaticamente no prédio.")) return;
    setBusy(`program-${entry.id}`);
    clearFeedback();
    try {
      await studioMutation(`radio_program_entries?id=eq.${entry.id}`, "PATCH", { active: !entry.active, last_error: null });
      setMessage(entry.active ? "Programação pausada." : "Programação ativada.");
      await loadStudio();
    } catch (toggleError) {
      setError(formatStudioError(toggleError));
    } finally {
      setBusy(null);
    }
  };

  const deleteProgram = async (entry: ProgramEntry) => {
    if (busy || !window.confirm(`Excluir a programação “${entry.title}”?`)) return;
    setBusy(`delete-program-${entry.id}`);
    clearFeedback();
    try {
      await studioMutation(`radio_program_entries?id=eq.${entry.id}`, "DELETE");
      setMessage("Programação excluída.");
      await loadStudio();
    } catch (deleteError) {
      setError(formatStudioError(deleteError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="radio-studio">
      <div className="radio-studio-head">
        <div>
          <span>ESTÚDIO EM NUVEM</span>
          <h2>Central da Rádio Santa Maria</h2>
          <p>Organize agora. Tocar no prédio continua sendo uma ação separada e confirmada.</p>
        </div>
        <button type="button" className="radio-studio-refresh" onClick={() => void loadStudio()} disabled={loading}>ATUALIZAR</button>
      </div>

      <nav className="radio-studio-tabs" aria-label="Áreas do estúdio da rádio">
        <StudioTabButton active={tab === "library"} onClick={() => setTab("library")} label="Biblioteca" />
        <StudioTabButton active={tab === "program"} onClick={() => setTab("program")} label="Programação" />
        <StudioTabButton active={tab === "content"} onClick={() => setTab("content")} label="Vinhetas e avisos" />
        <StudioTabButton active={tab === "properties"} onClick={() => setTab("properties")} label="Imóveis" />
        <StudioTabButton active={tab === "health"} onClick={() => setTab("health")} label="Saúde da Rádio" />
      </nav>

      {message ? <div className="radio-studio-message">{message}</div> : null}
      {error ? <div className="radio-studio-error">{error}</div> : null}
      {loading ? <div className="radio-studio-loading">Carregando estúdio...</div> : null}

      {!loading && tab === "library" ? (
        <div className="radio-studio-layout">
          <StudioCard title="Nova playlist" subtitle="Salvar músicas na nuvem não interrompe a programação atual.">
            <div className="radio-studio-form">
              <label><span>Nome</span><input value={libraryTitle} onChange={(event) => setLibraryTitle(event.target.value)} placeholder="Ex.: Happy Hour sexta" /></label>
              <label><span>Descrição</span><textarea value={libraryDescription} onChange={(event) => setLibraryDescription(event.target.value)} placeholder="Opcional" rows={2} /></label>
              <label className="radio-file-picker"><strong>ESCOLHER MP3</strong><small>Até {MAX_TRACKS} músicas · 25 MB cada</small><input type="file" accept=".mp3,audio/mpeg" multiple onChange={(event) => setLibraryFiles(Array.from(event.target.files ?? []))} /></label>
              {libraryFiles.length ? <div className="radio-selected-files">{libraryFiles.map((file, index) => <span key={`${file.name}-${index}`}>{index + 1}. {file.name} <small>{formatBytes(file.size)}</small></span>)}</div> : null}
              <button type="button" className="radio-primary" onClick={() => void createLibrary()} disabled={Boolean(busy) || !libraryFiles.length}>{busy === "create-library" ? "SALVANDO..." : "SALVAR NA BIBLIOTECA"}</button>
              <small className="radio-safe-note">Este botão só salva. Não toca nada.</small>
            </div>
          </StudioCard>

          <StudioCard title="Playlists salvas" subtitle={`${activePlaylists.length} ativa(s) na biblioteca`} wide>
            {!playlists.length ? <EmptyText text="Nenhuma playlist salva ainda." /> : (
              <div className="radio-studio-list">
                {playlists.map((playlist) => {
                  const list = tracksByPlaylist.get(playlist.id) ?? [];
                  return (
                    <article className={`radio-library-card${playlist.is_archived ? " is-archived" : ""}`} key={playlist.id}>
                      <div className="radio-library-title">
                        <div><strong>{playlist.title}</strong><small>{list.length} música(s) · tocou {playlist.play_count} vez(es)</small></div>
                        <span>{playlist.is_archived ? "ARQUIVADA" : "ATIVA"}</span>
                      </div>
                      {playlist.description ? <p>{playlist.description}</p> : null}
                      <div className="radio-track-list">
                        {list.map((track, index) => (
                          <div className="radio-track-row" key={track.id}>
                            <span>{index + 1}. {track.file_name}</span>
                            <small>{track.file_size_bytes ? formatBytes(track.file_size_bytes) : ""}</small>
                            <div>
                              <button type="button" disabled={Boolean(busy) || index === 0} onClick={() => void moveTrack(playlist.id, track.id, -1)}>↑</button>
                              <button type="button" disabled={Boolean(busy) || index === list.length - 1} onClick={() => void moveTrack(playlist.id, track.id, 1)}>↓</button>
                              <button type="button" disabled={Boolean(busy)} onClick={() => void removeTrack(track)}>×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="radio-row-actions">
                        {!playlist.is_archived ? <label className="radio-secondary file-action">+ MÚSICAS<input type="file" accept=".mp3,audio/mpeg" multiple onChange={(event) => void addTracks(playlist, event.target.files)} /></label> : null}
                        {!playlist.is_archived && list.length ? <button type="button" className="radio-danger-outline" disabled={Boolean(busy)} onClick={() => void playPlaylist(playlist)}>▶ TOCAR AGORA</button> : null}
                        <button type="button" className="radio-secondary" disabled={Boolean(busy)} onClick={() => void togglePlaylistArchive(playlist)}>{playlist.is_archived ? "REATIVAR" : "ARQUIVAR"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </StudioCard>
        </div>
      ) : null}

      {!loading && tab === "program" ? (
        <div className="radio-studio-layout">
          <StudioCard title="Nova programação" subtitle="Ela nasce desativada por padrão para não tocar nada sem sua autorização.">
            <div className="radio-studio-form">
              <label><span>Nome</span><input value={programTitle} onChange={(event) => setProgramTitle(event.target.value)} placeholder="Ex.: Playlist sexta 17h" /></label>
              <div className="radio-two-columns">
                <label><span>Tipo</span><select value={programTargetType} onChange={(event) => setProgramTargetType(event.target.value as "playlist" | "content")}><option value="playlist">Playlist</option><option value="content">Vinheta / aviso / imóvel</option></select></label>
                <label><span>Conteúdo</span><select value={programTargetId} onChange={(event) => setProgramTargetId(event.target.value)}>{programTargetType === "playlist" ? activePlaylists.map((item) => <option key={item.id} value={item.id}>{item.title}</option>) : readyContents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              </div>
              <label><span>Repetição</span><select value={programScheduleType} onChange={(event) => setProgramScheduleType(event.target.value as "once" | "weekly")}><option value="weekly">Toda semana</option><option value="once">Uma única vez</option></select></label>
              {programScheduleType === "once" ? (
                <label><span>Data e hora</span><input type="datetime-local" value={programRunAt} onChange={(event) => setProgramRunAt(event.target.value)} /></label>
              ) : (
                <>
                  <label><span>Horário</span><input type="time" value={programTime} onChange={(event) => setProgramTime(event.target.value)} /></label>
                  <div className="radio-day-picker">{DAY_OPTIONS.map((day) => <button type="button" key={day.value} className={programDays.includes(day.value) ? "is-active" : ""} onClick={() => setProgramDays((current) => current.includes(day.value) ? current.filter((value) => value !== day.value) : [...current, day.value])}>{day.label}</button>)}</div>
                </>
              )}
              <label className="radio-switch-row"><input type="checkbox" checked={programActive} onChange={(event) => setProgramActive(event.target.checked)} /><span>Ativar imediatamente após salvar</span></label>
              <button type="button" className="radio-primary" disabled={Boolean(busy) || !programTargetId} onClick={() => void createProgram()}>{busy === "create-program" ? "SALVANDO..." : "SALVAR PROGRAMAÇÃO"}</button>
            </div>
          </StudioCard>

          <StudioCard title="Agenda da Rádio" subtitle={`${programs.filter((item) => item.active).length} programação(ões) ativa(s)`} wide>
            {!programs.length ? <EmptyText text="Nenhuma programação criada." /> : <div className="radio-studio-list">{programs.map((entry) => <article className="radio-program-card" key={entry.id}><div><span className={entry.active ? "radio-status-on" : "radio-status-off"}>{entry.active ? "ATIVA" : "PAUSADA"}</span><strong>{entry.title}</strong><small>{programDescription(entry, playlists, contents)}</small>{entry.last_error ? <em>{entry.last_error}</em> : null}</div><div className="radio-row-actions"><button type="button" className={entry.active ? "radio-secondary" : "radio-primary-small"} disabled={Boolean(busy)} onClick={() => void toggleProgram(entry)}>{entry.active ? "PAUSAR" : "ATIVAR"}</button><button type="button" className="radio-secondary" disabled={Boolean(busy)} onClick={() => void deleteProgram(entry)}>EXCLUIR</button></div></article>)}</div>}
            {programLogs.length ? <div className="radio-program-log"><strong>Últimas execuções</strong>{programLogs.slice(0, 5).map((log) => <span key={log.id}>{formatDateTime(log.created_at)} · {log.status === "queued" ? "enviado" : log.status} {log.message ? `· ${log.message}` : ""}</span>)}</div> : null}
          </StudioCard>
        </div>
      ) : null}

      {!loading && tab === "content" ? (
        <div className="radio-studio-layout">
          <StudioCard title="Nova vinheta ou comunicado" subtitle="O roteiro pode ser salvo agora e o MP3 anexado depois.">
            <div className="radio-studio-form">
              <label><span>Tipo</span><select value={contentKind} onChange={(event) => setContentKind(event.target.value as Exclude<ContentKind, "property">)}><option value="jingle">Vinheta</option><option value="announcement">Comunicado</option><option value="training">Treinamento</option><option value="event">Evento</option></select></label>
              <label><span>Título</span><input value={contentTitle} onChange={(event) => setContentTitle(event.target.value)} placeholder="Ex.: Vinheta Santa Maria" /></label>
              <label><span>Texto / roteiro</span><textarea rows={5} value={contentScript} onChange={(event) => setContentScript(event.target.value)} placeholder="Digite exatamente o que deverá ser falado." /></label>
              <label className="radio-file-picker"><strong>ANEXAR MP3 (OPCIONAL)</strong><small>Sem MP3, o roteiro fica como rascunho.</small><input type="file" accept=".mp3,audio/mpeg" onChange={(event) => setContentFile(event.target.files?.[0] ?? null)} /></label>
              <button type="button" className="radio-primary" disabled={Boolean(busy)} onClick={() => void saveContent(contentKind)}>{busy === "save-content" ? "SALVANDO..." : "SALVAR CONTEÚDO"}</button>
              <div className="radio-tts-note"><strong>GERAÇÃO DE VOZ</strong><span>A estrutura está pronta. Para transformar o texto em MP3 automaticamente ainda precisamos conectar um provedor de voz em nuvem. Não existe chave de TTS configurada hoje.</span></div>
            </div>
          </StudioCard>
          <ContentList title="Biblioteca de vinhetas e avisos" items={nonPropertyContents} busy={Boolean(busy)} onAttach={attachAudio} onPlay={playContent} onArchive={archiveContent} />
        </div>
      ) : null}

      {!loading && tab === "properties" ? (
        <div className="radio-studio-layout">
          <StudioCard title="Novo imóvel para a Rádio" subtitle="Monte a fila comercial sem colocar nada no ar agora.">
            <div className="radio-studio-form">
              <label><span>Título</span><input value={propertyTitle} onChange={(event) => setPropertyTitle(event.target.value)} placeholder="Ex.: Oportunidade Jardim Canadá" /></label>
              <div className="radio-two-columns"><label><span>Código do imóvel</span><input value={propertyCode} onChange={(event) => setPropertyCode(event.target.value)} placeholder="Opcional" /></label><label><span>Link do imóvel</span><input value={propertyUrl} onChange={(event) => setPropertyUrl(event.target.value)} placeholder="Opcional" /></label></div>
              <label><span>Texto que será falado</span><textarea rows={6} value={propertyScript} onChange={(event) => setPropertyScript(event.target.value)} placeholder="Ex.: Atenção para uma oportunidade..." /></label>
              <label className="radio-file-picker"><strong>ANEXAR MP3 (OPCIONAL)</strong><small>Você pode deixar só o roteiro preparado.</small><input type="file" accept=".mp3,audio/mpeg" onChange={(event) => setPropertyFile(event.target.files?.[0] ?? null)} /></label>
              <button type="button" className="radio-primary" disabled={Boolean(busy)} onClick={() => void saveContent("property")}>{busy === "save-property" ? "SALVANDO..." : "ADICIONAR À FILA DE IMÓVEIS"}</button>
            </div>
          </StudioCard>
          <ContentList title="Fila de imóveis" items={propertyContents} busy={Boolean(busy)} onAttach={attachAudio} onPlay={playContent} onArchive={archiveContent} />
        </div>
      ) : null}

      {!loading && tab === "health" ? (
        <div className="radio-health-grid">
          <HealthCard title="Ponte local" value={playerOnline ? "ONLINE" : "OFFLINE"} ok={playerOnline} detail={player?.updated_at ? `Último contato ${formatDateTime(player.updated_at)}` : "Sem contato registrado"} />
          <HealthCard title="AudioCast" value={playerOnline && !player?.last_error ? "RESPONDENDO" : "VERIFICAR"} ok={playerOnline && !player?.last_error} detail={player?.device_name || "SOM SANTAMARIATEM"} />
          <HealthCard title="Automação" value={runtime?.operating_mode === "temporary" ? "MODO TEMPORÁRIO" : "NORMAL"} ok={runtime?.operating_mode !== "temporary"} detail={runtime?.temporary_started_at ? `Temporário desde ${formatDateTime(runtime.temporary_started_at)}` : "Programação ambiente preservada"} />
          <HealthCard title="Inicialização do notebook" value={playerOnline ? "RESPONDENDO" : "SEM RESPOSTA"} ok={playerOnline} detail="Quando a ponte responde, o processo automático do Windows está operacional neste momento." />
          <HealthCard title="Conteúdo ativo" value={session ? sessionStatus(session.status) : "NENHUM"} ok={!session || session.status !== "failed"} detail={session ? `${session.title} · ${session.triggered_by === "schedule" ? "programação" : "manual"}` : "Som ambiente normal"} />
          <HealthCard title="Último erro" value={player?.last_error || session?.last_error ? "ATENÇÃO" : "SEM ERROS"} ok={!player?.last_error && !session?.last_error} detail={player?.last_error || session?.last_error || "Nenhum erro ativo registrado"} />
          <div className="radio-health-summary">
            <strong>Resumo da nuvem</strong>
            <span>{activePlaylists.length} playlist(s) disponível(is)</span>
            <span>{readyContents.length} conteúdo(s) com áudio pronto</span>
            <span>{programs.filter((item) => item.active).length} programação(ões) ativa(s)</span>
            <span>Agendador: verificação automática a cada minuto</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StudioTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" className={active ? "is-active" : ""} onClick={onClick}>{label}</button>;
}

function StudioCard({ title, subtitle, children, wide = false }: { title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`radio-studio-card${wide ? " is-wide" : ""}`}><header><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>;
}

function ContentList({ title, items, busy, onAttach, onPlay, onArchive }: {
  title: string;
  items: ContentItem[];
  busy: boolean;
  onAttach: (item: ContentItem, files: FileList | null) => void;
  onPlay: (item: ContentItem) => void;
  onArchive: (item: ContentItem) => void;
}) {
  return <StudioCard title={title} subtitle={`${items.filter((item) => item.status !== "archived").length} item(ns) disponível(is)`} wide>{!items.length ? <EmptyText text="Nenhum conteúdo salvo." /> : <div className="radio-studio-list">{items.map((item) => <article className={`radio-content-card${item.status === "archived" ? " is-archived" : ""}`} key={item.id}><div className="radio-content-top"><div><span>{contentKindLabel(item.kind)}</span><strong>{item.title}</strong></div><em className={item.status === "ready" ? "is-ready" : item.status === "draft" ? "is-draft" : ""}>{item.status === "ready" ? "ÁUDIO PRONTO" : item.status === "draft" ? "ROTEIRO / SEM ÁUDIO" : "ARQUIVADO"}</em></div>{item.property_code ? <small>Código: {item.property_code}</small> : null}{item.script_text ? <p>{item.script_text}</p> : null}<div className="radio-row-actions">{item.status !== "archived" ? <label className="radio-secondary file-action">{item.audio_storage_path ? "TROCAR MP3" : "ANEXAR MP3"}<input type="file" accept=".mp3,audio/mpeg" onChange={(event) => void onAttach(item, event.target.files)} /></label> : null}{item.status === "ready" ? <button type="button" className="radio-danger-outline" disabled={busy} onClick={() => void onPlay(item)}>▶ TOCAR AGORA</button> : null}<button type="button" className="radio-secondary" disabled={busy} onClick={() => void onArchive(item)}>{item.status === "archived" ? "REATIVAR" : "ARQUIVAR"}</button>{item.property_url ? <button type="button" className="radio-secondary" onClick={() => window.open(item.property_url || "", "_blank", "noopener,noreferrer")}>ABRIR IMÓVEL</button> : null}</div></article>)}</div>}</StudioCard>;
}

function HealthCard({ title, value, ok, detail }: { title: string; value: string; ok: boolean; detail: string }) {
  return <article className={`radio-health-card${ok ? " is-ok" : " is-warn"}`}><span>{title}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="radio-empty">{text}</p>;
}

async function studioFetch(path: string) {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const details = await readSupabaseRestError(response);
    throw new Error(details.message || `HTTP ${response.status}`);
  }
  return response.json();
}

async function studioMutation(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", Prefer: "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await readSupabaseRestError(response);
    throw new Error(details.message || `HTTP ${response.status}`);
  }
}

async function studioRpc(name: string, body: unknown) {
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await readSupabaseRestError(response);
    throw new Error(details.message || `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function requireStorage() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Supabase indisponível.");
  return supabase;
}

function validMp3(file: File) {
  return file.size > 0 && file.size <= MAX_FILE_BYTES && (file.name.toLowerCase().endsWith(".mp3") || file.type === "audio/mpeg");
}

function sanitizeFileName(value: string) {
  const cleaned = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[_\.]+/, "").slice(-120);
  return cleaned.toLowerCase().endsWith(".mp3") ? cleaned : `${cleaned || "audio"}.mp3`;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; }
}

function contentKindLabel(kind: ContentKind) {
  if (kind === "jingle") return "VINHETA";
  if (kind === "announcement") return "COMUNICADO";
  if (kind === "property") return "IMÓVEL";
  if (kind === "training") return "TREINAMENTO";
  return "EVENTO";
}

function programDescription(entry: ProgramEntry, playlists: LibraryPlaylist[], contents: ContentItem[]) {
  const target = entry.target_type === "playlist" ? playlists.find((item) => item.id === entry.playlist_id)?.title : contents.find((item) => item.id === entry.content_id)?.title;
  if (entry.schedule_type === "once") return `${target || "Conteúdo"} · uma vez em ${entry.run_at ? formatDateTime(entry.run_at) : "—"}`;
  const labels = DAY_OPTIONS.filter((day) => entry.weekdays?.includes(day.value)).map((day) => day.label).join(", ");
  return `${target || "Conteúdo"} · ${labels || "—"} · ${(entry.local_time || "").slice(0, 5)}`;
}

function sessionStatus(status: PlaylistSession["status"]) {
  if (status === "queued") return "NA FILA";
  if (status === "claimed") return "PREPARANDO";
  if (status === "playing") return "TOCANDO";
  if (status === "stop_requested") return "ENCERRANDO";
  return status.toUpperCase();
}

function formatStudioError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes("RADIO_PLAYLIST_ALREADY_ACTIVE")) return "Já existe um conteúdo tocando ou sendo preparado.";
  if (value.includes("RADIO_TEMPORARY_MODE_ALREADY_ACTIVE")) return "A Rádio já está em modo temporário. Volte à automação antes de iniciar outro conteúdo.";
  if (value.includes("RADIO_LIBRARY_EMPTY")) return "Essa playlist está vazia.";
  if (value.includes("RADIO_CONTENT_NOT_READY")) return "Esse conteúdo ainda não tem áudio MP3 pronto.";
  if (value.includes("RADIO_ADMIN_REQUIRED")) return "Esta área exige acesso de administrador.";
  return value;
}
