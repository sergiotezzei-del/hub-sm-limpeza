import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  ISEC_COMMANDS,
  IsecStreamParser,
} from "./protocol.mjs";
import {
  formatAmt8000EventIndex,
} from "./event-buffer.mjs";
import {
  formatIsecCommand,
  formatIsecId,
  parseIntegerOption,
} from "./event-buffer-client.mjs";
import {
  parseAmt8000FullStatus,
} from "./status.mjs";

const DEFAULT_PANEL_HOST = "10.11.22.11";
const DEFAULT_PANEL_PORT = 9009;

const COMMAND_LABELS = new Map([
  [0x0b4a, "STATUS_COMPLETO_CENTRAL_ALARME"],
  [0x0bb0, "CAMERA_ENVIA_FOTO"],
  [0x3900, "BUFFER_EVENTOS"],
  [0x401a, "EXE_PANICO"],
  [0x401e, "ARMA_DESARMA_CENTRAL_ALARME"],
  [0x401f, "EXEC_BYPASS_ZONA"],
  [0xf0f0, "AUTENTICA_CONEXAO_REMOTA"],
  [0xf0f1, "DESCONECTAR_DISPOSITIVO_REMOTO"],
  [0xf0f7, "KEEP_ALIVE"],
  [0xf0fd, "NACK"],
  [0xf0fe, "ACK"],
]);

const CONTROL_COMMANDS = new Set([0x401a, 0x401e, 0x401f]);

function readArgs(argv) {
  const options = {
    inputPath: null,
    stdin: false,
    outPath: null,
    panelHost: DEFAULT_PANEL_HOST,
    panelPort: DEFAULT_PANEL_PORT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdin") {
      options.stdin = true;
    } else if (arg === "--out") {
      options.outPath = argv[++index];
    } else if (arg === "--panel-host") {
      options.panelHost = argv[++index];
    } else if (arg === "--panel-port") {
      options.panelPort = parseIntegerOption(argv[++index], DEFAULT_PANEL_PORT, {
        name: "panel-port",
        min: 1,
        max: 65535,
      });
    } else if (!options.inputPath) {
      options.inputPath = arg;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  return options;
}

function hexPayloadToBuffer(payload) {
  const compact = String(payload ?? "").replace(/[^0-9a-f]/gi, "");
  if (!compact || compact.length % 2 !== 0) return Buffer.alloc(0);
  return Buffer.from(compact, "hex");
}

function parseTsharkPayloadLine(line) {
  const columns = line.split("\t");
  if (columns.length < 8 || columns[0] === "frame.number") return null;
  const [frameNumberText, timeEpoch, streamText, src, srcPortText, dst, dstPortText, payloadText] = columns;
  const payload = hexPayloadToBuffer(payloadText);
  if (!payload.length) return null;

  return {
    frameNumber: Number(frameNumberText),
    timeEpoch: Number(timeEpoch),
    stream: streamText || "unknown",
    src,
    srcPort: Number(srcPortText),
    dst,
    dstPort: Number(dstPortText),
    payload,
  };
}

export function parseTsharkPayloadTsv(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTsharkPayloadLine)
    .filter(Boolean);
}

function directionOf(segment, { panelHost, panelPort }) {
  if (segment.dst === panelHost && segment.dstPort === panelPort) return "host_to_panel";
  if (segment.src === panelHost && segment.srcPort === panelPort) return "panel_to_host";
  return "other";
}

function commandLabel(command) {
  return COMMAND_LABELS.get(command) ?? "UNKNOWN";
}

function summarizeStatus(frame) {
  try {
    const status = parseAmt8000FullStatus(frame.data);
    return {
      firmware: status.firmware,
      sirenActive: status.sirenActive,
      hasTrouble: status.hasTrouble,
      batteryCode: status.batteryCode,
      batteryActive: status.batteryActive,
      armedPartitions: status.partitions.filter((partition) => partition.state === "armed").map((partition) => partition.id),
      triggeredPartitions: status.partitions.filter((partition) => partition.state === "triggered").map((partition) => partition.id),
      openZones: status.zones.filter((zone) => zone.state === "open").map((zone) => zone.id),
      triggeredZones: status.zones.filter((zone) => zone.state === "triggered").map((zone) => zone.id),
      bypassedZones: status.zones.filter((zone) => zone.state === "bypassed").map((zone) => zone.id),
    };
  } catch (error) {
    return {
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeFrame(frame, packet, direction) {
  const base = {
    packetFrame: packet.frameNumber,
    timeEpoch: packet.timeEpoch,
    tcpStream: packet.stream,
    direction,
    source: formatIsecId(frame.source),
    destination: formatIsecId(frame.destination),
    command: formatIsecCommand(frame.command),
    label: commandLabel(frame.command),
    dataLength: frame.data.length,
    sensitiveDataRedacted: frame.command === ISEC_COMMANDS.AUTHENTICATE,
    controlCommandObserved: CONTROL_COMMANDS.has(frame.command),
  };

  if (frame.command === ISEC_COMMANDS.AUTHENTICATE) {
    return {
      ...base,
      details: {
        deviceType: frame.data[0] ?? null,
        passwordPayload: "[redacted]",
      },
    };
  }

  if (frame.command === ISEC_COMMANDS.EVENT_BUFFER) {
    const eventIndex = frame.data.length >= 2 ? frame.data.readUInt16BE(0) : null;
    return {
      ...base,
      details: {
        eventIndex,
        eventIndexHex: Number.isInteger(eventIndex) && eventIndex >= 0 && eventIndex <= 511
          ? formatAmt8000EventIndex(eventIndex)
          : null,
      },
    };
  }

  if (frame.command === ISEC_COMMANDS.FULL_STATUS) {
    return {
      ...base,
      details: summarizeStatus(frame),
    };
  }

  if (frame.command === ISEC_COMMANDS.NACK) {
    return {
      ...base,
      details: {
        errorCode: frame.data.length ? `0x${frame.data[0].toString(16).padStart(2, "0").toUpperCase()}` : null,
      },
    };
  }

  return {
    ...base,
    details: {},
  };
}

export function analyzeIsecPayloadSegments(segments, {
  panelHost = DEFAULT_PANEL_HOST,
  panelPort = DEFAULT_PANEL_PORT,
  generatedAt = new Date(),
} = {}) {
  const parserByKey = new Map();
  const frames = [];
  const unparsedStreams = new Map();

  for (const segment of segments) {
    const direction = directionOf(segment, { panelHost, panelPort });
    const parserKey = `${segment.stream}:${direction}`;
    if (!parserByKey.has(parserKey)) parserByKey.set(parserKey, new IsecStreamParser());
    const parser = parserByKey.get(parserKey);
    for (const frame of parser.push(segment.payload)) {
      frames.push(summarizeFrame(frame, segment, direction));
    }
  }

  for (const [key, parser] of parserByKey) {
    if (parser.bufferedBytes > 0) unparsedStreams.set(key, parser.bufferedBytes);
  }

  const hostToPanel = frames.filter((frame) => frame.direction === "host_to_panel");
  const panelToHost = frames.filter((frame) => frame.direction === "panel_to_host");
  const passiveStatuses = frames.filter((frame) => frame.command === "0B4A" && frame.direction === "panel_to_host");
  const suspiciousStatusQueries = frames.filter((frame) => frame.command === "0B4A" && frame.direction === "host_to_panel");
  const controlCommandsObserved = frames.filter((frame) => frame.controlCommandObserved);

  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    panel: {
      host: panelHost,
      port: panelPort,
    },
    safety: {
      passiveCaptureOnly: true,
      rawPayloadPrinted: false,
      authenticationPayloadRedacted: true,
      scannerSentCommands: [],
    },
    summary: {
      payloadSegments: segments.length,
      decodedFrames: frames.length,
      hostToPanelFrames: hostToPanel.length,
      panelToHostFrames: panelToHost.length,
      passiveFullStatusFrames: passiveStatuses.length,
      hostToPanelFullStatusFrames: suspiciousStatusQueries.length,
      controlCommandsObserved: controlCommandsObserved.length,
      unparsedStreams: [...unparsedStreams.entries()].map(([stream, bufferedBytes]) => ({ stream, bufferedBytes })),
    },
    hostToPanelCommands: [...new Set(hostToPanel.map((frame) => `${frame.command} ${frame.label}`))],
    panelToHostCommands: [...new Set(panelToHost.map((frame) => `${frame.command} ${frame.label}`))],
    controlCommandsObserved: controlCommandsObserved.map((frame) => ({
      packetFrame: frame.packetFrame,
      direction: frame.direction,
      command: frame.command,
      label: frame.label,
      dataLength: frame.dataLength,
    })),
    frames,
  };
}

function printSummary(analysis) {
  console.log("[AMT8000-CAPTURE] Analise passiva sanitizada concluida.");
  console.log(`[AMT8000-CAPTURE] Segmentos TCP com payload: ${analysis.summary.payloadSegments}; quadros ISECNet decodificados: ${analysis.summary.decodedFrames}.`);
  console.log(`[AMT8000-CAPTURE] Host->central: ${analysis.summary.hostToPanelFrames}; central->host: ${analysis.summary.panelToHostFrames}.`);
  console.log(`[AMT8000-CAPTURE] 0B4A passivo central->host: ${analysis.summary.passiveFullStatusFrames}; 0B4A host->central observado: ${analysis.summary.hostToPanelFullStatusFrames}.`);
  if (analysis.summary.controlCommandsObserved > 0) {
    console.log(`[AMT8000-CAPTURE] ATENCAO: comandos de controle apareceram no trafego observado do software oficial: ${analysis.summary.controlCommandsObserved}.`);
  }

  const rows = analysis.frames.map((frame) => ({
    pacote: frame.packetFrame,
    stream: frame.tcpStream,
    direcao: frame.direction,
    comando: frame.command,
    nome: frame.label,
    bytes: frame.dataLength,
    detalhe: frame.command === "3900"
      ? frame.details.eventIndexHex ?? "-"
      : frame.command === "F0F0"
        ? "auth redigida"
        : frame.command === "0B4A"
          ? `status firmware=${frame.details.firmware ?? "-"}`
          : "",
  }));
  if (rows.length) console.table(rows);
}

async function readInput({ inputPath, stdin }) {
  if (stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
  if (!inputPath) throw new Error("Informe um TSV do tshark ou use --stdin.");
  return readFile(inputPath, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = readArgs(process.argv.slice(2));
    const input = await readInput(options);
    const analysis = analyzeIsecPayloadSegments(parseTsharkPayloadTsv(input), {
      panelHost: options.panelHost,
      panelPort: options.panelPort,
    });

    if (options.outPath) {
      await writeFile(options.outPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
    }
    printSummary(analysis);
    process.exit(0);
  } catch (error) {
    console.error(`[AMT8000-CAPTURE] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
