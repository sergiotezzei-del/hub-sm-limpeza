alter table public.hub_alert_rules
  drop constraint if exists hub_alert_rules_recurrence_type_check;

alter table public.hub_alert_rules
  add constraint hub_alert_rules_recurrence_type_check
  check (recurrence_type in ('weekly', 'biweekly', 'monthly', 'once'));

alter table public.hub_alert_rules
  drop constraint if exists hub_alert_rules_schedule_valid;

alter table public.hub_alert_rules
  add constraint hub_alert_rules_schedule_valid check (
    (recurrence_type = 'weekly' and cardinality(weekdays) > 0 and anchor_date is null)
    or (recurrence_type in ('biweekly', 'monthly', 'once') and cardinality(weekdays) = 0 and anchor_date is not null)
  );

alter table public.hub_alert_completions
  drop constraint if exists hub_alert_completions_rule_id_fkey;

alter table public.hub_alert_completions
  add constraint hub_alert_completions_rule_id_fkey
  foreign key (rule_id) references public.hub_alert_rules(id) on delete cascade;

grant delete on public.hub_alert_rules to authenticated;

create policy hub_alert_rules_admin_delete
  on public.hub_alert_rules for delete to authenticated
  using ((select public.is_hub_admin()));

alter table public.hub_tasks
  add column if not exists show_in_alerts boolean not null default false;

create index if not exists hub_tasks_show_in_alerts_idx
  on public.hub_tasks(show_in_alerts, status, archived_at)
  where show_in_alerts = true and archived_at is null;
