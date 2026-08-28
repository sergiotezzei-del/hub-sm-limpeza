import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

export type AlertRecurrenceType = "weekly" | "biweekly" | "monthly" | "once";

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

const RULE_SELECT = "id,title,description,recurrence_type,weekdays,anchor_date,active,created_at,updated_at";
const COMPLETION_SELECT = "id,rule_id,occurrence_date,completed_by_name,completed_at";

export async function loadAlertDataset(): Promise<HubAlertDataset> {
  const [rules, completions] = await Promise.all([
    fetchRows<AlertRuleRow>("hub_alert_rules", {
      select: RULE_SELECT,
      order: "created_at.asc",
    }),
    fetchRows<AlertCompletionRow>("hub_alert_completions", {
      select: COMPLETION_SELECT,
      order: "occurrence_date.desc",
      limit: "1000",
    }),
  ]);

  return {
    rules: rules.map(mapRule),
    completions: completions.map(mapCompletion),
  };
}

export async function createAlertRule(input: CreateAlertRuleInput, actorName: string): Promise<HubAlertRule> {
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    recurrence_type: input.recurrenceType,
    weekdays: input.recurrenceType === "weekly" ? [...new Set(input.weekdays ?? [])].sort((a, b) => a - b) : [],
    anchor_date: input.recurrenceType === "weekly" ? null : input.anchorDate || null,
    created_by_name: actorName,
  };

  const url = createRestUrl("hub_alert_rules", { select: RULE_SELECT });
  const response = await authenticatedSupabaseFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  const rows = await readRowsOrThrow<AlertRuleRow>(response, "create-alert-rule");
  const row = rows[0];
  if (!row) throw new Error("ALERT_RULE_CREATE_EMPTY_RESPONSE");
  return mapRule(row);
}

export async function setAlertRuleActive(ruleId: string, active: boolean) {
  const response = await authenticatedSupabaseFetch(
    createRestUrl("hub_alert_rules", { id: `eq.${ruleId}` }),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ active }),
    },
  );
  await ensureRestSuccess(response, "set-alert-rule-active");
}

export async function deleteAlertRule(ruleId: string) {
  const response = await authenticatedSupabaseFetch(
    createRestUrl("hub_alert_rules", { id: `eq.${ruleId}` }),
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  await ensureRestSuccess(response, "delete-alert-rule");
}

export async function completeAlertOccurrence(ruleId: string, occurrenceDate: string, actorName: string) {
  const response = await authenticatedSupabaseFetch(createRestUrl("hub_alert_completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      rule_id: ruleId,
      occurrence_date: occurrenceDate,
      completed_by_name: actorName,
    }),
  });

  if (response.ok) return;
  const diagnostic = await readSupabaseRestError(response);
  if (diagnostic.code === "23505") return;
  throw createRestError("complete-alert-occurrence", diagnostic);
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

async function fetchRows<T>(table: string, query: Record<string, string>) {
  const response = await authenticatedSupabaseFetch(createRestUrl(table, query), {
    headers: { Accept: "application/json" },
  });
  return readRowsOrThrow<T>(response, `select-${table}`);
}

function createRestUrl(table: string, query: Record<string, string> = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
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
