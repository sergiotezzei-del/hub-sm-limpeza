export type IntelbrasPartitionState = "armed" | "disarmed" | "triggered" | "unknown";
export type IntelbrasZoneState = "closed" | "open" | "bypassed" | "triggered" | "unknown";

export type IntelbrasPartition = {
  id: number;
  name: string;
  state: IntelbrasPartitionState;
};

export type IntelbrasZone = {
  id: number;
  name: string;
  partitionId?: number | null;
  state: IntelbrasZoneState;
};

export type IntelbrasPanelSnapshot = {
  model: "AMT 8000 LITE";
  online: boolean;
  batteryActive?: boolean | null;
  sirenActive?: boolean | null;
  updatedAt: string;
  partitions: IntelbrasPartition[];
  zones: IntelbrasZone[];
};

export type IntelbrasCommand =
  | { type: "arm_all" }
  | { type: "disarm_all" }
  | { type: "arm_partition"; partitionId: number }
  | { type: "disarm_partition"; partitionId: number }
  | { type: "bypass_zone"; zoneId: number }
  | { type: "restore_zone"; zoneId: number };

export type IntelbrasIntegrationConfig = {
  enabled: boolean;
  transport: "official_sdk" | "local_bridge";
  panelName: string;
  panelModel: "AMT 8000 LITE";
  localIp?: string;
};
