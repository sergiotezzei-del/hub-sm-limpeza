alter table public.marketing_requests
  add column if not exists queue_entered_at timestamptz default now();

update public.marketing_requests
set queue_entered_at = created_at
where deleted_at is null
  and queue_entered_at is null;

create index if not exists marketing_requests_queue_entered_idx
  on public.marketing_requests (urgency_approved desc, queue_entered_at asc, request_number asc)
  where deleted_at is null and status = 'solicitado';

-- Preserva created_at como data historica e usa queue_entered_at somente para a fila operacional.
do $patch$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef('public.marketing_v2_update_request(text,uuid,text,jsonb)'::regprocedure) into v_def;
  v_next := replace(
    v_def,
    '(q.created_at, q.request_number) < (v_request.created_at, v_request.request_number)',
    '(coalesce(q.queue_entered_at, q.created_at), q.request_number) < (coalesce(v_request.queue_entered_at, v_request.created_at), v_request.request_number)'
  );
  v_next := replace(
    v_next,
    'order by q.urgency_approved desc, q.created_at asc, q.request_number asc',
    'order by q.urgency_approved desc, coalesce(q.queue_entered_at, q.created_at) asc, q.request_number asc'
  );
  if v_next = v_def then
    raise exception 'MARKETING_QUEUE_PATCH_UPDATE_REQUEST_NOT_APPLIED';
  end if;
  execute v_next;
end
$patch$;

do $patch$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef('public.marketing_v2_request_queue_override(text,uuid,text)'::regprocedure) into v_def;
  v_next := replace(
    v_def,
    '(q.created_at, q.request_number) < (v_request.created_at, v_request.request_number)',
    '(coalesce(q.queue_entered_at, q.created_at), q.request_number) < (coalesce(v_request.queue_entered_at, v_request.created_at), v_request.request_number)'
  );
  v_next := replace(
    v_next,
    'order by q.urgency_approved desc, q.created_at asc, q.request_number asc',
    'order by q.urgency_approved desc, coalesce(q.queue_entered_at, q.created_at) asc, q.request_number asc'
  );
  if v_next = v_def then
    raise exception 'MARKETING_QUEUE_PATCH_OVERRIDE_NOT_APPLIED';
  end if;
  execute v_next;
end
$patch$;

do $patch$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef('private.marketing_v2_get_dashboard_review_unfiltered_v21(text)'::regprocedure) into v_def;
  v_next := replace(
    v_def,
    'order by (item->>''urgencyApproved'')::boolean desc, (item->>''createdAt'')::timestamptz asc, (item->>''requestNumber'')::bigint asc',
    'order by (item->>''urgencyApproved'')::boolean desc, coalesce(q.queue_entered_at, q.created_at) asc, (item->>''requestNumber'')::bigint asc'
  );
  if v_next = v_def then
    raise exception 'MARKETING_QUEUE_PATCH_DASHBOARD_NOT_APPLIED';
  end if;
  execute v_next;
end
$patch$;

create or replace function public.marketing_v2_reschedule_request(
  p_session_token text,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_now timestamptz := now();
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;

  if v_role <> 'marketing' or v_user_id not in ('arthur', 'maria') then
    raise exception 'MARKETING_RESCHEDULE_DENIED';
  end if;

  select * into v_request
  from public.marketing_requests q
  where q.id = p_request_id
    and q.deleted_at is null
  for update;

  if v_request.id is null then
    raise exception 'MARKETING_REQUEST_NOT_FOUND';
  end if;

  if v_request.request_kind <> 'capture_edit' then
    raise exception 'MARKETING_RESCHEDULE_CAPTURE_ONLY';
  end if;

  if v_request.status <> 'agendado' or v_request.confirmed_capture_at is null then
    raise exception 'MARKETING_RESCHEDULE_NOT_SCHEDULED';
  end if;

  update public.marketing_requests
  set status = 'solicitado',
      confirmed_capture_at = null,
      confirmed_capture_duration_minutes = null,
      confirmed_capture_end_at = null,
      capture_group_id = null,
      completed_at = null,
      queue_entered_at = v_now,
      updated_at = v_now
  where id = p_request_id;

  update public.marketing_queue_override_requests
  set status = 'rejected',
      decided_by_user_id = v_user_id,
      decided_by_name = v_user_name,
      decided_at = v_now
  where request_id = p_request_id
    and status = 'pending';

  update public.marketing_queue_override_requests
  set consumed_at = v_now
  where request_id = p_request_id
    and status = 'approved'
    and consumed_at is null;

  insert into public.marketing_request_events(
    request_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    details
  ) values (
    p_request_id,
    'pedido_reagendado_para_fim_da_fila',
    v_request.status,
    'solicitado',
    v_user_id,
    v_user_name,
    jsonb_build_object(
      'previousConfirmedCaptureAt', v_request.confirmed_capture_at,
      'previousConfirmedCaptureDurationMinutes', v_request.confirmed_capture_duration_minutes,
      'reason', 'Reagendado pelo Marketing a pedido do corretor',
      'queueEnteredAt', v_now
    )
  );

  perform private.marketing_notify_manager(
    p_request_id,
    'captacao_alterada',
    'Pedido voltou para a fila de agendamento',
    format('Pedido #%s · %s foi reagendado e voltou para o final da fila para receber uma nova data disponível.', v_request.request_number, v_request.broker_name),
    v_user_id,
    v_user_name
  );
end;
$function$;

revoke all on function public.marketing_v2_reschedule_request(text, uuid) from public;
grant execute on function public.marketing_v2_reschedule_request(text, uuid) to anon, authenticated;
