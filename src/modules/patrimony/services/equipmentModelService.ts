import {
  authenticatedSupabaseFetch,
  SupabaseAuthSessionRequiredError,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";
import type {
  PatrimonyEquipmentModel,
  PatrimonyEquipmentModelDraft,
} from "../types/patrimony.types";

const REQUEST_TIMEOUT_MS = 10000;

type EquipmentModelRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  description: string;
  active: boolean;
  sort_order: number | string;
  created_at: string;
  updated_at: string;
};

class EquipmentModelRemoteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "EquipmentModelRemoteError";
  }
}

export async function loadEquipmentModels() {
  const rows = await requestJson<EquipmentModelRow[]>(
    "patrimony_equipment_models?select=*&order=active.desc,sort_order.asc,name.asc",
  );
  return rows.map(mapEquipmentModel);
}

export async function saveEquipmentModel(draft: PatrimonyEquipmentModelDraft) {
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (!name) throw new EquipmentModelRemoteError(400, "Informe o nome do modelo.");
  if (!description) throw new EquipmentModelRemoteError(400, "Informe a descrição do modelo.");

  const id = draft.id ?? crypto.randomUUID();
  const category = draft.category?.trim() || "Notebook";
  const brand = draft.brand?.trim() || name.split(/\s+/)[0] || null;
  const model = draft.model?.trim() || name;
  const slug = draft.slug?.trim() || slugify(name);

  const rows = await requestJson<EquipmentModelRow[]>("patrimony_equipment_models?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      id,
      slug,
      name,
      category,
      brand,
      model,
      description,
      active: draft.active ?? true,
      sort_order: draft.sortOrder ?? 100,
    }]),
  });
  if (!rows[0]) throw new EquipmentModelRemoteError(500, "Não foi possível confirmar o modelo salvo.");
  return mapEquipmentModel(rows[0]);
}

export async function setEquipmentModelActive(modelId: string, active: boolean) {
  const rows = await requestJson<EquipmentModelRow[]>(
    `patrimony_equipment_models?id=eq.${encodeURIComponent(modelId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ active }),
    },
  );
  if (!rows[0]) throw new EquipmentModelRemoteError(404, "Modelo não encontrado.");
  return mapEquipmentModel(rows[0]);
}

export function getEquipmentModelErrorMessage(error: unknown) {
  if (error instanceof EquipmentModelRemoteError && (error.status === 401 || error.status === 403)) {
    return "A sessão de administrador expirou. Entre novamente.";
  }
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const normalized = normalize(message);
  if (normalized.includes("DUPLICATE") || normalized.includes("UNIQUE")) {
    return "Este modelo já está cadastrado.";
  }
  return message || "Não foi possível concluir a operação.";
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  if (!supabaseConfigured) throw new EquipmentModelRemoteError(0, "Supabase não configurado.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new EquipmentModelRemoteError(response.status, parseRemoteMessage(details) || `Erro online: ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof EquipmentModelRemoteError) throw error;
    if (error instanceof SupabaseAuthSessionRequiredError) {
      throw new EquipmentModelRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EquipmentModelRemoteError(408, "Tempo esgotado ao conectar com o Supabase.");
    }
    throw new EquipmentModelRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function mapEquipmentModel(row: EquipmentModelRow): PatrimonyEquipmentModel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    description: row.description,
    active: row.active,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function parseRemoteMessage(details: string) {
  if (!details) return "";
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    return [parsed.message, parsed.details, parsed.hint]
      .filter((value): value is string => typeof value === "string" && Boolean(value))
      .join(" ");
  } catch {
    return details;
  }
}
