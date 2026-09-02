function bcdByte(value) {
  const hi = (value >> 4) & 0x0f;
  const lo = value & 0x0f;
  if (hi > 9 || lo > 9) return null;
  return (hi * 10) + lo;
}

function eventDigit(nibble) {
  if (nibble === 0x0a) return "0";
  if (nibble >= 0x00 && nibble <= 0x09) return String(nibble);
  if (nibble >= 0x0b && nibble <= 0x0f) return nibble.toString(16).toUpperCase();
  return "?";
}

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

function parseNumericDigits(text) {
  return /^\d+$/.test(text) ? Number(text) : null;
}

export function decodeAmt8000EventRecord(bytes) {
  const event = Buffer.from(bytes);
  if (event.length !== 13) {
    throw new Error(`AMT 8000 event record must contain 13 bytes, got ${event.length}`);
  }

  const year = bcdByte(event[0]);
  const month = bcdByte(event[1]);
  const day = bcdByte(event[2]);
  const hour = bcdByte(event[3]);
  const minute = bcdByte(event[4]);
  const second = bcdByte(event[5]);

  const newRestoreNibble = (event[6] >> 4) & 0x0f;
  const internalCode = [
    eventDigit(event[6] & 0x0f),
    eventDigit((event[7] >> 4) & 0x0f),
    eventDigit(event[7] & 0x0f),
  ].join("");
  const programmedCode = [
    eventDigit((event[8] >> 4) & 0x0f),
    eventDigit(event[8] & 0x0f),
    eventDigit((event[9] >> 4) & 0x0f),
  ].join("");
  const zoneUserText = [
    eventDigit(event[9] & 0x0f),
    eventDigit((event[10] >> 4) & 0x0f),
    eventDigit(event[10] & 0x0f),
  ].join("");
  const partitionText = [
    eventDigit((event[11] >> 4) & 0x0f),
    eventDigit(event[11] & 0x0f),
  ].join("");

  const timestamp = [year, month, day, hour, minute, second].every(Number.isInteger)
    ? `20${twoDigits(year)}-${twoDigits(month)}-${twoDigits(day)} ${twoDigits(hour)}:${twoDigits(minute)}:${twoDigits(second)}`
    : null;

  let effectiveCode = programmedCode;
  if (programmedCode === "FFF") effectiveCode = internalCode;
  if (programmedCode === "000" || programmedCode === "AAA") effectiveCode = null;

  return {
    timestamp,
    eventKind: newRestoreNibble === 0x01 ? "new" : newRestoreNibble === 0x03 ? "restore" : `unknown_${newRestoreNibble.toString(16).toUpperCase()}`,
    internalCode,
    programmedCode,
    effectiveCode,
    zoneOrUser: parseNumericDigits(zoneUserText),
    zoneOrUserText,
    partition: parseNumericDigits(partitionText),
    partitionText,
    pictureAssociated: event[12] === 0x01,
    pictureFlag: event[12],
  };
}

export function decodeAmt8000EventBufferResponse(data) {
  const bytes = Buffer.from(data);
  if (bytes.length < 15) {
    throw new Error(`AMT 8000 event-buffer response must contain at least 15 bytes, got ${bytes.length}`);
  }

  const records = [];
  let offset = 0;
  while (offset + 15 <= bytes.length) {
    const index = bytes.readUInt16BE(offset);
    const event = decodeAmt8000EventRecord(bytes.subarray(offset + 2, offset + 15));
    records.push({ index, ...event });
    offset += 15;
  }

  return { records, trailingBytes: bytes.length - offset };
}
