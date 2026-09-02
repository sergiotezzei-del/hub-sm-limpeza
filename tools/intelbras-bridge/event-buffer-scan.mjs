import net from "node:net";
import {
  ISEC_COMMANDS,
  ISEC_ENDPOINTS,
  IsecStreamParser,
  authenticationResultLabel,
  buildAuthenticationFrame,
  buildIsecFrame,
  buildKeepAliveFrame,
} from "./protocol.mjs";
import {
  AMT8000_EVENT_BUFFER_SIZE,
  createCircularEventBufferScanPlan,
  decodeAmt8000EventBufferResponse,
  formatAmt8000EventIndex,
  isUsableAmt8000EventRecord,
  selectRecentAmt8000EventRecords,
} from "./event-buffer.mjs";

const DEFAULT_PANEL_HOST = "10.11.22.11";
const DEFAULT_PANEL_PORT = 9009;
const DEFAULT_RECENT_LIMIT = 32;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_REQUEST_TIMEOUT_MS = 7000;
const DEFAULT_REQUEST_GAP_MS = 20;
const KEEP_ALIVE_MS = 45000;

const deviceTypeLabels = Object.freeze({
  1: "Software programacao Remoto",
  2: "Software de monitoramento",
  3: "Mobile APP",
});

function failConfig(message) {
  console.error(`[AMT8000-EVENTS] ${message}`);
  process.exit(2);
}

function readIntegerEnv(name, fallback, { min, max }) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) failConfig(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    failConfig(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
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

if (!Object.hasOwn(deviceTypeLabels, deviceType)) {
  failConfig("INTELBRAS_DEVICE_TYPE invalido. Use 1, 2 ou 3.");
}
if (!/^\d{6}$/.test(password)) {
  failConfig("A senha de acesso remoto deve conter exatamente 6 digitos.");
}

let scanPlan;
try {
  scanPlan = createCircularEventBufferScanPlan({ startIndex, count: scanCount });
} catch (error) {
  failConfig(error instanceof Error ? error.message : String(error));
}

const panelId = [...ISEC_ENDPOINTS.PANEL];
const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];
const parser = new IsecStreamParser();
const pendingIndices = [...scanPlan];
const decodedRecords = [];
const warnings = [];

let socket;
let authenticated = false;
let finished = false;
let keepAliveTimer = null;
let requestTimer = null;
let currentIndex = null;
let completedReads = 0;
let eventResponses = 0;
let ackFrames = 0;
let passiveStatusFrames = 0;

function formatId(id) {
  return id.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function formatCommand(command) {
  return command.toString(16).padStart(4, "0").toUpperCase();
}

function formatMaybeIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < AMT8000_EVENT_BUFFER_SIZE
    ? formatAmt8000EventIndex(index)
    : String(index ?? "-");
}

function clearRequestTimer() {
  if (requestTimer) clearTimeout(requestTimer);
  requestTimer = null;
}

function dedupeRecords(records) {
  const unique = new Map();
  for (const record of records) {
    const key = [
      record.index,
      record.timestamp,
      record.eventKind,
      record.effectiveCode,
      record.zoneOrUserText,
      record.partitionText,
    ].join("|");
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

function tableRows(records) {
  return records.map((record) => ({
    "data/hora": record.timestamp ?? "-",
    indice: formatMaybeIndex(record.index),
    codigo: record.effectiveCode ?? "-",
    "new/restore": record.eventKind,
    "zona/usuario": record.zoneOrUser ?? record.zoneOrUserText ?? "-",
    particao: record.partition ?? record.partitionText ?? "-",
  }));
}

function printSummary() {
  const uniqueRecords = dedupeRecords(decodedRecords);
  const usableRecords = uniqueRecords.filter(isUsableAmt8000EventRecord);
  const recentRecords = selectRecentAmt8000EventRecords(uniqueRecords, { limit: recentLimit });

  console.log("[AMT8000-EVENTS] Varredura 3900 concluida.");
  console.log(`[AMT8000-EVENTS] Indices lidos: ${completedReads}/${scanCount}; respostas 3900: ${eventResponses}; ACKs recebidos: ${ackFrames}; 0B4A passivos: ${passiveStatusFrames}.`);
  console.log(`[AMT8000-EVENTS] Registros decodificados: ${uniqueRecords.length}; registros com data/codigo validos: ${usableRecords.length}; exibindo os ${recentRecords.length} mais recentes em ordem cronologica.`);

  if (warnings.length) {
    console.log("[AMT8000-EVENTS] Avisos sanitizados:");
    for (const warning of warnings) console.log(`[AMT8000-EVENTS] - ${warning}`);
  }

  if (!recentRecords.length) {
    console.log("[AMT8000-EVENTS] Nenhum registro recente valido foi identificado no intervalo lido.");
    return;
  }

  console.table(tableRows(recentRecords));
}

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearRequestTimer();
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  clearTimeout(deadline);
  if (message) console.log(message);
  if (code === 0) printSummary();
  if (socket && !socket.destroyed) socket.end();
  setTimeout(() => process.exit(code), 50).unref();
}

function scheduleNextRead() {
  if (finished) return;
  if (requestGapMs === 0) {
    queueMicrotask(sendNextRead);
    return;
  }
  const timer = setTimeout(sendNextRead, requestGapMs);
  timer.unref();
}

function sendNextRead() {
  if (finished || !authenticated || currentIndex !== null) return;

  const nextIndex = pendingIndices.shift();
  if (nextIndex === undefined) {
    finish(0, "[AMT8000-EVENTS] Leitura oficial 3900 finalizada. Nenhum estado da central foi alterado.");
    return;
  }

  currentIndex = nextIndex;
  const ordinal = completedReads + 1;
  const readFrame = buildIsecFrame({
    destination: panelId,
    source: clientId,
    command: ISEC_COMMANDS.EVENT_BUFFER,
    data: [(nextIndex >> 8) & 0xff, nextIndex & 0xff],
  });

  socket.write(readFrame);
  if (ordinal === 1 || ordinal === scanCount || ordinal % 32 === 0) {
    console.log(`[AMT8000-EVENTS] TX READ-COMMAND 3900 indice ${formatAmt8000EventIndex(nextIndex)} (${ordinal}/${scanCount}).`);
  }

  requestTimer = setTimeout(() => {
    finish(4, `[AMT8000-EVENTS] Tempo esgotado aguardando resposta 3900 do indice ${formatAmt8000EventIndex(nextIndex)}. Nenhuma alteracao foi enviada.`);
  }, requestTimeoutMs);
  requestTimer.unref();
}

function handleAuthentication(frame) {
  const code = frame.data[0];
  const label = authenticationResultLabel(code);
  console.log(`[AMT8000-EVENTS] Resposta de autenticacao: ${label}.`);
  if (code !== 0x00) {
    finish(5, `[AMT8000-EVENTS] Autenticacao nao aceita (${label}).`);
    return;
  }
  if (authenticated) return;

  authenticated = true;
  socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
  console.log("[AMT8000-EVENTS] TX keep-alive F0F7 (sem alteracao de estado).");

  keepAliveTimer = setInterval(() => {
    if (!socket.destroyed) {
      socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
      console.log("[AMT8000-EVENTS] TX keep-alive F0F7 (sem alteracao de estado).");
    }
  }, KEEP_ALIVE_MS);
  keepAliveTimer.unref();

  console.log("[AMT8000-EVENTS] Autenticado. Iniciando varredura circular do BUFFER_EVENTOS na mesma sessao TCP.");
  sendNextRead();
}

function handleEventBuffer(frame) {
  clearRequestTimer();
  eventResponses += 1;

  const requestedIndex = currentIndex;
  currentIndex = null;

  try {
    const decoded = decodeAmt8000EventBufferResponse(frame.data);
    decodedRecords.push(...decoded.records);
    if (decoded.trailingBytes > 0) {
      warnings.push(`Resposta 3900 do indice ${formatMaybeIndex(requestedIndex)} trouxe ${decoded.trailingBytes} byte(s) finais nao decodificados.`);
    }
    if (decoded.records[0] && requestedIndex !== null && decoded.records[0].index !== requestedIndex) {
      warnings.push(`Resposta 3900 solicitada para ${formatMaybeIndex(requestedIndex)} retornou primeiro indice ${formatMaybeIndex(decoded.records[0].index)}.`);
    }
  } catch (error) {
    finish(6, `[AMT8000-EVENTS] A resposta 3900 chegou, mas nao pode ser decodificada: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  completedReads += 1;
  if (completedReads === scanCount || completedReads % 32 === 0) {
    console.log(`[AMT8000-EVENTS] Progresso: ${completedReads}/${scanCount} indices lidos, ${decodedRecords.length} registro(s) recebidos.`);
  }
  scheduleNextRead();
}

console.log(`[AMT8000-EVENTS] Varredura SOMENTE LEITURA: ${host}:${port}`);
console.log(`[AMT8000-EVENTS] Comando oficial 3900 (BUFFER_EVENTOS), indices ${formatAmt8000EventIndex(startIndex)}..circular, total ${scanCount}.`);
console.log(`[AMT8000-EVENTS] Serao exibidos no maximo ${recentLimit} registros recentes em ordem cronologica.`);
console.log(`[AMT8000-EVENTS] Device type F0F0: ${deviceType} (${deviceTypeLabels[deviceType]}), ID cliente 8F FF.`);
console.log("[AMT8000-EVENTS] Nenhum comando de arme, desarme, bypass, panic ou alteracao de configuracao existe nesta ferramenta.");
console.log("[AMT8000-EVENTS] Nenhum payload bruto nem senha sera impresso.");

socket = net.createConnection({ host, port });
socket.setNoDelay(true);
socket.setKeepAlive(true, 30000);

const deadline = setTimeout(() => {
  finish(authenticated ? 4 : 3, authenticated
    ? "[AMT8000-EVENTS] Tempo geral esgotado antes de concluir a varredura 3900. Nenhuma alteracao foi enviada."
    : "[AMT8000-EVENTS] Tempo esgotado antes de concluir autenticacao/leitura.");
}, timeoutMs);
deadline.unref();

socket.on("connect", () => {
  console.log("[AMT8000-EVENTS] TCP conectado. Autenticando com F0F0 sem registrar a senha...");
  socket.write(buildAuthenticationFrame({
    password,
    deviceType,
    destination: panelId,
    source: clientId,
  }));
});

socket.on("data", (chunk) => {
  for (const frame of parser.push(chunk)) {
    if (frame.command === ISEC_COMMANDS.AUTHENTICATE) {
      handleAuthentication(frame);
      continue;
    }

    if (frame.command === ISEC_COMMANDS.EVENT_BUFFER) {
      handleEventBuffer(frame);
      continue;
    }

    if (frame.command === ISEC_COMMANDS.ACK) {
      ackFrames += 1;
      continue;
    }

    if (frame.command === ISEC_COMMANDS.FULL_STATUS) {
      passiveStatusFrames += 1;
      console.log(`[AMT8000-EVENTS] RX 0B4A passivo origem=${formatId(frame.source)} destino=${formatId(frame.destination)} dados=${frame.data.length} byte(s). Este scanner nao solicitou status.`);
      continue;
    }

    if (frame.command === ISEC_COMMANDS.NACK) {
      const errorCode = frame.data.length ? `0x${frame.data[0].toString(16).padStart(2, "0").toUpperCase()}` : "sem codigo";
      finish(6, `[AMT8000-EVENTS] A central respondeu NACK (${errorCode}) durante leitura 3900. Nenhuma alteracao foi enviada.`);
      return;
    }

    console.log(`[AMT8000-EVENTS] RX comando=${formatCommand(frame.command)} origem=${formatId(frame.source)} destino=${formatId(frame.destination)} dados=${frame.data.length} byte(s). Payload omitido.`);
  }
});

socket.on("error", (error) => {
  finish(7, `[AMT8000-EVENTS] Falha TCP: ${error.code || error.message}`);
});

socket.on("close", () => {
  if (!finished) finish(authenticated ? 4 : 7, "[AMT8000-EVENTS] Conexao encerrada pela central.");
});

process.on("SIGINT", () => {
  finish(130, "[AMT8000-EVENTS] Interrompido pelo usuario. Nenhuma alteracao foi enviada.");
});
