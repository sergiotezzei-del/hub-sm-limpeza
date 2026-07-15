export type EmployeeId = "neia" | "selma" | "helena";

export type GuardId = "carlos-clemente" | "salomao";

export type UserRole = "tezzei" | EmployeeId | GuardId | (string & {});

export type UserDepartment =
  | "Administração"
  | "Limpeza"
  | "Segurança"
  | "Manutenção"
  | "Estoque"
  | "Café"
  | "Água"
  | "Patrimônio"
  | "Chaves";

export type AppUserType =
  | "Admin"
  | "Limpeza"
  | "Segurança"
  | "Manutenção"
  | "Estoque"
  | "Consulta";

export type UserPermission =
  | "painel-admin"
  | "limpeza"
  | "estoque"
  | "saida-estoque"
  | "cafe"
  | "agua"
  | "seguranca"
  | "guardas"
  | "estacionamento-consulta"
  | "estacionamento-cadastro"
  | "manutencao"
  | "chaves"
  | "patrimonio"
  | "relatorios";

export type ManagedUser = {
  id: string;
  name: string;
  accessCode: string;
  userType: AppUserType;
  jobTitle: string;
  department: UserDepartment;
  active: boolean;
  photoData?: string;
  permissions: UserPermission[];
  linkedEmployeeId?: EmployeeId;
  linkedGuardId?: GuardId;
  protected?: boolean;
  system?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Employee = {
  id: EmployeeId;
  name: string;
  schedule: string;
  lunch: string;
  saturday: string;
};

export type EmployeeProfile = {
  employeeId: EmployeeId;
  photoData?: string;
};

export type Activity = {
  id: string;
  employeeId: EmployeeId;
  pavimento: string;
  ambiente: string;
  atividade: string;
  frequencia: string;
};

export type Product = {
  id: string;
  name: string;
  unit: string;
};

export type InventoryProduct = Product & {
  barcode?: string;
  photoData?: string;
  currentStock: number;
  minStock: number;
};

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  barcode?: string;
  movementType: "saida" | "entrada" | "ajuste";
  quantity: number;
  userId: string;
  userName: string;
  createdAt: string;
  observation?: string;
};

export type OrderStatus = "Novo" | "Pedido feito";

export type OrderItem = {
  id: string;
  productName: string;
  unit: string;
  quantity: number;
  manual?: boolean;
  observation?: string;
};

export type CleaningOrder = {
  id: string;
  data: string;
  hora: string;
  solicitante: "Neia";
  status: OrderStatus;
  itens: OrderItem[];
  deletedAt?: string;
  completedAt?: string;
};

export type StockCheckItem = {
  id: string;
  productName: string;
  unit: string;
  quantity: number;
  observation: string | undefined;
};

export type StockCheck = {
  id: string;
  data: string;
  hora: string;
  conferente: "Neia";
  itens: StockCheckItem[];
};
