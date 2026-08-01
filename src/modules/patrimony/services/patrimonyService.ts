import {
  getSupabaseAccessToken,
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";
import type {
  OrganizationPerson,
  OrganizationPersonDraft,
  PatrimonyAssignment,
  PatrimonyDataset,
  PatrimonyItem,
  PatrimonyItemDraft,
  PatrimonyMovement,
  PatrimonyReturnCondition,
  PatrimonySpace,
  PatrimonySpaceAssignment,
  PatrimonySpaceDraft,
} from "../types/patrimony.types";

const REQUEST_TIMEOUT_MS = 12000;

type PersonRow = {
  id: string;
  name: string;
  person_type: OrganizationPerson["personType"];
  department: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  managed_user_id: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  tracking_mode: PatrimonyItem["trackingMode"];
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  unit: string;
  total_quantity: number | string;
  available_quantity: number | string;
  maintenance_quantity: number | string;
  lost_quantity: number | string;
  status: PatrimonyItem["status"];
  storage_space_id: string | null;
  linked_space_id: string | null;
  acquisition_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  item_id: string;
  person_id: string;
  destination_space_id: string | null;
  quantity: number | string;
  returned_quantity: number | string;
  assigned_at: string;
  returned_at: string | null;
  last_return_condition: PatrimonyAssignment["lastReturnCondition"] | null;
  assigned_by_name: string;
  returned_by_name: string | null;
  notes: string | null;
  return_notes: string | null;
  created_at: string;
  updated_at: string;
};

type SpaceRow = {
  id: string;
  code: string;
  name: string;
  space_type: PatrimonySpace["spaceType"];
  department: string;
  location_detail: string | null;
  parent_space_id: string | null;
  status: PatrimonySpace["status"];
  map_group: string | null;
  layout_x: number | string | null;
  layout_y: number | string | null;
  layout_width: number | string | null;
  layout_height: number | string | null;
  layout_rotation: number | string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SpaceAssignmentRow = {
  id: string;
  space_id: string;
  person_id: string;
  assigned_at: string;
  released_at: string | null;
  assigned_by_name: string;
  released_by_name: string | null;
  notes: string | null;
  release_notes: string | null;
  created_at: string;
  updated_at: string;
};

type MovementRow = {
  id: string;
  movement_type: PatrimonyMovement["movementType"];
  item_id: string | null;
  assignment_id: string | null;
  space_id: string | null;
  space_assignment_id: string | null;
  person_id: string | null;
  quantity: number | string;
  condition: PatrimonyMovement["condition"] | null;
  actor_name: string;
  notes: string | null;
  created_at: string;
};

export class PatrimonyRemoteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details = "",
  ) {
    super(message);
    this.name = "PatrimonyRemoteError";
  }
}

export async function loadPatrimonyDataset(): Promise<PatrimonyDataset> {
  const [people, items, assignments, spaces, spaceAssignments, movements] = await Promise.all([
    requestJson<PersonRow[]>("organization_people?select=*&order=active.desc,name.asc"),
    requestJson<ItemRow[]>("patrimony_items?select=*&order=active.desc,name.asc"),
    requestJson<AssignmentRow[]>("patrimony_assignments?select=*&order=assigned_at.desc"),
    requestJson<SpaceRow[]>("patrimony_spaces?select=*&order=space_type.asc,code.asc"),
    requestJson<SpaceAssignmentRow[]>("patrimony_space_assignments?select=*&order=assigned_at.desc"),
    requestJson<MovementRow[]>("patrimony_movements?select=*&order=created_at.desc&limit=300"),
  ]);

  return {
    people: people.map(mapPerson),
    items: items.map(mapItem),
    assignments: assignments.map(mapAssignment),
    spaces: spaces.map(mapSpace),
    spaceAssignments: spaceAssignments.map(mapSpaceAssignment),
    movements: movements.map(mapMovement),
  };
}

export async function saveOrganizationPerson(draft: OrganizationPersonDraft) {
  const id = draft.id ?? crypto.randomUUID();
  const rows = await requestJson<PersonRow[]>("organization_people?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      id,
      name: draft.name.trim(),
      person_type: draft.personType,
      department: draft.department.trim() || "Não informado",
      job_title: cleanOptional(draft.jobTitle),
      email: cleanOptional(draft.email),
      phone: cleanOptional(draft.phone),
      active: draft.active ?? true,
      notes: cleanOptional(draft.notes),
    }]),
  });
  if (!rows[0]) throw new PatrimonyRemoteError(500, "Não foi possível confirmar a pessoa salva.");
  return mapPerson(rows[0]);
}

export async function savePatrimonyItem(draft: PatrimonyItemDraft) {
  const id = draft.id ?? crypto.randomUUID();
  const quantity = draft.trackingMode === "individual" ? 1 : Math.max(0, Number(draft.totalQuantity));
  const current = draft.id
    ? await requestJson<ItemRow[]>(`patrimony_items?id=eq.${encodeURIComponent(draft.id)}&select=*`)
    : [];
  const existing = current[0];
  const usedQuantity = existing
    ? Number(existing.total_quantity) - Number(existing.available_quantity)
    : 0;
  const availableQuantity = Math.max(0, quantity - usedQuantity);

  const rows = await requestJson<ItemRow[]>("patrimony_items?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      id,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      category: draft.category.trim(),
      tracking_mode: draft.trackingMode,
      brand: cleanOptional(draft.brand),
      model: cleanOptional(draft.model),
      serial_number: cleanOptional(draft.serialNumber),
      unit: draft.unit.trim() || "Unidade",
      total_quantity: quantity,
      available_quantity: existing ? availableQuantity : quantity,
      maintenance_quantity: existing ? Number(existing.maintenance_quantity) : 0,
      lost_quantity: existing ? Number(existing.lost_quantity) : 0,
      status: existing?.status ?? "disponivel",
      storage_space_id: draft.storageSpaceId || null,
      linked_space_id: draft.linkedSpaceId || null,
      acquisition_date: draft.acquisitionDate || null,
      active: draft.active ?? true,
      notes: cleanOptional(draft.notes),
    }]),
  });
  if (!rows[0]) throw new PatrimonyRemoteError(500, "Não foi possível confirmar o item salvo.");
  return mapItem(rows[0]);
}

export async function savePatrimonySpace(draft: PatrimonySpaceDraft) {
  const id = draft.id ?? crypto.randomUUID();
  const rows = await requestJson<SpaceRow[]>("patrimony_spaces?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      id,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      space_type: draft.spaceType,
      department: draft.department.trim() || "Não informado",
      location_detail: cleanOptional(draft.locationDetail),
      parent_space_id: draft.parentSpaceId || null,
      map_group: cleanOptional(draft.mapGroup),
      active: draft.active ?? true,
      notes: cleanOptional(draft.notes),
    }]),
  });
  if (!rows[0]) throw new PatrimonyRemoteError(500, "Não foi possível confirmar o espaço salvo.");
  return mapSpace(rows[0]);
}

export async function assignPatrimonyItem(input: {
  operationId?: string;
  itemId: string;
  personId: string;
  quantity: number;
  destinationSpaceId?: string;
  actorName: string;
  notes?: string;
}) {
  return requestJson<Array<{ assignment_id: string; item_status: string; available_quantity: number | string }>>(
    "rpc/register_patrimony_assignment",
    {
      method: "POST",
      body: JSON.stringify({
        p_assignment_id: input.operationId ?? crypto.randomUUID(),
        p_item_id: input.itemId,
        p_person_id: input.personId,
        p_quantity: input.quantity,
        p_destination_space_id: input.destinationSpaceId || null,
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
      }),
    },
  );
}

export async function returnPatrimonyAssignment(input: {
  assignmentId: string;
  quantity: number;
  condition: PatrimonyReturnCondition;
  actorName: string;
  notes?: string;
}) {
  return requestJson<Array<{ assignment_id: string; item_status: string; available_quantity: number | string }>>(
    "rpc/return_patrimony_assignment",
    {
      method: "POST",
      body: JSON.stringify({
        p_assignment_id: input.assignmentId,
        p_quantity: input.quantity,
        p_condition: input.condition,
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
      }),
    },
  );
}

export async function assignPatrimonySpace(input: {
  operationId?: string;
  spaceId: string;
  personId: string;
  actorName: string;
  notes?: string;
}) {
  return requestJson<Array<{ space_assignment_id: string; space_status: string }>>(
    "rpc/assign_patrimony_space",
    {
      method: "POST",
      body: JSON.stringify({
        p_space_assignment_id: input.operationId ?? crypto.randomUUID(),
        p_space_id: input.spaceId,
        p_person_id: input.personId,
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
      }),
    },
  );
}

export async function releasePatrimonySpace(input: {
  spaceAssignmentId: string;
  actorName: string;
  notes?: string;
}) {
  return requestJson<Array<{ space_assignment_id: string; space_status: string }>>(
    "rpc/release_patrimony_space",
    {
      method: "POST",
      body: JSON.stringify({
        p_space_assignment_id: input.spaceAssignmentId,
        p_actor_name: input.actorName,
        p_notes: cleanOptional(input.notes),
      }),
    },
  );
}

export function getPatrimonyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  const normalized = normalize(message);

  if (normalized.includes("SEM PERMISSAO")) return "A sessão de administrador não está válida. Entre novamente.";
  if (normalized.includes("QUANTIDADE INDISPONIVEL")) return message.replace("Disponivel", "Disponível");
  if (normalized.includes("ITEM NAO ENCONTRADO")) return "O item não existe ou está inativo.";
  if (normalized.includes("PESSOA NAO ENCONTRADA")) return "A pessoa não existe ou está inativa.";
  if (normalized.includes("ESPACO JA OCUPADO")) return "Este espaço já está ocupado.";
  if (normalized.includes("ESPACO NAO DISPONIVEL")) return "Este espaço não está disponível.";
  if (normalized.includes("DUPLICATE") || normalized.includes("UNIQUE")) return "Já existe um cadastro com este código ou número de série.";
  if (error instanceof PatrimonyRemoteError && (error.status === 401 || error.status === 403)) {
    return "A sessão de administrador expirou. Entre novamente.";
  }
  if (error instanceof PatrimonyRemoteError && error.status >= 500) {
    return "O Supabase apresentou uma falha temporária. Tente novamente.";
  }
  return message || "Não foi possível concluir a operação.";
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  ensureReady();
  const token = getSupabaseAccessToken();
  if (!token) throw new PatrimonyRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        [SUPABASE_KEY_HEADER]: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new PatrimonyRemoteError(response.status, parseRemoteMessage(details) || `Erro online: ${response.status}`, details);
    }

    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof PatrimonyRemoteError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PatrimonyRemoteError(408, "Tempo esgotado ao conectar com o Supabase.");
    }
    throw new PatrimonyRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function ensureReady() {
  if (!supabaseConfigured) throw new PatrimonyRemoteError(0, "Supabase não configurado.");
}

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean || null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function parseRemoteMessage(details: string) {
  if (!details) return "";
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    return [parsed.message, parsed.details, parsed.hint].filter((value): value is string => typeof value === "string" && Boolean(value)).join(" ");
  } catch {
    return details;
  }
}

function mapPerson(row: PersonRow): OrganizationPerson {
  return {
    id: row.id,
    name: row.name,
    personType: row.person_type,
    department: row.department,
    jobTitle: row.job_title ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    managedUserId: row.managed_user_id ?? undefined,
    active: row.active,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: ItemRow): PatrimonyItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    trackingMode: row.tracking_mode,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    unit: row.unit,
    totalQuantity: Number(row.total_quantity),
    availableQuantity: Number(row.available_quantity),
    maintenanceQuantity: Number(row.maintenance_quantity),
    lostQuantity: Number(row.lost_quantity),
    status: row.status,
    storageSpaceId: row.storage_space_id ?? undefined,
    linkedSpaceId: row.linked_space_id ?? undefined,
    acquisitionDate: row.acquisition_date ?? undefined,
    active: row.active,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssignment(row: AssignmentRow): PatrimonyAssignment {
  return {
    id: row.id,
    itemId: row.item_id,
    personId: row.person_id,
    destinationSpaceId: row.destination_space_id ?? undefined,
    quantity: Number(row.quantity),
    returnedQuantity: Number(row.returned_quantity),
    assignedAt: row.assigned_at,
    returnedAt: row.returned_at ?? undefined,
    lastReturnCondition: row.last_return_condition ?? undefined,
    assignedByName: row.assigned_by_name,
    returnedByName: row.returned_by_name ?? undefined,
    notes: row.notes ?? undefined,
    returnNotes: row.return_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSpace(row: SpaceRow): PatrimonySpace {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    spaceType: row.space_type,
    department: row.department,
    locationDetail: row.location_detail ?? undefined,
    parentSpaceId: row.parent_space_id ?? undefined,
    status: row.status,
    mapGroup: row.map_group ?? undefined,
    layoutX: numberOrUndefined(row.layout_x),
    layoutY: numberOrUndefined(row.layout_y),
    layoutWidth: numberOrUndefined(row.layout_width),
    layoutHeight: numberOrUndefined(row.layout_height),
    layoutRotation: numberOrUndefined(row.layout_rotation),
    active: row.active,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSpaceAssignment(row: SpaceAssignmentRow): PatrimonySpaceAssignment {
  return {
    id: row.id,
    spaceId: row.space_id,
    personId: row.person_id,
    assignedAt: row.assigned_at,
    releasedAt: row.released_at ?? undefined,
    assignedByName: row.assigned_by_name,
    releasedByName: row.released_by_name ?? undefined,
    notes: row.notes ?? undefined,
    releaseNotes: row.release_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMovement(row: MovementRow): PatrimonyMovement {
  return {
    id: row.id,
    movementType: row.movement_type,
    itemId: row.item_id ?? undefined,
    assignmentId: row.assignment_id ?? undefined,
    spaceId: row.space_id ?? undefined,
    spaceAssignmentId: row.space_assignment_id ?? undefined,
    personId: row.person_id ?? undefined,
    quantity: Number(row.quantity),
    condition: row.condition ?? undefined,
    actorName: row.actor_name,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function numberOrUndefined(value: number | string | null) {
  if (value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
