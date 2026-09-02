import {
  dedupeAmt8000EventRecords,
  sanitizeAmt8000EventRecord,
  selectRecentAmt8000EventRecords,
} from "./event-buffer.mjs";

export const READONLY_STATUS_QUERY_STATE = Object.freeze({
  available: false,
  reason: "no_official_amt8000_read_command_documented",
  note: "0B4A is documented as central-to-device SEND-COMMAND and is not sent as an active query.",
});

export function sanitizeAgentError(error) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\b\d{6}\b/g, "[redacted]");
}

export function buildReadonlyAgentSnapshot({
  previousEvents = [],
  scanResult = null,
  host = "10.11.22.11",
  port = 9009,
  firmware = "3.1.5",
  historyLimit = 200,
  now = new Date(),
  error = null,
} = {}) {
  const scannedRecords = scanResult?.records ?? [];
  const mergedRecords = dedupeAmt8000EventRecords([...previousEvents, ...scannedRecords]);
  const recentRecords = selectRecentAmt8000EventRecords(mergedRecords, { limit: historyLimit });
  const lastEvent = recentRecords.at(-1) ?? null;
  const lastError = sanitizeAgentError(error);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    panel: {
      name: "Santa Maria",
      model: "AMT 8000 LITE",
      firmware,
      host,
      port,
    },
    mode: {
      readonly: true,
      eventSource: "3900_BUFFER_EVENTOS",
      activeStatusQuery: READONLY_STATUS_QUERY_STATE,
      controlCommandsEnabled: false,
    },
    connection: {
      online: Boolean(scanResult && !error),
      authenticated: Boolean(scanResult?.authenticated),
      lastError,
    },
    scan: scanResult ? {
      startIndex: scanResult.startIndex,
      scanCount: scanResult.scanCount,
      completedReads: scanResult.completedReads,
      eventResponses: scanResult.eventResponses,
      ackFrames: scanResult.ackFrames,
      passiveStatusFrames: scanResult.passiveStatusFrames,
      warningCount: scanResult.warnings.length,
      warnings: scanResult.warnings,
      unknownFrameCount: scanResult.unknownFrames.length,
    } : null,
    events: recentRecords.map(sanitizeAmt8000EventRecord),
    summary: {
      eventCount: recentRecords.length,
      lastEvent: lastEvent ? sanitizeAmt8000EventRecord(lastEvent) : null,
      statusCurrentSnapshotAvailable: false,
    },
  };
}
