import {
  getSupabaseAccessToken,
  getSupabaseClient,
  SUPABASE_KEY_HEADER,
  SUPABASE_PUBLIC_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";
import type {
  HubTask,
  HubTaskDataset,
  HubTaskDraft,
  HubTaskEvent,
  HubTaskEventType,
  HubTaskPriority,
  HubTaskStatus,
} from "../types/task.types";

const REQUEST_TIMEOUT_MS = 12000;

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: HubTaskStatus;
  priority: HubTaskPriority;
  department: string;
  assignee_user_id: string | null;
  due_date: string | null;
  sort_order: number | string;
  source_module: string | null;
  created_by_user_id: string | null;
  created_by_name: string;
  last_actor_name: string;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type TaskEventRow = {
  id: string;
  task_id: string;
  event_type: HubTaskEventType;
  from_status: HubTaskStatus | null;
  to_status: HubTaskStatus | null;
  actor_name: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export class HubTaskRemoteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details = "",
  ) {
    super(message);
    this.name = "HubTaskRemoteError";
  }
}

export async function loadHubTaskDataset(): Promise<HubTaskDataset> {
  const [tasks, events] = await Promise.all([
    requestJson<TaskRow[]>("hub_tasks?select=*&archived_at=is.null&order=status.asc,sort_order.asc,created_at.desc"),
    requestJson<TaskEventRow[]>("hub_task_events?select=*&order=created_at.desc&limit=300"),
  ]);

  return {
    tasks: tasks.map(mapTask),
    events: events.map(mapEvent),
  };
}

export async function saveHubTask(
  draft: HubTaskDraft,
  actor: { userId: string; name: string },
): Promise<HubTask> {
  const title = draft.title.trim();
  const department = draft.department.trim() || "Geral";
  if (!title) throw new HubTaskRemoteError(400, "Informe o título da tarefa.");

  if (draft.id) {
    const rows = await requestJson<TaskRow[]>(`hub_tasks?id=eq.${encodeURIComponent(draft.id)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title,
        description: cleanOptional(draft.description),
        status: draft.status,
        priority: draft.priority,
        department,
        assignee_user_id: draft.assigneeUserId || null,
        due_date: draft.dueDate || null,
        last_actor_name: actor.name,
      }),
    });
    if (!rows[0]) throw new HubTaskRemoteError(404, "Tarefa não encontrada.");
    return mapTask(rows[0]);
  }

  const rows = await requestJson<TaskRow[]>("hub_tasks?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      id: crypto.randomUUID(),
      title,
      description: cleanOptional(draft.description),
      status: draft.status,
      priority: draft.priority,
      department,
      assignee_user_id: draft.assigneeUserId || null,
      due_date: draft.dueDate || null,
      sort_order: 0,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      last_actor_name: actor.name,
    }]),
  });
  if (!rows[0]) throw new HubTaskRemoteError(500, "Não foi possível confirmar a tarefa salva.");
  return mapTask(rows[0]);
}

export async function moveHubTask(
  taskId: string,
  status: HubTaskStatus,
  actorName: string,
): Promise<HubTask> {
  const rows = await requestJson<TaskRow[]>(`hub_tasks?id=eq.${encodeURIComponent(taskId)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status, last_actor_name: actorName }),
  });
  if (!rows[0]) throw new HubTaskRemoteError(404, "Tarefa não encontrada.");
  return mapTask(rows[0]);
}

export async function archiveHubTask(taskId: string, actorName: string): Promise<void> {
  const rows = await requestJson<TaskRow[]>(`hub_tasks?id=eq.${encodeURIComponent(taskId)}&archived_at=is.null&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ archived_at: new Date().toISOString(), last_actor_name: actorName }),
  });
  if (!rows[0]) throw new HubTaskRemoteError(404, "Tarefa não encontrada ou já arquivada.");
}

export function getHubTaskErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  const normalized = normalize(message);

  if (normalized.includes("INFORME O TITULO")) return message;
  if (normalized.includes("TAREFA NAO ENCONTRADA")) return message;
  if (normalized.includes("JWT EXPIRED") || normalized.includes("PGRST303")) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (normalized.includes("SEM PERMISSAO") || normalized.includes("ROW-LEVEL SECURITY")) {
    return "Você não tem permissão para alterar os afazeres.";
  }
  if (normalized.includes("FOREIGN KEY") || normalized.includes("MANAGED_USERS")) {
    return "O responsável selecionado não está mais disponível. Atualize a tela e escolha outro.";
  }
  if (error instanceof HubTaskRemoteError && (error.status === 401 || error.status === 403)) {
    return "Sua sessão de administrador expirou. Entre novamente.";
  }
  if (error instanceof HubTaskRemoteError && error.status >= 500) {
    return "O Supabase apresentou uma falha temporária. Tente novamente.";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "A conexão demorou demais. Verifique a internet e tente novamente.";
  }
  return message || "Não foi possível concluir a operação.";
}

async function requestJson<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  ensureReady();
  const token = await getValidAccessToken();
  if (!token) throw new HubTaskRemoteError(401, "Sessão Supabase Auth do Admin não encontrada.");

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
      if (allowRefresh && shouldRefresh(response.status, details)) {
        await refreshSupabaseSession();
        return requestJson<T>(path, init, false);
      }
      throw new HubTaskRemoteError(response.status, extractRemoteMessage(details), details);
    }

    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof HubTaskRemoteError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HubTaskRemoteError(408, "Tempo limite da conexão excedido.");
    }
    throw new HubTaskRemoteError(0, error instanceof Error ? error.message : "Falha de rede.");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getValidAccessToken() {
  const supabase = await getSupabaseClient();
  if (!supabase) return getSupabaseAccessToken();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? getSupabaseAccessToken();
}

async function refreshSupabaseSession() {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.refreshSession();
  if (error) throw new HubTaskRemoteError(401, "Não foi possível renovar a sessão.", error.message);
}

function shouldRefresh(status: number, details: string) {
  const normalized = normalize(details);
  return status === 401 || normalized.includes("JWT EXPIRED") || normalized.includes("PGRST303");
}

function extractRemoteMessage(details: string) {
  try {
    const parsed = JSON.parse(details) as { message?: unknown; details?: unknown; hint?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const extra = typeof parsed.details === "string" ? parsed.details : typeof parsed.hint === "string" ? parsed.hint : "";
    return [message, extra].filter(Boolean).join(" — ") || details;
  } catch {
    return details;
  }
}

function mapTask(row: TaskRow): HubTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    status: row.status,
    priority: row.priority,
    department: row.department,
    assigneeUserId: row.assignee_user_id || undefined,
    dueDate: row.due_date || undefined,
    sortOrder: Number(row.sort_order),
    sourceModule: row.source_module || undefined,
    createdByUserId: row.created_by_user_id || undefined,
    createdByName: row.created_by_name,
    lastActorName: row.last_actor_name,
    completedAt: row.completed_at || undefined,
    archivedAt: row.archived_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: TaskEventRow): HubTaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    fromStatus: row.from_status || undefined,
    toStatus: row.to_status || undefined,
    actorName: row.actor_name,
    details: row.details || {},
    createdAt: row.created_at,
  };
}

function ensureReady() {
  if (!supabaseConfigured) throw new HubTaskRemoteError(503, "Supabase não configurado.");
}

function cleanOptional(value: string) {
  const clean = value.trim();
  return clean || null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
