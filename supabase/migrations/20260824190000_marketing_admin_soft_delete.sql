alter table public.marketing_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id text,
  add column if not exists deleted_by_name text,
  add column if not exists deletion_reason text;

comment on column public.marketing_requests.deleted_at is
  'Exclusao logica administrativa. Pedidos com valor preenchido ficam fora de toda operacao do Marketing.';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_deleted_by_user_fkey'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_deleted_by_user_fkey
      foreign key (deleted_by_user_id)
      references public.managed_users(id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_deletion_metadata_valid'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_deletion_metadata_valid
      check (
        (
          deleted_at is null
          and deleted_by_user_id is null
          and deleted_by_name is null
          and deletion_reason is null
        )
        or (
          deleted_at is not null
          and nullif(btrim(coalesce(deleted_by_user_id, '')), '') is not null
          and nullif(btrim(coalesce(deleted_by_name, '')), '') is not null
          and char_length(btrim(coalesce(deletion_reason, ''))) between 5 and 2000
        )
      );
  end if;
end;
$$;

create index if not exists marketing_requests_deleted_idx
  on public.marketing_requests(deleted_at desc, request_number desc)
  where deleted_at is not null;

create index if not exists marketing_requests_active_queue_v21_idx
  on public.marketing_requests(urgency_approved desc, created_at asc, request_number asc)
  where deleted_at is null and status = 'solicitado';

create or replace function private.marketing_guard_deleted_request_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    if new.deleted_at is not null
      or coalesce(current_setting('app.marketing_admin_restore', true), '') <> 'on' then
      raise exception 'MARKETING_REQUEST_DELETED';
    end if;
    if (
      to_jsonb(new)
        - 'deleted_at'
        - 'deleted_by_user_id'
        - 'deleted_by_name'
        - 'deletion_reason'
        - 'updated_at'
    ) is distinct from (
      to_jsonb(old)
        - 'deleted_at'
        - 'deleted_by_user_id'
        - 'deleted_by_name'
        - 'deletion_reason'
        - 'updated_at'
    ) then
      raise exception 'MARKETING_RESTORE_FIELDS_DENIED';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.marketing_guard_active_request_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.marketing_requests q
    where q.id = new.request_id
      and q.deleted_at is not null
  ) then
    raise exception 'MARKETING_REQUEST_DELETED';
  end if;
  return new;
end;
$$;

revoke all on function private.marketing_guard_deleted_request_mutation() from public, anon, authenticated;
revoke all on function private.marketing_guard_active_request_reference() from public, anon, authenticated;

drop trigger if exists marketing_requests_guard_deleted_mutation on public.marketing_requests;
create trigger marketing_requests_guard_deleted_mutation
before update on public.marketing_requests
for each row execute function private.marketing_guard_deleted_request_mutation();

drop trigger if exists marketing_notifications_guard_deleted_request on public.marketing_notifications;
create trigger marketing_notifications_guard_deleted_request
before insert on public.marketing_notifications
for each row execute function private.marketing_guard_active_request_reference();

drop trigger if exists marketing_queue_overrides_guard_deleted_request on public.marketing_queue_override_requests;
create trigger marketing_queue_overrides_guard_deleted_request
before insert or update on public.marketing_queue_override_requests
for each row execute function private.marketing_guard_active_request_reference();

drop trigger if exists marketing_manager_reviews_guard_deleted_request on public.marketing_manager_reviews;
create trigger marketing_manager_reviews_guard_deleted_request
before insert or update on public.marketing_manager_reviews
for each row execute function private.marketing_guard_active_request_reference();

alter table public.marketing_requests
  drop constraint if exists marketing_requests_confirmed_capture_no_overlap;

alter table public.marketing_requests
  add constraint marketing_requests_confirmed_capture_no_overlap
  exclude using gist (
    tstzrange(
      confirmed_capture_at,
      confirmed_capture_end_at,
      '[)'
    ) with &&
  )
  where (
    deleted_at is null
    and request_kind = 'capture_edit'
    and status <> 'cancelado'
    and confirmed_capture_at is not null
    and confirmed_capture_duration_minutes is not null
    and confirmed_capture_end_at is not null
  );

create or replace function private.marketing_capture_conflicts(
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_excluded_request_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.marketing_requests q
    where q.deleted_at is null
      and q.request_kind = 'capture_edit'
      and q.status <> 'cancelado'
      and q.confirmed_capture_at is not null
      and q.confirmed_capture_duration_minutes is not null
      and q.id is distinct from p_excluded_request_id
      and tstzrange(
        q.confirmed_capture_at,
        q.confirmed_capture_at + q.confirmed_capture_duration_minutes * interval '1 minute',
        '[)'
      ) && tstzrange(
        p_start_at,
        p_start_at + p_duration_minutes * interval '1 minute',
        '[)'
      )
  );
$$;

revoke all on function private.marketing_capture_conflicts(timestamptz, integer, uuid) from public, anon, authenticated;

create or replace function private.marketing_filter_operational_dashboard(p_dashboard jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_dashboard, '{}'::jsonb) || jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(p_dashboard->'requests', '[]'::jsonb)) with ordinality source(item, ordinal)
      where exists (
        select 1
        from public.marketing_requests q
        where q.id = (item->>'id')::uuid
          and q.deleted_at is null
      )
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(p_dashboard->'notifications', '[]'::jsonb)) with ordinality source(item, ordinal)
      where exists (
        select 1
        from public.marketing_requests q
        where q.id = (item->>'requestId')::uuid
          and q.deleted_at is null
      )
    ), '[]'::jsonb),
    'queueOverrideRequests', coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(p_dashboard->'queueOverrideRequests', '[]'::jsonb)) with ordinality source(item, ordinal)
      where exists (
        select 1
        from public.marketing_requests q
        where q.id = (item->>'requestId')::uuid
          and q.deleted_at is null
      )
    ), '[]'::jsonb),
    'managerReviews', coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(p_dashboard->'managerReviews', '[]'::jsonb)) with ordinality source(item, ordinal)
      where exists (
        select 1
        from public.marketing_requests q
        where q.id = (item->>'requestId')::uuid
          and q.deleted_at is null
      )
    ), '[]'::jsonb),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(p_dashboard->'occupiedCaptureSlots', '[]'::jsonb)) with ordinality source(item, ordinal)
      where exists (
        select 1
        from public.marketing_requests q
        where q.id = (item->>'requestId')::uuid
          and q.deleted_at is null
      )
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.marketing_filter_operational_dashboard(jsonb) from public, anon, authenticated;

alter function public.marketing_get_dashboard(text)
  rename to marketing_get_dashboard_unfiltered_v21;
alter function public.marketing_get_dashboard_unfiltered_v21(text)
  set schema private;
revoke all on function private.marketing_get_dashboard_unfiltered_v21(text) from public, anon, authenticated;

create function public.marketing_get_dashboard(p_access_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.marketing_filter_operational_dashboard(
    private.marketing_get_dashboard_unfiltered_v21(p_access_code)
  );
$$;

alter function public.marketing_session_get_dashboard(text)
  rename to marketing_session_get_dashboard_unfiltered_v21;
alter function public.marketing_session_get_dashboard_unfiltered_v21(text)
  set schema private;
revoke all on function private.marketing_session_get_dashboard_unfiltered_v21(text) from public, anon, authenticated;

create function public.marketing_session_get_dashboard(p_session_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.marketing_filter_operational_dashboard(
    private.marketing_session_get_dashboard_unfiltered_v21(p_session_token)
  );
$$;

alter function public.marketing_v2_get_dashboard(text)
  rename to marketing_v2_get_dashboard_unfiltered_v21;
alter function public.marketing_v2_get_dashboard_unfiltered_v21(text)
  set schema private;
revoke all on function private.marketing_v2_get_dashboard_unfiltered_v21(text) from public, anon, authenticated;

create function public.marketing_v2_get_dashboard(p_session_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.marketing_filter_operational_dashboard(
    private.marketing_v2_get_dashboard_unfiltered_v21(p_session_token)
  );
$$;

alter function public.marketing_v2_get_dashboard_review(text)
  rename to marketing_v2_get_dashboard_review_unfiltered_v21;
alter function public.marketing_v2_get_dashboard_review_unfiltered_v21(text)
  set schema private;
revoke all on function private.marketing_v2_get_dashboard_review_unfiltered_v21(text) from public, anon, authenticated;

create function public.marketing_v2_get_dashboard_review(p_session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_result jsonb;
begin
  select r.user_id, r.access_role
    into v_user_id, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  v_result := private.marketing_filter_operational_dashboard(
    private.marketing_v2_get_dashboard_review_unfiltered_v21(p_session_token)
  );

  return v_result || jsonb_build_object(
    'deletedRequests', case when v_role = 'admin' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'requestNumber', q.request_number,
        'teamId', q.team_id,
        'managerName', q.manager_name,
        'brokerId', q.broker_id,
        'brokerName', q.broker_name,
        'hasPropertyCode', q.has_property_code,
        'propertyReference', case when q.has_property_code then q.property_reference else 'Sem código informado' end,
        'isExclusive', q.is_exclusive,
        'requestKind', q.request_kind,
        'contentTypes', q.content_types,
        'captureLocation', case when q.request_kind = 'capture_edit' then q.capture_location else null end,
        'preferredCaptureAt', case when q.request_kind = 'capture_edit' then q.preferred_capture_at else null end,
        'preferredCaptureDurationMinutes', case when q.request_kind = 'capture_edit' then q.preferred_capture_duration_minutes else null end,
        'confirmedCaptureAt', case when q.request_kind = 'capture_edit' then q.confirmed_capture_at else null end,
        'confirmedCaptureDurationMinutes', case when q.request_kind = 'capture_edit' then q.confirmed_capture_duration_minutes else null end,
        'assetLink', q.asset_link,
        'paidTraffic', q.paid_traffic,
        'requesterNotes', q.requester_notes,
        'marketingNotes', q.marketing_notes,
        'status', q.status,
        'assignedMarketingName', q.assigned_marketing_name,
        'promisedAt', q.promised_at,
        'urgencyRequested', q.urgency_requested,
        'urgencyReason', q.urgency_reason,
        'urgencyApproved', q.urgency_approved,
        'urgencyDecidedByName', q.urgency_decided_by_name,
        'urgencyDecidedAt', q.urgency_decided_at,
        'createdByUserId', q.created_by_user_id,
        'createdByName', q.created_by_name,
        'requestSource', q.request_source,
        'publicRequesterName', q.public_requester_name,
        'completedAt', q.completed_at,
        'createdAt', q.created_at,
        'updatedAt', q.updated_at,
        'deletedAt', q.deleted_at,
        'deletedByUserId', q.deleted_by_user_id,
        'deletedByName', q.deleted_by_name,
        'deletionReason', q.deletion_reason,
        'events', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'eventType', e.event_type,
            'fromStatus', e.from_status,
            'toStatus', e.to_status,
            'actorUserId', e.actor_user_id,
            'actorName', e.actor_name,
            'details', e.details,
            'createdAt', e.created_at
          ) order by e.created_at asc, e.id asc)
          from public.marketing_request_events e
          where e.request_id = q.id
        ), '[]'::jsonb)
      ) order by q.deleted_at desc, q.request_number desc)
      from public.marketing_requests q
      where q.deleted_at is not null
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.marketing_get_dashboard(text) from public, anon, authenticated;
revoke all on function public.marketing_session_get_dashboard(text) from public, anon, authenticated;
revoke all on function public.marketing_v2_get_dashboard(text) from public, anon, authenticated;
revoke all on function public.marketing_v2_get_dashboard_review(text) from public, anon, authenticated;

grant execute on function public.marketing_get_dashboard(text) to anon, authenticated;
grant execute on function public.marketing_session_get_dashboard(text) to anon, authenticated;
grant execute on function public.marketing_v2_get_dashboard(text) to anon, authenticated;
grant execute on function public.marketing_v2_get_dashboard_review(text) to anon, authenticated;

create or replace function public.marketing_v2_admin_update_request(
  p_session_token text,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_changes jsonb := '{}'::jsonb;
  v_team_id uuid;
  v_manager_name text;
  v_broker_id uuid;
  v_broker_name text;
  v_has_property_code boolean;
  v_property_reference text;
  v_is_exclusive boolean;
  v_request_kind text;
  v_content_types text[];
  v_capture_location text;
  v_preferred_capture_at timestamptz;
  v_preferred_duration integer;
  v_asset_link text;
  v_paid_traffic boolean;
  v_requester_notes text;
  v_urgency_requested boolean;
  v_urgency_reason text;
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;
  if jsonb_typeof(v_payload) <> 'object' then raise exception 'MARKETING_ADMIN_PAYLOAD_INVALID'; end if;
  if exists (
    select 1
    from jsonb_object_keys(v_payload) key
    where key <> all(array[
      'teamId',
      'brokerName',
      'hasPropertyCode',
      'propertyReference',
      'isExclusive',
      'requestKind',
      'contentTypes',
      'captureLocation',
      'preferredCaptureAt',
      'preferredCaptureDurationMinutes',
      'assetLink',
      'paidTraffic',
      'requesterNotes',
      'urgencyRequested',
      'urgencyReason'
    ]::text[])
  ) then
    raise exception 'MARKETING_ADMIN_FIELD_DENIED';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
    and deleted_at is null
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  v_team_id := v_request.team_id;
  if v_payload ? 'teamId' then
    v_team_id := nullif(v_payload->>'teamId', '')::uuid;
  end if;
  select t.manager_name into v_manager_name
  from public.marketing_teams t
  where t.id = v_team_id
    and t.active is true;
  if v_manager_name is null then raise exception 'MARKETING_TEAM_NOT_FOUND'; end if;

  v_broker_name := case
    when v_payload ? 'brokerName' then btrim(coalesce(v_payload->>'brokerName', ''))
    else v_request.broker_name
  end;
  if char_length(v_broker_name) not between 2 and 120 then raise exception 'MARKETING_BROKER_REQUIRED'; end if;
  select b.id into v_broker_id
  from public.marketing_brokers b
  where b.team_id = v_team_id
    and lower(btrim(b.name)) = lower(v_broker_name)
  limit 1;
  if v_broker_id is null then
    insert into public.marketing_brokers(team_id, name)
    values (v_team_id, v_broker_name)
    on conflict (team_id, (lower(btrim(name)))) do nothing
    returning id into v_broker_id;
    if v_broker_id is null then
      select b.id into v_broker_id
      from public.marketing_brokers b
      where b.team_id = v_team_id
        and lower(btrim(b.name)) = lower(v_broker_name)
      limit 1;
    end if;
  end if;

  v_has_property_code := v_request.has_property_code;
  if v_payload ? 'hasPropertyCode' then
    if jsonb_typeof(v_payload->'hasPropertyCode') <> 'boolean' then raise exception 'MARKETING_ADMIN_PAYLOAD_INVALID'; end if;
    v_has_property_code := (v_payload->>'hasPropertyCode')::boolean;
  end if;
  if v_has_property_code then
    v_property_reference := case
      when v_payload ? 'propertyReference' then nullif(btrim(coalesce(v_payload->>'propertyReference', '')), '')
      when v_request.has_property_code then v_request.property_reference
      else null
    end;
    if v_property_reference is null or char_length(v_property_reference) > 80 then
      raise exception 'MARKETING_PROPERTY_REQUIRED';
    end if;
  else
    v_property_reference := 'SEM CÓDIGO';
  end if;

  v_is_exclusive := v_request.is_exclusive;
  if v_payload ? 'isExclusive' then
    if jsonb_typeof(v_payload->'isExclusive') <> 'boolean' then raise exception 'MARKETING_EXCLUSIVITY_REQUIRED'; end if;
    v_is_exclusive := (v_payload->>'isExclusive')::boolean;
  end if;

  v_request_kind := case
    when v_payload ? 'requestKind' then v_payload->>'requestKind'
    else v_request.request_kind
  end;
  if v_request_kind not in ('capture_edit', 'edit_only') then raise exception 'MARKETING_KIND_INVALID'; end if;

  v_content_types := v_request.content_types;
  if v_payload ? 'contentTypes' then
    if jsonb_typeof(v_payload->'contentTypes') <> 'array' then raise exception 'MARKETING_CONTENT_INVALID'; end if;
    select array_agg(value order by ordinal)
      into v_content_types
    from jsonb_array_elements_text(v_payload->'contentTypes') with ordinality values_with_order(value, ordinal);
    if coalesce(cardinality(v_content_types), 0) = 0
      or cardinality(v_content_types) > 5
      or exists (
        select 1 from unnest(v_content_types) value
        where value not in ('video', 'fotos', 'carrossel', 'post_estatico', 'outro')
      )
      or (select count(*) from unnest(v_content_types)) <> (select count(distinct value) from unnest(v_content_types) value) then
      raise exception 'MARKETING_CONTENT_INVALID';
    end if;
  end if;

  v_capture_location := case
    when v_payload ? 'captureLocation' then nullif(btrim(coalesce(v_payload->>'captureLocation', '')), '')
    else v_request.capture_location
  end;
  v_preferred_capture_at := case
    when v_payload ? 'preferredCaptureAt' then nullif(v_payload->>'preferredCaptureAt', '')::timestamptz
    else v_request.preferred_capture_at
  end;
  v_preferred_duration := case
    when v_payload ? 'preferredCaptureDurationMinutes' then nullif(v_payload->>'preferredCaptureDurationMinutes', '')::integer
    else v_request.preferred_capture_duration_minutes
  end;

  if v_request_kind = 'edit_only' then
    if v_request.request_kind <> 'edit_only'
      and (v_request.confirmed_capture_at is not null or v_request.confirmed_capture_duration_minutes is not null) then
      raise exception 'MARKETING_ADMIN_KIND_CONFIRMED_CAPTURE_DENIED';
    end if;
    v_capture_location := null;
    v_preferred_capture_at := null;
    v_preferred_duration := null;
  else
    if v_capture_location is not null and char_length(v_capture_location) > 300 then
      raise exception 'MARKETING_CAPTURE_LOCATION_INVALID';
    end if;
    if (v_preferred_capture_at is null) <> (v_preferred_duration is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;
    if v_preferred_capture_at is not null
      and not private.marketing_capture_window_is_valid(v_preferred_capture_at, v_preferred_duration) then
      raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
    end if;
  end if;

  v_asset_link := case
    when v_payload ? 'assetLink' then nullif(btrim(coalesce(v_payload->>'assetLink', '')), '')
    else v_request.asset_link
  end;
  if v_asset_link is not null
    and (char_length(v_asset_link) > 2000 or v_asset_link !~* '^https?://') then
    raise exception 'MARKETING_ASSET_LINK_INVALID';
  end if;

  v_paid_traffic := v_request.paid_traffic;
  if v_payload ? 'paidTraffic' then
    if jsonb_typeof(v_payload->'paidTraffic') <> 'boolean' then raise exception 'MARKETING_ADMIN_PAYLOAD_INVALID'; end if;
    v_paid_traffic := (v_payload->>'paidTraffic')::boolean;
  end if;

  v_requester_notes := case
    when v_payload ? 'requesterNotes' then nullif(btrim(coalesce(v_payload->>'requesterNotes', '')), '')
    else v_request.requester_notes
  end;
  if v_requester_notes is not null and char_length(v_requester_notes) > 3000 then
    raise exception 'MARKETING_NOTES_TOO_LONG';
  end if;

  v_urgency_requested := v_request.urgency_requested;
  if v_payload ? 'urgencyRequested' then
    if jsonb_typeof(v_payload->'urgencyRequested') <> 'boolean' then raise exception 'MARKETING_ADMIN_PAYLOAD_INVALID'; end if;
    v_urgency_requested := (v_payload->>'urgencyRequested')::boolean;
  end if;
  v_urgency_reason := case
    when v_payload ? 'urgencyReason' then nullif(btrim(coalesce(v_payload->>'urgencyReason', '')), '')
    else v_request.urgency_reason
  end;
  if v_request.urgency_decided_at is not null
    and (
      v_request.urgency_requested is distinct from v_urgency_requested
      or v_request.urgency_reason is distinct from v_urgency_reason
    ) then
    raise exception 'MARKETING_URGENCY_ALREADY_DECIDED';
  end if;
  if v_urgency_requested then
    if v_urgency_reason is null or char_length(v_urgency_reason) > 1000 then
      raise exception 'MARKETING_URGENCY_REASON_REQUIRED';
    end if;
  else
    v_urgency_reason := null;
  end if;

  if v_request.team_id is distinct from v_team_id then
    v_changes := v_changes || jsonb_build_object('teamId', jsonb_build_object('from', v_request.team_id, 'to', v_team_id, 'fromLabel', v_request.manager_name, 'toLabel', v_manager_name));
  end if;
  if v_request.broker_name is distinct from v_broker_name then
    v_changes := v_changes || jsonb_build_object('brokerName', jsonb_build_object('from', v_request.broker_name, 'to', v_broker_name));
  end if;
  if v_request.has_property_code is distinct from v_has_property_code then
    v_changes := v_changes || jsonb_build_object('hasPropertyCode', jsonb_build_object('from', v_request.has_property_code, 'to', v_has_property_code));
  end if;
  if v_request.property_reference is distinct from v_property_reference then
    v_changes := v_changes || jsonb_build_object('propertyReference', jsonb_build_object('from', case when v_request.has_property_code then v_request.property_reference else 'Sem código informado' end, 'to', case when v_has_property_code then v_property_reference else 'Sem código informado' end));
  end if;
  if v_request.is_exclusive is distinct from v_is_exclusive then
    v_changes := v_changes || jsonb_build_object('isExclusive', jsonb_build_object('from', v_request.is_exclusive, 'to', v_is_exclusive));
  end if;
  if v_request.request_kind is distinct from v_request_kind then
    v_changes := v_changes || jsonb_build_object('requestKind', jsonb_build_object('from', v_request.request_kind, 'to', v_request_kind));
  end if;
  if v_request.content_types is distinct from v_content_types then
    v_changes := v_changes || jsonb_build_object('contentTypes', jsonb_build_object('from', v_request.content_types, 'to', v_content_types));
  end if;
  if v_request.capture_location is distinct from v_capture_location then
    v_changes := v_changes || jsonb_build_object('captureLocation', jsonb_build_object('from', v_request.capture_location, 'to', v_capture_location));
  end if;
  if v_request.preferred_capture_at is distinct from v_preferred_capture_at then
    v_changes := v_changes || jsonb_build_object('preferredCaptureAt', jsonb_build_object('from', v_request.preferred_capture_at, 'to', v_preferred_capture_at));
  end if;
  if v_request.preferred_capture_duration_minutes is distinct from v_preferred_duration then
    v_changes := v_changes || jsonb_build_object('preferredCaptureDurationMinutes', jsonb_build_object('from', v_request.preferred_capture_duration_minutes, 'to', v_preferred_duration));
  end if;
  if v_request.asset_link is distinct from v_asset_link then
    v_changes := v_changes || jsonb_build_object('assetLink', jsonb_build_object('from', v_request.asset_link, 'to', v_asset_link));
  end if;
  if v_request.paid_traffic is distinct from v_paid_traffic then
    v_changes := v_changes || jsonb_build_object('paidTraffic', jsonb_build_object('from', v_request.paid_traffic, 'to', v_paid_traffic));
  end if;
  if v_request.requester_notes is distinct from v_requester_notes then
    v_changes := v_changes || jsonb_build_object('requesterNotes', jsonb_build_object('from', v_request.requester_notes, 'to', v_requester_notes));
  end if;
  if v_request.urgency_requested is distinct from v_urgency_requested then
    v_changes := v_changes || jsonb_build_object('urgencyRequested', jsonb_build_object('from', v_request.urgency_requested, 'to', v_urgency_requested));
  end if;
  if v_request.urgency_reason is distinct from v_urgency_reason then
    v_changes := v_changes || jsonb_build_object('urgencyReason', jsonb_build_object('from', v_request.urgency_reason, 'to', v_urgency_reason));
  end if;
  if v_changes = '{}'::jsonb then raise exception 'MARKETING_ADMIN_UPDATE_NO_CHANGES'; end if;

  update public.marketing_requests
  set team_id = v_team_id,
      manager_name = v_manager_name,
      broker_id = v_broker_id,
      broker_name = v_broker_name,
      has_property_code = v_has_property_code,
      property_reference = v_property_reference,
      is_exclusive = v_is_exclusive,
      request_kind = v_request_kind,
      content_types = v_content_types,
      capture_location = v_capture_location,
      preferred_capture_at = v_preferred_capture_at,
      preferred_capture_duration_minutes = v_preferred_duration,
      asset_link = v_asset_link,
      paid_traffic = v_paid_traffic,
      requester_notes = v_requester_notes,
      urgency_requested = v_urgency_requested,
      urgency_reason = v_urgency_reason
  where id = v_request.id;

  insert into public.marketing_request_events(
    request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
  ) values (
    v_request.id,
    'pedido_editado_admin',
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('changes', v_changes)
  );

  return v_changes;
end;
$$;

create or replace function public.marketing_v2_admin_delete_request(
  p_session_token text,
  p_request_id uuid,
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
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;
  if v_reason is null or char_length(v_reason) not between 5 and 2000 then
    raise exception 'MARKETING_DELETION_REASON_REQUIRED';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.deleted_at is not null then raise exception 'MARKETING_REQUEST_ALREADY_DELETED'; end if;

  update public.marketing_requests
  set deleted_at = now(),
      deleted_by_user_id = v_user_id,
      deleted_by_name = v_user_name,
      deletion_reason = v_reason
  where id = v_request.id;

  insert into public.marketing_request_events(
    request_id, event_type, from_status, to_status, actor_user_id, actor_name, details
  ) values (
    v_request.id,
    'pedido_excluido_admin',
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('reason', v_reason, 'deletedBy', v_user_name)
  );
end;
$$;

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
    if (v_request.preferred_capture_at is null) <> (v_request.preferred_capture_duration_minutes is null)
      or (v_request.confirmed_capture_at is null) <> (v_request.confirmed_capture_duration_minutes is null) then
      raise exception 'MARKETING_RESTORE_DATA_INVALID';
    end if;
    if v_request.preferred_capture_at is not null
      and not private.marketing_capture_window_is_valid(v_request.preferred_capture_at, v_request.preferred_capture_duration_minutes) then
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

revoke all on function public.marketing_v2_admin_update_request(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_v2_admin_delete_request(text, uuid, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_admin_restore_request(text, uuid) from public, anon, authenticated;

grant execute on function public.marketing_v2_admin_update_request(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.marketing_v2_admin_delete_request(text, uuid, text) to anon, authenticated;
grant execute on function public.marketing_v2_admin_restore_request(text, uuid) to anon, authenticated;

create or replace function public.marketing_public_get_availability()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_start_date date;
  v_end_date date;
begin
  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';

  if v_settings.id is null then
    raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED';
  end if;

  v_start_date := (now() at time zone v_settings.timezone)::date;
  v_end_date := v_start_date + 35;

  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', to_char(v_settings.workday_start, 'HH24:MI'),
      'workdayEnd', to_char(v_settings.workday_end, 'HH24:MI'),
      'durationOptionsMinutes', v_settings.duration_options_minutes
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'startAt', q.confirmed_capture_at,
        'durationMinutes', q.confirmed_capture_duration_minutes
      ) order by q.confirmed_capture_at)
      from public.marketing_requests q
      where q.deleted_at is null
        and q.request_kind = 'capture_edit'
        and q.status <> 'cancelado'
        and q.confirmed_capture_at is not null
        and q.confirmed_capture_duration_minutes is not null
        and (q.confirmed_capture_at at time zone v_settings.timezone)::date >= v_start_date
        and (q.confirmed_capture_at at time zone v_settings.timezone)::date < v_end_date
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.marketing_v2_request_queue_override(
  p_session_token text,
  p_request_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_user_name text;
  v_role text;
  v_request public.marketing_requests%rowtype;
  v_blocking_request_id uuid;
  v_override_id uuid;
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'marketing' then raise exception 'MARKETING_OVERRIDE_REQUEST_DENIED'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'MARKETING_OVERRIDE_REASON_REQUIRED';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
    and deleted_at is null
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.status not in ('solicitado', 'bloqueado') then
    raise exception 'MARKETING_OVERRIDE_NOT_NEEDED';
  end if;

  select q.id into v_blocking_request_id
  from public.marketing_requests q
  where q.deleted_at is null
    and q.status = 'solicitado'
    and q.id <> p_request_id
    and (
      (q.urgency_approved is true and v_request.urgency_approved is false)
      or (
        q.urgency_approved = v_request.urgency_approved
        and (q.created_at, q.request_number) < (v_request.created_at, v_request.request_number)
      )
    )
  order by q.urgency_approved desc, q.created_at asc, q.request_number asc
  limit 1;

  if v_blocking_request_id is null then
    raise exception 'MARKETING_OVERRIDE_NOT_NEEDED';
  end if;
  if exists (
    select 1 from public.marketing_queue_override_requests o
    where o.request_id = p_request_id and o.status = 'pending'
  ) then
    raise exception 'MARKETING_OVERRIDE_ALREADY_PENDING';
  end if;

  begin
    insert into public.marketing_queue_override_requests (
      request_id,
      blocking_request_id,
      requested_by_user_id,
      requested_by_name,
      reason
    ) values (
      p_request_id,
      v_blocking_request_id,
      v_user_id,
      v_user_name,
      btrim(p_reason)
    ) returning id into v_override_id;
  exception when unique_violation then
    raise exception 'MARKETING_OVERRIDE_ALREADY_PENDING';
  end;

  insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
  values (
    p_request_id,
    'alteracao_fila_solicitada',
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('overrideRequestId', v_override_id, 'blockingRequestId', v_blocking_request_id, 'reason', btrim(p_reason))
  );

  return v_override_id;
end;
$$;

create or replace function public.marketing_v2_decide_queue_override(
  p_session_token text,
  p_override_request_id uuid,
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
  v_override public.marketing_queue_override_requests%rowtype;
  v_request public.marketing_requests%rowtype;
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'admin' then raise exception 'MARKETING_ADMIN_REQUIRED'; end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'MARKETING_OVERRIDE_DECISION_INVALID';
  end if;

  select * into v_override
  from public.marketing_queue_override_requests
  where id = p_override_request_id
  for update;
  if v_override.id is null then raise exception 'MARKETING_OVERRIDE_NOT_FOUND'; end if;
  if v_override.status <> 'pending' then raise exception 'MARKETING_OVERRIDE_ALREADY_DECIDED'; end if;

  select * into v_request
  from public.marketing_requests
  where id = v_override.request_id
    and deleted_at is null;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  update public.marketing_queue_override_requests
  set status = p_decision,
      decided_by_user_id = v_user_id,
      decided_by_name = v_user_name,
      decided_at = now()
  where id = p_override_request_id;

  insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
  values (
    v_override.request_id,
    case when p_decision = 'approved' then 'alteracao_fila_aprovada' else 'alteracao_fila_rejeitada' end,
    v_request.status,
    v_request.status,
    v_user_id,
    v_user_name,
    jsonb_build_object('overrideRequestId', p_override_request_id, 'decision', p_decision)
  );
end;
$$;

revoke all on function public.marketing_public_get_availability() from public, anon, authenticated;
revoke all on function public.marketing_v2_request_queue_override(text, uuid, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_decide_queue_override(text, uuid, text) from public, anon, authenticated;

grant execute on function public.marketing_public_get_availability() to anon, authenticated;
grant execute on function public.marketing_v2_request_queue_override(text, uuid, text) to anon, authenticated;
grant execute on function public.marketing_v2_decide_queue_override(text, uuid, text) to anon, authenticated;

create or replace function public.marketing_v2_update_request(
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
  v_role text;
  v_actor_team_id uuid;
  v_request public.marketing_requests%rowtype;
  v_status text;
  v_confirmed timestamptz;
  v_confirmed_duration integer;
  v_promised timestamptz;
  v_assigned text;
  v_marketing_notes text;
  v_blocking_request_id uuid;
  v_override_id uuid;
  v_timezone text;
  v_capture_message text;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_actor_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
    and deleted_at is null
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  select s.timezone into v_timezone
  from public.marketing_schedule_settings s
  where s.id = 'default';

  if p_action = 'cancel' then
    if v_role = 'sales_manager' and v_request.team_id is distinct from v_actor_team_id then
      raise exception 'MARKETING_REQUEST_DENIED';
    end if;
    if v_role not in ('admin', 'marketing', 'sales_manager') then
      raise exception 'MARKETING_REQUEST_DENIED';
    end if;

    update public.marketing_requests
    set status = 'cancelado', completed_at = now()
    where id = p_request_id;

    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'cancelado', v_request.status, 'cancelado', v_user_id, v_user_name, p_payload);

    if v_role <> 'sales_manager' and v_request.status <> 'cancelado' then
      perform private.marketing_notify_manager(
        p_request_id,
        'status_alterado',
        'Pedido cancelado',
        format('Pedido #%s · %s foi cancelado.', v_request.request_number, v_request.broker_name),
        v_user_id,
        v_user_name
      );
    end if;
    return;
  end if;

  if p_action = 'approve_urgency' then
    if v_role <> 'admin' then raise exception 'MARKETING_URGENCY_DENIED'; end if;
    update public.marketing_requests
    set urgency_requested = true,
        urgency_approved = true,
        urgency_decided_by_name = v_user_name,
        urgency_decided_at = now()
    where id = p_request_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'urgencia_aprovada', v_request.status, v_request.status, v_user_id, v_user_name, p_payload);
    return;
  end if;

  if p_action = 'reject_urgency' then
    if v_role <> 'admin' then raise exception 'MARKETING_URGENCY_DENIED'; end if;
    update public.marketing_requests
    set urgency_approved = false,
        urgency_decided_by_name = v_user_name,
        urgency_decided_at = now()
    where id = p_request_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'urgencia_mantida_na_fila', v_request.status, v_request.status, v_user_id, v_user_name, p_payload);
    return;
  end if;

  if p_action <> 'save_management' or v_role not in ('admin', 'marketing') then
    raise exception 'MARKETING_UPDATE_DENIED';
  end if;

  v_status := coalesce(nullif(p_payload->>'status', ''), v_request.status);
  if v_status not in ('solicitado', 'agendado', 'aguardando_edicao', 'em_edicao', 'em_aprovacao', 'revisao', 'pronto', 'bloqueado', 'cancelado') then
    raise exception 'MARKETING_STATUS_INVALID';
  end if;

  v_promised := case
    when p_payload ? 'promisedAt' then nullif(p_payload->>'promisedAt', '')::timestamptz
    else v_request.promised_at
  end;
  v_assigned := case
    when p_payload ? 'assignedMarketingName' then nullif(btrim(p_payload->>'assignedMarketingName'), '')
    else v_request.assigned_marketing_name
  end;
  v_marketing_notes := case
    when p_payload ? 'marketingNotes' then nullif(btrim(p_payload->>'marketingNotes'), '')
    else v_request.marketing_notes
  end;

  if v_assigned is not null and v_assigned not in ('Maria', 'Arthur') then
    raise exception 'MARKETING_ASSIGNEE_INVALID';
  end if;

  if v_request.request_kind = 'edit_only' then
    if (p_payload ? 'confirmedCaptureAt' and nullif(p_payload->>'confirmedCaptureAt', '') is not null)
      or (p_payload ? 'confirmedCaptureDurationMinutes' and nullif(p_payload->>'confirmedCaptureDurationMinutes', '') is not null) then
      raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED';
    end if;
    v_confirmed := v_request.confirmed_capture_at;
    v_confirmed_duration := v_request.confirmed_capture_duration_minutes;
  else
    v_confirmed := case
      when p_payload ? 'confirmedCaptureAt' then nullif(p_payload->>'confirmedCaptureAt', '')::timestamptz
      else v_request.confirmed_capture_at
    end;
    v_confirmed_duration := case
      when p_payload ? 'confirmedCaptureDurationMinutes' then nullif(p_payload->>'confirmedCaptureDurationMinutes', '')::integer
      else v_request.confirmed_capture_duration_minutes
    end;

    if (v_confirmed is null) <> (v_confirmed_duration is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;

    if v_confirmed is not null and v_status <> 'cancelado' then
      if not private.marketing_capture_window_is_valid(v_confirmed, v_confirmed_duration) then
        raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_capture_schedule', 0));
      if private.marketing_capture_conflicts(v_confirmed, v_confirmed_duration, p_request_id) then
        raise exception 'MARKETING_CAPTURE_CONFLICT';
      end if;
    end if;
  end if;

  if v_request.status in ('solicitado', 'bloqueado')
    and v_status not in ('solicitado', 'bloqueado', 'cancelado') then
    select q.id into v_blocking_request_id
    from public.marketing_requests q
    where q.deleted_at is null
      and q.status = 'solicitado'
      and q.id <> p_request_id
      and (
        (q.urgency_approved is true and v_request.urgency_approved is false)
        or (
          q.urgency_approved = v_request.urgency_approved
          and (q.created_at, q.request_number) < (v_request.created_at, v_request.request_number)
        )
      )
    order by q.urgency_approved desc, q.created_at asc, q.request_number asc
    limit 1;

    if v_blocking_request_id is not null then
      select o.id into v_override_id
      from public.marketing_queue_override_requests o
      where o.request_id = p_request_id
        and o.status = 'approved'
        and o.consumed_at is null
        and o.blocking_request_id = v_blocking_request_id
      order by o.decided_at desc
      limit 1
      for update;

      if v_override_id is null then
        raise exception 'MARKETING_QUEUE_ORDER_BLOCKED';
      end if;
    end if;
  end if;

  update public.marketing_requests
  set status = v_status,
      confirmed_capture_at = case when v_request.request_kind = 'capture_edit' then v_confirmed else confirmed_capture_at end,
      confirmed_capture_duration_minutes = case when v_request.request_kind = 'capture_edit' then v_confirmed_duration else confirmed_capture_duration_minutes end,
      promised_at = v_promised,
      assigned_marketing_name = v_assigned,
      marketing_notes = v_marketing_notes,
      completed_at = case when v_status in ('pronto', 'cancelado') then coalesce(completed_at, now()) else null end
  where id = p_request_id;

  if v_override_id is not null then
    update public.marketing_queue_override_requests
    set consumed_at = now()
    where id = v_override_id;
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      'alteracao_fila_utilizada',
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('overrideRequestId', v_override_id, 'blockingRequestId', v_blocking_request_id)
    );
  end if;

  if v_request.status is distinct from v_status then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (p_request_id, 'status_alterado', v_request.status, v_status, v_user_id, v_user_name, jsonb_build_object('status', v_status));

    perform private.marketing_notify_manager(
      p_request_id,
      case
        when v_status = 'pronto' then 'pedido_pronto'
        when v_status = 'bloqueado' then 'pedido_bloqueado'
        when v_request.status = 'bloqueado' then 'pedido_desbloqueado'
        else 'status_alterado'
      end,
      case
        when v_status = 'pronto' then 'Pedido pronto'
        when v_status = 'bloqueado' then 'Pedido bloqueado'
        when v_request.status = 'bloqueado' then 'Pedido desbloqueado'
        else 'Status do pedido atualizado'
      end,
      format(
        'Pedido #%s · %s: %s.',
        v_request.request_number,
        v_request.broker_name,
        private.marketing_status_label(v_status)
      ),
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.request_kind = 'capture_edit'
    and (
      v_request.confirmed_capture_at is distinct from v_confirmed
      or v_request.confirmed_capture_duration_minutes is distinct from v_confirmed_duration
    ) then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      case when v_request.confirmed_capture_at is null then 'data_confirmada' else 'data_confirmada_alterada' end,
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('confirmedCaptureAt', v_confirmed, 'confirmedCaptureDurationMinutes', v_confirmed_duration)
    );

    v_capture_message := case
      when v_confirmed is null then 'A captação voltou a aguardar definição do Marketing.'
      else format(
        'Captação confirmada: %s · duração de %s minutos.',
        to_char(v_confirmed at time zone v_timezone, 'DD/MM/YYYY "às" HH24:MI'),
        v_confirmed_duration
      )
    end;

    perform private.marketing_notify_manager(
      p_request_id,
      case when v_request.confirmed_capture_at is null then 'captacao_confirmada' else 'captacao_alterada' end,
      case when v_request.confirmed_capture_at is null then 'Captação confirmada' else 'Captação alterada' end,
      v_capture_message,
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.promised_at is distinct from v_promised then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      case when v_request.promised_at is null then 'previsao_entrega_definida' else 'previsao_entrega_alterada' end,
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('promisedAt', v_promised)
    );
    perform private.marketing_notify_manager(
      p_request_id,
      'previsao_entrega',
      'Previsão de entrega atualizada',
      case
        when v_promised is null then 'A previsão de entrega foi retirada e será redefinida pelo Marketing.'
        else format('Previsão de entrega: %s.', to_char(v_promised at time zone v_timezone, 'DD/MM/YYYY "às" HH24:MI'))
      end,
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.assigned_marketing_name is distinct from v_assigned then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      'responsavel_definido',
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      jsonb_build_object('assignedMarketingName', v_assigned)
    );
    perform private.marketing_notify_manager(
      p_request_id,
      'responsavel_definido',
      'Responsável do Marketing atualizado',
      case when v_assigned is null then 'O pedido está aguardando definição de responsável.' else format('Responsável: %s.', v_assigned) end,
      v_user_id,
      v_user_name
    );
  end if;

  if v_request.marketing_notes is distinct from v_marketing_notes then
    insert into public.marketing_request_events(request_id, event_type, from_status, to_status, actor_user_id, actor_name, details)
    values (
      p_request_id,
      'observacao_interna_atualizada',
      v_request.status,
      v_status,
      v_user_id,
      v_user_name,
      '{}'::jsonb
    );
  end if;
end;
$$;

revoke all on function public.marketing_v2_update_request(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_v2_update_request(text, uuid, text, jsonb) to anon, authenticated;
