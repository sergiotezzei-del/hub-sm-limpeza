export type ServiceRequestStatus =
  | "novo"
  | "em_andamento"
  | "aguardando"
  | "concluido"
  | "cancelado";

export type ServiceRequest = {
  id: string;
  protocolNumber: number;
  requesterName: string;
  department: string;
  requestText: string;
  status: ServiceRequestStatus;
  adminNotes?: string;
  lastActorName: string;
  openedAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
};

export type ServiceRequestEvent = {
  id: string;
  requestId: string;
  eventType: "criado" | "status_alterado" | "anotacao";
  fromStatus?: ServiceRequestStatus;
  toStatus?: ServiceRequestStatus;
  actorName: string;
  note?: string;
  createdAt: string;
};

export type ServiceRequestDataset = {
  requests: ServiceRequest[];
  events: ServiceRequestEvent[];
};

export type PublicServiceRequestDraft = {
  submissionId: string;
  requesterName: string;
  department: string;
  requestText: string;
};

export type PublicServiceRequestReceipt = {
  requestId: string;
  protocolNumber: number;
  openedAt: string;
};
