import assert from "node:assert/strict";
import test from "node:test";
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
});

test("formats sanitized ISEC identifiers and commands for logs", () => {
  assert.equal(formatIsecId([0x8f, 0xff]), "8F FF");
  assert.equal(formatIsecCommand(0x3900), "3900");
});
