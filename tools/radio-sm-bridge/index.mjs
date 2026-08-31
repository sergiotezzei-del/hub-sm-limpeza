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

if (!BRIDGE_TOKEN) {
  console.error("[radio-sm] RADIO_BRIDGE_TOKEN não informado.");
  process.exit(1);
}

if (!Number.isFinite(HTTP_PORT) || HTTP_PORT < 1024 || HTTP_PORT > 65535) {
  console.error("[radio-sm] RADIO_HTTP_PORT inválida.");
  process.exit(1);
}

const activeAudio = new Map();
let busy = false;
let stopped = false;

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${BIND_IP}:${HTTP_PORT}`}`);
    const match = /^\/radio-audio\/([0-9a-f-]{36})\.mp3$/i.exec(url.pathname);
    if (!match) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }

    const filePath = activeAudio.get(match[1]);
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
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("internal error");
  }
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[radio-sm] Ponte ativa em http://${BIND_IP}:${HTTP_PORT}`);
  console.log(`[radio-sm] AudioCast: ${AUDIOCAST_IP}`);
  console.log(`[radio-sm] Pasta de áudios: ${AUDIO_DIR}`);
  console.log("[radio-sm] Aguardando comunicados do HUB...");
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
  const commandUrl = `http://${AUDIOCAST_IP}/httpapi.asp?command=playPromptUrl:${audioUrl}`;
  console.log(`[radio-sm] Disparando: ${job.title || id}`);
  console.log(`[radio-sm] Arquivo: ${path.basename(filePath)} | janela: ${durationSeconds}s`);

  try {
    const response = await fetch(commandUrl, { signal: AbortSignal.timeout(7000) });
    const text = (await response.text()).trim();
    if (!response.ok || text !== "OK") {
      throw new Error(`AudioCast respondeu ${response.status}: ${text || "sem resposta"}`);
    }

    await sleep((durationSeconds + 2) * 1000);
  } finally {
    activeAudio.delete(id);
  }
}

async function poll() {
  if (busy || stopped) return;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const timer = setInterval(() => void poll(), POLL_MS);
void poll();

function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  console.log("\n[radio-sm] Encerrando ponte...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
