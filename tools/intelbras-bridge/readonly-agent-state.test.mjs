import assert from "node:assert/strict";
import test from "node:test";
import {
  READONLY_STATUS_QUERY_STATE,
  buildReadonlyAgentSnapshot,
  sanitizeAgentError,
} from "./readonly-agent-state.mjs";

test("builds sanitized readonly agent snapshot from a 3900 scan", () => {
  const snapshot = buildReadonlyAgentSnapshot({
    now: new Date("2026-09-02T22:00:00Z"),
    scanResult: {
      authenticated: true,
      startIndex: 0,
      scanCount: 512,
      completedReads: 512,
      eventResponses: 512,
      ackFrames: 1,
      passiveStatusFrames: 0,
      warnings: [],
      unknownFrames: [],
      records: [
        { index: 0, timestamp: "2026-08-05 22:20:16", effectiveCode: "130", eventKind: "new", zoneOrUser: 13, zoneOrUserText: "013", partition: 1, partitionText: "01", pictureAssociated: false },
        { index: 1, timestamp: "2026-08-05 22:20:16", effectiveCode: "130", eventKind: "restore", zoneOrUser: 13, zoneOrUserText: "013", partition: 1, partitionText: "01", pictureAssociated: false },
      ],
    },
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.connection.online, true);
  assert.equal(snapshot.connection.authenticated, true);
  assert.equal(snapshot.mode.readonly, true);
  assert.equal(snapshot.mode.controlCommandsEnabled, false);
  assert.deepEqual(snapshot.mode.activeStatusQuery, READONLY_STATUS_QUERY_STATE);
  assert.equal(snapshot.summary.eventCount, 2);
  assert.deepEqual(snapshot.summary.lastEvent, {
    timestamp: "2026-08-05 22:20:16",
    index: 1,
    indexHex: "0001",
    eventKind: "restore",
    eventCode: "130",
    zoneOrUser: 13,
    partition: 1,
    pictureAssociated: false,
  });
});

test("offline snapshot preserves sanitized history and redacts 6-digit sequences from errors", () => {
  const snapshot = buildReadonlyAgentSnapshot({
    now: new Date("2026-09-02T22:05:00Z"),
    previousEvents: [
      { index: 4, indexHex: "0004", timestamp: "2026-08-06 08:00:00", eventCode: "407", eventKind: "new", zoneOrUser: null, partition: 1, pictureAssociated: false },
    ],
    error: new Error("Falha TCP depois de token 123456"),
  });

  assert.equal(snapshot.connection.online, false);
  assert.equal(snapshot.connection.authenticated, false);
  assert.equal(snapshot.connection.lastError, "Falha TCP depois de token [redacted]");
  assert.equal(snapshot.summary.eventCount, 1);
  assert.equal(snapshot.events[0].eventCode, "407");
  assert.equal(sanitizeAgentError(null), null);
});
