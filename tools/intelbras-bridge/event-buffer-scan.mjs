import {
  AMT8000_EVENT_BUFFER_SIZE,
  dedupeAmt8000EventRecords,
  formatAmt8000EventIndex,
  isUsableAmt8000EventRecord,
  selectRecentAmt8000EventRecords,
  toAmt8000EventTableRows,
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

const DEFAULT_RECENT_LIMIT = 32;

function failConfig(message) {
  console.error(`[AMT8000-EVENTS] ${message}`);
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
const recentLimit = readIntegerEnv("INTELBRAS_EVENT_RECENT_LIMIT", DEFAULT_RECENT_LIMIT, { min: 1, max: AMT8000_EVENT_BUFFER_SIZE });
const deviceType = readIntegerEnv("INTELBRAS_DEVICE_TYPE", 1, { min: 1, max: 3 });

function printSummary(result) {
  const uniqueRecords = dedupeAmt8000EventRecords(result.records);
  const usableRecords = uniqueRecords.filter(isUsableAmt8000EventRecord);
  const recentRecords = selectRecentAmt8000EventRecords(uniqueRecords, { limit: recentLimit });

  console.log("[AMT8000-EVENTS] Leitura oficial 3900 finalizada. Nenhum estado da central foi alterado.");
  console.log("[AMT8000-EVENTS] Varredura 3900 concluida.");
  console.log(`[AMT8000-EVENTS] Indices lidos: ${result.completedReads}/${result.scanCount}; respostas 3900: ${result.eventResponses}; ACKs recebidos: ${result.ackFrames}; 0B4A passivos: ${result.passiveStatusFrames}.`);
  console.log(`[AMT8000-EVENTS] Registros decodificados: ${uniqueRecords.length}; registros com data/codigo validos: ${usableRecords.length}; exibindo os ${recentRecords.length} mais recentes em ordem cronologica.`);

  if (result.warnings.length) {
    console.log("[AMT8000-EVENTS] Avisos sanitizados:");
    for (const warning of result.warnings) console.log(`[AMT8000-EVENTS] - ${warning}`);
  }

  if (!recentRecords.length) {
    console.log("[AMT8000-EVENTS] Nenhum registro recente valido foi identificado no intervalo lido.");
    return;
  }

  console.table(toAmt8000EventTableRows(recentRecords));
}

console.log(`[AMT8000-EVENTS] Varredura SOMENTE LEITURA: ${host}:${port}`);
console.log(`[AMT8000-EVENTS] Comando oficial 3900 (BUFFER_EVENTOS), indices ${formatAmt8000EventIndex(startIndex)}..circular, total ${scanCount}.`);
console.log(`[AMT8000-EVENTS] Serao exibidos no maximo ${recentLimit} registros recentes em ordem cronologica.`);
console.log(`[AMT8000-EVENTS] Device type F0F0: ${deviceType} (${INTELBRAS_DEVICE_TYPE_LABELS[deviceType]}), ID cliente 8F FF.`);
console.log("[AMT8000-EVENTS] Nenhum comando de arme, desarme, bypass, panic ou alteracao de configuracao existe nesta ferramenta.");
console.log("[AMT8000-EVENTS] Nenhum payload bruto nem senha sera impresso.");

try {
  const result = await readAmt8000EventBuffer({
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
      if (event.type === "connect") {
        console.log("[AMT8000-EVENTS] TCP conectado. Autenticando com F0F0 sem registrar a senha...");
        return;
      }
      if (event.type === "authentication") {
        console.log(`[AMT8000-EVENTS] Resposta de autenticacao: ${event.label}.`);
        if (event.label === "accepted") {
          console.log("[AMT8000-EVENTS] Autenticado. Iniciando varredura circular do BUFFER_EVENTOS na mesma sessao TCP.");
        }
        return;
      }
      if (event.type === "keep-alive") {
        console.log("[AMT8000-EVENTS] TX keep-alive F0F7 (sem alteracao de estado).");
        return;
      }
      if (event.type === "event-buffer-request" && (event.ordinal === 1 || event.ordinal === event.total || event.ordinal % 32 === 0)) {
        console.log(`[AMT8000-EVENTS] TX READ-COMMAND 3900 indice ${event.indexHex} (${event.ordinal}/${event.total}).`);
        return;
      }
      if (event.type === "event-buffer-response" && (event.completedReads === event.total || event.completedReads % 32 === 0)) {
        console.log(`[AMT8000-EVENTS] Progresso: ${event.completedReads}/${event.total} indices lidos, ${event.recordCount} registro(s) recebidos.`);
        return;
      }
      if (event.type === "passive-status") {
        console.log(`[AMT8000-EVENTS] RX 0B4A passivo origem=${event.source} destino=${event.destination} dados=${event.dataLength} byte(s). Este scanner nao solicitou status.`);
        return;
      }
      if (event.type === "unknown-frame") {
        console.log(`[AMT8000-EVENTS] RX comando=${event.command} origem=${event.source} destino=${event.destination} dados=${event.dataLength} byte(s). Payload omitido.`);
      }
    },
  });
  printSummary(result);
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`[AMT8000-EVENTS] ${message}`);
  process.exit(error instanceof IsecReadOnlyError ? error.exitCode : 1);
}
