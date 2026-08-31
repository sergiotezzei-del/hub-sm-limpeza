import type { IntelbrasIntegrationConfig } from "./types";

export const INTELBRAS_AMT8000_CONFIG: IntelbrasIntegrationConfig = {
  enabled: false,
  transport: "official_sdk",
  panelName: "Santa Maria",
  panelModel: "AMT 8000 LITE",
  firmware: "3.1.5",
  localIp: "192.168.1.100",
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
] as const;
