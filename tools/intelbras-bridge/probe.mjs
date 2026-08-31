import net from "node:net";
import {
  ISEC_COMMANDS,
  ISEC_ENDPOINTS,
  IsecStreamParser,
  authenticationResultLabel,
  buildAckFrame,
  buildAuthenticationFrame,
  buildKeepAliveFrame,
} from "./protocol.mjs";
import { parseAmt8000FullStatus, toHubSnapshot } from "./status.mjs";

const host = process.env.INTELBRAS_PANEL_HOST || "192.168.1.100";
const port = Number(process.env.INTELBRAS_PANEL_PORT || 9009);
const password = process.env.INTELBRAS_REMOTE_PASSWORD || "";
const timeoutMs = Number(process.env.INTELBRAS_PROBE_TIMEOUT_MS || 90000);
const keepAliveMs = 45000;
const panelId = [...ISEC_ENDPOINTS.PANEL];
const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];

const partitionNames = {
  1: "Sub Solo",
  2: "Térreo",
  3: "1 Andar",
  4: "Externos",
};

if (!/^\d{6}$/.test(password)) {
  console.error("[AMT8000] Defina INTELBRAS_REMOTE_PASSWORD com a senha de acesso remoto de 6 dígitos. Não coloque essa senha no código.");
  process.exit(2);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[AMT8000] Porta inválida.");
  process.exit(2);
}

console.log(`[AMT8000] Teste SOMENTE LEITURA: ${host}:${port}`);
console.log("[AMT8000] Identificação ISECNet do software: 8F FF (conforme SDK oficial).");
console.log("[AMT8000] Diagnóstico passivo: serão exibidos apenas código, origem/destino e tamanho dos quadros recebidos; o conteúdo não será mostrado.");
console.log("[AMT8000] O agente não possui caminho de código para arme, desarme ou bypass neste teste.");

const parser = new IsecStreamParser();
let authenticated = false;
let statusReceived = false;
let keepAliveTimer = null;
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
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  clearTimeout(deadline);
  if (message) console.log(message);
  socket.end();
  setTimeout(() => process.exit(code), 50).unref();
}

const socket = net.createConnection({ host, port });
socket.setNoDelay(true);
socket.setKeepAlive(true, 30000);

const deadline = setTimeout(() => {
  if (authenticated && !statusReceived) {
    finish(4, "[AMT8000] Diagnóstico concluído: autenticação aceita, mas nenhum STATUS_COMPLETO_CENTRAL_ALARME (0B4A) chegou. Nenhum comando de alteração foi enviado.");
  } else {
    finish(3, "[AMT8000] Tempo esgotado sem autenticação válida.");
  }
}, timeoutMs);

deadline.unref();

socket.on("connect", () => {
  console.log("[AMT8000] TCP conectado. Enviando somente autenticação F0F0 como software 8F FF...");
  socket.write(buildAuthenticationFrame({ password, destination: panelId, source: clientId }));
});

socket.on("data", (chunk) => {
  for (const frame of parser.push(chunk)) {
    console.log(`[AMT8000] RX comando=${formatCommand(frame.command)} origem=${formatId(frame.source)} destino=${formatId(frame.destination)} dados=${frame.data.length} byte(s)`);

    if (frame.command === ISEC_COMMANDS.AUTHENTICATE) {
      const code = frame.data[0];
      const label = authenticationResultLabel(code);
      console.log(`[AMT8000] Resposta de autenticação: ${label}.`);
      if (code !== 0x00) {
        finish(5, `[AMT8000] Autenticação não aceita (${label}).`);
        return;
      }
      if (!authenticated) {
        authenticated = true;

        // O SDK oficial prevê F0F7 como manutenção da sessão. Enviamos um imediatamente
        // após autenticar e depois periodicamente. Isso não altera nenhuma configuração.
        socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
        console.log("[AMT8000] TX keep-alive F0F7 (sem alteração de estado).");

        keepAliveTimer = setInterval(() => {
          if (!socket.destroyed) {
            socket.write(buildKeepAliveFrame({ destination: panelId, source: clientId }));
            console.log("[AMT8000] TX keep-alive F0F7 (sem alteração de estado).");
          }
        }, keepAliveMs);
        keepAliveTimer.unref();
        console.log("[AMT8000] Autenticado. Escutando os quadros enviados pela central...");
      }
      continue;
    }

    if (frame.command === ISEC_COMMANDS.FULL_STATUS) {
      try {
        const decoded = parseAmt8000FullStatus(frame.data, partitionNames);
        const snapshot = toHubSnapshot(decoded);
        statusReceived = true;
        socket.write(buildAckFrame({ destination: panelId, source: clientId }));
        console.log("[AMT8000] STATUS 0B4A recebido, decodificado e confirmado com ACK F0FE.");
        console.log(JSON.stringify({
          panelName: snapshot.panelName,
          online: snapshot.online,
          firmware: decoded.firmware,
          sirenActive: snapshot.sirenActive,
          batteryActive: snapshot.batteryActive,
          partitions: snapshot.partitions,
          zones: snapshot.zones.filter((zone) => zone.state !== "closed"),
          rawStatusBytes: decoded.rawLength,
        }, null, 2));
        finish(0, "[AMT8000] Teste somente leitura concluído. Nenhum comando de arme/desarme/bypass foi enviado.");
      } catch (error) {
        finish(6, `[AMT8000] O status chegou, mas não pôde ser decodificado: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
});

socket.on("error", (error) => {
  finish(7, `[AMT8000] Falha TCP: ${error.code || error.message}`);
});

socket.on("close", () => {
  if (!finished) finish(authenticated ? 4 : 7, "[AMT8000] Conexão encerrada pela central.");
});
