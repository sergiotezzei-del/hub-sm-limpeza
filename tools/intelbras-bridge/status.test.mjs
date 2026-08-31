import assert from "node:assert/strict";
import test from "node:test";
import { parseAmt8000FullStatus } from "./status.mjs";

test("decodes partition and zone states from official 0B4A layout", () => {
  const data = Buffer.alloc(135, 0);
  data[0] = 0x01;
  data[1] = 0x03;
  data[2] = 0x01;
  data[3] = 0x05;
  data[20] = 0x1a; // siren + alarm + bypass indicators

  // Partition status 0 begins at data[21]; partition 1 at data[22].
  data[22] = 0x81; // enabled + armed
  data[23] = 0x84; // enabled + alarm

  // Zone 1 open, zone 2 in alarm, zone 3 bypassed.
  data[38] = 0b00000001;
  data[46] = 0b00000010;
  data[54] = 0b00000100;
  data[134] = 0x04;

  const status = parseAmt8000FullStatus(data, { 1: "Sub Solo", 2: "Térreo" });
  assert.equal(status.model, "AMT 8000");
  assert.equal(status.firmware, "3.1.5");
  assert.equal(status.sirenActive, true);
  assert.equal(status.batteryActive, true);
  assert.equal(status.partitions[0].name, "Sub Solo");
  assert.equal(status.partitions[0].state, "armed");
  assert.equal(status.partitions[1].state, "triggered");
  assert.equal(status.zones[0].state, "open");
  assert.equal(status.zones[1].state, "triggered");
  assert.equal(status.zones[2].state, "bypassed");
  assert.equal(status.zones[3].state, "closed");
});

test("requires the fixed status prefix through zone bitmaps", () => {
  assert.throws(() => parseAmt8000FullStatus(Buffer.alloc(61)), /incomplete/);
});
