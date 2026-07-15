import type { VehicleLoadState, VehicleOwnerType, VehicleRecord, VehicleRecordDraft } from "../types/vehicle.types";
import { getSupabaseAccessToken, SUPABASE_KEY_HEADER, SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseConfigured } from "./supabaseClient";

const VEHICLE_RECORDS_KEY = "hub-sm-vehicle-records";
const VEHICLE_REQUEST_TIMEOUT_MS = 8000;

type VehicleRecordRow = {
  id: string;
  plate: string;
  normalized_plate: string;
  owner_name: string | null;
  owner_type: VehicleOwnerType | null;
  department: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  car_photo_data: string | null;
  plate_photo_data: string | null;
  parking_authorized: boolean | null;
  parking_priority: boolean | null;
  notes: string | null;
  active: boolean | null;
  created_at: string;
  updated_at: string;
};

class VehicleRemoteError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super(details || `VEHICLE_REMOTE_ERROR_${status}`);
    this.name = "VehicleRemoteError";
  }
}

export async function loadVehicleRecords(): Promise<VehicleLoadState> {
  if (!supabaseConfigured) {
    return {
      vehicles: getLocalVehicleRecords(),
      remoteReadable: false,
      remoteProtected: false,
      message: "Supabase não configurado. Exibindo registros deste aparelho.",
    };
  }

  try {
    const response = await vehicleRequest("vehicle_records?select=*&order=owner_name.asc");
    const vehicles = ((await response.json()) as VehicleRecordRow[]).map(mapVehicleRow);
    saveLocalVehicleRecords(vehicles);
    return {
      vehicles,
      remoteReadable: true,
      remoteProtected: false,
    };
  } catch (error) {
    return {
      vehicles: getLocalVehicleRecords(),
      remoteReadable: false,
      remoteProtected: isVehicleRemoteProtectedError(error),
      message: isVehicleRemoteProtectedError(error)
        ? "Cadastro de veículos protegido por RLS. Faça login com sessão Supabase autorizada."
        : "Erro ao carregar veículos. Exibindo registros deste aparelho.",
    };
  }
}

export async function saveVehicleRecord(draft: VehicleRecordDraft): Promise<{ vehicle: VehicleRecord; message: string }> {
  const normalized = normalizeVehicleDraft(draft);
  const accessToken = getSupabaseAccessToken();

  if (!supabaseConfigured || !accessToken) {
    throw new Error("Sessão Supabase autorizada não encontrada para salvar veículo.");
  }

  const path = normalized.id
    ? `vehicle_records?id=eq.${encodeURIComponent(normalized.id)}`
    : "vehicle_records?on_conflict=normalized_plate";
  const response = await vehicleRequest(path, {
    method: normalized.id ? "PATCH" : "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(normalized.id ? vehicleDraftToRow(normalized) : [vehicleDraftToRow(normalized)]),
  });
  const row = ((await response.json()) as VehicleRecordRow[])[0];
  if (!row?.id) throw new Error("Não foi possível confirmar o veículo salvo.");

  const vehicle = mapVehicleRow(row);
  upsertLocalVehicleRecord(vehicle);
  return { vehicle, message: "Veículo salvo no Supabase." };
}

export function normalizeVehiclePlate(plate: string) {
  return plate
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function createBlankVehicleDraft(plate = "", platePhotoData = ""): VehicleRecordDraft {
  return {
    plate,
    ownerName: "",
    ownerType: "Funcionário",
    department: "",
    brand: "",
    model: "",
    color: "",
    platePhotoData: platePhotoData || undefined,
    parkingAuthorized: true,
    parkingPriority: false,
    notes: "",
    active: true,
  };
}

export function vehicleToDraft(vehicle: VehicleRecord): VehicleRecordDraft {
  return {
    id: vehicle.id,
    plate: vehicle.plate,
    ownerName: vehicle.ownerName,
    ownerType: vehicle.ownerType,
    department: vehicle.department,
    brand: vehicle.brand,
    model: vehicle.model,
    color: vehicle.color,
    carPhotoData: vehicle.carPhotoData,
    platePhotoData: vehicle.platePhotoData,
    parkingAuthorized: vehicle.parkingAuthorized,
    parkingPriority: vehicle.parkingPriority,
    notes: vehicle.notes,
    active: vehicle.active,
  };
}

function vehicleRequest(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), VEHICLE_REQUEST_TIMEOUT_MS);
  const accessToken = getSupabaseAccessToken();

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  }).then(async (response) => {
    if (!response.ok) throw new VehicleRemoteError(response.status, await response.text());
    return response;
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function vehicleDraftToRow(draft: VehicleRecordDraft) {
  return {
    plate: draft.plate.trim().toUpperCase(),
    normalized_plate: normalizeVehiclePlate(draft.plate),
    owner_name: nullableText(draft.ownerName),
    owner_type: draft.ownerType,
    department: nullableText(draft.department),
    brand: nullableText(draft.brand),
    model: nullableText(draft.model),
    color: nullableText(draft.color),
    car_photo_data: nullableText(draft.carPhotoData),
    plate_photo_data: nullableText(draft.platePhotoData),
    parking_authorized: draft.parkingAuthorized,
    parking_priority: draft.parkingPriority,
    notes: nullableText(draft.notes),
    active: draft.active,
  };
}

function mapVehicleRow(row: VehicleRecordRow): VehicleRecord {
  return {
    id: row.id,
    plate: row.plate,
    normalizedPlate: row.normalized_plate,
    ownerName: row.owner_name ?? "",
    ownerType: row.owner_type ?? "Funcionário",
    department: row.department ?? "",
    brand: row.brand ?? "",
    model: row.model ?? "",
    color: row.color ?? "",
    carPhotoData: row.car_photo_data ?? undefined,
    platePhotoData: row.plate_photo_data ?? undefined,
    parkingAuthorized: row.parking_authorized ?? true,
    parkingPriority: row.parking_priority ?? false,
    notes: row.notes ?? "",
    active: row.active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: "Supabase",
  };
}

function normalizeVehicleDraft(draft: VehicleRecordDraft): VehicleRecordDraft {
  return {
    ...draft,
    plate: draft.plate.trim(),
    ownerName: draft.ownerName.trim(),
    department: draft.department.trim(),
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    color: draft.color.trim(),
    notes: draft.notes.trim(),
  };
}

function getLocalVehicleRecords(): VehicleRecord[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(VEHICLE_RECORDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as VehicleRecord[];
    return Array.isArray(parsed) ? parsed.map((vehicle) => ({ ...vehicle, source: "Local" as const })) : [];
  } catch {
    return [];
  }
}

function saveLocalVehicleRecords(vehicles: VehicleRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VEHICLE_RECORDS_KEY, JSON.stringify(vehicles));
}

function upsertLocalVehicleRecord(vehicle: VehicleRecord) {
  const records = getLocalVehicleRecords();
  const exists = records.some((current) => current.id === vehicle.id || current.normalizedPlate === vehicle.normalizedPlate);
  saveLocalVehicleRecords(exists
    ? records.map((current) => (current.id === vehicle.id || current.normalizedPlate === vehicle.normalizedPlate ? vehicle : current))
    : [...records, vehicle]);
}

function isVehicleRemoteProtectedError(error: unknown) {
  if (!(error instanceof VehicleRemoteError)) return false;
  const details = error.details.toLowerCase();
  return error.status === 401
    || error.status === 403
    || details.includes("permission denied")
    || details.includes("row-level security");
}

function nullableText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
