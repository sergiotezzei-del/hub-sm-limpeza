create or replace function public.marketing_v2_request_period_exception(
  p_session_token text,
  p_request_id uuid,
  p_special_capture_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if not (v_role = 'marketing' and v_user_id in ('maria','arthur')) then
    raise exception 'MARKETING_SPECIAL_REQUEST_DENIED';
  end if;
  if p_special_capture_at is null or p_special_capture_at <= now() then
    raise exception 'MARKETING_SPECIAL_TIME_INVALID';
  end if;
  if nullif(btrim(coalesce(p_reason,'')), '') is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'MARKETING_SPECIAL_REASON_REQUIRED';
  end if;

  select * into v_request
  from public.marketing_requests q
  where q.id = p_request_id and q.deleted_at is null
  for update;

  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.status in ('pronto','cancelado') then raise exception 'MARKETING_SPECIAL_REQUEST_CLOSED'; end if;
  if v_request.request_kind <> 'capture_edit' then raise exception 'MARKETING_SPECIAL_CAPTURE_ONLY'; end if;
  if v_request.special_capture_status = 'pending' then raise exception 'MARKETING_SPECIAL_ALREADY_PENDING'; end if;

  select * into v_settings from public.marketing_schedule_settings where id='default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;
  v_local_date := (p_special_capture_at at time zone v_settings.timezone)::date;
  v_booking_key := coalesce(v_request.capture_group_id, v_request.id);
  v_period := private.marketing_standard_capture_period(p_special_capture_at);

  if v_period is not null then
    v_mode := 'period_override';
    if not exists (
      select 1
      from private.marketing_schedule_occupied_slots() s
      where s.booking_key is distinct from v_booking_key
        and (s.start_at at time zone v_settings.timezone)::date = v_local_date
        and private.marketing_standard_capture_period(s.start_at) = v_period
    ) then
      raise exception 'MARKETING_SPECIAL_PERIOD_NOT_RESERVED';
    end if;
  else
    v_mode := 'off_standard';
  end if;

  if exists (
    select 1
    from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from v_booking_key
      and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(p_special_capture_at, p_special_capture_at + interval '60 minutes', '[)')
  ) then
    raise exception 'MARKETING_SPECIAL_EXACT_CONFLICT';
  end if;

  update public.marketing_requests q
  set special_capture_at = p_special_capture_at,
      special_capture_reason = btrim(p_reason),
      special_capture_status = 'pending',
      special_capture_decided_by_user_id = null,
      special_capture_decided_by_name = null,
      special_capture_decided_at = null
  where coalesce(q.capture_group_id, q.id) = v_booking_key
    and q.deleted_at is null
    and q.status <> 'cancelado';

  insert into public.marketing_request_events(
    request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
  ) values (
    v_request.id,
    'excecao_agenda_solicitada',
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object(
      'specialCaptureAt', p_special_capture_at,
      'reason', btrim(p_reason),
      'mode', v_mode,
      'approvalRequiredBy', 'tezzei'
    )
  );
end;
$function$;

revoke all on function public.marketing_v2_request_period_exception(text,uuid,timestamptz,text) from public;
grant execute on function public.marketing_v2_request_period_exception(text,uuid,timestamptz,text) to anon, authenticated;
