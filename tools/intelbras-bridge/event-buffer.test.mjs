import test from "node:test";
import assert from "node:assert/strict";
import {
  createCircularEventBufferScanPlan,
  dedupeAmt8000EventRecords,
  decodeAmt8000EventBufferResponse,
  decodeAmt8000EventRecord,
  fingerprintAmt8000EventRecord,
  formatAmt8000EventIndex,
  isUsableAmt8000EventRecord,
  parseAmt8000EventTimestamp,
  sanitizeAmt8000EventRecord,
  selectRecentAmt8000EventRecords,
  toAmt8000EventTableRows,
} from "./event-buffer.mjs";

test("decodes one AMT 8000 event record", () => {
  const event = Buffer.from([
    0x26, 0x09, 0x02, 0x13, 0x53, 0x00,
    0x11, 0x30, 0xff, 0xf0, 0x05, 0x01, 0x00,
  ]);
  assert.deepEqual(decodeAmt8000EventRecord(event), {
    timestamp: "2026-09-02 13:53:00",
    eventKind: "new",
    internalCode: "130",
    programmedCode: "FFF",
    effectiveCode: "130",
    zoneOrUser: 5,
    zoneOrUserText: "005",
    partition: 1,
    partitionText: "01",
    pictureAssociated: false,
    pictureFlag: 0,
  });
});

test("decodes index plus one 13-byte record", () => {
  const response = Buffer.from([
    0x00, 0x2a,
    0x26, 0x09, 0x02, 0x13, 0x53, 0x00,
    0x31, 0x30, 0xff, 0xf0, 0x05, 0x01, 0x01,
  ]);
  const decoded = decodeAmt8000EventBufferResponse(response);
  assert.equal(decoded.records.length, 1);
  assert.equal(decoded.records[0].index, 42);
  assert.equal(decoded.records[0].eventKind, "restore");
  assert.equal(decoded.records[0].effectiveCode, "130");
  assert.equal(decoded.records[0].pictureAssociated, true);
  assert.equal(decoded.trailingBytes, 0);
});

test("decodes observed Santa Maria event fields without raw payload logging", () => {
  const response = Buffer.from([
    0x00, 0x00,
    0x26, 0x08, 0x05, 0x22, 0x20, 0x16,
    0x11, 0x30, 0xff, 0xf0, 0x13, 0x01, 0x00,
    0x00, 0x01,
    0x26, 0x08, 0x05, 0x22, 0x20, 0x16,
    0x31, 0x30, 0xff, 0xf0, 0x13, 0x01, 0x00,
  ]);
  const decoded = decodeAmt8000EventBufferResponse(response);
  assert.equal(decoded.records.length, 2);
  assert.equal(decoded.records[0].index, 0);
  assert.equal(decoded.records[0].timestamp, "2026-08-05 22:20:16");
  assert.equal(decoded.records[0].eventKind, "new");
  assert.equal(decoded.records[0].effectiveCode, "130");
  assert.equal(decoded.records[0].zoneOrUser, 13);
  assert.equal(decoded.records[0].partition, 1);
  assert.equal(decoded.records[1].index, 1);
  assert.equal(decoded.records[1].eventKind, "restore");
});

test("rejects impossible event timestamps as unusable", () => {
  const decoded = decodeAmt8000EventRecord(Buffer.alloc(13, 0));
  assert.equal(decoded.timestamp, null);
  assert.equal(decoded.effectiveCode, null);
  assert.equal(isUsableAmt8000EventRecord(decoded), false);
  assert.equal(parseAmt8000EventTimestamp("2026-02-30 12:00:00"), null);
});

test("builds circular scan plan for AMT 8000 buffer range", () => {
  assert.deepEqual(createCircularEventBufferScanPlan({ startIndex: 510, count: 4 }), [510, 511, 0, 1]);
  assert.equal(formatAmt8000EventIndex(0), "0000");
  assert.equal(formatAmt8000EventIndex(511), "01FF");
  assert.throws(() => createCircularEventBufferScanPlan({ startIndex: 512, count: 1 }), /between 0 and 511/);
});

test("selects most recent usable records in chronological order", () => {
  const records = [
    { index: 10, timestamp: "2026-08-05 22:20:16", effectiveCode: "130", eventKind: "new" },
    { index: 11, timestamp: "2026-08-05 22:20:16", effectiveCode: "130", eventKind: "restore" },
    { index: 12, timestamp: null, effectiveCode: "407", eventKind: "new" },
    { index: 13, timestamp: "2026-08-06 01:00:00", effectiveCode: null, eventKind: "new" },
    { index: 14, timestamp: "2026-08-06 02:00:00", effectiveCode: "407", eventKind: "new" },
  ];

  assert.deepEqual(
    selectRecentAmt8000EventRecords(records, { limit: 2 }).map((record) => record.index),
    [11, 14],
  );
});

test("sanitizes and deduplicates event records without raw fields", () => {
  const records = [
    { index: 0, timestamp: "2026-08-05 22:20:16", effectiveCode: "130", eventKind: "new", zoneOrUser: 13, zoneOrUserText: "013", partition: 1, partitionText: "01", pictureAssociated: false },
    { index: 0, timestamp: "2026-08-05 22:20:16", effectiveCode: "130", eventKind: "new", zoneOrUser: 13, zoneOrUserText: "013", partition: 1, partitionText: "01", pictureAssociated: false },
  ];
  assert.equal(dedupeAmt8000EventRecords(records).length, 1);
  assert.equal(fingerprintAmt8000EventRecord(records[0]), "0000|2026-08-05 22:20:16|new|130|013|01");
  assert.deepEqual(sanitizeAmt8000EventRecord(records[0]), {
    timestamp: "2026-08-05 22:20:16",
    index: 0,
    indexHex: "0000",
    eventKind: "new",
    eventCode: "130",
    zoneOrUser: 13,
    partition: 1,
    pictureAssociated: false,
  });
  assert.deepEqual(toAmt8000EventTableRows(records.slice(0, 1)), [{
    "data/hora": "2026-08-05 22:20:16",
    indice: "0000",
    codigo: "130",
    "new/restore": "new",
    "zona/usuario": 13,
    particao: 1,
  }]);
});

test("accepts already sanitized records in recent selection", () => {
  const records = [
    { index: 3, timestamp: "2026-08-05 22:20:16", eventCode: "130", eventKind: "new", zoneOrUser: 13, partition: 1 },
    { index: 4, timestamp: "2026-08-06 22:20:16", eventCode: "407", eventKind: "new", zoneOrUser: null, partition: 1 },
  ];
  assert.deepEqual(selectRecentAmt8000EventRecords(records, { limit: 1 }).map((record) => record.index), [4]);
});
