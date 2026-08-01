export type PatrimonyPersonType =
  | "funcionario"
  | "corretor_terceirizado"
  | "consultor_terceirizado"
  | "prestador"
  | "temporario"
  | "outro";

export type PatrimonyTrackingMode = "individual" | "quantidade";

export type PatrimonyItemStatus =
  | "disponivel"
  | "em_uso"
  | "parcialmente_em_uso"
  | "manutencao"
  | "indisponivel"
  | "baixado"
  | "extraviado";

export type PatrimonySpaceType = "mesa" | "locker" | "gaveta" | "estoque" | "sala" | "outro";
export type PatrimonySpaceStatus = "disponivel" | "ocupado" | "manutencao" | "inativo";
export type PatrimonyReturnCondition = "bom" | "danificado" | "perdido";

export type OrganizationPerson = {
  id: string;
  name: string;
  personType: PatrimonyPersonType;
  department: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  managedUserId?: string;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PatrimonySpace = {
  id: string;
  code: string;
  name: string;
  spaceType: PatrimonySpaceType;
  department: string;
  locationDetail?: string;
  parentSpaceId?: string;
  status: PatrimonySpaceStatus;
  mapGroup?: string;
  layoutX?: number;
  layoutY?: number;
  layoutWidth?: number;
  layoutHeight?: number;
  layoutRotation?: number;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PatrimonyItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  trackingMode: PatrimonyTrackingMode;
  brand?: string;
  model?: string;
  serialNumber?: string;
  unit: string;
  totalQuantity: number;
  availableQuantity: number;
  maintenanceQuantity: number;
  lostQuantity: number;
  status: PatrimonyItemStatus;
  storageSpaceId?: string;
  linkedSpaceId?: string;
  acquisitionDate?: string;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PatrimonyAssignment = {
  id: string;
  itemId: string;
  personId: string;
  destinationSpaceId?: string;
  quantity: number;
  returnedQuantity: number;
  assignedAt: string;
  returnedAt?: string;
  lastReturnCondition?: PatrimonyReturnCondition;
  assignedByName: string;
  returnedByName?: string;
  notes?: string;
  returnNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PatrimonySpaceAssignment = {
  id: string;
  spaceId: string;
  personId: string;
  assignedAt: string;
  releasedAt?: string;
  assignedByName: string;
  releasedByName?: string;
  notes?: string;
  releaseNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PatrimonyMovementType =
  | "cadastro"
  | "entrada_estoque"
  | "entrega"
  | "devolucao"
  | "transferencia"
  | "ajuste"
  | "manutencao"
  | "baixa"
  | "alocacao_espaco"
  | "liberacao_espaco";

export type PatrimonyMovement = {
  id: string;
  movementType: PatrimonyMovementType;
  itemId?: string;
  assignmentId?: string;
  spaceId?: string;
  spaceAssignmentId?: string;
  personId?: string;
  quantity: number;
  condition?: PatrimonyReturnCondition;
  actorName: string;
  notes?: string;
  createdAt: string;
};

export type PatrimonyDataset = {
  people: OrganizationPerson[];
  items: PatrimonyItem[];
  assignments: PatrimonyAssignment[];
  spaces: PatrimonySpace[];
  spaceAssignments: PatrimonySpaceAssignment[];
  movements: PatrimonyMovement[];
};

export type OrganizationPersonDraft = {
  id?: string;
  name: string;
  personType: PatrimonyPersonType;
  department: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  notes?: string;
};

export type PatrimonyItemDraft = {
  id?: string;
  code: string;
  name: string;
  category: string;
  trackingMode: PatrimonyTrackingMode;
  brand?: string;
  model?: string;
  serialNumber?: string;
  unit: string;
  totalQuantity: number;
  storageSpaceId?: string;
  linkedSpaceId?: string;
  acquisitionDate?: string;
  active?: boolean;
  notes?: string;
};

export type PatrimonySpaceDraft = {
  id?: string;
  code: string;
  name: string;
  spaceType: PatrimonySpaceType;
  department: string;
  locationDetail?: string;
  parentSpaceId?: string;
  mapGroup?: string;
  active?: boolean;
  notes?: string;
};
