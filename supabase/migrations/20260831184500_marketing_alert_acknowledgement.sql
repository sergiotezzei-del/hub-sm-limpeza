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
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_role <> 'admin' then
    raise exception 'MARKETING_ADMIN_REQUIRED';
  end if;
  if p_alert_kind not in ('request', 'urgency') then
    raise exception 'MARKETING_ALERT_KIND_INVALID';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
    and deleted_at is null;

  if v_request.id is null then
    raise exception 'MARKETING_REQUEST_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.marketing_request_events e
    where e.request_id = p_request_id
      and e.event_type = 'admin_alert_acknowledged'
      and e.actor_user_id = v_user_id
      and e.details->>'alertKind' = p_alert_kind
  ) then
    insert into public.marketing_request_events (
      request_id,
      event_type,
      from_status,
      to_status,
      actor_user_id,
      actor_name,
      details
    ) values (
      p_request_id,
      'admin_alert_acknowledged',
      v_request.status,
      v_request.status,
      v_user_id,
      coalesce(nullif(btrim(v_user_name), ''), 'Administrador'),
      jsonb_build_object(
        'alertKind', p_alert_kind,
        'source', 'dashboard'
      )
    );
  end if;
end;
$$;

revoke all on function public.marketing_v2_acknowledge_request_alert(text, uuid, text) from public;
grant execute on function public.marketing_v2_acknowledge_request_alert(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.marketing_v2_get_acknowledged_request_alerts(
  p_session_token text
)
returns table (
  request_id uuid,
  alert_kind text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;
  if v_role <> 'admin' then
    raise exception 'MARKETING_ADMIN_REQUIRED';
  end if;

  return query
  select distinct
    e.request_id,
    e.details->>'alertKind' as alert_kind
  from public.marketing_request_events e
  join public.marketing_requests q on q.id = e.request_id
  where e.event_type = 'admin_alert_acknowledged'
    and e.actor_user_id = v_user_id
    and e.details->>'alertKind' in ('request', 'urgency')
    and q.deleted_at is null
  order by e.request_id, e.details->>'alertKind';
end;
$$;

revoke all on function public.marketing_v2_get_acknowledged_request_alerts(text) from public;
grant execute on function public.marketing_v2_get_acknowledged_request_alerts(text) to anon, authenticated, service_role;
