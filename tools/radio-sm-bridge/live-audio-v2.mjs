import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const SUPABASE_URL = (process.env.RADIO_SUPABASE_URL || "https://dtdepfpkyiqtnsjztjit.supabase.co").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.RADIO_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImR0ZGVwZnBreWlxdG5zanp0aml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODkyMTcsImV4cCI6MjA5ODc2NTIxN30.kNYAYQTw8gqUaYqRTqdcPtthXO5vbZD6XwxeBvhpRgo";
const BRIDGE_TOKEN = (process.env.RADIO_BRIDGE_TOKEN || "").trim();
const AUDIOCAST_IP = (process.env.RADIO_AUDIOCAST_IP || "10.11.22.53").trim();
const BIND_IP = (process.env.RADIO_BIND_IP || "10.11.22.50").trim();
const LIVE_PORT = Number(process.env.RADIO_LIVE_PORT || 8092);
const POLL_MS = Math.max(700, Number(process.env.RADIO_LIVE_POLL_MS || 1000));
const BASE_DIR = path.resolve(process.env.RADIO_HOME || process.cwd());
const CAPTURE_EXE = path.resolve(process.env.RADIO_CAPTURE_EXE || path.join(BASE_DIR, "audio_capture.exe"));
const FFMPEG_EXE = path.resolve(process.env.RADIO_FFMPEG_EXE || path.join(BASE_DIR, "ffmpeg.exe"));
const PROCTAP_EXE = path.resolve(process.env.RADIO_PROCTAP_EXE || path.join(BASE_DIR, "proctap-venv", "Scripts", "proctap.exe"));
const MIC_OVERRIDE = (process.env.RADIO_MIC_DEVICE || "").trim();

if (!BRIDGE_TOKEN) {
  console.error("[radio-live] RADIO_BRIDGE_TOKEN nao informado.");
  process.exit(1);
}

let stopped = false;
let pollBusy = false;
let desiredActive = false;
let liveState = null;
let reconnectAttempts = 0;
let fatalStreamError = false;

const server = http.createServer((req, res) => void handleRequest(req, res));
server.on("connection", (socket) => {
  try {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
  } catch {}
});

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${BIND_IP}:${LIVE_PORT}`}`);
    if (url.pathname === "/radio-live/notebook.mp3") {
      serveLiveAudio(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("internal error");
    } else if (!res.destroyed) {
      res.destroy();
    }
  }
}

function serveLiveAudio(res) {
  const state = liveState;
  if (!state || !state.encoder || state.stopping) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("live audio unavailable");
    return;
  }

  if (state.response && !state.response.destroyed) {
    res.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("live audio already streaming");
    return;
  }

  state.response = res;
  try {
    res.socket?.setNoDelay(true);
    res.socket?.setKeepAlive(true, 30000);
  } catch {}

  res.useChunkedEncodingByDefault = false;
  res.shouldKeepAlive = false;
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Connection: "close",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  state.encoder.stdout.pipe(res, { end: false });
  state.resolveStarted();

  res.once("close", () => {
    try { state.encoder?.stdout?.unpipe(res); } catch {}
    if (!state.stopping && desiredActive) {
      state.streamError = "AudioCast encerrou o stream ao vivo inesperadamente.";
    }
  });
}

server.listen(LIVE_PORT, "0.0.0.0", () => {
  console.log(`[radio-live] Ponte v2 em http://${BIND_IP}:${LIVE_PORT}`);
  console.log("[radio-live] Fontes: microfone, Spotify, Edge, Chrome e som inteiro.");
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
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${name}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function getNotebookAudioState() {
  const rows = await supabaseRpc("radio_bridge_get_notebook_audio", { p_token: BRIDGE_TOKEN });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function setNotebookStatus(status, error = null) {
  return supabaseRpc("radio_bridge_set_notebook_audio_status", {
    p_token: BRIDGE_TOKEN,
    p_status: status,
    p_error: error,
  });
}

async function audioCastCommand(command) {
  const response = await fetch(`http://${AUDIOCAST_IP}/httpapi.asp?command=${command}`, {
    signal: AbortSignal.timeout(7000),
  });
  const text = (await response.text()).trim();
  if (!response.ok || text !== "OK") {
    throw new Error(`AudioCast respondeu ${response.status}: ${text || "sem resposta"}`);
  }
}

function normalizeSource(remote) {
  const allowed = ["system", "spotify", "edge", "chrome", "microphone"];
  const kind = allowed.includes(remote?.source_kind) ? remote.source_kind : "system";
  const processName = typeof remote?.source_process_name === "string" ? remote.source_process_name.trim() : "";
  const label = typeof remote?.source_label === "string" && remote.source_label.trim()
    ? remote.source_label.trim()
    : kind === "microphone"
      ? "Microfone do notebook"
      : kind === "spotify"
        ? "Spotify"
        : kind === "edge"
          ? "YouTube / navegador - Microsoft Edge"
          : kind === "chrome"
            ? "YouTube / navegador - Google Chrome"
            : "Som inteiro do notebook";
  return { kind, processName, label, key: `${kind}:${processName.toLowerCase()}` };
}

function validateLocalTools(source) {
  if (process.platform !== "win32") throw new Error("A captura ao vivo esta configurada somente para Windows.");
  if (!fs.existsSync(FFMPEG_EXE)) throw new Error(`FFmpeg nao encontrado: ${FFMPEG_EXE}`);
  if (source.kind === "system" && !fs.existsSync(CAPTURE_EXE)) throw new Error(`Capturador nao encontrado: ${CAPTURE_EXE}`);
  if (["spotify", "edge", "chrome"].includes(source.kind) && !fs.existsSync(PROCTAP_EXE)) {
    throw new Error("Captura por aplicativo nao esta instalada.");
  }
}

function createLiveState(source) {
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  return {
    source,
    capture: null,
    encoder: null,
    response: null,
    stopping: false,
    streamError: null,
    started,
    resolveStarted,
  };
}

function runAndCollect(executable, args, timeoutMs, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: BASE_DIR,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error(`${path.basename(executable)} excedeu o tempo de resposta.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 || allowFailure) resolve({ stdout, stderr, code });
      else reject(new Error(stderr.trim() || stdout.trim() || `${path.basename(executable)} encerrou com codigo ${code ?? "?"}.`));
    });
  });
}

async function processExists(processName) {
  const result = await runAndCollect(
    "tasklist.exe",
    ["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"],
    5000,
    true,
  );
  return result.stdout.toLowerCase().includes(`"${processName.toLowerCase()}"`);
}

async function waitForProcess(processName, maxAttempts = 8) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await processExists(processName)) return;
    await sleep(600);
  }
  throw new Error(`${processName} nao esta aberto neste notebook.`);
}

async function detectMicrophoneDevice() {
  if (MIC_OVERRIDE) return MIC_OVERRIDE;

  const result = await runAndCollect(
    FFMPEG_EXE,
    ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
    8000,
    true,
  );

  const combined = `${result.stdout}\n${result.stderr}`;
  const devices = [];
  const regex = /"([^"]+)"\s+\(audio\)/g;
  let match;
  while ((match = regex.exec(combined)) !== null) {
    const name = match[1].trim();
    if (name && !devices.includes(name)) devices.push(name);
  }

  if (!devices.length) {
    throw new Error("Nenhum microfone foi encontrado pelo Windows.");
  }

  const preferred = devices.find((name) => {
    const n = name.toLowerCase();
    const looksLikeMic = n.includes("microphone") || n.includes("microfone") || n.includes("mic array") || n.includes("array");
    const excluded = n.includes("cable") || n.includes("stereo mix") || n.includes("mixagem") || n.includes("output");
    return looksLikeMic && !excluded;
  });

  return preferred || devices.find((name) => {
    const n = name.toLowerCase();
    return !n.includes("cable") && !n.includes("stereo mix") && !n.includes("mixagem") && !n.includes("output");
  }) || devices[0];
}

async function spawnCapture(source) {
  if (source.kind === "system") {
    return spawn(
      CAPTURE_EXE,
      ["--sample-rate", "48000", "--channels", "2", "--bit-depth", "16", "--chunk-duration", "0.10"],
      { cwd: BASE_DIR, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
  }

  if (source.kind === "microphone") {
    const microphone = await detectMicrophoneDevice();
    console.log(`[radio-live] Microfone selecionado: ${microphone}`);
    return spawn(
      FFMPEG_EXE,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-f", "dshow",
        "-audio_buffer_size", "60",
        "-i", `audio=${microphone}`,
        "-ac", "2",
        "-ar", "48000",
        "-f", "s16le",
        "pipe:1",
      ],
      { cwd: BASE_DIR, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
  }

  await waitForProcess(source.processName);
  console.log(`[radio-live] Fonte: ${source.label} | processo ${source.processName}`);
  return spawn(
    PROCTAP_EXE,
    ["--name", source.processName, "--format", "int16", "--resample-quality", "fast", "--stdout"],
    { cwd: BASE_DIR, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
}

function spawnEncoder() {
  return spawn(
    FFMPEG_EXE,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-thread_queue_size", "2048",
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "-i", "pipe:0",
      "-vn",
      "-c:a", "libmp3lame",
      "-b:a", "160k",
      "-reservoir", "0",
      "-write_xing", "0",
      "-id3v2_version", "0",
      "-flush_packets", "1",
      "-f", "mp3",
      "pipe:1",
    ],
    { cwd: BASE_DIR, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
}

async function startLiveAudio(remote) {
  if (liveState || stopped || fatalStreamError) return;

  const source = normalizeSource(remote);
  validateLocalTools(source);
  await setNotebookStatus("starting", null);

  const state = createLiveState(source);
  liveState = state;

  try {
    const capture = await spawnCapture(source);
    const encoder = spawnEncoder();
    state.capture = capture;
    state.encoder = encoder;
    capture.stdout.pipe(encoder.stdin);

    attachDiagnostics(state, capture, source.kind === "microphone" ? "microfone" : `capturador de ${source.label}`);
    attachDiagnostics(state, encoder, "codificador MP3");

    const audioUrl = `http://${BIND_IP}:${LIVE_PORT}/radio-live/notebook.mp3`;
    await audioCastCommand(`playPromptUrl:${audioUrl}`);
    await withTimeout(state.started, 10000, "AudioCast nao solicitou o stream ao vivo pela rede.");
    if (state.streamError) throw new Error(state.streamError);

    reconnectAttempts = 0;
    await setNotebookStatus("streaming", null);
    console.log(`[radio-live] Ao vivo: ${source.label}.`);
  } catch (error) {
    const message = errorMessage(error);
    await stopLocalProcesses(state);
    liveState = null;
    try { await setNotebookStatus("error", message); } catch {}
    throw error;
  }
}

function attachDiagnostics(state, child, label) {
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 1800) stderr = stderr.slice(-1800);
  });
  child.once("error", (error) => {
    if (!state.stopping) state.streamError = `${label}: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (!state.stopping && code !== 0) {
      state.streamError = `${label} encerrou (codigo ${code ?? "?"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`;
    }
  });
}

async function stopLocalProcesses(state) {
  if (!state) return;
  state.stopping = true;
  try { if (state.response && !state.response.destroyed) state.response.destroy(); } catch {}
  try { state.capture?.stdout?.unpipe(state.encoder?.stdin); } catch {}
  try { state.encoder?.stdout?.unpipe(); } catch {}
  try { state.capture?.kill(); } catch {}
  try { state.encoder?.kill(); } catch {}
  await sleep(250);
}

async function stopLiveAudio() {
  const state = liveState;
  if (state) await stopLocalProcesses(state);
  liveState = null;
  reconnectAttempts = 0;
  fatalStreamError = false;
  await setNotebookStatus("idle", null);
  console.log("[radio-live] Stream encerrado; automacao preservada.");
}

async function recoverUnexpectedClose(remote, message) {
  if (!desiredActive) return;
  reconnectAttempts += 1;

  if (reconnectAttempts > 3) {
    fatalStreamError = true;
    await setNotebookStatus("error", `${message} A ponte tentou reconectar 3 vezes.`);
    console.error(`[radio-live] Falha definitiva: ${message}`);
    return;
  }

  console.warn(`[radio-live] Stream caiu; reconectando (${reconnectAttempts}/3)...`);
  if (liveState) await stopLocalProcesses(liveState);
  liveState = null;
  await setNotebookStatus("starting", null);
  await sleep(700);
  await startLiveAudio(remote);
}

async function poll() {
  if (stopped || pollBusy) return;
  pollBusy = true;

  try {
    const remote = await getNotebookAudioState();
    desiredActive = remote?.active === true;
    const requestedSource = normalizeSource(remote);

    if (!desiredActive) {
      if (liveState || fatalStreamError) await stopLiveAudio();
      return;
    }

    if (fatalStreamError) return;

    if (liveState?.streamError) {
      const message = liveState.streamError;
      liveState.streamError = null;
      await recoverUnexpectedClose(remote, message);
      return;
    }

    if (liveState && liveState.source.key !== requestedSource.key) {
      await stopLocalProcesses(liveState);
      liveState = null;
      reconnectAttempts = 0;
    }

    if (!liveState) await startLiveAudio(remote);
  } catch (error) {
    console.warn(`[radio-live] Falha transitoria: ${errorMessage(error)}`);
  } finally {
    pollBusy = false;
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const timer = setInterval(() => void poll(), POLL_MS);

void (async () => {
  try { await setNotebookStatus("idle", null); }
  catch (error) { console.warn(`[radio-live] Nao foi possivel limpar estado inicial: ${errorMessage(error)}`); }
  await poll();
})();

async function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  try {
    if (liveState) await stopLiveAudio();
    else await setNotebookStatus("idle", null);
  } catch {}
  console.log("\n[radio-live] Encerrando ponte v2...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
