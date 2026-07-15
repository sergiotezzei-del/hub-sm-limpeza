export const vehicleOwnerTypes = ["Funcionário", "Corretor", "Cliente", "Prestador", "Diretoria", "Visitante", "Outro"] as const;

export type VehicleOwnerType = (typeof vehicleOwnerTypes)[number];

export type VehicleRecord = {
  id: string;
  plate: string;
  normalizedPlate: string;
  ownerName: string;
  ownerType: VehicleOwnerType;
  department: string;
  brand: string;
  model: string;
  color: string;
  carPhotoData?: string;
  platePhotoData?: string;
  parkingAuthorized: boolean;
  parkingPriority: boolean;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  source: "Supabase" | "Local";
};

export type VehicleRecordDraft = {
  id?: string;
  plate: string;
  ownerName: string;
  ownerType: VehicleOwnerType;
  department: string;
  brand: string;
  model: string;
  color: string;
  carPhotoData?: string;
  platePhotoData?: string;
  parkingAuthorized: boolean;
  parkingPriority: boolean;
  notes: string;
  active: boolean;
};

export type VehicleLoadState = {
  vehicles: VehicleRecord[];
  remoteReadable: boolean;
  remoteProtected: boolean;
  message?: string;
};
