import { getSupabaseClient } from "../security/services/supabaseClient";

export type AlertRecurrenceType = "weekly" | "biweekly" | "once";

export type HubAlertRule = {
  id: string;
  title: string;
  description?: string;
  recurrenceType: AlertRecurrenceType;
  weekdays: number[];
  anchorDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HubAlertCompletion = {
  id: string;
  ruleId: string;
  occurrenceDate: string;
  completedByName: string;
  completedAt: string;
};

export type HubAlertDataset = {
  rules: HubAlertRule[];
  completions: HubAlertCompletion[];
};

export type CreateAlertRuleInput = {
  title: string;
  description?: string;
  recurrenceType: AlertRecurrenceType;
  weekdays?: number[];
  anchorDate?: string;
};

type AlertRuleRow = {
  id: string;
  title: string;
  description: string | null;
  recurrence_type: AlertRecurrenceType;
  weekdays: number[] | null;
  anchor_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type AlertCompletionRow = {
  id: string;
  rule_id: string;
  occurrence_date: string;
  completed_by_name: string;
  completed_at: string;
};

export async function loadAlertDataset(): Promise<HubAlertDataset> {
  const supabase = await getRequiredSupabaseClient();
  const [rulesResult, completionsResult] = await Promise.all([
    supabase
      .from("hub_alert_rules")
      .select("id,title,description,recurrence_type,weekdays,anchor_date,active,created_at,updated_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("hub_alert_completions")
      .select("id,rule_id,occurrence_date,completed_by_name,completed_at")
      .order("occurrence_date", { ascending: false })
      .limit(1000),
  ]);

  if (rulesResult.error) throw rulesResult.error;
  if (completionsResult.error) throw completionsResult.error;

  return {
    rules: ((rulesResult.data ?? []) as AlertRuleRow[]).map(mapRule),
    completions: ((completionsResult.data ?? []) as AlertCompletionRow[]).map(mapCompletion),
  };
}

export async function createAlertRule(input: CreateAlertRuleInput, actorName: string): Promise<HubAlertRule> {
  const supabase = await getRequiredSupabaseClient();
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    recurrence_type: input.recurrenceType,
    weekdays: input.recurrenceType === "weekly" ? [...new Set(input.weekdays ?? [])].sort((a, b) => a - b) : [],
    anchor_date: input.recurrenceType === "weekly" ? null : input.anchorDate || null,
    created_by_name: actorName,
  };

  const result = await supabase
    .from("hub_alert_rules")
    .insert(payload)
    .select("id,title,description,recurrence_type,weekdays,anchor_date,active,created_at,updated_at")
    .single();

  if (result.error) throw result.error;
  return mapRule(result.data as AlertRuleRow);
}

export async function setAlertRuleActive(ruleId: string, active: boolean) {
  const supabase = await getRequiredSupabaseClient();
  const result = await supabase
    .from("hub_alert_rules")
    .update({ active })
    .eq("id", ruleId);

  if (result.error) throw result.error;
}

export async function completeAlertOccurrence(ruleId: string, occurrenceDate: string, actorName: string) {
  const supabase = await getRequiredSupabaseClient();
  const result = await supabase
    .from("hub_alert_completions")
    .insert({
      rule_id: ruleId,
      occurrence_date: occurrenceDate,
      completed_by_name: actorName,
    });

  if (result.error && result.error.code !== "23505") throw result.error;
}

function mapRule(row: AlertRuleRow): HubAlertRule {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    recurrenceType: row.recurrence_type,
    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number).filter(Number.isInteger) : [],
    anchorDate: row.anchor_date ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCompletion(row: AlertCompletionRow): HubAlertCompletion {
  return {
    id: row.id,
    ruleId: row.rule_id,
    occurrenceDate: row.occurrence_date,
    completedByName: row.completed_by_name,
    completedAt: row.completed_at,
  };
}

async function getRequiredSupabaseClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado para Alertas.");
  return supabase;
}
