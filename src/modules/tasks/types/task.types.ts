export type HubTaskStatus = "a_fazer" | "em_andamento" | "aguardando" | "concluido";
export type HubTaskPriority = "baixa" | "media" | "alta" | "urgente";
export type HubTaskEventType = "criada" | "editada" | "status_alterado" | "concluida" | "reaberta" | "arquivada";

export type HubTask = {
  id: string;
  title: string;
  description?: string;
  status: HubTaskStatus;
  priority: HubTaskPriority;
  department: string;
  assigneeUserId?: string;
  dueDate?: string;
  sortOrder: number;
  showInAlerts: boolean;
  sourceModule?: string;
  sourceServiceRequestId?: string;
  createdByUserId?: string;
  createdByName: string;
  lastActorName: string;
  completedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type HubTaskEvent = {
  id: string;
  taskId: string;
  eventType: HubTaskEventType;
  fromStatus?: HubTaskStatus;
  toStatus?: HubTaskStatus;
  actorName: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type HubTaskDraft = {
  id?: string;
  title: string;
  description: string;
  status: HubTaskStatus;
  priority: HubTaskPriority;
  department: string;
  assigneeUserId: string;
  dueDate: string;
  showInAlerts: boolean;
  sourceModule?: string;
  sourceServiceRequestId?: string;
  sourceServiceRequestProtocol?: string;
};

export type HubTaskNavigationDraft = HubTaskDraft & {
  notice?: string;
};

export type HubTaskDataset = {
  tasks: HubTask[];
  events: HubTaskEvent[];
};
