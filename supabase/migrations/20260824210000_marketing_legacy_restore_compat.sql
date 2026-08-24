-- Allow restoring pre-V2 requests that have a preferred capture date without a duration.
create or replace function public.marketing_v2_admin_restore_request(
  p_session_token text,
  p_request_id uuid
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
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.deleted_at is null then raise exception 'MARKETING_REQUEST_NOT_DELETED'; end if;
  if not exists (
    select 1 from public.marketing_teams t
    where t.id = v_request.team_id and t.active is true
  ) then raise exception 'MARKETING_RESTORE_TEAM_INACTIVE'; end if;
  if char_length(btrim(coalesce(v_request.broker_name, ''))) not between 2 and 120
    or coalesce(cardinality(v_request.content_types), 0) = 0
    or v_request.request_kind not in ('capture_edit', 'edit_only') then
    raise exception 'MARKETING_RESTORE_DATA_INVALID';
  end if;
  if v_request.has_property_code
    and nullif(btrim(coalesce(v_request.property_reference, '')), '') is null then
    raise exception 'MARKETING_RESTORE_DATA_INVALID';
  end if;
  if v_request.request_kind = 'edit_only'
    and (
      v_request.capture_location is not null
      or v_request.preferred_capture_at is not null
      or v_request.preferred_capture_duration_minutes is not null
      or v_request.confirmed_capture_at is not null
      or v_request.confirmed_capture_duration_minutes is not null
    ) then
    raise exception 'MARKETING_RESTORE_KIND_INVALID';
  end if;
  if v_request.request_kind = 'capture_edit' then
    -- Pre-V2 rows may have a requested date without a requested duration.
    if v_request.preferred_capture_at is null
      and v_request.preferred_capture_duration_minutes is not null then
      raise exception 'MARKETING_RESTORE_DATA_INVALID';
    end if;
    if (v_request.confirmed_capture_at is null) <> (v_request.confirmed_capture_duration_minutes is null) then
      raise exception 'MARKETING_RESTORE_DATA_INVALID';
    end if;
    if v_request.preferred_capture_at is not null
      and v_request.preferred_capture_duration_minutes is not null
      and not private.marketing_capture_window_is_valid(
        v_request.preferred_capture_at,
        v_request.preferred_capture_duration_minutes
      ) then
      raise exception 'MARKETING_RESTORE_DATA_INVALID';
    end if;
    if v_request.confirmed_capture_at is not null and v_request.status <> 'cancelado' then
      if not private.marketing_capture_window_is_valid(v_request.confirmed_capture_at, v_request.confirmed_capture_duration_minutes) then
        raise exception 'MARKETING_RESTORE_DATA_INVALID';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_schedule', 0));
      if private.marketing_capture_conflicts(
        v_request.confirmed_capture_at,
        v_request.confirmed_capture_duration_minutes,
        v_request.id
      ) then
        raise exception 'MARKETING_RESTORE_CAPTURE_CONFLICT';
      end if;
    end if;
  end if;

  perform set_config('app.marketing_admin_restore', 'on', true);
  begin
    update public.marketing_requests
    set deleted_at = null,
        deleted_by_user_id = null,
        deleted_by_name = null,
        deletion_reason = null
    where id = v_request.id;
  exception when exclusion_violation then
    perform set_config('app.marketing_admin_restore', '', true);
    raise exception 'MARKETING_RESTORE_CAPTURE_CONFLICT';
  end;
  perform set_config('app.marketing_admin_restore', '', true);

  insert into public.marketing_request_events(
    request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
  ) values (
    v_request.id,
    'pedido_restaurado_admin',
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('restoredBy', v_user_name)
  );
end;
$$;

revoke all on function public.marketing_v2_admin_restore_request(text, uuid) from public, anon, authenticated;
grant execute on function public.marketing_v2_admin_restore_request(text, uuid) to anon, authenticated;

