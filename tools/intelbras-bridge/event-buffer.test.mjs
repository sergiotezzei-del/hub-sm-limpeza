import test from "node:test";
import assert from "node:assert/strict";
import { decodeAmt8000EventBufferResponse, decodeAmt8000EventRecord } from "./event-buffer.mjs";

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
