export const ISEC_COMMANDS = Object.freeze({
  AUTHENTICATE: 0xf0f0,
  KEEP_ALIVE: 0xf0f7,
  ACK: 0xf0fe,
  NACK: 0xf0fd,
  FULL_STATUS: 0x0b4a,
  EVENT_BUFFER: 0x3900,
  ARM_DISARM: 0x401e,
  BYPASS_ZONE: 0x401f,
});

export const ISEC_ENDPOINTS = Object.freeze({
  PANEL: Object.freeze([0x00, 0x00]),
  PROGRAMMING_SOFTWARE: Object.freeze([0x8f, 0xff]),
});

export function checksumIsec(bytes) {
  let checksum = 0;
  for (const byte of bytes) checksum ^= byte;
  return (checksum ^ 0xff) & 0xff;
}

function assertTwoByteId(value, name) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isInteger(item) || item < 0 || item > 0xff)) {
    throw new Error(`${name} must contain exactly two bytes`);
  }
}

export function buildIsecFrame({ destination = [0x00, 0x00], source = [0x00, 0x00], command, data = [] }) {
  assertTwoByteId(destination, "destination");
  assertTwoByteId(source, "source");
  if (!Number.isInteger(command) || command < 0 || command > 0xffff) throw new Error("command must be a 16-bit integer");
  if (!Array.isArray(data) || data.some((item) => !Number.isInteger(item) || item < 0 || item > 0xff)) throw new Error("data must be an array of bytes");

  const numBytes = 2 + data.length;
  const body = [
    ...destination,
    ...source,
    (numBytes >> 8) & 0xff,
    numBytes & 0xff,
    (command >> 8) & 0xff,
    command & 0xff,
    ...data,
  ];
  return Buffer.from([...body, checksumIsec(body)]);
}

export function encodeRemotePassword(password) {
  if (!/^\d{6}$/.test(password ?? "")) {
    throw new Error("INTELBRAS_REMOTE_PASSWORD must contain exactly 6 digits");
  }
  return [...password].map((digit) => (digit === "0" ? 0x0a : Number(digit)));
}

export function buildAuthenticationFrame({ password, deviceType = 0x01, softwareVersion = [0x01, 0x00], destination, source } = {}) {
  if (!Array.isArray(softwareVersion) || softwareVersion.length !== 2) throw new Error("softwareVersion must contain two bytes");
  return buildIsecFrame({
    destination,
    source,
    command: ISEC_COMMANDS.AUTHENTICATE,
    data: [deviceType, ...encodeRemotePassword(password), ...softwareVersion],
  });
}

export function buildKeepAliveFrame({ destination, source } = {}) {
  return buildIsecFrame({ destination, source, command: ISEC_COMMANDS.KEEP_ALIVE });
}

export function buildAckFrame({ destination, source } = {}) {
  return buildIsecFrame({ destination, source, command: ISEC_COMMANDS.ACK });
}

export function parseIsecFrame(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes.length < 9) throw new Error("ISECNet frame is too short");
  const numBytes = bytes.readUInt16BE(4);
  const expectedLength = 7 + numBytes;
  if (bytes.length !== expectedLength) throw new Error(`ISECNet frame length mismatch: expected ${expectedLength}, got ${bytes.length}`);

  const payloadWithoutChecksum = bytes.subarray(0, -1);
  const expectedChecksum = checksumIsec(payloadWithoutChecksum);
  const actualChecksum = bytes.at(-1);
  if (actualChecksum !== expectedChecksum) throw new Error("ISECNet checksum mismatch");

  return {
    destination: [bytes[0], bytes[1]],
    source: [bytes[2], bytes[3]],
    numBytes,
    command: bytes.readUInt16BE(6),
    data: bytes.subarray(8, -1),
    checksum: actualChecksum,
    raw: bytes,
  };
}

export class IsecStreamParser {
  #buffer = Buffer.alloc(0);

  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const frames = [];

    while (this.#buffer.length >= 6) {
      const numBytes = this.#buffer.readUInt16BE(4);
      if (numBytes < 2 || numBytes > 4096) {
        this.#buffer = this.#buffer.subarray(1);
        continue;
      }
      const frameLength = 7 + numBytes;
      if (this.#buffer.length < frameLength) break;

      const candidate = this.#buffer.subarray(0, frameLength);
      try {
        frames.push(parseIsecFrame(candidate));
        this.#buffer = this.#buffer.subarray(frameLength);
      } catch {
        this.#buffer = this.#buffer.subarray(1);
      }
    }

    return frames;
  }

  get bufferedBytes() {
    return this.#buffer.length;
  }
}

export function authenticationResultLabel(code) {
  return ({
    0x00: "accepted",
    0x01: "incorrect_password",
    0x02: "incorrect_software_version",
    0x03: "callback_required",
    0x04: "waiting_user_permission",
  })[code] ?? `unknown_${code}`;
}
