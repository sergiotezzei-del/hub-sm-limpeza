const SUPABASE_URL = (process.env.RADIO_SUPABASE_URL || "https://dtdepfpkyiqtnsjztjit.supabase.co").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.RADIO_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZGVwZnBreWlxdG5zanp0aml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODkyMTcsImV4cCI6MjA5ODc2NTIxN30.kNYAYQTw8gqUaYqRTqdcPtthXO5vbZD6XwxeBvhpRgo";
const BRIDGE_TOKEN = (process.env.RADIO_BRIDGE_TOKEN || "").trim();
const AUDIOCAST_IP = (process.env.RADIO_AUDIOCAST_IP || "10.11.22.53").trim();
const DEVICE_NAME = (process.env.RADIO_DEVICE_NAME || "SOM SANTAMARIATEM").trim();

if (!BRIDGE_TOKEN) {
  console.error("[radio-player] RADIO_BRIDGE_TOKEN nao informado.");
  process.exit(1);
}

let stopped = false;
let commandBusy = false;
let statusBusy = false;
const warningTimes = new Map();

console.log("[radio-player] Musica atual e controles habilitados via RPC direto.");

async function supabaseRpc(name, body, timeoutMs = 7000) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${name}: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function claimCommand() {
  const rows = await supabaseRpc("radio_bridge_claim_command", { p_token: BRIDGE_TOKEN });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function finishCommand(id, success, error = null) {
  return supabaseRpc("radio_bridge_finish_command", {
    p_token: BRIDGE_TOKEN,
    p_id: id,
    p_success: success,
    p_error: error,
  });
}

async function setPlayerState(state) {
  return supabaseRpc("radio_bridge_set_player_state", {
    p_token: BRIDGE_TOKEN,
    p_device_name: state.device_name,
    p_title: state.title,
    p_artist: state.artist,
    p_album: state.album,
    p_player_status: state.player_status,
    p_volume: state.volume,
    p_mute: state.mute,
    p_mode: state.mode,
    p_current_ms: state.current_ms,
    p_total_ms: state.total_ms,
    p_error: state.last_error,
  });
}

async function pollCommands() {
  if (stopped || commandBusy) return;
  commandBusy = true;
  let command = null;

  try {
    command = await claimCommand();
    if (!command) return;

    const audioCastCommand = mapCommand(command);
    const response = await fetch(
      `http://${AUDIOCAST_IP}/httpapi.asp?command=${audioCastCommand}`,
      { signal: AbortSignal.timeout(5000) },
    );
    const text = (await response.text()).trim();

    if (!response.ok || text !== "OK") {
      throw new Error(`AudioCast respondeu ${response.status}: ${text || "sem resposta"}`);
    }

    await finishCommand(command.id, true, null);
    console.log(`[radio-player] Controle executado: ${commandLabel(command)}`);
    setTimeout(() => void syncStatus(), 300);
  } catch (error) {
    const message = errorMessage(error);
    if (command?.id) {
      console.error(`[radio-player] Falha no controle ${commandLabel(command)}: ${message}`);
      try {
        await finishCommand(command.id, false, message);
      } catch {}
    } else {
      logTransient("cloud", `Conexao com o HUB indisponivel. Tentando novamente... (${message})`);
    }
  } finally {
    commandBusy = false;
  }
}

async function syncStatus() {
  if (stopped || statusBusy) return;
  statusBusy = true;

  try {
    const response = await fetch(
      `http://${AUDIOCAST_IP}/httpapi.asp?command=getPlayerStatus`,
      { signal: AbortSignal.timeout(4500) },
    );

    if (!response.ok) throw new Error(`AudioCast HTTP ${response.status}`);

    const raw = JSON.parse(await response.text());

    await setPlayerState({
      device_name: DEVICE_NAME,
      title: decodeLinkPlayText(raw.Title),
      artist: decodeLinkPlayText(raw.Artist),
      album: decodeLinkPlayText(raw.Album),
      player_status: typeof raw.status === "string" ? raw.status : "",
      volume: integerOr(raw.vol, 0),
      mute: String(raw.mute) === "1",
      mode: nullableInteger(raw.mode),
      current_ms: nullableInteger(raw.curpos),
      total_ms: nullableInteger(raw.totlen),
      last_error: null,
    });
  } catch (error) {
    const message = errorMessage(error);
    const key = message.includes("AudioCast") ? "audiocast" : "cloud";
    logTransient(
      key,
      `${key === "audiocast" ? "AudioCast" : "Conexao com o HUB"} indisponivel. Tentando novamente... (${message})`,
    );
  } finally {
    statusBusy = false;
  }
}

function mapCommand(command) {
  switch (command.command) {
    case "pause": return "setPlayerCmd:pause";
    case "resume": return "setPlayerCmd:resume";
    case "next": return "setPlayerCmd:next";
    case "previous": return "setPlayerCmd:prev";
    case "mute": return "setPlayerCmd:mute:1";
    case "unmute": return "setPlayerCmd:mute:0";
    case "volume": {
      const value = Math.max(0, Math.min(100, Number(command.value)));
      if (!Number.isFinite(value)) throw new Error("volume invalido");
      return `setPlayerCmd:vol:${Math.round(value)}`;
    }
    default:
      throw new Error(`comando nao suportado: ${command.command}`);
  }
}

function decodeLinkPlayText(value) {
  if (typeof value !== "string" || !value) return "";
  const trimmed = value.trim();

  if (!/^[0-9a-f]+$/i.test(trimmed) || trimmed.length % 2 !== 0) {
    return trimmed;
  }

  try {
    const decoded = Buffer.from(trimmed, "hex")
      .toString("utf8")
      .replace(/\0/g, "")
      .trim();
    return decoded || trimmed;
  } catch {
    return trimmed;
  }
}

function commandLabel(command) {
  return command?.command === "volume"
    ? `volume ${command.value}%`
    : String(command?.command || "desconhecido");
}

function integerOr(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function logTransient(key, message) {
  const now = Date.now();
  const last = warningTimes.get(key) || 0;
  if (now - last < 30000) return;
  warningTimes.set(key, now);
  console.warn(`[radio-player] ${message}`);
}

const commandTimer = setInterval(() => void pollCommands(), 900);
const statusTimer = setInterval(() => void syncStatus(), 2500);

void pollCommands();
void syncStatus();

function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(commandTimer);
  clearInterval(statusTimer);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
