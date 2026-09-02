export const AMT8000_EVENT_BUFFER_SIZE = 512;
export const AMT8000_EVENT_RECORD_BYTES = 13;
export const AMT8000_EVENT_BUFFER_RESPONSE_RECORD_BYTES = 15;

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

function timestampFromParts({ year, month, day, hour, minute, second }) {
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) return null;

  const fullYear = 2000 + year;
  if (month < 1 || month > 12) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  const lastDayOfMonth = new Date(Date.UTC(fullYear, month, 0)).getUTCDate();
  if (day < 1 || day > lastDayOfMonth) return null;

  return `${fullYear}-${twoDigits(month)}-${twoDigits(day)} ${twoDigits(hour)}:${twoDigits(minute)}:${twoDigits(second)}`;
}

export function parseAmt8000EventTimestamp(timestamp) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timestamp ?? "");
  if (!match) return null;

  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const millis = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(millis);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return millis;
}

export function formatAmt8000EventIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= AMT8000_EVENT_BUFFER_SIZE) {
    throw new Error(`AMT 8000 event-buffer index must be between 0 and 511, got ${index}`);
  }
  return index.toString(16).padStart(4, "0").toUpperCase();
}

export function createCircularEventBufferScanPlan({ startIndex = 0, count = AMT8000_EVENT_BUFFER_SIZE } = {}) {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= AMT8000_EVENT_BUFFER_SIZE) {
    throw new Error(`startIndex must be between 0 and 511, got ${startIndex}`);
  }
  if (!Number.isInteger(count) || count < 1 || count > AMT8000_EVENT_BUFFER_SIZE) {
    throw new Error(`count must be between 1 and 512, got ${count}`);
  }

  return Array.from({ length: count }, (_, offset) => (startIndex + offset) % AMT8000_EVENT_BUFFER_SIZE);
}

export function decodeAmt8000EventRecord(bytes) {
  const event = Buffer.from(bytes);
  if (event.length !== AMT8000_EVENT_RECORD_BYTES) {
    throw new Error(`AMT 8000 event record must contain ${AMT8000_EVENT_RECORD_BYTES} bytes, got ${event.length}`);
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

  const timestamp = timestampFromParts({ year, month, day, hour, minute, second });

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
    zoneOrUserText: zoneUserText,
    partition: parseNumericDigits(partitionText),
    partitionText,
    pictureAssociated: event[12] === 0x01,
    pictureFlag: event[12],
  };
}

export function decodeAmt8000EventBufferResponse(data) {
  const bytes = Buffer.from(data);
  if (bytes.length < AMT8000_EVENT_BUFFER_RESPONSE_RECORD_BYTES) {
    throw new Error(`AMT 8000 event-buffer response must contain at least ${AMT8000_EVENT_BUFFER_RESPONSE_RECORD_BYTES} bytes, got ${bytes.length}`);
  }

  const records = [];
  let offset = 0;
  while (offset + AMT8000_EVENT_BUFFER_RESPONSE_RECORD_BYTES <= bytes.length) {
    const index = bytes.readUInt16BE(offset);
    const event = decodeAmt8000EventRecord(bytes.subarray(offset + 2, offset + AMT8000_EVENT_BUFFER_RESPONSE_RECORD_BYTES));
    records.push({ index, ...event });
    offset += AMT8000_EVENT_BUFFER_RESPONSE_RECORD_BYTES;
  }

  return { records, trailingBytes: bytes.length - offset };
}

export function isUsableAmt8000EventRecord(record) {
  return parseAmt8000EventTimestamp(record?.timestamp) !== null
    && typeof record.effectiveCode === "string"
    && record.effectiveCode.length > 0;
}

export function sortAmt8000EventRecordsChronologically(records) {
  return [...records].sort((a, b) => {
    const aTimestamp = parseAmt8000EventTimestamp(a.timestamp);
    const bTimestamp = parseAmt8000EventTimestamp(b.timestamp);

    if (aTimestamp === null && bTimestamp === null) return (a.index ?? 0) - (b.index ?? 0);
    if (aTimestamp === null) return 1;
    if (bTimestamp === null) return -1;
    if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;
    return (a.index ?? 0) - (b.index ?? 0);
  });
}

export function selectRecentAmt8000EventRecords(records, { limit = 32 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`recent event limit must be a positive integer, got ${limit}`);
  }

  const chronological = sortAmt8000EventRecordsChronologically(records.filter(isUsableAmt8000EventRecord));
  return chronological.slice(Math.max(0, chronological.length - limit));
}
