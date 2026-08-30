import type { IntelbrasIntegrationConfig } from "./types";

export const INTELBRAS_AMT8000_CONFIG: IntelbrasIntegrationConfig = {
  enabled: false,
  transport: "official_sdk",
  panelName: "Santa Maria",
  panelModel: "AMT 8000 LITE",
  localIp: "192.168.1.100",
};

export const INTELBRAS_KNOWN_PARTITIONS = [
  { id: 1, name: "Sub Solo" },
  { id: 2, name: "Terreo" },
  { id: 3, name: "1 Andar" },
  { id: 4, name: "Externos" },
] as const;
