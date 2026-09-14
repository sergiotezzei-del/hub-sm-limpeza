-- Stabilizes the current Marketing workflow without rewriting historical rows.

create or replace function private.marketing_validate_operational_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then return new; end if;

  -- Restoring a legacy row must preserve its historical values. New edits are
  -- validated by the regular RPCs after the row has returned to the operation.
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status and not (
    new.status = 'cancelado'
    or (old.status = 'solicitado' and new.status in ('agendado', 'aguardando_edicao', 'bloqueado'))
    or (old.status = 'agendado' and new.status in ('solicitado', 'aguardando_edicao', 'bloqueado'))
    or (old.status = 'aguardando_edicao' and new.status in ('em_edicao', 'bloqueado'))
    or (old.status = 'em_edicao' and new.status in ('em_aprovacao', 'bloqueado'))
    or (old.status = 'em_aprovacao' and new.status in ('revisao', 'em_edicao', 'pronto', 'bloqueado'))
    or (old.status = 'revisao' and new.status in ('em_edicao', 'em_aprovacao', 'pronto', 'bloqueado'))
    or old.status = 'bloqueado'
  ) then
    raise exception 'MARKETING_STATUS_TRANSITION_INVALID';
  end if;

  if new.request_kind = 'edit_only'
    and (new.confirmed_capture_at is not null or new.confirmed_capture_duration_minutes is not null) then
    raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED';
  end if;

  if (new.confirmed_capture_at is null) <> (new.confirmed_capture_duration_minutes is null) then
    raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
  end if;

  if new.confirmed_capture_at is not null and new.confirmed_capture_duration_minutes <> 60 then
    raise exception 'MARKETING_CAPTURE_DURATION_INVALID';
  end if;

  if new.confirmed_capture_at is not null
    and (tg_op = 'INSERT' or new.confirmed_capture_at is distinct from old.confirmed_capture_at)
    and new.confirmed_capture_at <= now() then
    raise exception 'MARKETING_CAPTURE_IN_PAST';
  end if;

  if new.preferred_capture_at is not null
    and (tg_op = 'INSERT' or new.preferred_capture_at is distinct from old.preferred_capture_at)
    and new.preferred_capture_at <= now() then
    raise exception 'MARKETING_CAPTURE_IN_PAST';
  end if;

  if new.status = 'agendado' and (
    new.request_kind <> 'capture_edit'
    or new.confirmed_capture_at is null
    or new.confirmed_capture_duration_minutes <> 60
    or new.assigned_marketing_name is null
    or new.assigned_marketing_name not in ('Maria', 'Arthur')
  ) then
    raise exception 'MARKETING_SCHEDULE_ASSIGNEE_REQUIRED';
  end if;

  if new.status in ('aguardando_edicao', 'em_edicao', 'em_aprovacao', 'revisao', 'pronto')
    and (new.assigned_marketing_name is null or new.assigned_marketing_name not in ('Maria', 'Arthur')) then
    raise exception 'MARKETING_SCHEDULE_ASSIGNEE_REQUIRED';
  end if;

  if new.request_kind = 'capture_edit'
    and new.status in ('aguardando_edicao', 'em_edicao', 'em_aprovacao', 'revisao', 'pronto')
    and new.confirmed_capture_at is null then
    raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
  end if;

  if new.capture_group_id is not null
    and new.assigned_marketing_name is not null
    and current_setting('app.marketing_group_assignee_sync', true) is distinct from 'on'
    and exists (
      select 1
      from public.marketing_requests sibling
      where sibling.capture_group_id = new.capture_group_id
        and sibling.id <> new.id
        and sibling.deleted_at is null
        and sibling.status <> 'cancelado'
        and sibling.assigned_marketing_name is distinct from new.assigned_marketing_name
    ) then
    raise exception 'MARKETING_GROUP_ASSIGNEE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function private.marketing_validate_operational_state() from public, anon, authenticated;

drop trigger if exists marketing_requests_validate_operational_state on public.marketing_requests;
create trigger marketing_requests_validate_operational_state
before insert or update of
  status,
  request_kind,
  preferred_capture_at,
  confirmed_capture_at,
  confirmed_capture_duration_minutes,
  assigned_marketing_name,
  capture_group_id,
  deleted_at
on public.marketing_requests
for each row execute function private.marketing_validate_operational_state();

create or replace function public.marketing_v2_update_request_grouped(
  p_session_token text,
  p_request_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_request public.marketing_requests%rowtype;
  v_confirmed timestamptz;
  v_duration integer;
  v_status text;
  v_assigned text;
  v_booking_key uuid;
  v_existing_start timestamptz;
  v_existing_max_start timestamptz;
  v_member record;
begin
  select r.user_id, r.user_name into v_user_id, v_user_name
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request
  from public.marketing_requests q
  where q.id = p_request_id and q.deleted_at is null
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  if p_payload ? 'expectedUpdatedAt'
    and nullif(p_payload->>'expectedUpdatedAt', '') is not null
    and (p_payload->>'expectedUpdatedAt')::timestamptz is distinct from v_request.updated_at then
    raise exception 'MARKETING_REQUEST_STALE';
  end if;

  if p_action = 'save_management' then
    v_status := coalesce(nullif(p_payload->>'status', ''), v_request.status);
    v_assigned := case
      when p_payload ? 'assignedMarketingName' then nullif(btrim(p_payload->>'assignedMarketingName'), '')
      else v_request.assigned_marketing_name
    end;

    if v_assigned is not null and v_assigned not in ('Maria', 'Arthur') then
      raise exception 'MARKETING_ASSIGNEE_INVALID';
    end if;

    if v_request.request_kind = 'capture_edit' then
      v_confirmed := case
        when p_payload ? 'confirmedCaptureAt' then nullif(p_payload->>'confirmedCaptureAt', '')::timestamptz
        else v_request.confirmed_capture_at
      end;
      v_duration := case
        when p_payload ? 'confirmedCaptureDurationMinutes' then nullif(p_payload->>'confirmedCaptureDurationMinutes', '')::integer
        else v_request.confirmed_capture_duration_minutes
      end;

      if (v_confirmed is null) <> (v_duration is null) then raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED'; end if;
      if v_confirmed is not null and v_duration <> 60 then raise exception 'MARKETING_CAPTURE_DURATION_INVALID'; end if;
      if v_confirmed is not null and v_confirmed is distinct from v_request.confirmed_capture_at and v_confirmed <= now() then
        raise exception 'MARKETING_CAPTURE_IN_PAST';
      end if;

      if v_confirmed is not null and v_status <> 'cancelado' then
        if not private.marketing_capture_window_is_valid(v_confirmed, v_duration) then
          raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
        end if;
        v_booking_key := coalesce(v_request.capture_group_id, v_request.id);
        if v_request.capture_group_id is not null then
          perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('marketing_capture_group:' || v_request.capture_group_id::text, 0)
          );
          select min(q.confirmed_capture_at), max(q.confirmed_capture_at)
            into v_existing_start, v_existing_max_start
          from public.marketing_requests q
          where q.capture_group_id = v_request.capture_group_id
            and q.id <> v_request.id
            and q.deleted_at is null
            and q.status <> 'cancelado'
            and q.confirmed_capture_at is not null;
          if v_existing_start is not null and (
            v_existing_start is distinct from v_existing_max_start
            or v_existing_start is distinct from v_confirmed
          ) then
            raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
          end if;
        end if;
        perform private.marketing_validate_capture_booking(v_booking_key, v_confirmed, 60);
      end if;
    end if;

    if v_request.capture_group_id is not null
      and p_payload ? 'assignedMarketingName'
      and v_request.assigned_marketing_name is distinct from v_assigned then
      perform pg_catalog.set_config('app.marketing_group_assignee_sync', 'on', true);
      for v_member in
        update public.marketing_requests q
        set assigned_marketing_name = v_assigned
        where q.capture_group_id = v_request.capture_group_id
          and q.id <> v_request.id
          and q.deleted_at is null
          and q.status <> 'cancelado'
          and q.assigned_marketing_name is distinct from v_assigned
        returning q.id, q.status, q.assigned_marketing_name
      loop
        insert into public.marketing_request_events(
          request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
        ) values (
          v_member.id, 'responsavel_definido', v_member.status, v_member.status,
          v_user_id, v_user_name,
          jsonb_build_object('assignedMarketingName', v_assigned, 'source', 'capture_group_sync')
        );
        perform private.marketing_notify_manager(
          v_member.id, 'responsavel_definido', 'Responsável do Marketing atualizado',
          case when v_assigned is null then 'O pedido está aguardando definição de responsável.' else format('Responsável: %s.', v_assigned) end,
          v_user_id, v_user_name
        );
      end loop;
      perform pg_catalog.set_config('app.marketing_group_assignee_sync', 'off', true);
    end if;
  end if;

  perform private.marketing_v2_update_request_grouped_v124_base(
    p_session_token, p_request_id, p_action, p_payload
  );
end;
$$;

revoke all on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb) to anon, authenticated;

create or replace function public.marketing_v2_request_period_exception(
  p_session_token text,
  p_request_id uuid,
  p_special_capture_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_booking_key uuid;
  v_period text;
  v_settings public.marketing_schedule_settings%rowtype;
  v_local_date date;
  v_mode text;
begin
  select r.user_id, r.user_name, r.access_role into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if not (v_role = 'marketing' and v_user_id in ('maria', 'arthur')) then raise exception 'MARKETING_SPECIAL_REQUEST_DENIED'; end if;
  if p_special_capture_at is null or p_special_capture_at <= now() then raise exception 'MARKETING_SPECIAL_TIME_INVALID'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'MARKETING_SPECIAL_REASON_REQUIRED'; end if;

  select * into v_request from public.marketing_requests q
  where q.id = p_request_id and q.deleted_at is null for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'solicitado' then raise exception 'MARKETING_SPECIAL_REQUEST_STATE_INVALID'; end if;
  if v_request.request_kind <> 'capture_edit' then raise exception 'MARKETING_SPECIAL_CAPTURE_ONLY'; end if;
  if v_request.assigned_marketing_name is null or v_request.assigned_marketing_name not in ('Maria', 'Arthur') then raise exception 'MARKETING_SCHEDULE_ASSIGNEE_REQUIRED'; end if;
  if v_request.special_capture_status = 'pending' then raise exception 'MARKETING_SPECIAL_ALREADY_PENDING'; end if;

  v_booking_key := coalesce(v_request.capture_group_id, v_request.id);
  if exists (
    select 1 from public.marketing_requests q
    where coalesce(q.capture_group_id, q.id) = v_booking_key
      and q.deleted_at is null and q.status <> 'cancelado'
      and (q.status <> 'solicitado' or q.assigned_marketing_name is distinct from v_request.assigned_marketing_name)
  ) then raise exception 'MARKETING_GROUP_ASSIGNEE_MISMATCH'; end if;

  select * into v_settings from public.marketing_schedule_settings where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;
  v_local_date := (p_special_capture_at at time zone v_settings.timezone)::date;
  v_period := private.marketing_standard_capture_period(p_special_capture_at);
  if v_period is not null then
    v_mode := 'period_override';
    if not exists (
      select 1 from private.marketing_schedule_occupied_slots() s
      where s.booking_key is distinct from v_booking_key
        and (s.start_at at time zone v_settings.timezone)::date = v_local_date
        and private.marketing_standard_capture_period(s.start_at) = v_period
    ) then raise exception 'MARKETING_SPECIAL_PERIOD_NOT_RESERVED'; end if;
  else
    v_mode := 'off_standard';
  end if;

  if exists (
    select 1 from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from v_booking_key
      and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(p_special_capture_at, p_special_capture_at + interval '60 minutes', '[)')
  ) then raise exception 'MARKETING_SPECIAL_EXACT_CONFLICT'; end if;

  update public.marketing_requests q
  set special_capture_at = p_special_capture_at,
      special_capture_reason = btrim(p_reason),
      special_capture_status = 'pending',
      special_capture_decided_by_user_id = null,
      special_capture_decided_by_name = null,
      special_capture_decided_at = null
  where coalesce(q.capture_group_id, q.id) = v_booking_key
    and q.deleted_at is null and q.status = 'solicitado';

  insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
  values (
    v_request.id, 'excecao_agenda_solicitada', v_request.status, v_request.status, v_user_id, v_user_name,
    jsonb_build_object('specialCaptureAt', p_special_capture_at, 'reason', btrim(p_reason), 'mode', v_mode, 'approvalRequiredBy', 'tezzei')
  );
end;
$$;

revoke all on function public.marketing_v2_request_period_exception(text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.marketing_v2_request_period_exception(text, uuid, timestamptz, text) to anon, authenticated;

create or replace function public.marketing_v2_decide_special_capture(
  p_session_token text,
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_booking_key uuid;
  v_special_at timestamptz;
  v_member record;
begin
  select r.user_id, r.user_name, r.access_role into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if not (v_role = 'admin' and v_user_id = 'tezzei') then raise exception 'MARKETING_SPECIAL_DECISION_DENIED'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'MARKETING_SPECIAL_DECISION_INVALID'; end if;

  select * into v_request from public.marketing_requests q
  where q.id = p_request_id and q.deleted_at is null for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.special_capture_status <> 'pending' or v_request.special_capture_at is null then raise exception 'MARKETING_SPECIAL_NOT_PENDING'; end if;

  v_booking_key := coalesce(v_request.capture_group_id, v_request.id);
  v_special_at := v_request.special_capture_at;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_group:' || v_booking_key::text, 0));

  if p_decision = 'approved' then
    if exists (
      select 1 from public.marketing_requests q
      where q.deleted_at is null and q.status <> 'cancelado'
        and coalesce(q.capture_group_id, q.id) = v_booking_key
        and (q.status <> 'solicitado' or q.assigned_marketing_name is null or q.assigned_marketing_name not in ('Maria', 'Arthur')
          or q.assigned_marketing_name is distinct from v_request.assigned_marketing_name)
    ) then raise exception 'MARKETING_GROUP_ASSIGNEE_MISMATCH'; end if;
    perform private.marketing_validate_special_capture_booking(v_booking_key, v_special_at);
  end if;

  for v_member in
    select q.id, q.status, q.request_number, q.broker_name
    from public.marketing_requests q
    where q.deleted_at is null and q.status <> 'cancelado'
      and coalesce(q.capture_group_id, q.id) = v_booking_key
      and q.special_capture_status = 'pending'
      and q.special_capture_at = v_special_at
    for update
  loop
    if p_decision = 'approved' then
      update public.marketing_requests
      set special_capture_status = 'approved',
          special_capture_decided_by_user_id = v_user_id,
          special_capture_decided_by_name = v_user_name,
          special_capture_decided_at = now(),
          confirmed_capture_at = v_special_at,
          confirmed_capture_duration_minutes = 60,
          status = 'agendado', completed_at = null
      where id = v_member.id;
      insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
      values (v_member.id, 'excecao_periodo_aprovada', v_member.status, 'agendado', v_user_id, v_user_name, jsonb_build_object('specialCaptureAt', v_special_at));
      perform private.marketing_notify_manager(v_member.id, 'status_alterado', 'Exceção de agenda aprovada',
        format('Pedido #%s · %s teve a exceção de agenda aprovada por Sérgio Tezzei.', v_member.request_number, v_member.broker_name), v_user_id, v_user_name);
    else
      update public.marketing_requests
      set special_capture_status = 'rejected', special_capture_decided_by_user_id = v_user_id,
          special_capture_decided_by_name = v_user_name, special_capture_decided_at = now()
      where id = v_member.id;
      insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
      values (v_member.id, 'excecao_periodo_rejeitada', v_member.status, v_member.status, v_user_id, v_user_name, jsonb_build_object('specialCaptureAt', v_special_at));
      perform private.marketing_notify_manager(v_member.id, 'status_alterado', 'Exceção de agenda não aprovada',
        format('Pedido #%s · %s continua aguardando outro horário disponível.', v_member.request_number, v_member.broker_name), v_user_id, v_user_name);
    end if;
  end loop;
end;
$$;

revoke all on function public.marketing_v2_decide_special_capture(text, uuid, text) from public, anon, authenticated;
grant execute on function public.marketing_v2_decide_special_capture(text, uuid, text) to anon, authenticated;

create or replace function private.marketing_alert_source_at(p_request_id uuid, p_alert_kind text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case p_alert_kind
    when 'request' then coalesce(q.queue_entered_at, q.created_at)
    when 'urgency' then coalesce((
      select max(e.created_at) from public.marketing_request_events e
      where e.request_id = q.id and e.event_type in ('urgencia_solicitada', 'criado', 'criado_publicamente')
    ), q.created_at)
    when 'special_capture' then coalesce((
      select max(e.created_at) from public.marketing_request_events e
      where e.request_id = q.id and e.event_type in ('excecao_agenda_solicitada', 'excecao_periodo_solicitada')
    ), q.updated_at)
    else null
  end
  from public.marketing_requests q
  where q.id = p_request_id and q.deleted_at is null;
$$;

revoke all on function private.marketing_alert_source_at(uuid, text) from public, anon, authenticated;

create or replace function public.marketing_v2_acknowledge_request_alert(
  p_session_token text,
  p_request_id uuid,
  p_alert_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_source_at timestamptz;
begin
  select r.user_id, r.user_name, r.access_role into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;
  if p_alert_kind not in ('request', 'urgency', 'special_capture') then raise exception 'MARKETING_ALERT_KIND_INVALID'; end if;

  select * into v_request from public.marketing_requests q where q.id = p_request_id and q.deleted_at is null;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  v_source_at := private.marketing_alert_source_at(p_request_id, p_alert_kind);

  if not exists (
    select 1 from public.marketing_request_events e
    where e.request_id = p_request_id and e.event_type = 'admin_alert_acknowledged'
      and e.actor_user_id = v_user_id and e.details->>'alertKind' = p_alert_kind
      and e.created_at >= v_source_at
  ) then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'admin_alert_acknowledged', v_request.status, v_request.status, v_user_id,
      coalesce(nullif(btrim(v_user_name), ''), 'Administrador'),
      jsonb_build_object('alertKind', p_alert_kind, 'source', 'dashboard', 'alertSourceAt', v_source_at));
  end if;
end;
$$;

revoke all on function public.marketing_v2_acknowledge_request_alert(text, uuid, text) from public, anon, authenticated;
grant execute on function public.marketing_v2_acknowledge_request_alert(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.marketing_v2_get_acknowledged_request_alerts(p_session_token text)
returns table(request_id uuid, alert_kind text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
begin
  select r.user_id, r.access_role into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;

  return query
  select distinct e.request_id, e.details->>'alertKind'
  from public.marketing_request_events e
  join public.marketing_requests q on q.id = e.request_id and q.deleted_at is null
  where e.event_type = 'admin_alert_acknowledged'
    and e.actor_user_id = v_user_id
    and e.details->>'alertKind' in ('request', 'urgency', 'special_capture')
    and e.created_at >= private.marketing_alert_source_at(e.request_id, e.details->>'alertKind')
  order by e.request_id, e.details->>'alertKind';
end;
$$;

revoke all on function public.marketing_v2_get_acknowledged_request_alerts(text) from public, anon, authenticated;
grant execute on function public.marketing_v2_get_acknowledged_request_alerts(text) to anon, authenticated, service_role;

create or replace function public.marketing_google_calendar_server_batch(
  p_secret text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id text;
  v_queue_ids jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_connections jsonb := '[]'::jsonb;
begin
  if not private.marketing_google_calendar_secret_matches(p_secret) then
    raise exception 'MARKETING_GOOGLE_SERVER_DENIED';
  end if;

  select ds.decrypted_secret into v_client_id
  from public.google_calendar_connections c
  join vault.decrypted_secrets ds on ds.id = c.client_id_secret_id
  where c.client_id_secret_id is not null
  order by c.updated_at desc
  limit 1;

  with queued as (
    select q.request_id
    from private.marketing_google_calendar_sync_queue q
    where q.attempts < 8
    order by q.queued_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), queued_groups as (
    select distinct r.capture_group_id
    from public.marketing_requests r
    join queued q on q.request_id = r.id
    where r.capture_group_id is not null
  ), relevant as (
    select r.* from public.marketing_requests r
    where r.id in (select request_id from queued)
       or (r.capture_group_id is not null and r.capture_group_id in (select capture_group_id from queued_groups))
  )
  select
    coalesce((select jsonb_agg(q.request_id) from queued q), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'requestNumber', r.request_number,
      'requestKind', r.request_kind,
      'status', r.status,
      'brokerName', r.broker_name,
      'managerName', r.manager_name,
      'propertyReference', r.property_reference,
      'captureLocation', r.capture_location,
      'confirmedCaptureAt', r.confirmed_capture_at,
      'assignedMarketingName', r.assigned_marketing_name,
      'captureGroupId', r.capture_group_id,
      'contentTypes', r.content_types,
      'deletedAt', r.deleted_at
    ) order by r.request_number) from relevant r), '[]'::jsonb)
  into v_queue_ids, v_requests;

  select coalesce(jsonb_agg(jsonb_build_object(
    'managedUserId', c.managed_user_id,
    'googleEmail', coalesce(c.google_email, ''),
    'calendarId', coalesce(c.calendar_id, 'primary'),
    'refreshToken', rt.decrypted_secret
  ) order by c.managed_user_id), '[]'::jsonb)
  into v_connections
  from private.marketing_google_calendar_connections c
  join vault.decrypted_secrets rt on rt.id = c.refresh_token_secret_id
  where c.connected_at is not null and c.refresh_token_secret_id is not null;

  return jsonb_build_object(
    'clientId', coalesce(v_client_id, ''),
    'queueRequestIds', v_queue_ids,
    'requests', v_requests,
    'connections', v_connections
  );
end;
$$;

revoke all on function public.marketing_google_calendar_server_batch(text, integer) from public;
grant execute on function public.marketing_google_calendar_server_batch(text, integer) to anon, authenticated, service_role;

-- Internal helpers are reachable only through validated public RPCs.
revoke all on function private.marketing_standard_capture_period(timestamptz) from public, anon, authenticated;
revoke all on function private.marketing_validate_special_capture_booking(uuid, timestamptz) from public, anon, authenticated;

notify pgrst, 'reload schema';
