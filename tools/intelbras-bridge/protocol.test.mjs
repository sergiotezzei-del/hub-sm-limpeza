import assert from "node:assert/strict";
import test from "node:test";
import {
  ISEC_COMMANDS,
  IsecStreamParser,
  buildAuthenticationFrame,
  buildIsecFrame,
  checksumIsec,
  encodeRemotePassword,
  parseIsecFrame,
} from "./protocol.mjs";

// Public Intelbras ISEC examples used only as checksum regression vectors.
test("checksum matches known ISEC vectors", () => {
  assert.equal(checksumIsec([0x08, 0xe9, 0x21, 0x31, 0x32, 0x33, 0x34, 0x44, 0x21]), 0x5e);
  assert.equal(checksumIsec([0x08, 0xe9, 0x21, 0x31, 0x32, 0x33, 0x34, 0x5b, 0x21]), 0x41);
});

test("build and parse a keep-alive style frame", () => {
  const frame = buildIsecFrame({ command: ISEC_COMMANDS.KEEP_ALIVE });
  const parsed = parseIsecFrame(frame);
  assert.equal(parsed.command, ISEC_COMMANDS.KEEP_ALIVE);
  assert.equal(parsed.numBytes, 2);
  assert.equal(parsed.data.length, 0);
});

test("remote password stays out of logs and uses SDK zero encoding", () => {
  assert.deepEqual(encodeRemotePassword("102030"), [1, 0x0a, 2, 0x0a, 3, 0x0a]);
  assert.throws(() => encodeRemotePassword("1234"), /6 digits/);
});

test("authentication frame contains F0F0 and 9 data bytes", () => {
  const parsed = parseIsecFrame(buildAuthenticationFrame({ password: "123456" }));
  assert.equal(parsed.command, ISEC_COMMANDS.AUTHENTICATE);
  assert.equal(parsed.numBytes, 11);
  assert.deepEqual([...parsed.data], [0x01, 1, 2, 3, 4, 5, 6, 0x01, 0x00]);
});

test("stream parser handles TCP fragmentation and multiple frames", () => {
  const first = buildIsecFrame({ command: ISEC_COMMANDS.KEEP_ALIVE });
  const second = buildIsecFrame({ command: ISEC_COMMANDS.AUTHENTICATE, data: [0x00] });
  const parser = new IsecStreamParser();
  assert.equal(parser.push(first.subarray(0, 4)).length, 0);
  const result = parser.push(Buffer.concat([first.subarray(4), second]));
  assert.equal(result.length, 2);
  assert.equal(result[0].command, ISEC_COMMANDS.KEEP_ALIVE);
  assert.equal(result[1].command, ISEC_COMMANDS.AUTHENTICATE);
});

test("parser rejects corrupted checksum", () => {
  const frame = Buffer.from(buildIsecFrame({ command: ISEC_COMMANDS.KEEP_ALIVE }));
  frame[frame.length - 1] ^= 0xff;
  assert.throws(() => parseIsecFrame(frame), /checksum/);
});
