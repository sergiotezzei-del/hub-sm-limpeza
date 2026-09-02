import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AMT8000_EVENT_BUFFER_SIZE,
} from "./event-buffer.mjs";
import {
  DEFAULT_PANEL_HOST,
  DEFAULT_PANEL_PORT,
  DEFAULT_REQUEST_GAP_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  INTELBRAS_DEVICE_TYPE_LABELS,
  IsecReadOnlyError,
  parseIntegerOption,
  readAmt8000EventBuffer,
} from "./event-buffer-client.mjs";
import {
  buildReadonlyAgentSnapshot,
} from "./readonly-agent-state.mjs";

const DEFAULT_SCAN_INTERVAL_MS = 300000;
const DEFAULT_HISTORY_LIMIT = 200;
const DEFAULT_OUTPUT_PATH = path.resolve(".tmp", "intelbras-readonly-agent-snapshot.json");

function failConfig(message) {
  console.error(`[AMT8000-AGENT] ${message}`);
  process.exit(2);
}

function readIntegerEnv(name, fallback, bounds) {
  try {
    return parseIntegerOption(process.env[name], fallback, { name, ...bounds });
  } catch (error) {
    failConfig(error instanceof Error ? error.message : String(error));
  }
}

const host = process.env.INTELBRAS_PANEL_HOST || DEFAULT_PANEL_HOST;
const port = readIntegerEnv("INTELBRAS_PANEL_PORT", DEFAULT_PANEL_PORT, { min: 1, max: 65535 });
const password = process.env.INTELBRAS_REMOTE_PASSWORD || "";
const timeoutMs = readIntegerEnv("INTELBRAS_PROBE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, { min: 1000, max: 900000 });
const requestTimeoutMs = readIntegerEnv("INTELBRAS_EVENT_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, { min: 500, max: 60000 });
const requestGapMs = readIntegerEnv("INTELBRAS_EVENT_REQUEST_GAP_MS", DEFAULT_REQUEST_GAP_MS, { min: 0, max: 5000 });
const startIndex = readIntegerEnv("INTELBRAS_EVENT_BUFFER_START", 0, { min: 0, max: AMT8000_EVENT_BUFFER_SIZE - 1 });
const scanCount = readIntegerEnv("INTELBRAS_EVENT_BUFFER_COUNT", AMT8000_EVENT_BUFFER_SIZE, { min: 1, max: AMT8000_EVENT_BUFFER_SIZE });
const historyLimit = readIntegerEnv("INTELBRAS_AGENT_HISTORY_LIMIT", DEFAULT_HISTORY_LIMIT, { min: 1, max: 5000 });
const scanIntervalMs = readIntegerEnv("INTELBRAS_AGENT_SCAN_INTERVAL_MS", DEFAULT_SCAN_INTERVAL_MS, { min: 60000, max: 86400000 });
const deviceType = readIntegerEnv("INTELBRAS_DEVICE_TYPE", 1, { min: 1, max: 3 });
const outputPath = path.resolve(process.env.INTELBRAS_AGENT_OUTPUT || DEFAULT_OUTPUT_PATH);
const runOnce = process.env.INTELBRAS_AGENT_ONCE === "1";

let stopping = false;
let running = false;
let lastEvents = [];

async function loadPreviousEvents() {
  try {
    const parsed = JSON.parse(await readFile(outputPath, "utf8"));
    if (Array.isArray(parsed?.events)) return parsed.events;
  } catch {
    return [];
  }
  return [];
}

async function writeSnapshot(snapshot) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tempPath, outputPath);
}

function logScanResult(snapshot) {
  const eventCount = snapshot.summary.eventCount;
  const lastEvent = snapshot.summary.lastEvent;
  const lastEventText = lastEvent
    ? `${lastEvent.timestamp} indice=${lastEvent.indexHex} codigo=${lastEvent.eventCode} tipo=${lastEvent.eventKind} zona/usuario=${lastEvent.zoneOrUser ?? "-"} particao=${lastEvent.partition ?? "-"}`
    : "sem evento valido";

  console.log(`[AMT8000-AGENT] Snapshot atualizado: online=${snapshot.connection.online}; eventos=${eventCount}; ultimo=${lastEventText}.`);
  console.log(`[AMT8000-AGENT] Arquivo: ${outputPath}`);
}

async function runScanCycle() {
  if (running || stopping) return 0;
  running = true;
  const previousEvents = lastEvents.length ? lastEvents : await loadPreviousEvents();

  try {
    const scanResult = await readAmt8000EventBuffer({
      host,
      port,
      password,
      deviceType,
      timeoutMs,
      requestTimeoutMs,
      requestGapMs,
      startIndex,
      scanCount,
      onLog(event) {
        if (event.type === "authentication") {
          console.log(`[AMT8000-AGENT] Autenticacao: ${event.label}.`);
          return;
        }
        if (event.type === "event-buffer-response" && (event.completedReads === event.total || event.completedReads % 128 === 0)) {
          console.log(`[AMT8000-AGENT] Progresso 3900: ${event.completedReads}/${event.total}.`);
          return;
        }
        if (event.type === "passive-status") {
          console.log(`[AMT8000-AGENT] 0B4A passivo observado (${event.dataLength} byte(s)); nao foi solicitado como query.`);
        }
      },
    });

    const snapshot = buildReadonlyAgentSnapshot({
      previousEvents,
      scanResult,
      host,
      port,
      historyLimit,
      now: new Date(),
    });
    lastEvents = snapshot.events;
    await writeSnapshot(snapshot);
    logScanResult(snapshot);
    return 0;
  } catch (error) {
    const snapshot = buildReadonlyAgentSnapshot({
      previousEvents,
      host,
      port,
      historyLimit,
      now: new Date(),
      error,
    });
    lastEvents = snapshot.events;
    await writeSnapshot(snapshot);
    console.log(`[AMT8000-AGENT] Falha sanitizada: ${snapshot.connection.lastError}`);
    console.log(`[AMT8000-AGENT] Snapshot offline atualizado em: ${outputPath}`);
    return error instanceof IsecReadOnlyError ? error.exitCode : 1;
  } finally {
    running = false;
  }
}

console.log(`[AMT8000-AGENT] Agente local SOMENTE LEITURA: ${host}:${port}`);
console.log(`[AMT8000-AGENT] Device type F0F0: ${deviceType} (${INTELBRAS_DEVICE_TYPE_LABELS[deviceType]}), ID cliente 8F FF.`);
console.log(`[AMT8000-AGENT] Fonte de eventos: READ-COMMAND 3900 BUFFER_EVENTOS, indices ${startIndex}..circular, total ${scanCount}.`);
console.log("[AMT8000-AGENT] Status atual ativo nao implementado: falta READ-COMMAND oficial para AMT 8000 LITE.");
console.log("[AMT8000-AGENT] Nenhum comando de arme, desarme, bypass, panic ou configuracao existe neste agente.");
console.log("[AMT8000-AGENT] Nenhum payload bruto nem senha sera impresso.");

const firstExitCode = await runScanCycle();
if (runOnce) process.exit(firstExitCode);

const timer = setInterval(() => {
  void runScanCycle();
}, scanIntervalMs);
timer.unref();

process.on("SIGINT", () => {
  stopping = true;
  clearInterval(timer);
  console.log("[AMT8000-AGENT] Encerrando por SIGINT. Nenhuma alteracao foi enviada.");
  process.exit(0);
});

while (!stopping) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
