import { getSupabaseClient } from "../security/services/supabaseClient";

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

export async function loadAlertTasks(): Promise<AlertTask[]> {
  const supabase = await getRequiredSupabaseClient();
  const result = await supabase
    .from("hub_tasks")
    .select("id,title,description,due_date,priority,department,status")
    .eq("show_in_alerts", true)
    .is("archived_at", null)
    .neq("status", "concluido")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (result.error) throw result.error;
  return ((result.data ?? []) as AlertTaskRow[]).map((row) => ({
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
  const supabase = await getRequiredSupabaseClient();
  const result = await supabase
    .from("hub_tasks")
    .select("id")
    .eq("show_in_alerts", true)
    .is("archived_at", null)
    .neq("status", "concluido");

  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => String(row.id));
}

export async function setTaskAlertVisibility(taskId: string, visible: boolean, actorName: string) {
  const supabase = await getRequiredSupabaseClient();
  const result = await supabase
    .from("hub_tasks")
    .update({ show_in_alerts: visible, last_actor_name: actorName })
    .eq("id", taskId)
    .is("archived_at", null);

  if (result.error) throw result.error;
}

export async function completeAlertTask(taskId: string, _actorName: string) {
  const supabase = await getRequiredSupabaseClient();
  const result = await supabase
    .from("hub_tasks")
    .delete()
    .eq("id", taskId)
    .is("archived_at", null);

  if (result.error) throw result.error;
}

async function getRequiredSupabaseClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado para Afazeres.");
  return supabase;
}
