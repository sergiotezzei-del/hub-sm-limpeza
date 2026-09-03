import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  ISEC_COMMANDS,
  ISEC_ENDPOINTS,
  IsecStreamParser,
  buildIsecFrame,
} from "./protocol.mjs";
import {
  IsecReadOnlyError,
  formatIsecCommand,
  formatIsecId,
  parseIntegerOption,
  readAmt8000EventBuffer,
  validateRemotePassword,
} from "./event-buffer-client.mjs";

test("validates readonly event-buffer client options before opening TCP", () => {
  assert.equal(parseIntegerOption("42", 0, { name: "TEST", min: 1, max: 100 }), 42);
  assert.equal(parseIntegerOption("", 7, { name: "TEST", min: 1, max: 100 }), 7);
  assert.throws(
    () => parseIntegerOption("abc", 0, { name: "TEST", min: 1, max: 100 }),
    /TEST deve ser um inteiro entre 1 e 100/,
  );
  assert.throws(
    () => parseIntegerOption("101", 0, { name: "TEST", min: 1, max: 100 }),
    /TEST deve ser um inteiro entre 1 e 100/,
  );

  assert.doesNotThrow(() => validateRemotePassword("123456"));
  assert.throws(() => validateRemotePassword("12345"), IsecReadOnlyError);
  assert.throws(() => readAmt8000EventBuffer({ password: "12345" }), IsecReadOnlyError);
  assert.throws(() => readAmt8000EventBuffer({ password: "123456", deviceType: 4 }), IsecReadOnlyError);
  assert.throws(() => readAmt8000EventBuffer({ password: "123456", requestRetries: -1 }), IsecReadOnlyError);
});

test("formats sanitized ISEC identifiers and commands for logs", () => {
  assert.equal(formatIsecId([0x8f, 0xff]), "8F FF");
  assert.equal(formatIsecCommand(0x3900), "3900");
});

test("retries a readonly 3900 request once when the panel response is delayed", async () => {
  const panelId = [...ISEC_ENDPOINTS.PANEL];
  const clientId = [...ISEC_ENDPOINTS.PROGRAMMING_SOFTWARE];
  const eventBytes = [
    0x26, 0x08, 0x05, 0x22, 0x20, 0x16,
    0x11, 0x30, 0xff, 0xf0, 0x13, 0x01, 0x00,
  ];
  const logs = [];
  let eventBufferRequests = 0;

  const server = net.createServer((socket) => {
    const parser = new IsecStreamParser();
    socket.on("data", (chunk) => {
      for (const frame of parser.push(chunk)) {
        if (frame.command === ISEC_COMMANDS.AUTHENTICATE) {
          socket.write(buildIsecFrame({
            destination: clientId,
            source: panelId,
            command: ISEC_COMMANDS.AUTHENTICATE,
            data: [0x00],
          }));
        }
        if (frame.command === ISEC_COMMANDS.KEEP_ALIVE) {
          socket.write(buildIsecFrame({
            destination: clientId,
            source: panelId,
            command: ISEC_COMMANDS.ACK,
          }));
        }
        if (frame.command === ISEC_COMMANDS.EVENT_BUFFER) {
          eventBufferRequests += 1;
          if (eventBufferRequests === 1) continue;
          socket.write(buildIsecFrame({
            destination: clientId,
            source: panelId,
            command: ISEC_COMMANDS.EVENT_BUFFER,
            data: [frame.data[0], frame.data[1], ...eventBytes],
          }));
        }
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const result = await readAmt8000EventBuffer({
      host: "127.0.0.1",
      port,
      password: "123456",
      timeoutMs: 1000,
      requestTimeoutMs: 25,
      requestGapMs: 0,
      keepAliveMs: 5000,
      requestRetries: 1,
      scanCount: 1,
      onLog(event) {
        logs.push(event);
      },
    });

    assert.equal(eventBufferRequests, 2);
    assert.equal(result.completedReads, 1);
    assert.equal(result.records[0].index, 0);
    assert.equal(result.records[0].effectiveCode, "130");
    assert.equal(logs.some((event) => event.type === "event-buffer-retry" && event.indexHex === "0000"), true);
    assert.equal(result.warnings.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
