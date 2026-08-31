export type IntelbrasIntegrationState = "waiting_sdk" | "disabled" | "ready" | "error";
export type IntelbrasPartitionState = "armed" | "disarmed" | "triggered" | "unknown";
export type IntelbrasZoneState = "closed" | "open" | "bypassed" | "triggered" | "unknown";
export type IntelbrasCommandStatus = "blocked" | "queued" | "success" | "failed";

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
  panelName: string;
  online: boolean | null;
  batteryActive?: boolean | null;
  sirenActive?: boolean | null;
  integrationState: IntelbrasIntegrationState;
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

export type IntelbrasCommandContext = {
  actorUserId: string;
  actorName: string;
  source: "hub_web" | "hub_pwa";
};

export type IntelbrasCommandResult = {
  status: IntelbrasCommandStatus;
  command: IntelbrasCommand;
  message: string;
  requestedAt: string;
};

export type IntelbrasAuditRecord = {
  id: string;
  createdAt: string;
  actorName: string;
  command: IntelbrasCommand;
  status: IntelbrasCommandStatus;
  message: string;
};

export type IntelbrasIntegrationConfig = {
  enabled: boolean;
  transport: "official_sdk" | "local_bridge";
  panelName: string;
  panelModel: "AMT 8000 LITE";
  firmware?: string;
  localIp?: string;
};

export type IntelbrasAlarmProvider = {
  loadSnapshot: () => Promise<IntelbrasPanelSnapshot>;
  executeCommand: (command: IntelbrasCommand, context: IntelbrasCommandContext) => Promise<IntelbrasCommandResult>;
  loadAudit: () => Promise<IntelbrasAuditRecord[]>;
};
