export type AuditorioStatus = "pendente" | "aprovado" | "recusado" | "cancelado" | "concluido";

export type AuditorioEventType =
  | "lancamento"
  | "treinamento"
  | "reuniao"
  | "palestra"
  | "evento_interno"
  | "apresentacao"
  | "outro";

export type AuditorioFoodType = "nao" | "coffee_break" | "buffet";

export type AuditorioFoodResponsible =
  | "santa_maria"
  | "construtora"
  | "empresa_evento"
  | "outro";

export type AuditorioReservedSlot = {
  date: string;
  start: string;
  end: string;
  label: "Reservado";
};

export type AuditorioAvailability = {
  monthStart: string;
  monthEnd: string;
  timezone: string;
  dayStart: string;
  dayEnd: string;
  timeStepMinutes: number;
  reservedSlots: AuditorioReservedSlot[];
};

export type PublicAuditorioRequestDraft = {
  submissionId: string;
  accessCode: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string;
  requesterDepartment?: string;
  requesterCompany?: string;
  eventType: AuditorioEventType;
  eventName: string;
  launchName?: string;
  builderName?: string;
  eventDate: string;
  setupTime: string;
  startTime: string;
  endTime: string;
  teardownTime: string;
  peopleCount: number;
  foodType: AuditorioFoodType;
  foodResponsible?: AuditorioFoodResponsible | "";
  foodResponsibleOther?: string;
  needsProjector: boolean;
  needsMicrophone: boolean;
  needsSound: boolean;
  needsChairs: boolean;
  needsTables: boolean;
  specialNeeds?: string;
  notes?: string;
  website?: string;
};

export type PublicAuditorioReceipt = {
  reservationId: string;
  protocolNumber: number;
  protocol: string;
  createdAt: string;
  status: AuditorioStatus;
  accessCode: string;
};

export type PublicAuditorioStatus = {
  id: string;
  protocol: string;
  protocolNumber: number;
  eventName: string;
  eventType: AuditorioEventType;
  eventTypeLabel: string;
  eventDate: string;
  setupTime: string;
  startTime: string;
  endTime: string;
  teardownTime: string;
  status: AuditorioStatus;
  statusLabel: string;
  adminNote?: string | null;
  peopleCount: number;
  foodType: AuditorioFoodType;
  foodTypeLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditorioReservation = PublicAuditorioStatus & {
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string | null;
  requesterDepartment?: string | null;
  requesterCompany?: string | null;
  launchName?: string | null;
  builderName?: string | null;
  reservationStart: string;
  reservationEnd: string;
  foodResponsible?: AuditorioFoodResponsible | null;
  foodResponsibleLabel?: string | null;
  foodResponsibleOther?: string | null;
  needsProjector: boolean;
  needsMicrophone: boolean;
  needsSound: boolean;
  needsChairs: boolean;
  needsTables: boolean;
  specialNeeds?: string | null;
  notes?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  refusedBy?: string | null;
  refusedByName?: string | null;
  refusedAt?: string | null;
  canceledBy?: string | null;
  canceledByName?: string | null;
  canceledAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
};

export type AuditorioReservationEvent = {
  id: string;
  reservationId: string;
  type: string;
  actorId?: string | null;
  actorName?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AuditorioNotification = {
  id: string;
  reservationId: string;
  recipientId?: string | null;
  type: string;
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
};

export type AuditorioDashboard = {
  reservations: AuditorioReservation[];
  events: AuditorioReservationEvent[];
  notifications: AuditorioNotification[];
  generatedAt: string;
};

export type AuditorioDecision = "aprovar" | "recusar" | "cancelar" | "concluir";
