import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

export type AlertTask = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: string;
  department: string;
  status: string;
};

type AlertTaskRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  department: string;
  status: string;
};

const TASK_SELECT = "id,title,description,due_date,priority,department,status";

export async function loadAlertTasks(): Promise<AlertTask[]> {
  const rows = await fetchTaskRows({
    select: TASK_SELECT,
    show_in_alerts: "eq.true",
    archived_at: "is.null",
    status: "neq.concluido",
    order: "due_date.asc.nullslast,updated_at.desc",
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    dueDate: row.due_date ?? undefined,
    priority: row.priority,
    department: row.department,
    status: row.status,
  }));
}

export async function loadAlertTaskIds(): Promise<string[]> {
  const response = await authenticatedSupabaseFetch(createTaskUrl({
    select: "id",
    show_in_alerts: "eq.true",
    archived_at: "is.null",
    status: "neq.concluido",
  }), { headers: { Accept: "application/json" } });
  const rows = await readRowsOrThrow<{ id: string }>(response, "select-alert-task-ids");
  return rows.map((row) => String(row.id));
}

export async function setTaskAlertVisibility(taskId: string, visible: boolean, actorName: string) {
  const response = await authenticatedSupabaseFetch(createTaskUrl({
    id: `eq.${taskId}`,
    archived_at: "is.null",
  }), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ show_in_alerts: visible, last_actor_name: actorName }),
  });
  await ensureRestSuccess(response, "set-task-alert-visibility");
}

export async function completeAlertTask(taskId: string, _actorName: string) {
  const response = await authenticatedSupabaseFetch(createTaskUrl({
    id: `eq.${taskId}`,
    archived_at: "is.null",
  }), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await ensureRestSuccess(response, "complete-alert-task");
}

async function fetchTaskRows(query: Record<string, string>) {
  const response = await authenticatedSupabaseFetch(createTaskUrl(query), {
    headers: { Accept: "application/json" },
  });
  return readRowsOrThrow<AlertTaskRow>(response, "select-alert-tasks");
}

function createTaskUrl(query: Record<string, string>) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/hub_tasks`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function readRowsOrThrow<T>(response: Response, context: string): Promise<T[]> {
  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw createRestError(context, diagnostic);
  }
  const text = await response.text();
  if (!text) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
}

async function ensureRestSuccess(response: Response, context: string) {
  if (response.ok) return;
  const diagnostic = await readSupabaseRestError(response);
  throw createRestError(context, diagnostic);
}

function createRestError(
  context: string,
  diagnostic: { status: number; code: string | null; message: string | null },
) {
  return new Error(
    `SUPABASE_REST_${context}:${diagnostic.status}:${diagnostic.code ?? "unknown"}:${diagnostic.message ?? "unknown"}`,
  );
}
