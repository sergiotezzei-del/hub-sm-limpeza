import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  completeAlertOccurrence,
  createAlertRule,
  deleteAlertRule,
  HubAlertCompletion,
  HubAlertRule,
  loadAlertDataset,
  setAlertRuleActive,
  type AlertRecurrenceType,
} from "./alertService";
import { completeAlertTask, loadAlertTasks, type AlertTask } from "./alertTaskService";
import "./alerts.css";

const ACTOR_NAME = "Admin Tezzei";
const LOOKBACK_DAYS = 90;

const WEEKDAYS = [
  { value: 1, short: "SEG", label: "Segunda" },
  { value: 2, short: "TER", label: "Terça" },
  { value: 3, short: "QUA", label: "Quarta" },
  { value: 4, short: "QUI", label: "Quinta" },
  { value: 5, short: "SEX", label: "Sexta" },
  { value: 6, short: "SÁB", label: "Sábado" },
  { value: 0, short: "DOM", label: "Domingo" },
];

type PendingAlert = {
  rule: HubAlertRule;
  occurrenceDate: string;
  pendingCount: number;
  isToday: boolean;
};

type RuleDraft = {
  title: string;
  description: string;
  recurrenceType: AlertRecurrenceType;
  weekdays: number[];
  anchorDate: string;
  monthlyDay: string;
};

const EMPTY_DRAFT: RuleDraft = {
  title: "",
  description: "",
  recurrenceType: "weekly",
  weekdays: [],
  anchorDate: "",
  monthlyDay: "20",
};

export function AlertDashboardEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let decoratedHost: HTMLElement | null = null;

    const syncHost = () => {
      const nextHost = findAdminHomeScreen();
      if (decoratedHost && decoratedHost !== nextHost) undecorateAdminHome(decoratedHost);
      if (nextHost) decorateAdminHome(nextHost);
      decoratedHost = nextHost;
      setHost((current) => current === nextHost ? current : nextHost);
    };

    syncHost();
    const root = document.getElementById("root");
    if (!root) return () => undefined;

    const observer = new MutationObserver(syncHost);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (decoratedHost) undecorateAdminHome(decoratedHost);
    };
  }, []);

  if (!host) return null;
  return createPortal(<AlertDashboardPanel />, host);
}

function AlertDashboardPanel() {
  const [rules, setRules] = useState<HubAlertRule[]>([]);
  const [completions, setCompletions] = useState<HubAlertCompletion[]>([]);
  const [alertTasks, setAlertTasks] = useState<AlertTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [markingKey, setMarkingKey] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const today = getTodayIso();

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([loadAlertDataset(), loadAlertTasks()])
      .then(([datasetResult, tasksResult]) => {
        if (!active) return;

        if (datasetResult.status === "fulfilled") {
          setRules(datasetResult.value.rules);
          setCompletions(datasetResult.value.completions);
        }
        if (tasksResult.status === "fulfilled") setAlertTasks(tasksResult.value);

        if (datasetResult.status === "rejected" && tasksResult.status === "rejected") {
          setMessage("Não foi possível carregar os alertas nem os Afazeres.");
        } else if (datasetResult.status === "rejected") {
          setMessage("Afazeres carregados, mas os alertas recorrentes estão temporariamente indisponíveis.");
        } else if (tasksResult.status === "rejected") {
          setMessage("Alertas carregados. Afazeres estão temporariamente indisponíveis.");
        } else {
          setMessage("");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const pendingAlerts = useMemo(
    () => buildPendingAlerts(rules, completions, today),
    [rules, completions, today],
  );

  const overdueCount = pendingAlerts.filter((alert) => !alert.isToday).length
    + alertTasks.filter((task) => Boolean(task.dueDate && task.dueDate < today)).length;
  const totalPending = pendingAlerts.length + alertTasks.length;

  async function markDone(alert: PendingAlert) {
    const key = `${alert.rule.id}:${alert.occurrenceDate}`;
    if (markingKey) return;
    setMarkingKey(key);
    setMessage("");
    try {
      await completeAlertOccurrence(alert.rule.id, alert.occurrenceDate, ACTOR_NAME);
      setCompletions((current) => [
        ...current,
        {
          id: `local-${key}`,
          ruleId: alert.rule.id,
          occurrenceDate: alert.occurrenceDate,
          completedByName: ACTOR_NAME,
          completedAt: new Date().toISOString(),
        },
      ]);
      setMessage(`${alert.rule.title} marcado como feito.`);
    } catch {
      setMessage("Não foi possível registrar como feito.");
    } finally {
      setMarkingKey("");
    }
  }

  async function markTaskDone(task: AlertTask) {
    const key = `task:${task.id}`;
    if (markingKey) return;
    setMarkingKey(key);
    setMessage("");
    try {
      await completeAlertTask(task.id, ACTOR_NAME);
      setAlertTasks((current) => current.filter((item) => item.id !== task.id));
      setMessage(`${task.title} concluído nos Afazeres.`);
    } catch {
      setMessage("Não foi possível concluir o Afazer.");
    } finally {
      setMarkingKey("");
    }
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setMessage("Informe o nome do alerta.");
      return;
    }
    if (draft.recurrenceType === "weekly" && draft.weekdays.length === 0) {
      setMessage("Escolha pelo menos um dia da semana.");
      return;
    }
    if (draft.recurrenceType === "monthly") {
      const day = Number(draft.monthlyDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        setMessage("Informe um dia do mês entre 1 e 31.");
        return;
      }
    } else if (draft.recurrenceType !== "weekly" && !draft.anchorDate) {
      setMessage(draft.recurrenceType === "biweekly" ? "Informe a primeira data da rotina." : "Informe a data do alerta.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const anchorDate = draft.recurrenceType === "monthly"
        ? `2000-01-${String(Number(draft.monthlyDay)).padStart(2, "0")}`
        : draft.anchorDate;
      const created = await createAlertRule({
        title,
        description: draft.description,
        recurrenceType: draft.recurrenceType,
        weekdays: draft.weekdays,
        anchorDate,
      }, ACTOR_NAME);
      setRules((current) => [...current, created]);
      setDraft(EMPTY_DRAFT);
      setMessage("Alerta criado.");
    } catch {
      setMessage("Não foi possível criar o alerta.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: HubAlertRule) {
    if (togglingId || deletingId) return;
    setTogglingId(rule.id);
    setMessage("");
    try {
      await setAlertRuleActive(rule.id, !rule.active);
      setRules((current) => current.map((item) => item.id === rule.id ? { ...item, active: !item.active } : item));
      setMessage(rule.active ? "Alerta pausado." : "Alerta ativado.");
    } catch {
      setMessage("Não foi possível alterar o alerta.");
    } finally {
      setTogglingId("");
    }
  }

  async function removeRule(rule: HubAlertRule) {
    if (togglingId || deletingId) return;
    if (!window.confirm(`Excluir o alerta “${rule.title}”? O histórico de marcações desta rotina também será removido.`)) return;
    setDeletingId(rule.id);
    setMessage("");
    try {
      await deleteAlertRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setCompletions((current) => current.filter((item) => item.ruleId !== rule.id));
      setMessage("Alerta excluído.");
    } catch {
      setMessage("Não foi possível excluir o alerta.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="hub-alert-panel" aria-label="Alertas e rotinas recorrentes">
      <header className="hub-alert-panel-head">
        <div>
          <p className="hub-alert-kicker">ROTINAS DO DIA</p>
          <h2>ALERTAS</h2>
          <small>{loading ? "Carregando..." : totalPending === 0 ? "Nenhuma pendência hoje" : `${totalPending} alerta(s) pendente(s)${overdueCount ? ` · ${overdueCount} atrasado(s)` : ""}`}</small>
        </div>
        <button className="hub-alert-create-button" type="button" onClick={() => setManagerOpen(true)}>+ Criar alerta</button>
      </header>

      {message && <p className="hub-alert-message" role="status">{message}</p>}

      {!loading && totalPending === 0 && (
        <article className="hub-alert-empty">
          <strong>✓ Nenhum alerta pendente hoje.</strong>
          <span>As próximas rotinas e Afazeres marcados aparecerão aqui.</span>
        </article>
      )}

      <div className="hub-alert-cards">
        {alertTasks.map((task) => {
          const key = `task:${task.id}`;
          const overdue = Boolean(task.dueDate && task.dueDate < today);
          const dueToday = task.dueDate === today;
          return (
            <article className={`hub-alert-card ${overdue ? "is-overdue" : dueToday ? "is-today" : "is-task"}`} key={key}>
              <div className="hub-alert-card-status">
                <span>{overdue ? "ATRASADO" : dueToday ? "HOJE" : "AFAZER"}</span>
                <time dateTime={task.dueDate || today}>{task.dueDate ? `Prazo · ${formatDateShort(task.dueDate)}` : "Sem prazo"}</time>
              </div>
              <h3>{task.title}</h3>
              {task.description && <p>{task.description}</p>}
              <small>Afazeres · {task.department}</small>
              <button
                className="hub-alert-done-button"
                type="button"
                disabled={Boolean(markingKey)}
                onClick={() => { void markTaskDone(task); }}
              >
                {markingKey === key ? "Salvando..." : "FEITO"}
              </button>
            </article>
          );
        })}

        {pendingAlerts.map((alert) => {
          const key = `${alert.rule.id}:${alert.occurrenceDate}`;
          const overdue = !alert.isToday;
          return (
            <article className={`hub-alert-card ${overdue ? "is-overdue" : "is-today"}`} key={key}>
              <div className="hub-alert-card-status">
                <span>{overdue ? "ATRASADO" : "HOJE"}</span>
                <time dateTime={alert.occurrenceDate}>{formatOccurrenceDate(alert.occurrenceDate, alert.isToday)}</time>
              </div>
              <h3>{alert.rule.title}</h3>
              {alert.rule.description && <p>{alert.rule.description}</p>}
              {alert.pendingCount > 1 && <small>Existem {alert.pendingCount} execuções pendentes desta rotina. A mais antiga aparece primeiro.</small>}
              <button
                className="hub-alert-done-button"
                type="button"
                disabled={Boolean(markingKey)}
                onClick={() => { void markDone(alert); }}
              >
                {markingKey === key ? "Salvando..." : "FEITO"}
              </button>
            </article>
          );
        })}
      </div>

      <button className="hub-alert-manage-link" type="button" onClick={() => setManagerOpen(true)}>Gerenciar alertas</button>

      {managerOpen && createPortal(
        <div className="hub-alert-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManagerOpen(false); }}>
          <section className="hub-alert-modal" role="dialog" aria-modal="true" aria-labelledby="hub-alert-manager-title">
            <header className="hub-alert-modal-head">
              <div>
                <p className="hub-alert-kicker">CONFIGURAÇÃO</p>
                <h2 id="hub-alert-manager-title">Alertas recorrentes</h2>
              </div>
              <button type="button" className="hub-alert-close-button" onClick={() => setManagerOpen(false)} aria-label="Fechar">×</button>
            </header>

            <form className="hub-alert-form" onSubmit={saveRule}>
              <label>
                Nome da rotina
                <input type="text" value={draft.title} placeholder="Ex.: Fechamento da fatura do cartão" onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label>
                Observação <small>(opcional)</small>
                <input type="text" value={draft.description} placeholder="O que precisa ser feito" onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </label>
              <label>
                Frequência
                <select value={draft.recurrenceType} onChange={(event) => setDraft({ ...draft, recurrenceType: event.target.value as AlertRecurrenceType, weekdays: [], anchorDate: "" })}>
                  <option value="weekly">Dias da semana</option>
                  <option value="biweekly">A cada 2 semanas</option>
                  <option value="monthly">Uma vez por mês</option>
                  <option value="once">Uma única data</option>
                </select>
              </label>

              {draft.recurrenceType === "weekly" && (
                <fieldset className="hub-alert-weekdays">
                  <legend>Dias</legend>
                  <div>
                    {WEEKDAYS.map((weekday) => {
                      const checked = draft.weekdays.includes(weekday.value);
                      return (
                        <label className={checked ? "selected" : ""} key={weekday.value} title={weekday.label}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setDraft((current) => ({
                              ...current,
                              weekdays: checked
                                ? current.weekdays.filter((day) => day !== weekday.value)
                                : [...current.weekdays, weekday.value],
                            }))}
                          />
                          <span>{weekday.short}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {draft.recurrenceType === "monthly" && (
                <label>
                  Dia do mês
                  <input type="number" min="1" max="31" value={draft.monthlyDay} onChange={(event) => setDraft({ ...draft, monthlyDay: event.target.value })} />
                  <small>O HUB repetirá todo mês nesse dia. Se escolher 29, 30 ou 31 e o mês for menor, usará o último dia daquele mês.</small>
                </label>
              )}

              {(draft.recurrenceType === "biweekly" || draft.recurrenceType === "once") && (
                <label>
                  {draft.recurrenceType === "biweekly" ? "Primeira data da rotina" : "Data"}
                  <input type="date" value={draft.anchorDate} onChange={(event) => setDraft({ ...draft, anchorDate: event.target.value })} />
                  {draft.recurrenceType === "biweekly" && <small>O HUB repetirá automaticamente a cada 14 dias a partir desta data.</small>}
                </label>
              )}

              <button className="hub-alert-save-button" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alerta"}</button>
            </form>

            <section className="hub-alert-rules-list">
              <h3>Alertas cadastrados</h3>
              {rules.length === 0 && <p>Nenhum alerta cadastrado.</p>}
              {rules.map((rule) => (
                <article key={rule.id}>
                  <div>
                    <strong>{rule.title}</strong>
                    <small>{formatRuleSchedule(rule)}</small>
                  </div>
                  <div className="hub-alert-rule-actions">
                    <button type="button" disabled={Boolean(togglingId || deletingId)} onClick={() => { void toggleRule(rule); }}>
                      {togglingId === rule.id ? "Salvando..." : rule.active ? "Pausar" : "Ativar"}
                    </button>
                    <button className="hub-alert-delete-rule" type="button" disabled={Boolean(togglingId || deletingId)} onClick={() => { void removeRule(rule); }}>
                      {deletingId === rule.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

function findAdminHomeScreen() {
  const screens = Array.from(document.querySelectorAll<HTMLElement>(".screen"));
  return screens.find((screen) => {
    const text = screen.textContent ?? "";
    return screen.querySelectorAll(":scope > .hub-home-section").length >= 2
      && text.includes("Afazeres")
      && text.includes("Chamados")
      && text.includes("Administração do HUB");
  }) ?? null;
}

function decorateAdminHome(host: HTMLElement) {
  host.classList.add("alerts-admin-home-screen");
  let topCount = 0;
  Array.from(host.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.classList.contains("hub-alert-panel")) return;
    if (child.classList.contains("hub-home-section")) {
      child.classList.add("alerts-home-menu-section");
      child.classList.remove("alerts-home-top");
    } else {
      child.classList.add("alerts-home-top");
      child.classList.remove("alerts-home-menu-section");
      topCount += 1;
    }
  });
  host.style.setProperty("--alerts-start-row", String(topCount + 1));
}

function undecorateAdminHome(host: HTMLElement) {
  host.classList.remove("alerts-admin-home-screen");
  host.style.removeProperty("--alerts-start-row");
  Array.from(host.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    child.classList.remove("alerts-home-menu-section", "alerts-home-top");
  });
}

function buildPendingAlerts(rules: HubAlertRule[], completions: HubAlertCompletion[], todayIso: string): PendingAlert[] {
  const completed = new Set(completions.map((item) => `${item.ruleId}:${item.occurrenceDate}`));
  const today = parseIsoDate(todayIso);
  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);

  return rules
    .filter((rule) => rule.active)
    .flatMap((rule) => {
      const createdDate = new Date(rule.createdAt);
      const createdIso = Number.isNaN(createdDate.getTime()) ? todayIso : toIsoDate(createdDate);
      const firstDate = maxDate(parseIsoDate(createdIso), lookback);
      const pendingDates: string[] = [];

      for (let cursor = new Date(firstDate); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
        const occurrenceDate = toIsoDate(cursor);
        if (!isRuleDueOn(rule, occurrenceDate)) continue;
        if (!completed.has(`${rule.id}:${occurrenceDate}`)) pendingDates.push(occurrenceDate);
      }

      if (pendingDates.length === 0) return [];
      return [{
        rule,
        occurrenceDate: pendingDates[0],
        pendingCount: pendingDates.length,
        isToday: pendingDates[0] === todayIso,
      }];
    })
    .sort((first, second) => first.occurrenceDate.localeCompare(second.occurrenceDate) || first.rule.title.localeCompare(second.rule.title));
}

function isRuleDueOn(rule: HubAlertRule, dateIso: string) {
  const date = parseIsoDate(dateIso);
  if (rule.recurrenceType === "weekly") return rule.weekdays.includes(date.getDay());
  if (rule.recurrenceType === "monthly") {
    if (!rule.anchorDate) return false;
    const anchorDay = parseIsoDate(rule.anchorDate).getDate();
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
    return date.getDate() === Math.min(anchorDay, lastDay);
  }
  if (!rule.anchorDate || dateIso < rule.anchorDate) return false;
  if (rule.recurrenceType === "once") return dateIso === rule.anchorDate;
  const anchor = parseIsoDate(rule.anchorDate);
  const diffDays = Math.round((date.getTime() - anchor.getTime()) / 86400000);
  return diffDays >= 0 && diffDays % 14 === 0;
}

function formatRuleSchedule(rule: HubAlertRule) {
  if (rule.recurrenceType === "once") return rule.anchorDate ? `Uma vez · ${formatDateShort(rule.anchorDate)}` : "Uma vez";
  if (rule.recurrenceType === "biweekly") return rule.anchorDate ? `A cada 2 semanas · início ${formatDateShort(rule.anchorDate)}` : "A cada 2 semanas";
  if (rule.recurrenceType === "monthly") return rule.anchorDate ? `Todo mês · dia ${parseIsoDate(rule.anchorDate).getDate()}` : "Todo mês";
  const labels = WEEKDAYS.filter((weekday) => rule.weekdays.includes(weekday.value)).map((weekday) => weekday.short);
  return labels.length ? labels.join(" · ") : "Dias da semana";
}

function formatOccurrenceDate(dateIso: string, isToday: boolean) {
  if (isToday) return `Hoje · ${formatDateShort(dateIso)}`;
  const date = parseIsoDate(dateIso);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  return `${capitalize(weekday)} · ${formatDateShort(dateIso)}`;
}

function formatDateShort(dateIso: string) {
  const [year, month, day] = dateIso.split("-");
  return `${day}/${month}/${year}`;
}

function getTodayIso() {
  return toIsoDate(new Date());
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function maxDate(first: Date, second: Date) {
  return first > second ? first : second;
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
