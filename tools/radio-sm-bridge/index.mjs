import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = (process.env.RADIO_SUPABASE_URL || "https://dtdepfpkyiqtnsjztjit.supabase.co").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.RADIO_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZGVwZnBreWlxdG5zanp0aml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODkyMTcsImV4cCI6MjA5ODc2NTIxN30.kNYAYQTw8gqUaYqRTqdcPtthXO5vbZD6XwxeBvhpRgo";
const BRIDGE_TOKEN = (process.env.RADIO_BRIDGE_TOKEN || "").trim();
const AUDIOCAST_IP = (process.env.RADIO_AUDIOCAST_IP || "10.11.22.53").trim();
const BIND_IP = (process.env.RADIO_BIND_IP || "10.11.22.50").trim();
const HTTP_PORT = Number(process.env.RADIO_HTTP_PORT || 8091);
const POLL_MS = Math.max(1000, Number(process.env.RADIO_POLL_MS || 2500));
const AUDIO_DIR = path.resolve(process.env.RADIO_AUDIO_DIR || process.env.USERPROFILE || process.cwd());
const PLAYER_BRIDGE_URL = `${SUPABASE_URL}/functions/v1/radio-player-bridge`;
const PLAYLIST_CACHE_DIR = path.join(AUDIO_DIR, ".radio-sm-playlists");

if (!BRIDGE_TOKEN) {
  console.error("[radio-sm] RADIO_BRIDGE_TOKEN não informado.");
  process.exit(1);
}

if (!Number.isFinite(HTTP_PORT) || HTTP_PORT < 1024 || HTTP_PORT > 65535) {
  console.error("[radio-sm] RADIO_HTTP_PORT inválida.");
  process.exit(1);
}

const activeAudio = new Map();
const activePlaylists = new Map();
let busy = false;
let playlistBusy = false;
let stopped = false;

const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${BIND_IP}:${HTTP_PORT}`}`);

    const announcementMatch = /^\/radio-audio\/([0-9a-f-]{36})\.mp3$/i.exec(url.pathname);
    if (announcementMatch) {
      const filePath = activeAudio.get(announcementMatch[1]);
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("audio unavailable");
        return;
      }

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": stat.size,
        "Cache-Control": "no-store",
        Connection: "close",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const playlistMatch = /^\/radio-playlist\/([0-9a-f-]{36})\.mp3$/i.exec(url.pathname);
    if (playlistMatch) {
      await servePlaylist(playlistMatch[1], res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("internal error");
    } else if (!res.destroyed) {
      res.destroy();
    }
  }
}

async function servePlaylist(sessionId, res) {
  const state = activePlaylists.get(sessionId);
  if (!state || !Array.isArray(state.files) || state.files.length === 0) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("playlist unavailable");
    return;
  }

  if (state.response && !state.response.destroyed) {
    res.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("playlist already streaming");
    return;
  }

  state.response = res;
  const totalSize = state.files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": totalSize,
    "Cache-Control": "no-store",
    Connection: "close",
  });
  state.resolveStarted();

  try {
    outer: for (const filePath of state.files) {
      const stream = fs.createReadStream(filePath);
      for await (const chunk of stream) {
        if (state.stopRequested || res.destroyed) {
          stream.destroy();
          break outer;
        }
        if (!res.write(chunk)) {
          await waitForDrainOrClose(res);
        }
      }
    }

    if (!state.stopRequested && !res.destroyed) {
      state.completedNaturally = true;
      res.end();
    } else if (!res.destroyed) {
      res.destroy();
    }
  } catch (error) {
    state.streamError = error instanceof Error ? error.message : String(error);
    if (!res.destroyed) res.destroy();
  } finally {
    state.resolveFinished();
  }
}

function waitForDrainOrClose(res) {
  return new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
  });
}

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[radio-sm] Ponte ativa em http://${BIND_IP}:${HTTP_PORT}`);
  console.log(`[radio-sm] AudioCast: ${AUDIOCAST_IP}`);
  console.log(`[radio-sm] Pasta de áudios: ${AUDIO_DIR}`);
  console.log("[radio-sm] Aguardando comunicados e playlists do HUB...");
});

async function supabaseRpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${name}: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function bridgeEdge(action, payload = {}) {
  const response = await fetch(PLAYER_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, token: BRIDGE_TOKEN, ...payload }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Edge ${action}: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function claimNext() {
  const rows = await supabaseRpc("radio_bridge_claim", { p_token: BRIDGE_TOKEN });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function finishJob(id, success, errorMessage = null) {
  return supabaseRpc("radio_bridge_finish", {
    p_token: BRIDGE_TOKEN,
    p_id: id,
    p_success: success,
    p_error: errorMessage,
  });
}

function resolveAudioFile(localFile) {
  if (typeof localFile !== "string" || !localFile.trim()) throw new Error("local_file vazio");
  const clean = localFile.trim();
  if (path.basename(clean) !== clean) throw new Error("local_file deve conter somente o nome do arquivo");
  if (!clean.toLowerCase().endsWith(".mp3")) throw new Error("somente arquivos MP3 são permitidos");

  const filePath = path.resolve(AUDIO_DIR, clean);
  if (path.dirname(filePath) !== AUDIO_DIR) throw new Error("arquivo fora da pasta permitida");
  if (!fs.existsSync(filePath)) throw new Error(`arquivo não encontrado: ${filePath}`);
  return filePath;
}

async function dispatchToAudioCast(job, filePath) {
  const id = String(job.id);
  const durationSeconds = Math.min(60, Math.max(1, Number(job.duration_seconds || 10)));
  activeAudio.set(id, filePath);

  const audioUrl = `http://${BIND_IP}:${HTTP_PORT}/radio-audio/${id}.mp3`;
  console.log(`[radio-sm] Disparando: ${job.title || id}`);
  console.log(`[radio-sm] Arquivo: ${path.basename(filePath)} | janela: ${durationSeconds}s`);

  try {
    await audioCastCommand(`playPromptUrl:${audioUrl}`);
    await sleep((durationSeconds + 2) * 1000);
  } finally {
    activeAudio.delete(id);
  }
}

async function audioCastCommand(command) {
  const commandUrl = `http://${AUDIOCAST_IP}/httpapi.asp?command=${command}`;
  const response = await fetch(commandUrl, { signal: AbortSignal.timeout(7000) });
  const text = (await response.text()).trim();
  if (!response.ok || text !== "OK") {
    throw new Error(`AudioCast respondeu ${response.status}: ${text || "sem resposta"}`);
  }
  return text;
}

async function poll() {
  if (busy || playlistBusy || stopped) return;
  busy = true;
  let job = null;

  try {
    job = await claimNext();
    if (!job) return;

    const filePath = resolveAudioFile(job.local_file);
    await dispatchToAudioCast(job, filePath);
    await finishJob(job.id, true, null);
    console.log(`[radio-sm] Concluído: ${job.title || job.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[radio-sm] Falha: ${message}`);
    if (job?.id) {
      try {
        await finishJob(job.id, false, message);
      } catch (finishError) {
        console.error(`[radio-sm] Não foi possível registrar a falha: ${finishError instanceof Error ? finishError.message : String(finishError)}`);
      }
    }
  } finally {
    busy = false;
  }
}

async function pollPlaylist() {
  if (playlistBusy || busy || stopped) return;
  playlistBusy = true;
  let session = null;

  try {
    const claimed = await bridgeEdge("playlist_claim");
    session = claimed?.session ?? null;
    if (!session) return;

    await dispatchPlaylist(session);
    await bridgeEdge("playlist_finish", { id: session.id, success: true, error: null });
    console.log(`[radio-playlist] Finalizada: ${session.title || session.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[radio-playlist] Falha: ${message}`);
    if (session?.id) {
      try {
        await bridgeEdge("playlist_finish", { id: session.id, success: false, error: message });
      } catch (finishError) {
        console.error(`[radio-playlist] Não foi possível finalizar no HUB: ${finishError instanceof Error ? finishError.message : String(finishError)}`);
      }
    }
  } finally {
    playlistBusy = false;
  }
}

async function dispatchPlaylist(session) {
  const id = String(session.id || "").trim();
  const tracks = Array.isArray(session.tracks) ? session.tracks : [];
  if (!id || tracks.length === 0) throw new Error("playlist sem faixas");

  const cacheDir = path.join(PLAYLIST_CACHE_DIR, id);
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const files = [];
  try {
    console.log(`[radio-playlist] Preparando ${tracks.length} faixa(s): ${session.title || id}`);
    for (const track of tracks) {
      files.push(await downloadPlaylistTrack(id, track, cacheDir));
    }

    const state = createPlaylistState(files);
    activePlaylists.set(id, state);

    await audioCastCommand("setPlayerCmd:pause");
    await sleep(450);

    const audioUrl = `http://${BIND_IP}:${HTTP_PORT}/radio-playlist/${id}.mp3`;
    await audioCastCommand(`playPromptUrl:${audioUrl}`);
    await withTimeout(state.started, 10000, "AudioCast não solicitou o stream da playlist");
    await bridgeEdge("playlist_started", { id });
    console.log(`[radio-playlist] Tocando: ${session.title || id}`);

    while (!stopped) {
      const finished = await Promise.race([
        state.finished.then(() => true),
        sleep(1000).then(() => false),
      ]);
      if (finished) break;

      let shouldStop = false;
      try {
        const status = await bridgeEdge("playlist_should_stop", { id });
        shouldStop = status?.stop === true;
      } catch (error) {
        console.warn(`[radio-playlist] Falha transitória ao consultar parada: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (shouldStop) {
        state.stopRequested = true;
        if (state.response && !state.response.destroyed) state.response.destroy();
      }
    }

    if (stopped) {
      state.stopRequested = true;
      if (state.response && !state.response.destroyed) state.response.destroy();
    }

    await withTimeout(state.finished, 5000, "stream da playlist não encerrou");
    if (state.streamError) throw new Error(state.streamError);
    if (!state.completedNaturally && !state.stopRequested) {
      throw new Error("stream da playlist encerrou antes do esperado");
    }
  } finally {
    activePlaylists.delete(id);
    await fs.promises.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function createPlaylistState(files) {
  let resolveStarted;
  let resolveFinished;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  const finished = new Promise((resolve) => { resolveFinished = resolve; });
  return {
    files,
    response: null,
    stopRequested: false,
    completedNaturally: false,
    streamError: null,
    started,
    finished,
    resolveStarted,
    resolveFinished,
  };
}

async function downloadPlaylistTrack(sessionId, track, cacheDir) {
  const trackId = String(track?.id || "").trim();
  const position = Number(track?.position || 0);
  if (!trackId || !Number.isInteger(position) || position < 1) throw new Error("faixa inválida na playlist");

  const response = await fetch(PLAYER_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg,application/json" },
    body: JSON.stringify({
      action: "playlist_track",
      token: BRIDGE_TOKEN,
      session_id: sessionId,
      track_id: trackId,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`download da faixa ${position}: HTTP ${response.status} ${text.slice(0, 250)}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error(`faixa ${position} vazia`);
  const filePath = path.join(cacheDir, `${String(position).padStart(3, "0")}-${trackId}.mp3`);
  await fs.promises.writeFile(filePath, bytes);
  console.log(`[radio-playlist] Faixa ${position} pronta (${Math.round(bytes.byteLength / 1024)} KB)`);
  return filePath;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollCoordinator() {
  if (stopped || busy || playlistBusy) return;
  await pollPlaylist();
  if (!stopped) await poll();
}

const timer = setInterval(() => void pollCoordinator(), POLL_MS);
void pollCoordinator();

function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  for (const state of activePlaylists.values()) {
    state.stopRequested = true;
    if (state.response && !state.response.destroyed) state.response.destroy();
  }
  console.log("\n[radio-sm] Encerrando ponte...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
