import net from "node:net";
import {
  ISEC_COMMANDS,
  ISEC_ENDPOINTS,
  IsecStreamParser,
  authenticationResultLabel,
  buildAuthenticationFrame,
  buildIsecFrame,
} from "./protocol.mjs";

const EVENT_BUFFER_COMMAND = 0x3900;
const host = process.env.INTELBRAS_PANEL_HOST || "192.168.1.100";
const port = Number(process.env.INTELBRAS_PANEL_PORT || 9009);
const password = process.env.INTELBRAS_REMOTE_PASSWORD || "";
const timeoutMs = Number(process.env.INTELBRAS_PROBE_TIMEOUT_MS || 20000);
const panelId = [...ISEC_ENDPOINTS.PANEL];
const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];

if (!/^\d{6}$/.test(password)) {
  console.error("[AMT8000-EVENTS] A senha de acesso remoto deve conter exatamente 6 dígitos.");
  process.exit(2);
}

const parser = new IsecStreamParser();
let authenticated = false;
let requestSent = false;
let finished = false;

function formatId(id) {
  return id.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function formatCommand(command) {
  return command.toString(16).padStart(4, "0").toUpperCase();
}

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  if (message) console.log(message);
  socket.end();
  setTimeout(() => process.exit(code), 50).unref();
}

console.log(`[AMT8000-EVENTS] Teste SOMENTE LEITURA: ${host}:${port}`);
console.log("[AMT8000-EVENTS] Comando oficial 3900 (BUFFER_EVENTOS), índice inicial 0000.");
console.log("[AMT8000-EVENTS] Nenhum comando de arme, desarme, bypass, panic ou alteração de configuração existe neste teste.");
console.log("[AMT8000-EVENTS] O conteúdo dos eventos não será impresso; apenas metadados da resposta.");

const socket = net.createConnection({ host, port });
socket.setNoDelay(true);
socket.setKeepAlive(true, 30000);

const deadline = setTimeout(() => {
  if (authenticated && requestSent) {
    finish(4, "[AMT8000-EVENTS] Tempo esgotado sem resposta ao READ-COMMAND 3900. Nenhuma alteração foi enviada.");
  } else {
    finish(3, "[AMT8000-EVENTS] Tempo esgotado antes de concluir autenticação/leitura.");
  }
}, timeoutMs);
deadline.unref();

socket.on("connect", () => {
  console.log("[AMT8000-EVENTS] TCP conectado. Autenticando com F0F0 como software de programação remota (device type 1)...");
  socket.write(buildAuthenticationFrame({
    password,
    deviceType: 1,
    destination: panelId,
    source: clientId,
  }));
});

socket.on("data", (chunk) => {
  for (const frame of parser.push(chunk)) {
    console.log(`[AMT8000-EVENTS] RX comando=${formatCommand(frame.command)} origem=${formatId(frame.source)} destino=${formatId(frame.destination)} dados=${frame.data.length} byte(s)`);

    if (frame.command === ISEC_COMMANDS.AUTHENTICATE) {
      const code = frame.data[0];
      const label = authenticationResultLabel(code);
      console.log(`[AMT8000-EVENTS] Resposta de autenticação: ${label}.`);
      if (code !== 0x00) {
        finish(5, `[AMT8000-EVENTS] Autenticação não aceita (${label}).`);
        return;
      }
      if (!authenticated) {
        authenticated = true;
        const readFrame = buildIsecFrame({
          destination: panelId,
          source: clientId,
          command: EVENT_BUFFER_COMMAND,
          data: [0x00, 0x00],
        });
        socket.write(readFrame);
        requestSent = true;
        console.log("[AMT8000-EVENTS] TX READ-COMMAND 3900, buffer index 0000 (somente leitura).");
      }
      continue;
    }

    if (frame.command === EVENT_BUFFER_COMMAND) {
      const index = frame.data.length >= 2
        ? `${frame.data[0].toString(16).padStart(2, "0")}${frame.data[1].toString(16).padStart(2, "0")}`.toUpperCase()
        : "indisponível";
      console.log(`[AMT8000-EVENTS] BUFFER_EVENTOS recebido: ${frame.data.length} byte(s), índice retornado=${index}.`);
      finish(0, "[AMT8000-EVENTS] Leitura oficial 3900 concluída. Nenhum estado da central foi alterado.");
      return;
    }

    if (frame.command === ISEC_COMMANDS.NACK) {
      const errorCode = frame.data.length ? `0x${frame.data[0].toString(16).padStart(2, "0").toUpperCase()}` : "sem código";
      finish(6, `[AMT8000-EVENTS] A central respondeu NACK ao teste de leitura (${errorCode}). Nenhuma alteração foi enviada.`);
      return;
    }
  }
});

socket.on("error", (error) => {
  finish(7, `[AMT8000-EVENTS] Falha TCP: ${error.code || error.message}`);
});

socket.on("close", () => {
  if (!finished) finish(authenticated ? 4 : 7, "[AMT8000-EVENTS] Conexão encerrada pela central.");
});
