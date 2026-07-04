export type EmployeeId = "neia" | "selma" | "helena";

export type UserRole = "tezzei" | EmployeeId;

export type Employee = {
  id: EmployeeId;
  name: string;
  schedule: string;
  lunch: string;
  saturday: string;
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
};
