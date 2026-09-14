alter table public.hub_alert_rules
  add column if not exists alert_time time without time zone;

comment on column public.hub_alert_rules.alert_time is
  'Horário opcional em que o alerta recorrente deve aparecer no painel do dia.';
