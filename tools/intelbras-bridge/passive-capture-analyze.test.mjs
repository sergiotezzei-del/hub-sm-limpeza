import assert from "node:assert/strict";
import test from "node:test";
import {
  ISEC_COMMANDS,
  ISEC_ENDPOINTS,
  buildAuthenticationFrame,
  buildIsecFrame,
  buildKeepAliveFrame,
} from "./protocol.mjs";
import {
  analyzeIsecPayloadSegments,
  parseTsharkPayloadTsv,
} from "./passive-capture-analyze.mjs";

function payloadHex(bytes) {
  return Buffer.from(bytes).toString("hex").match(/../g).join(":");
}

function tsvLine({ frame, stream = 0, src, srcPort, dst, dstPort, payload }) {
  return [
    frame,
    `178000000${frame}.000000`,
    stream,
    src,
    srcPort,
    dst,
    dstPort,
    payloadHex(payload),
  ].join("\t");
}

test("analyzes passive tshark payloads without exposing authentication data", () => {
  const host = "192.168.1.50";
  const panel = "10.11.22.11";
  const hostPort = 51000;
  const panelPort = 9009;
  const panelId = [...ISEC_ENDPOINTS.PANEL];
  const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];
  const statusData = Buffer.alloc(135, 0);
  statusData[0] = 0x01;
  statusData[1] = 0x03;
  statusData[2] = 0x01;
  statusData[3] = 0x05;
  statusData[20] = 0x03;
  statusData[22] = 0x81;
  statusData[38] = 0x01;
  statusData[134] = 0x04;

  const auth = buildAuthenticationFrame({
    password: "123456",
    deviceType: 1,
    destination: panelId,
    source: clientId,
  });
  const keepAlive = buildKeepAliveFrame({ destination: panelId, source: clientId });
  const eventBuffer = buildIsecFrame({
    destination: panelId,
    source: clientId,
    command: ISEC_COMMANDS.EVENT_BUFFER,
    data: [0x00, 0x2a],
  });
  const fullStatus = buildIsecFrame({
    destination: clientId,
    source: panelId,
    command: ISEC_COMMANDS.FULL_STATUS,
    data: [...statusData],
  });

  const tsv = [
    tsvLine({ frame: 1, src: host, srcPort: hostPort, dst: panel, dstPort: panelPort, payload: auth }),
    tsvLine({ frame: 2, src: host, srcPort: hostPort, dst: panel, dstPort: panelPort, payload: keepAlive }),
    tsvLine({ frame: 3, src: host, srcPort: hostPort, dst: panel, dstPort: panelPort, payload: eventBuffer }),
    tsvLine({ frame: 4, src: panel, srcPort: panelPort, dst: host, dstPort: hostPort, payload: fullStatus }),
  ].join("\n");

  const analysis = analyzeIsecPayloadSegments(parseTsharkPayloadTsv(tsv), {
    panelHost: panel,
    panelPort,
    generatedAt: new Date("2026-09-03T12:00:00Z"),
  });

  assert.equal(analysis.summary.payloadSegments, 4);
  assert.equal(analysis.summary.decodedFrames, 4);
  assert.equal(analysis.summary.passiveFullStatusFrames, 1);
  assert.equal(analysis.summary.hostToPanelFullStatusFrames, 0);
  assert.equal(analysis.summary.controlCommandsObserved, 0);
  assert.equal(JSON.stringify(analysis).includes("123456"), false);

  const authFrame = analysis.frames.find((frame) => frame.command === "F0F0");
  assert.equal(authFrame.sensitiveDataRedacted, true);
  assert.equal(authFrame.details.passwordPayload, "[redacted]");

  const eventFrame = analysis.frames.find((frame) => frame.command === "3900");
  assert.equal(eventFrame.details.eventIndexHex, "002A");

  const statusFrame = analysis.frames.find((frame) => frame.command === "0B4A");
  assert.deepEqual(statusFrame.details.armedPartitions, [1]);
  assert.deepEqual(statusFrame.details.openZones, [1]);
  assert.equal(statusFrame.details.sirenActive, true);
});

test("reassembles fragmented TCP payloads by stream and direction", () => {
  const host = "192.168.1.50";
  const panel = "10.11.22.11";
  const frame = buildIsecFrame({
    destination: [...ISEC_ENDPOINTS.PANEL],
    source: [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE],
    command: ISEC_COMMANDS.EVENT_BUFFER,
    data: [0x01, 0xff],
  });
  const firstHalf = frame.subarray(0, 5);
  const secondHalf = frame.subarray(5);
  const tsv = [
    tsvLine({ frame: 1, stream: 7, src: host, srcPort: 51000, dst: panel, dstPort: 9009, payload: firstHalf }),
    tsvLine({ frame: 2, stream: 7, src: host, srcPort: 51000, dst: panel, dstPort: 9009, payload: secondHalf }),
  ].join("\n");

  const analysis = analyzeIsecPayloadSegments(parseTsharkPayloadTsv(tsv), {
    panelHost: panel,
    panelPort: 9009,
    generatedAt: new Date("2026-09-03T12:00:00Z"),
  });

  assert.equal(analysis.summary.decodedFrames, 1);
  assert.equal(analysis.frames[0].command, "3900");
  assert.equal(analysis.frames[0].details.eventIndexHex, "01FF");
});
