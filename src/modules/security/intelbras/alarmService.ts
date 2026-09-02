import { INTELBRAS_AMT8000_CONFIG, INTELBRAS_KNOWN_PARTITIONS } from "./config";
import type {
  IntelbrasAlarmProvider,
  IntelbrasAuditRecord,
  IntelbrasCommand,
  IntelbrasCommandContext,
  IntelbrasCommandResult,
  IntelbrasPanelSnapshot,
} from "./types";

const waitingMessage = "Agente local somente leitura preparado para eventos 3900. Status atual de partições/zonas ainda aguarda comando oficial comprovado para AMT 8000; arme, desarme e bypass continuam bloqueados.";

function buildWaitingSnapshot(): IntelbrasPanelSnapshot {
  return {
    model: "AMT 8000 LITE",
    panelName: INTELBRAS_AMT8000_CONFIG.panelName,
    online: null,
    batteryActive: null,
    sirenActive: null,
    integrationState: "bridge_setup",
    updatedAt: new Date().toISOString(),
    partitions: INTELBRAS_KNOWN_PARTITIONS.map((partition) => ({ ...partition, state: "unknown" })),
    zones: [],
  };
}

const blockedAudit: IntelbrasAuditRecord[] = [];

const waitingProvider: IntelbrasAlarmProvider = {
  async loadSnapshot() {
    return buildWaitingSnapshot();
  },
  async executeCommand(command: IntelbrasCommand, context: IntelbrasCommandContext): Promise<IntelbrasCommandResult> {
    const requestedAt = new Date().toISOString();
    const result: IntelbrasCommandResult = {
      status: "blocked",
      command,
      message: waitingMessage,
      requestedAt,
    };

    blockedAudit.unshift({
      id: `blocked-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: requestedAt,
      actorName: context.actorName,
      command,
      status: "blocked",
      message: waitingMessage,
    });

    return result;
  },
  async loadAudit() {
    return [...blockedAudit];
  },
};

export function getIntelbrasAlarmProvider(): IntelbrasAlarmProvider {
  return waitingProvider;
}

export function getIntelbrasWaitingMessage() {
  return waitingMessage;
}

export function describeIntelbrasCommand(command: IntelbrasCommand) {
  switch (command.type) {
    case "arm_all":
      return "Ativar todas as partições";
    case "disarm_all":
      return "Desativar todas as partições";
    case "arm_partition":
      return `Ativar partição ${command.partitionId}`;
    case "disarm_partition":
      return `Desativar partição ${command.partitionId}`;
    case "bypass_zone":
      return `Anular zona ${command.zoneId}`;
    case "restore_zone":
      return `Restaurar zona ${command.zoneId}`;
  }
}
