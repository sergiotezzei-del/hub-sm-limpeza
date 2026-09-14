import { useEffect } from "react";
import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";
import "./alertTimeEnhancer.css";

type AlertRuleTimeRow = {
  id: string;
  title: string;
  description: string | null;
  alert_time: string | null;
  active: boolean;
  created_at: string;
};

const REFRESH_MS = 15000;

export function AlertTimeEnhancer() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    let rules: AlertRuleTimeRow[] = [];
    let busy = false;
    let frame = 0;

    const refreshRules = async () => {
      if (busy) return;
      busy = true;
      try {
        rules = await loadRuleTimes();
        decorate();
      } catch {
        // A Central de Alertas continua operando mesmo se o horário falhar temporariamente.
      } finally {
        busy = false;
      }
    };

    const decorate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        ensureCreateTimeField(() => rules, refreshRules);
        decorateRuleCards(rules, refreshRules);
        decoratePendingCards(rules);
      });
    };

    void refreshRules();
    decorate();

    const observer = new MutationObserver(decorate);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    const interval = window.setInterval(() => { void refreshRules(); }, REFRESH_MS);
    const onFocus = () => { void refreshRules(); };
    window.addEventListener("focus", onFocus);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

function ensureCreateTimeField(
  getRules: () => AlertRuleTimeRow[],
  refreshRules: () => Promise<void>,
) {
  const form = document.querySelector<HTMLFormElement>(".hub-alert-form");
  if (!form || form.querySelector(".hub-alert-time-field")) return;

  const label = document.createElement("label");
  label.className = "hub-alert-time-field";
  label.innerHTML = "Horário do alerta <small>(opcional)</small>";

  const input = document.createElement("input");
  input.type = "time";
  input.step = "60";
  input.setAttribute("aria-label", "Horário do alerta");
  label.appendChild(input);

  const saveButton = form.querySelector<HTMLButtonElement>(".hub-alert-save-button");
  if (saveButton) form.insertBefore(label, saveButton);
  else form.appendChild(label);

  form.addEventListener("submit", () => {
    const selectedTime = normalizeTime(input.value);
    if (!selectedTime) return;

    const beforeIds = new Set(getRules().map((rule) => rule.id));
    const startedAt = Date.now();

    const persistWhenCreated = async () => {
      if (Date.now() - startedAt > 12000) return;
      try {
        const current = await loadRuleTimes();
        const created = current
          .filter((rule) => !beforeIds.has(rule.id))
          .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];

        if (!created) {
          window.setTimeout(() => { void persistWhenCreated(); }, 300);
          return;
        }

        await saveRuleTime(created.id, selectedTime);
        input.value = "";
        await refreshRules();
      } catch {
        window.setTimeout(() => { void persistWhenCreated(); }, 500);
      }
    };

    window.setTimeout(() => { void persistWhenCreated(); }, 300);
  }, true);
}

function decorateRuleCards(
  rules: AlertRuleTimeRow[],
  refreshRules: () => Promise<void>,
) {
  const articles = Array.from(document.querySelectorAll<HTMLElement>(".hub-alert-rules-list > article"));
  if (!articles.length || !rules.length) return;

  articles.forEach((article, index) => {
    const rule = rules[index];
    if (!rule) return;

    article.dataset.alertRuleId = rule.id;
    let field = article.querySelector<HTMLLabelElement>(".hub-alert-rule-time-control");
    if (!field) {
      field = document.createElement("label");
      field.className = "hub-alert-rule-time-control";
      field.innerHTML = "<span>Horário</span>";

      const input = document.createElement("input");
      input.type = "time";
      input.step = "60";
      input.setAttribute("aria-label", `Horário do alerta ${rule.title}`);
      field.appendChild(input);

      const info = article.querySelector<HTMLElement>(":scope > div:first-child");
      info?.appendChild(field);

      input.addEventListener("change", async () => {
        input.disabled = true;
        try {
          await saveRuleTime(rule.id, normalizeTime(input.value));
          await refreshRules();
        } catch {
          input.value = displayTime(rule.alert_time);
        } finally {
          input.disabled = false;
        }
      });
    }

    const input = field.querySelector<HTMLInputElement>("input");
    if (input && document.activeElement !== input) input.value = displayTime(rule.alert_time);
  });
}

function decoratePendingCards(rules: AlertRuleTimeRow[]) {
  if (!rules.length) return;

  const activeRules = rules.filter((rule) => rule.active && rule.alert_time);
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".hub-alert-card.is-today, .hub-alert-card.is-overdue"));

  cards.forEach((card) => {
    const title = card.querySelector("h3")?.textContent?.trim() ?? "";
    const rule = activeRules.find((candidate) => candidate.title === title);
    const time = rule ? displayTime(rule.alert_time) : "";
    const statusTime = card.querySelector<HTMLTimeElement>(".hub-alert-card-status time");
    if (!statusTime) return;

    const original = statusTime.dataset.alertBaseText ?? statusTime.textContent?.trim() ?? "";
    statusTime.dataset.alertBaseText = original.replace(/\s·\s\d{2}:\d{2}$/, "");
    const base = statusTime.dataset.alertBaseText;
    statusTime.textContent = time ? `${base} · ${time}` : base;

    card.classList.toggle("has-alert-time", Boolean(time));
  });
}

async function loadRuleTimes(): Promise<AlertRuleTimeRow[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/hub_alert_rules`);
  url.searchParams.set("select", "id,title,description,alert_time,active,created_at");
  url.searchParams.set("order", "created_at.asc");

  const response = await authenticatedSupabaseFetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw new Error(`ALERT_TIME_LOAD:${diagnostic.status}:${diagnostic.code ?? "unknown"}`);
  }

  const parsed = await response.json() as unknown;
  return Array.isArray(parsed) ? parsed as AlertRuleTimeRow[] : [];
}

async function saveRuleTime(ruleId: string, time: string | null) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/hub_alert_rules`);
  url.searchParams.set("id", `eq.${ruleId}`);

  const response = await authenticatedSupabaseFetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ alert_time: time }),
  });

  if (!response.ok) {
    const diagnostic = await readSupabaseRestError(response);
    throw new Error(`ALERT_TIME_SAVE:${diagnostic.status}:${diagnostic.code ?? "unknown"}`);
  }
}

function normalizeTime(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}:00` : null;
}

function displayTime(value: string | null) {
  const match = value ? /^(\d{2}):(\d{2})/.exec(value) : null;
  return match ? `${match[1]}:${match[2]}` : "";
}
