import type { IntelbrasIntegrationConfig } from "./types";

export const INTELBRAS_AMT8000_CONFIG: IntelbrasIntegrationConfig = {
  enabled: false,
  transport: "local_bridge",
  panelName: "Santa Maria",
  panelModel: "AMT 8000 LITE",
  firmware: "3.1.5",
  localIp: "10.11.22.11",
  localPort: 9009,
  sdkReceived: true,
  readOnlyBridgeReady: false,
};

export const INTELBRAS_KNOWN_PARTITIONS = [
  { id: 1, name: "Sub Solo" },
  { id: 2, name: "Térreo" },
  { id: 3, name: "1 Andar" },
  { id: 4, name: "Externos" },
  { id: 5, name: "Partição 05" },
  { id: 6, name: "Partição 06" },
  { id: 7, name: "Partição 07" },
  { id: 8, name: "Partição 08" },
  { id: 9, name: "Partição 09" },
  { id: 10, name: "Partição 10" },
  { id: 11, name: "Partição 11" },
  { id: 12, name: "Partição 12" },
  { id: 13, name: "Partição 13" },
  { id: 14, name: "Partição 14" },
  { id: 15, name: "Partição 15" },
  { id: 16, name: "Partição 16" },
] as const;
