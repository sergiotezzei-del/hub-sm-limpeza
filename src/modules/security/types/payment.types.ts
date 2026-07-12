import type { GuardId } from "../../../types";

export type GuardPaymentStatus = "PENDENTE" | "ENVIADO AO FINANCEIRO" | "PAGO";

export type GuardPaymentProfile = {
  id: string;
  guardId: GuardId;
  operationalName: string;
  paymentName: string;
  bankName: string;
  agency: string;
  accountType: string;
  accountNumber: string;
  cpf: string;
  pix: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source: "Supabase" | "Local";
};

export type GuardPaymentRecord = {
  id: string;
  paymentDate: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  guardId: GuardId;
  guardDisplayName: string;
  baseAmount: number;
  holidayExtraAmount: number;
  shiftExtraAmount: number;
  extraDescription: string;
  totalAmount: number;
  status: GuardPaymentStatus;
  notes: string;
  financeMessage: string;
  createdAt: string;
  updatedAt: string;
  source: "Supabase" | "Local";
};

export type GuardPaymentLoadState = {
  profiles: GuardPaymentProfile[];
  records: GuardPaymentRecord[];
  remoteReadable: boolean;
  remoteProtected: boolean;
  message?: string;
};
