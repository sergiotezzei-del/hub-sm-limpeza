import net from "node:net";
import {
  ISEC_COMMANDS,
  ISEC_ENDPOINTS,
  IsecStreamParser,
  authenticationResultLabel,
  buildAuthenticationFrame,
  buildKeepAliveFrame,
} from "./protocol.mjs";

const host = process.env.INTELBRAS_PANEL_HOST || "192.168.1.100";
const port = Number(process.env.INTELBRAS_PANEL_PORT || 9009);
const password = process.env.INTELBRAS_REMOTE_PASSWORD || "";
const timeoutMs = Number(process.env.INTELBRAS_PROBE_TIMEOUT_MS || 90000);
const deviceType = Number(process.env.INTELBRAS_DEVICE_TYPE || 3);
const keepAliveMs = 45000;
const panelId = [...ISEC_ENDPOINTS.PANEL];
const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];

const deviceTypeLabels = Object.freeze({
  1: "Software programação Remoto",
  2: "Software de monitoramento",
  3: "Mobile APP",
});

if (!/^\d{6}$/.test(password)) {
  console.error("[AMT8000-RAW] Senha remota inválida. Use o launcher seguro; não coloque a senha no código.");
  process.exit(2);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[AMT8000-RAW] Porta inválida.");
  process.exit(2);
}
if (!Object.hasOwn(deviceTypeLabels, deviceType)) {
  console.error("[AMT8000-RAW] INTELBRAS_DEVICE_TYPE inválido. Use 1, 2 ou 3.");
  process.exit(2);
}

function hexByte(value) {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function formatId(bytes) {
  return [...bytes].map(hexByte).join(" ");
}

function formatCommand(command) {
  return command.toString(16).padStart(4, "0").toUpperCase();
}

function rawHeaderSummary(chunk) {
  const bytes = Buffer.from(chunk);
  if (bytes.length < 8) {
    return `tamanho=${bytes.length} byte(s), cabeçalho incompleto`;
  }
  const destination = bytes.subarray(0, 2);
  const source = bytes.subarray(2, 4);
  const declaredBytes = bytes.readUInt16BE(4);
  const command = bytes.readUInt16BE(6);
  return `tamanho=${bytes.length} byte(s), destino=${formatId(destination)}, origem=${formatId(source)}, NumBytes=${declaredBytes}, comando-inicial=${formatCommand(command)}`;
}

console.log(`[AMT8000-RAW] Diagnóstico SOMENTE LEITURA: ${host}:${port}`);
console.log(`[AMT8000-RAW] Device type: ${deviceType} (${deviceTypeLabels[deviceType]}), ID cliente 8F FF.`);
console.log("[AMT8000-RAW] Serão exibidos somente metadados/cabeçalhos de recepção; nenhum payload será impresso.");
console.log("[AMT8000-RAW] Não existe caminho de código para arme, desarme ou bypass neste diagnóstico.");

const parser = new IsecStreamParser();
let authenticated = false;
let keepAliveTimer = null;
let finished = false;
let rawChunks = 0;
let parsedFrames = 0;

function finish(code, message) {
  if (finished) return;
  finished = true;
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  clearTimeout(deadline);
  if (message) console.log(message);
  console.log(`[AMT8000-RAW] Resumo: chunks TCP=${rawChunks}, quadros ISEC válidos=${parsedFrames}, bytes restantes no parser=${parser.bufferedBytes}.`);
  socket.end();
  setTimeout(() => process.exit(code), 50).unref();
}

const socket = net.createConnection({ host, port });
socket.setNoDelay(true);
socket.setKeepAlive(true, 30000);

const deadline = setTimeout(() => {
  finish(authenticated ? 0 : 3, authenticated
    ? "[AMT8000-RAW] Diagnóstico concluído. Nenhum comando de alteração foi enviado."
    : "[AMT8000-RAW] Tempo esgotado sem autenticação válida.");
}, timeoutMs);
deadline.unref();

socket.on("connect", () => {
  console.log("[AMT8000-RAW] TCP conectado. Enviando somente autenticação F0F0...");
  socket.write(buildAuthenticationFrame({ password, deviceType, destination: panelId, source: clientId }));
});

socket.on("data", (chunk) => {
  rawChunks += 1;
  console.log(`[AMT8000-RAW] TCP RX #${rawChunks}: ${rawHeaderSummary(chunk)}`);

  const before = parser.bufferedBytes;
  const frames = parser.push(chunk);
  const after = parser.bufferedBytes;
  if (frames.length === 0) {
    console.log(`[AMT8000-RAW] Parser: nenhum quadro válido extraído neste chunk; buffer antes=${before}, depois=${after}.`);
  }

  for (const frame of frames) {
    parsedFrames += 1;
    console.log(`[AMT8000-RAW] ISEC #${parsedFrames}: comando=${formatCommand(frame.command)} origem=${formatId(frame.source)} destino=${formatId(frame.destination)} dados=${frame.data.length} byte(s)`);

    if (frame.command === ISEC_COMMANDS.AUTHENTICATE) {
      const code = frame.data[0];
      const label = authenticationResultLabel(code);
      console.log(`[AMT8000-RAW] Resposta de autenticação: ${label}.`);
      if (code !== 0x00) {
        finish(5, `[AMT8000-RAW] Autenticação não aceita (${label}).`);
        return;
      }
      if (!authenticated) {
        authenticated = true;
        socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
        console.log("[AMT8000-RAW] TX keep-alive F0F7.");
        keepAliveTimer = setInterval(() => {
          if (!socket.destroyed) {
            socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
            console.log("[AMT8000-RAW] TX keep-alive F0F7.");
          }
        }, keepAliveMs);
        keepAliveTimer.unref();
        console.log("[AMT8000-RAW] Autenticado. Escutando bytes TCP brutos e quadros ISEC...");
      }
    }

    if (frame.command === ISEC_COMMANDS.FULL_STATUS) {
      console.log(`[AMT8000-RAW] >>> 0B4A detectado pelo parser com ${frame.data.length} byte(s) de dados.`);
    }
  }
});

socket.on("error", (error) => {
  finish(7, `[AMT8000-RAW] Falha TCP: ${error.code || error.message}`);
});

socket.on("close", () => {
  if (!finished) finish(authenticated ? 0 : 7, "[AMT8000-RAW] Conexão encerrada pela central.");
});
