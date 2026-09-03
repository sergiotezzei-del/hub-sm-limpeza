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
  formatMaybeAmt8000EventIndex,
} from "./event-buffer.mjs";

export const DEFAULT_PANEL_HOST = "10.11.22.11";
export const DEFAULT_PANEL_PORT = 9009;
export const DEFAULT_TIMEOUT_MS = 180000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 7000;
export const DEFAULT_REQUEST_GAP_MS = 20;
export const DEFAULT_REQUEST_RETRIES = 1;
export const DEFAULT_KEEP_ALIVE_MS = 45000;

export const INTELBRAS_DEVICE_TYPE_LABELS = Object.freeze({
  1: "Software programacao Remoto",
  2: "Software de monitoramento",
  3: "Mobile APP",
});

export class IsecReadOnlyError extends Error {
  constructor(message, { exitCode = 1 } = {}) {
    super(message);
    this.name = "IsecReadOnlyError";
    this.exitCode = exitCode;
  }
}

export function parseIntegerOption(value, fallback, { name = "value", min, max } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new IsecReadOnlyError(`${name} deve ser um inteiro entre ${min} e ${max}.`, { exitCode: 2 });
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new IsecReadOnlyError(`${name} deve ser um inteiro entre ${min} e ${max}.`, { exitCode: 2 });
  }
  return parsed;
}

export function validateRemotePassword(password) {
  if (!/^\d{6}$/.test(password ?? "")) {
    throw new IsecReadOnlyError("A senha de acesso remoto deve conter exatamente 6 digitos.", { exitCode: 2 });
  }
}

export function formatIsecId(id) {
  return id.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export function formatIsecCommand(command) {
  return command.toString(16).padStart(4, "0").toUpperCase();
}

export function readAmt8000EventBuffer({
  host = DEFAULT_PANEL_HOST,
  port = DEFAULT_PANEL_PORT,
  password,
  deviceType = 1,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  requestGapMs = DEFAULT_REQUEST_GAP_MS,
  requestRetries = DEFAULT_REQUEST_RETRIES,
  keepAliveMs = DEFAULT_KEEP_ALIVE_MS,
  startIndex = 0,
  scanCount = AMT8000_EVENT_BUFFER_SIZE,
  onLog = () => {},
} = {}) {
  validateRemotePassword(password);

  if (!Object.hasOwn(INTELBRAS_DEVICE_TYPE_LABELS, deviceType)) {
    throw new IsecReadOnlyError("INTELBRAS_DEVICE_TYPE invalido. Use 1, 2 ou 3.", { exitCode: 2 });
  }
  if (!Number.isInteger(requestRetries) || requestRetries < 0 || requestRetries > 10) {
    throw new IsecReadOnlyError("INTELBRAS_EVENT_REQUEST_RETRIES deve ser um inteiro entre 0 e 10.", { exitCode: 2 });
  }

  const scanPlan = createCircularEventBufferScanPlan({ startIndex, count: scanCount });
  const panelId = [...ISEC_ENDPOINTS.PANEL];
  const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];
  const parser = new IsecStreamParser();
  const pendingIndices = [...scanPlan];
  const records = [];
  const warnings = [];
  const unknownFrames = [];

  let socket;
  let deadline;
  let keepAliveTimer = null;
  let requestTimer = null;
  let nextReadTimer = null;
  let authenticated = false;
  let finished = false;
  let currentIndex = null;
  let currentAttempt = 0;
  let completedReads = 0;
  let eventResponses = 0;
  let ackFrames = 0;
  let passiveStatusFrames = 0;

  return new Promise((resolve, reject) => {
    function cleanup() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (requestTimer) clearTimeout(requestTimer);
      if (nextReadTimer) clearTimeout(nextReadTimer);
      if (deadline) clearTimeout(deadline);
      keepAliveTimer = null;
      requestTimer = null;
      nextReadTimer = null;
      deadline = null;
    }

    function finishSuccess() {
      if (finished) return;
      finished = true;
      cleanup();
      if (socket && !socket.destroyed) socket.end();
      resolve({
        host,
        port,
        startIndex,
        scanCount,
        records,
        warnings,
        unknownFrames,
        completedReads,
        eventResponses,
        ackFrames,
        passiveStatusFrames,
        authenticated,
      });
    }

    function finishError(error) {
      if (finished) return;
      finished = true;
      cleanup();
      if (socket && !socket.destroyed) socket.end();
      reject(error);
    }

    function scheduleNextRead() {
      if (finished) return;
      if (requestGapMs === 0) {
        queueMicrotask(sendNextRead);
        return;
      }
      nextReadTimer = setTimeout(sendNextRead, requestGapMs);
      nextReadTimer.unref();
    }

    function armRequestTimeout(index) {
      if (requestTimer) clearTimeout(requestTimer);
      requestTimer = setTimeout(() => {
        if (currentIndex !== index) return;
        if (currentAttempt < requestRetries) {
          currentAttempt += 1;
          const maxAttempts = requestRetries + 1;
          warnings.push(`Sem resposta 3900 do indice ${formatAmt8000EventIndex(index)} na tentativa ${currentAttempt}/${maxAttempts}; reenviando READ-COMMAND somente leitura.`);
          onLog({
            type: "event-buffer-retry",
            index,
            indexHex: formatAmt8000EventIndex(index),
            attempt: currentAttempt + 1,
            maxAttempts,
          });
          writeCurrentRead();
          return;
        }
        finishError(new IsecReadOnlyError(`Tempo esgotado aguardando resposta 3900 do indice ${formatAmt8000EventIndex(index)}. Nenhuma alteracao foi enviada.`, { exitCode: 4 }));
      }, requestTimeoutMs);
      requestTimer.unref();
    }

    function writeCurrentRead() {
      if (finished || !authenticated || currentIndex === null) return;
      const ordinal = completedReads + 1;
      const maxAttempts = requestRetries + 1;
      const readFrame = buildIsecFrame({
        destination: panelId,
        source: clientId,
        command: ISEC_COMMANDS.EVENT_BUFFER,
        data: [(currentIndex >> 8) & 0xff, currentIndex & 0xff],
      });

      socket.write(readFrame);
      onLog({
        type: "event-buffer-request",
        index: currentIndex,
        indexHex: formatAmt8000EventIndex(currentIndex),
        ordinal,
        total: scanCount,
        attempt: currentAttempt + 1,
        maxAttempts,
      });
      armRequestTimeout(currentIndex);
    }

    function sendNextRead() {
      if (finished || !authenticated || currentIndex !== null) return;

      const nextIndex = pendingIndices.shift();
      if (nextIndex === undefined) {
        finishSuccess();
        return;
      }

      currentIndex = nextIndex;
      currentAttempt = 0;
      writeCurrentRead();
    }

    function handleAuthentication(frame) {
      const code = frame.data[0];
      const label = authenticationResultLabel(code);
      onLog({ type: "authentication", code, label });

      if (code !== 0x00) {
        finishError(new IsecReadOnlyError(`Autenticacao nao aceita (${label}).`, { exitCode: 5 }));
        return;
      }
      if (authenticated) return;

      authenticated = true;
      socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
      onLog({ type: "keep-alive" });

      keepAliveTimer = setInterval(() => {
        if (!socket.destroyed) {
          socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
          onLog({ type: "keep-alive" });
        }
      }, keepAliveMs);
      keepAliveTimer.unref();

      sendNextRead();
    }

    function handleEventBuffer(frame) {
      if (requestTimer) clearTimeout(requestTimer);
      requestTimer = null;
      eventResponses += 1;

      const requestedIndex = currentIndex;
      currentIndex = null;
      currentAttempt = 0;

      try {
        const decoded = decodeAmt8000EventBufferResponse(frame.data);
        records.push(...decoded.records);
        if (decoded.trailingBytes > 0) {
          warnings.push(`Resposta 3900 do indice ${formatMaybeAmt8000EventIndex(requestedIndex)} trouxe ${decoded.trailingBytes} byte(s) finais nao decodificados.`);
        }
        if (decoded.records[0] && decoded.records[0].index !== requestedIndex) {
          warnings.push(`Resposta 3900 solicitada para ${formatMaybeAmt8000EventIndex(requestedIndex)} retornou primeiro indice ${formatMaybeAmt8000EventIndex(decoded.records[0].index)}.`);
        }
      } catch (error) {
        finishError(new IsecReadOnlyError(`A resposta 3900 chegou, mas nao pode ser decodificada: ${error instanceof Error ? error.message : String(error)}`, { exitCode: 6 }));
        return;
      }

      completedReads += 1;
      onLog({
        type: "event-buffer-response",
        completedReads,
        total: scanCount,
        recordCount: records.length,
      });
      scheduleNextRead();
    }

    socket = net.createConnection({ host, port });
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);

    deadline = setTimeout(() => {
      finishError(new IsecReadOnlyError(authenticated
        ? "Tempo geral esgotado antes de concluir a varredura 3900. Nenhuma alteracao foi enviada."
        : "Tempo esgotado antes de concluir autenticacao/leitura.", { exitCode: authenticated ? 4 : 3 }));
    }, timeoutMs);
    deadline.unref();

    socket.on("connect", () => {
      onLog({ type: "connect", host, port });
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
          onLog({ type: "ack" });
          continue;
        }

        if (frame.command === ISEC_COMMANDS.FULL_STATUS) {
          passiveStatusFrames += 1;
          onLog({
            type: "passive-status",
            command: frame.command,
            commandHex: formatIsecCommand(frame.command),
            source: formatIsecId(frame.source),
            destination: formatIsecId(frame.destination),
            dataLength: frame.data.length,
          });
          continue;
        }

        if (frame.command === ISEC_COMMANDS.NACK) {
          const errorCode = frame.data.length ? `0x${frame.data[0].toString(16).padStart(2, "0").toUpperCase()}` : "sem codigo";
          finishError(new IsecReadOnlyError(`A central respondeu NACK (${errorCode}) durante leitura 3900. Nenhuma alteracao foi enviada.`, { exitCode: 6 }));
          return;
        }

        const unknownFrame = {
          command: formatIsecCommand(frame.command),
          source: formatIsecId(frame.source),
          destination: formatIsecId(frame.destination),
          dataLength: frame.data.length,
        };
        unknownFrames.push(unknownFrame);
        onLog({ type: "unknown-frame", ...unknownFrame });
      }
    });

    socket.on("error", (error) => {
      finishError(new IsecReadOnlyError(`Falha TCP: ${error.code || error.message}`, { exitCode: 7 }));
    });

    socket.on("close", () => {
      if (!finished) {
        finishError(new IsecReadOnlyError(authenticated ? "Conexao encerrada pela central." : "Conexao encerrada antes da autenticacao.", { exitCode: authenticated ? 4 : 7 }));
      }
    });
  });
}
