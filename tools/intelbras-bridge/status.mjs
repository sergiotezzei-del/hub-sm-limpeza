function bit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return Boolean((bitmap[byteIndex] ?? 0) & (1 << bitIndex));
}

function partitionState(statusByte) {
  if (statusByte & 0x04) return "triggered";
  return statusByte & 0x01 ? "armed" : "disarmed";
}

function zoneState(zoneIndex, openBitmap, alarmBitmap, bypassBitmap) {
  if (bit(alarmBitmap, zoneIndex)) return "triggered";
  if (bit(bypassBitmap, zoneIndex)) return "bypassed";
  if (bit(openBitmap, zoneIndex)) return "open";
  return "closed";
}

export function parseAmt8000FullStatus(data, partitionNames = {}) {
  const bytes = Buffer.from(data);
  if (bytes.length < 62) {
    throw new Error(`AMT 8000 full status is incomplete: ${bytes.length} data bytes`);
  }

  const modelCode = bytes[0];
  const firmware = `${bytes[1] ?? 0}.${bytes[2] ?? 0}.${bytes[3] ?? 0}`;
  const generalStatus = bytes[20] ?? 0;

  // SDK layout: bytes 22..38 are partition status 0..16.
  // Data array is zero-based, so partition 1 starts at data[22].
  const partitions = Array.from({ length: 16 }, (_, offset) => {
    const id = offset + 1;
    const raw = bytes[21 + id] ?? 0;
    return {
      id,
      name: partitionNames[id] ?? `Partição ${String(id).padStart(2, "0")}`,
      state: partitionState(raw),
      enabled: Boolean(raw & 0x80),
      readyToArm: Boolean(raw & 0x10),
      exitDelay: Boolean(raw & 0x20),
      alarmOccurred: Boolean(raw & 0x08),
      raw,
    };
  });

  const openBitmap = bytes.subarray(38, 46);
  const alarmBitmap = bytes.subarray(46, 54);
  const bypassBitmap = bytes.subarray(54, 62);
  const zones = Array.from({ length: 64 }, (_, zoneIndex) => ({
    id: zoneIndex + 1,
    name: `Zona ${String(zoneIndex + 1).padStart(2, "0")}`,
    state: zoneState(zoneIndex, openBitmap, alarmBitmap, bypassBitmap),
  }));

  const batteryCode = bytes.length >= 135 ? bytes[134] : null;
  const batteryActive = batteryCode === null ? null : batteryCode !== 0x01;
  const clock = bytes.length >= 70
    ? {
        day: bytes[64],
        month: bytes[65],
        year: bytes[66],
        hour: bytes[67],
        minute: bytes[68],
        second: bytes[69],
      }
    : null;

  return {
    modelCode,
    model: modelCode === 0x01 ? "AMT 8000" : `Unknown model 0x${modelCode.toString(16).padStart(2, "0")}`,
    firmware,
    sirenActive: Boolean(generalStatus & 0x02),
    hasTrouble: Boolean(generalStatus & 0x01),
    hasBypassedZones: Boolean(generalStatus & 0x10),
    zonesInAlarm: Boolean(generalStatus & 0x08),
    allZonesClosed: Boolean(generalStatus & 0x04),
    batteryCode,
    batteryActive,
    clock,
    partitions,
    zones,
    rawLength: bytes.length,
  };
}

export function toHubSnapshot(status, { panelName = "Santa Maria" } = {}) {
  return {
    model: "AMT 8000 LITE",
    panelName,
    online: true,
    batteryActive: status.batteryActive,
    sirenActive: status.sirenActive,
    integrationState: "read_only",
    updatedAt: new Date().toISOString(),
    firmware: status.firmware,
    partitions: status.partitions.map(({ id, name, state }) => ({ id, name, state })),
    zones: status.zones.map(({ id, name, state }) => ({ id, name, state })),
  };
}
