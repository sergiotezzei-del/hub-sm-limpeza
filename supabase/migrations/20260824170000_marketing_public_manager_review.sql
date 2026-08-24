alter table public.marketing_requests
  add column if not exists request_source text not null default 'hub',
  add column if not exists public_requester_name text,
  add column if not exists public_submission_id uuid;

alter table public.marketing_requests
  alter column created_by_user_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_source_valid'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_source_valid
      check (request_source in ('hub', 'public'));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'marketing_requests_public_requester_valid'
      and conrelid = 'public.marketing_requests'::regclass
  ) then
    alter table public.marketing_requests
      add constraint marketing_requests_public_requester_valid
      check (
        (request_source = 'hub' and public_requester_name is null and public_submission_id is null)
        or (
          request_source = 'public'
          and char_length(btrim(coalesce(public_requester_name, ''))) between 2 and 120
          and public_submission_id is not null
        )
      );
  end if;
end;
$$;

create table if not exists public.marketing_manager_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests(id) on delete restrict,
  team_id uuid not null references public.marketing_teams(id) on delete restrict,
  opened_by_user_id text not null references public.managed_users(id) on update cascade on delete restrict,
  opened_by_name text not null check (btrim(opened_by_name) <> ''),
  reason text not null check (
    reason in (
      'property_code_divergent',
      'incomplete_request',
      'incorrect_service',
      'capture_confirmation',
      'content_validation',
      'other'
    )
  ),
  details text not null check (char_length(btrim(details)) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'modified', 'declined')),
  manager_user_id text not null references public.managed_users(id) on update cascade on delete restrict,
  manager_name text,
  manager_response text check (manager_response is null or char_length(manager_response) <= 2000),
  decided_at timestamptz,
  return_status text not null check (
    return_status in ('solicitado', 'agendado', 'aguardando_edicao', 'em_edicao', 'em_aprovacao', 'revisao', 'bloqueado')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and manager_name is null and decided_at is null)
    or (status <> 'pending' and nullif(btrim(coalesce(manager_name, '')), '') is not null and decided_at is not null)
  )
);

create or replace function public.marketing_v2_get_dashboard_review(p_session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_role text;
  v_team_id uuid;
  v_result jsonb;
  v_requests jsonb;
begin
  select r.user_id, r.access_role, r.team_id
    into v_user_id, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;

  if v_user_id is null then
    raise exception 'MARKETING_SESSION_EXPIRED';
  end if;

  v_result := public.marketing_v2_get_dashboard(p_session_token);

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'requestSource', q.request_source,
      'publicRequesterName', q.public_requester_name,
      'isExclusive', q.is_exclusive,
      'managerReviewStatus', latest_review.status,
      'managerReviewUpdatedAt', latest_review.updated_at
    )
    order by (item->>'urgencyApproved')::boolean desc, (item->>'createdAt')::timestamptz asc, (item->>'requestNumber')::bigint asc
  ), '[]'::jsonb)
    into v_requests
  from jsonb_array_elements(coalesce(v_result->'requests', '[]'::jsonb)) item
  join public.marketing_requests q on q.id = (item->>'id')::uuid
  left join lateral (
    select r.status, r.updated_at
    from public.marketing_manager_reviews r
    where r.request_id = q.id
    order by r.created_at desc
    limit 1
  ) latest_review on true;

  return v_result || jsonb_build_object(
    'requests', v_requests,
    'managerReviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', review.id,
        'requestId', review.request_id,
        'requestNumber', q.request_number,
        'teamId', review.team_id,
        'managerName', q.manager_name,
        'brokerName', q.broker_name,
        'propertyLabel', case when q.has_property_code then q.property_reference else 'Sem código informado' end,
        'openedByUserId', review.opened_by_user_id,
        'openedByName', review.opened_by_name,
        'reason', review.reason,
        'details', review.details,
        'status', review.status,
        'managerUserId', review.manager_user_id,
        'reviewManagerName', review.manager_name,
        'managerResponse', review.manager_response,
        'decidedAt', review.decided_at,
        'returnStatus', review.return_status,
        'createdAt', review.created_at,
        'updatedAt', review.updated_at
      ) order by (review.status = 'pending') desc, review.updated_at desc)
      from public.marketing_manager_reviews review
      join public.marketing_requests q on q.id = review.request_id
      where (v_role in ('admin', 'marketing'))
        or (
          v_role = 'sales_manager'
          and review.manager_user_id = v_user_id
          and review.team_id = v_team_id
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.marketing_v2_open_manager_review(
  p_session_token text,
  p_request_id uuid,
  p_reason text,
  p_details text
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
  v_manager_user_id text;
  v_review_id uuid;
  v_details text := btrim(coalesce(p_details, ''));
begin
  select r.user_id, r.user_name, r.access_role
    into v_user_id, v_user_name, v_role
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role not in ('admin', 'marketing') then raise exception 'MARKETING_MANAGER_REVIEW_OPEN_DENIED'; end if;
  if p_reason not in (
    'property_code_divergent',
    'incomplete_request',
    'incorrect_service',
    'capture_confirmation',
    'content_validation',
    'other'
  ) then
    raise exception 'MARKETING_MANAGER_REVIEW_REASON_INVALID';
  end if;
  if char_length(v_details) not between 5 and 2000 then
    raise exception 'MARKETING_MANAGER_REVIEW_DETAILS_REQUIRED';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.status in ('pronto', 'cancelado') then
    raise exception 'MARKETING_MANAGER_REVIEW_REQUEST_CLOSED';
  end if;
  if exists (
    select 1
    from public.marketing_manager_reviews review
    where review.request_id = p_request_id
      and review.status = 'pending'
  ) then
    raise exception 'MARKETING_MANAGER_REVIEW_ALREADY_PENDING';
  end if;

  select a.managed_user_id into v_manager_user_id
  from public.marketing_access a
  join public.managed_users u on u.id = a.managed_user_id and u.active is true
  where a.role = 'sales_manager'
    and a.team_id = v_request.team_id
    and a.active is true
  order by a.updated_at desc, a.managed_user_id
  limit 1;
  if v_manager_user_id is null then
    raise exception 'MARKETING_MANAGER_REVIEW_MANAGER_NOT_FOUND';
  end if;

  begin
    insert into public.marketing_manager_reviews (
      request_id,
      team_id,
      opened_by_user_id,
      opened_by_name,
      reason,
      details,
      manager_user_id,
      return_status
    ) values (
      p_request_id,
      v_request.team_id,
      v_user_id,
      v_user_name,
      p_reason,
      v_details,
      v_manager_user_id,
      v_request.status
    ) returning id into v_review_id;
  exception when unique_violation then
    raise exception 'MARKETING_MANAGER_REVIEW_ALREADY_PENDING';
  end;

  update public.marketing_requests
  set status = 'bloqueado',
      completed_at = null
  where id = p_request_id;

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
    'auditoria_solicitada',
    v_request.status,
    'bloqueado',
    v_user_id,
    v_user_name,
    jsonb_build_object(
      'reviewId', v_review_id,
      'reason', p_reason,
      'details', v_details,
      'managerUserId', v_manager_user_id,
      'returnStatus', v_request.status
    )
  );

  perform private.marketing_notify_manager(
    p_request_id,
    'auditoria_gerente',
    'Marketing pediu sua conferência',
    format('Pedido #%s · %s. Motivo: %s', v_request.request_number, v_request.broker_name, v_details),
    v_user_id,
    v_user_name
  );

  return v_review_id;
end;
$$;

create or replace function public.marketing_v2_resolve_manager_review(
  p_session_token text,
  p_review_id uuid,
  p_decision text,
  p_manager_response text default null,
  p_corrections jsonb default '{}'::jsonb
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
  v_team_id uuid;
  v_review public.marketing_manager_reviews%rowtype;
  v_request public.marketing_requests%rowtype;
  v_response text := nullif(btrim(coalesce(p_manager_response, '')), '');
  v_corrections jsonb := coalesce(p_corrections, '{}'::jsonb);
  v_changes jsonb := '{}'::jsonb;
  v_broker_name text;
  v_broker_id uuid;
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
  v_event_type text;
  v_target_status text;
begin
  select r.user_id, r.user_name, r.access_role, r.team_id
    into v_user_id, v_user_name, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;
  if v_role <> 'sales_manager' then raise exception 'MARKETING_MANAGER_REVIEW_DECIDE_DENIED'; end if;
  if p_decision not in ('confirmed', 'modified', 'declined') then
    raise exception 'MARKETING_MANAGER_REVIEW_DECISION_INVALID';
  end if;
  if v_response is not null and char_length(v_response) > 2000 then
    raise exception 'MARKETING_MANAGER_REVIEW_RESPONSE_TOO_LONG';
  end if;
  if p_decision = 'declined' and (v_response is null or char_length(v_response) < 3) then
    raise exception 'MARKETING_MANAGER_REVIEW_DECLINE_REASON_REQUIRED';
  end if;

  select * into v_review
  from public.marketing_manager_reviews
  where id = p_review_id
  for update;
  if v_review.id is null then raise exception 'MARKETING_MANAGER_REVIEW_NOT_FOUND'; end if;
  if v_review.status <> 'pending' then raise exception 'MARKETING_MANAGER_REVIEW_ALREADY_DECIDED'; end if;
  if v_review.manager_user_id <> v_user_id or v_review.team_id is distinct from v_team_id then
    raise exception 'MARKETING_MANAGER_REVIEW_DECIDE_DENIED';
  end if;

  select * into v_request
  from public.marketing_requests
  where id = v_review.request_id
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'bloqueado' then raise exception 'MARKETING_MANAGER_REVIEW_REQUEST_NOT_BLOCKED'; end if;

  if p_decision = 'modified' then
    if jsonb_typeof(v_corrections) <> 'object' then
      raise exception 'MARKETING_MANAGER_REVIEW_CORRECTIONS_INVALID';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(v_corrections) key
      where key <> all(array[
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
      raise exception 'MARKETING_MANAGER_REVIEW_FIELD_DENIED';
    end if;

    v_broker_name := v_request.broker_name;
    v_broker_id := v_request.broker_id;
    v_has_property_code := v_request.has_property_code;
    v_property_reference := v_request.property_reference;
    v_is_exclusive := v_request.is_exclusive;
    v_request_kind := v_request.request_kind;
    v_content_types := v_request.content_types;
    v_capture_location := v_request.capture_location;
    v_preferred_capture_at := v_request.preferred_capture_at;
    v_preferred_duration := v_request.preferred_capture_duration_minutes;
    v_asset_link := v_request.asset_link;
    v_paid_traffic := v_request.paid_traffic;
    v_requester_notes := v_request.requester_notes;
    v_urgency_requested := v_request.urgency_requested;
    v_urgency_reason := v_request.urgency_reason;

    if v_corrections ? 'brokerName' then
      v_broker_name := btrim(coalesce(v_corrections->>'brokerName', ''));
      if char_length(v_broker_name) not between 2 and 120 then raise exception 'MARKETING_BROKER_REQUIRED'; end if;
      select b.id into v_broker_id
      from public.marketing_brokers b
      where b.team_id = v_request.team_id
        and lower(btrim(b.name)) = lower(v_broker_name)
      limit 1;
      if v_broker_id is null then
        insert into public.marketing_brokers(team_id, name)
        values (v_request.team_id, v_broker_name)
        on conflict (team_id, (lower(btrim(name)))) do nothing
        returning id into v_broker_id;
        if v_broker_id is null then
          select b.id into v_broker_id
          from public.marketing_brokers b
          where b.team_id = v_request.team_id
            and lower(btrim(b.name)) = lower(v_broker_name)
          limit 1;
        end if;
      end if;
    end if;

    if v_corrections ? 'hasPropertyCode' then
      if jsonb_typeof(v_corrections->'hasPropertyCode') <> 'boolean' then
        raise exception 'MARKETING_MANAGER_REVIEW_CORRECTIONS_INVALID';
      end if;
      v_has_property_code := (v_corrections->>'hasPropertyCode')::boolean;
    end if;
    if v_has_property_code then
      if v_corrections ? 'propertyReference' then
        v_property_reference := nullif(btrim(coalesce(v_corrections->>'propertyReference', '')), '');
      elsif not v_request.has_property_code then
        v_property_reference := null;
      end if;
      if v_property_reference is null or char_length(v_property_reference) > 80 then
        raise exception 'MARKETING_PROPERTY_REQUIRED';
      end if;
    else
      v_property_reference := 'SEM CÓDIGO';
    end if;

    if v_corrections ? 'isExclusive' then
      if jsonb_typeof(v_corrections->'isExclusive') <> 'boolean' then
        raise exception 'MARKETING_EXCLUSIVITY_REQUIRED';
      end if;
      v_is_exclusive := (v_corrections->>'isExclusive')::boolean;
    end if;

    if v_corrections ? 'requestKind' then
      v_request_kind := v_corrections->>'requestKind';
      if v_request_kind not in ('capture_edit', 'edit_only') then raise exception 'MARKETING_KIND_INVALID'; end if;
    end if;

    if v_corrections ? 'contentTypes' then
      if jsonb_typeof(v_corrections->'contentTypes') <> 'array' then
        raise exception 'MARKETING_CONTENT_INVALID';
      end if;
      select array_agg(value order by ordinal)
        into v_content_types
      from jsonb_array_elements_text(v_corrections->'contentTypes') with ordinality values_with_order(value, ordinal);
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

    if v_corrections ? 'captureLocation' then
      v_capture_location := nullif(btrim(coalesce(v_corrections->>'captureLocation', '')), '');
    end if;
    if v_corrections ? 'preferredCaptureAt' then
      v_preferred_capture_at := nullif(v_corrections->>'preferredCaptureAt', '')::timestamptz;
    end if;
    if v_corrections ? 'preferredCaptureDurationMinutes' then
      v_preferred_duration := nullif(v_corrections->>'preferredCaptureDurationMinutes', '')::integer;
    end if;

    if v_request_kind = 'edit_only' then
      if (v_corrections ? 'captureLocation' and nullif(v_corrections->>'captureLocation', '') is not null)
        or (v_corrections ? 'preferredCaptureAt' and nullif(v_corrections->>'preferredCaptureAt', '') is not null)
        or (v_corrections ? 'preferredCaptureDurationMinutes' and nullif(v_corrections->>'preferredCaptureDurationMinutes', '') is not null) then
        raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED';
      end if;
      if v_request.confirmed_capture_at is not null or v_request.confirmed_capture_duration_minutes is not null then
        raise exception 'MARKETING_REVIEW_KIND_CONFIRMED_CAPTURE_DENIED';
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
      if v_preferred_capture_at is not null then
        if not private.marketing_capture_window_is_valid(v_preferred_capture_at, v_preferred_duration) then
          raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
        end if;
        if private.marketing_capture_conflicts(v_preferred_capture_at, v_preferred_duration, v_request.id) then
          raise exception 'MARKETING_CAPTURE_CONFLICT';
        end if;
      end if;
    end if;

    if v_corrections ? 'assetLink' then
      v_asset_link := nullif(btrim(coalesce(v_corrections->>'assetLink', '')), '');
      if v_asset_link is not null
        and (char_length(v_asset_link) > 2000 or v_asset_link !~* '^https?://') then
        raise exception 'MARKETING_ASSET_LINK_INVALID';
      end if;
    end if;
    if v_corrections ? 'paidTraffic' then
      if jsonb_typeof(v_corrections->'paidTraffic') <> 'boolean' then
        raise exception 'MARKETING_MANAGER_REVIEW_CORRECTIONS_INVALID';
      end if;
      v_paid_traffic := (v_corrections->>'paidTraffic')::boolean;
    end if;
    if v_corrections ? 'requesterNotes' then
      v_requester_notes := nullif(btrim(coalesce(v_corrections->>'requesterNotes', '')), '');
      if v_requester_notes is not null and char_length(v_requester_notes) > 3000 then
        raise exception 'MARKETING_NOTES_TOO_LONG';
      end if;
    end if;

    if v_request.urgency_decided_at is not null
      and (v_corrections ? 'urgencyRequested' or v_corrections ? 'urgencyReason') then
      raise exception 'MARKETING_URGENCY_ALREADY_DECIDED';
    end if;
    if v_corrections ? 'urgencyRequested' then
      if jsonb_typeof(v_corrections->'urgencyRequested') <> 'boolean' then
        raise exception 'MARKETING_MANAGER_REVIEW_CORRECTIONS_INVALID';
      end if;
      v_urgency_requested := (v_corrections->>'urgencyRequested')::boolean;
    end if;
    if v_corrections ? 'urgencyReason' then
      v_urgency_reason := nullif(btrim(coalesce(v_corrections->>'urgencyReason', '')), '');
    end if;
    if v_urgency_requested then
      if v_urgency_reason is null or char_length(v_urgency_reason) > 1000 then
        raise exception 'MARKETING_URGENCY_REASON_REQUIRED';
      end if;
    else
      v_urgency_reason := null;
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
      v_changes := v_changes || jsonb_build_object(
        'isExclusive',
        jsonb_build_object(
          'from', v_request.is_exclusive,
          'to', v_is_exclusive,
          'fromLabel', case when v_request.is_exclusive is null then 'Não informado' when v_request.is_exclusive then 'Sim' else 'Não' end,
          'toLabel', case when v_is_exclusive then 'Sim' else 'Não' end
        )
      );
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
    if v_changes = '{}'::jsonb then
      raise exception 'MARKETING_MANAGER_REVIEW_NO_CHANGES';
    end if;

    update public.marketing_requests
    set broker_id = v_broker_id,
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
  elsif v_corrections <> '{}'::jsonb then
    raise exception 'MARKETING_MANAGER_REVIEW_CORRECTIONS_NOT_ALLOWED';
  end if;

  v_target_status := case when p_decision = 'declined' then 'cancelado' else v_review.return_status end;
  perform set_config('app.marketing_manager_review_resolution', 'on', true);
  update public.marketing_requests
  set status = v_target_status,
      completed_at = case when v_target_status = 'cancelado' then now() else null end
  where id = v_request.id;
  perform set_config('app.marketing_manager_review_resolution', '', true);

  update public.marketing_manager_reviews
  set status = p_decision,
      manager_name = v_user_name,
      manager_response = v_response,
      decided_at = now()
  where id = p_review_id;

  v_event_type := case p_decision
    when 'confirmed' then 'auditoria_confirmada'
    when 'modified' then 'auditoria_modificada'
    else 'auditoria_declinada'
  end;

  insert into public.marketing_request_events (
    request_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    details
  ) values (
    v_request.id,
    v_event_type,
    'bloqueado',
    v_target_status,
    v_user_id,
    v_user_name,
    jsonb_build_object(
      'reviewId', p_review_id,
      'managerResponse', v_response,
      'changes', v_changes
    )
  );

  perform private.marketing_notify_staff(
    v_request.id,
    v_event_type,
    'Auditoria respondida',
    format(
      'Pedido #%s · %s: %s.',
      v_request.request_number,
      v_request.broker_name,
      case p_decision
        when 'confirmed' then 'gerente confirmou os dados'
        when 'modified' then 'gerente corrigiu o pedido'
        else 'gerente declinou o pedido'
      end
    ),
    v_user_id,
    v_user_name
  );
end;
$$;

create unique index if not exists marketing_requests_public_submission_uidx
  on public.marketing_requests(public_submission_id)
  where public_submission_id is not null;
create index if not exists marketing_requests_source_idx
  on public.marketing_requests(request_source, created_at desc);

create unique index if not exists marketing_manager_reviews_pending_uidx
  on public.marketing_manager_reviews(request_id)
  where status = 'pending';
create index if not exists marketing_manager_reviews_manager_idx
  on public.marketing_manager_reviews(manager_user_id, status, created_at desc);
create index if not exists marketing_manager_reviews_request_idx
  on public.marketing_manager_reviews(request_id, created_at desc);
create index if not exists marketing_manager_reviews_team_idx
  on public.marketing_manager_reviews(team_id, status, created_at desc);
create index if not exists marketing_manager_reviews_opener_idx
  on public.marketing_manager_reviews(opened_by_user_id, created_at desc);

alter table public.marketing_manager_reviews enable row level security;
revoke all on public.marketing_manager_reviews from public, anon, authenticated;

drop trigger if exists marketing_manager_reviews_touch on public.marketing_manager_reviews;
create trigger marketing_manager_reviews_touch
before update on public.marketing_manager_reviews
for each row execute function public.touch_marketing_updated_at();

create or replace function private.marketing_guard_pending_manager_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and new.status <> 'bloqueado'
    and coalesce(current_setting('app.marketing_manager_review_resolution', true), '') <> 'on'
    and exists (
      select 1
      from public.marketing_manager_reviews r
      where r.request_id = old.id
        and r.status = 'pending'
    ) then
    raise exception 'MARKETING_MANAGER_REVIEW_PENDING';
  end if;
  return new;
end;
$$;

revoke all on function private.marketing_guard_pending_manager_review() from public, anon, authenticated;

drop trigger if exists marketing_requests_guard_pending_manager_review on public.marketing_requests;
create trigger marketing_requests_guard_pending_manager_review
before update of status on public.marketing_requests
for each row execute function private.marketing_guard_pending_manager_review();

create or replace function private.marketing_notify_staff(
  p_request_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_actor_user_id text,
  p_actor_name text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.marketing_requests%rowtype;
  v_recipient record;
  v_notification_id uuid;
  v_count integer := 0;
begin
  select * into v_request
  from public.marketing_requests
  where id = p_request_id;

  if v_request.id is null then
    return 0;
  end if;

  for v_recipient in
    select a.managed_user_id
    from public.marketing_access a
    join public.managed_users u on u.id = a.managed_user_id and u.active is true
    where a.active is true
      and a.role in ('admin', 'marketing')
      and a.managed_user_id is distinct from p_actor_user_id
    order by a.role, a.managed_user_id
  loop
    insert into public.marketing_notifications (
      recipient_user_id,
      request_id,
      type,
      title,
      message
    ) values (
      v_recipient.managed_user_id,
      p_request_id,
      p_type,
      p_title,
      p_message
    ) returning id into v_notification_id;

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
      'notificacao_criada',
      v_request.status,
      v_request.status,
      p_actor_user_id,
      coalesce(nullif(btrim(p_actor_name), ''), 'Gerente'),
      jsonb_build_object(
        'notificationId', v_notification_id,
        'recipientUserId', v_recipient.managed_user_id,
        'type', p_type
      )
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.marketing_notify_staff(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.marketing_public_get_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'managerName', t.manager_name
      ) order by t.sort_order, t.manager_name)
      from public.marketing_teams t
      where t.active is true
    ), '[]'::jsonb),
    'contentTypes', jsonb_build_array('video', 'fotos', 'carrossel', 'post_estatico', 'outro'),
    'requestKinds', jsonb_build_array('capture_edit', 'edit_only')
  );
$$;

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
      where q.request_kind = 'capture_edit'
        and q.status <> 'cancelado'
        and q.confirmed_capture_at is not null
        and q.confirmed_capture_duration_minutes is not null
        and (q.confirmed_capture_at at time zone v_settings.timezone)::date >= v_start_date
        and (q.confirmed_capture_at at time zone v_settings.timezone)::date < v_end_date
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.marketing_public_create_request(
  p_submission_id uuid,
  p_requester_name text,
  p_team_id uuid,
  p_broker_name text,
  p_has_property_code boolean,
  p_property_reference text,
  p_request_kind text,
  p_content_types text[],
  p_is_exclusive boolean,
  p_capture_location text default null,
  p_preferred_capture_at timestamptz default null,
  p_preferred_capture_duration_minutes integer default null,
  p_asset_link text default null,
  p_paid_traffic boolean default false,
  p_requester_notes text default null,
  p_urgency_requested boolean default false,
  p_urgency_reason text default null,
  p_website text default null
)
returns table (request_number bigint, team_name text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text := btrim(coalesce(p_requester_name, ''));
  v_broker_name text := btrim(coalesce(p_broker_name, ''));
  v_manager_name text;
  v_has_property_code boolean := coalesce(p_has_property_code, true);
  v_property_reference text;
  v_capture_location text := nullif(btrim(coalesce(p_capture_location, '')), '');
  v_asset_link text := nullif(btrim(coalesce(p_asset_link, '')), '');
  v_requester_notes text := nullif(btrim(coalesce(p_requester_notes, '')), '');
  v_urgency_reason text := nullif(btrim(coalesce(p_urgency_reason, '')), '');
  v_request_id uuid;
  v_request_number bigint;
  v_created_at timestamptz;
  v_existing_manager_name text;
  v_inserted boolean := false;
begin
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    raise exception 'MARKETING_PUBLIC_SUBMISSION_REJECTED';
  end if;
  if p_submission_id is null then
    raise exception 'MARKETING_SUBMISSION_ID_REQUIRED';
  end if;
  if char_length(v_requester_name) not between 2 and 120 then
    raise exception 'MARKETING_REQUESTER_NAME_INVALID';
  end if;
  if char_length(v_broker_name) not between 2 and 120 then
    raise exception 'MARKETING_BROKER_REQUIRED';
  end if;
  if p_request_kind not in ('capture_edit', 'edit_only') then
    raise exception 'MARKETING_KIND_INVALID';
  end if;
  if coalesce(cardinality(p_content_types), 0) = 0
    or cardinality(p_content_types) > 5
    or exists (
      select 1
      from unnest(p_content_types) value
      where value not in ('video', 'fotos', 'carrossel', 'post_estatico', 'outro')
    )
    or (select count(*) from unnest(p_content_types)) <> (select count(distinct value) from unnest(p_content_types) value) then
    raise exception 'MARKETING_CONTENT_INVALID';
  end if;
  if p_is_exclusive is null then
    raise exception 'MARKETING_EXCLUSIVITY_REQUIRED';
  end if;

  select t.manager_name into v_manager_name
  from public.marketing_teams t
  where t.id = p_team_id
    and t.active is true;
  if v_manager_name is null then
    raise exception 'MARKETING_TEAM_NOT_FOUND';
  end if;

  if v_has_property_code then
    v_property_reference := nullif(btrim(coalesce(p_property_reference, '')), '');
    if v_property_reference is null or char_length(v_property_reference) > 80 then
      raise exception 'MARKETING_PROPERTY_REQUIRED';
    end if;
  else
    v_property_reference := 'SEM CÓDIGO';
  end if;

  if v_asset_link is not null
    and (char_length(v_asset_link) > 2000 or v_asset_link !~* '^https?://') then
    raise exception 'MARKETING_ASSET_LINK_INVALID';
  end if;
  if v_requester_notes is not null and char_length(v_requester_notes) > 3000 then
    raise exception 'MARKETING_NOTES_TOO_LONG';
  end if;
  if coalesce(p_urgency_requested, false) then
    if v_urgency_reason is null or char_length(v_urgency_reason) > 1000 then
      raise exception 'MARKETING_URGENCY_REASON_REQUIRED';
    end if;
  else
    v_urgency_reason := null;
  end if;

  if p_request_kind = 'edit_only' then
    if v_capture_location is not null
      or p_preferred_capture_at is not null
      or p_preferred_capture_duration_minutes is not null then
      raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED';
    end if;
  else
    if v_capture_location is null or char_length(v_capture_location) > 300 then
      raise exception 'MARKETING_CAPTURE_LOCATION_REQUIRED';
    end if;
    if (p_preferred_capture_at is null) <> (p_preferred_capture_duration_minutes is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;
    if p_preferred_capture_at is not null then
      if not private.marketing_capture_window_is_valid(p_preferred_capture_at, p_preferred_capture_duration_minutes) then
        raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
      end if;
      if private.marketing_capture_conflicts(p_preferred_capture_at, p_preferred_capture_duration_minutes) then
        raise exception 'MARKETING_CAPTURE_CONFLICT';
      end if;
    end if;
  end if;

  select q.id, q.request_number, q.created_at, q.manager_name
    into v_request_id, v_request_number, v_created_at, v_existing_manager_name
  from public.marketing_requests q
  where q.public_submission_id = p_submission_id;

  if v_request_id is not null then
    return query select v_request_number, v_existing_manager_name, v_created_at;
    return;
  end if;

  insert into public.marketing_requests (
    team_id,
    manager_name,
    broker_id,
    broker_name,
    has_property_code,
    property_reference,
    is_exclusive,
    request_kind,
    content_types,
    capture_location,
    preferred_capture_at,
    preferred_capture_duration_minutes,
    asset_link,
    paid_traffic,
    requester_notes,
    urgency_requested,
    urgency_reason,
    created_by_user_id,
    created_by_name,
    request_source,
    public_requester_name,
    public_submission_id,
    status
  ) values (
    p_team_id,
    v_manager_name,
    null,
    v_broker_name,
    v_has_property_code,
    v_property_reference,
    p_is_exclusive,
    p_request_kind,
    p_content_types,
    case when p_request_kind = 'capture_edit' then v_capture_location else null end,
    case when p_request_kind = 'capture_edit' then p_preferred_capture_at else null end,
    case when p_request_kind = 'capture_edit' then p_preferred_capture_duration_minutes else null end,
    v_asset_link,
    coalesce(p_paid_traffic, false),
    v_requester_notes,
    coalesce(p_urgency_requested, false),
    v_urgency_reason,
    null,
    v_requester_name,
    'public',
    v_requester_name,
    p_submission_id,
    'solicitado'
  )
  on conflict (public_submission_id) where public_submission_id is not null do nothing
  returning id, marketing_requests.request_number, marketing_requests.created_at
    into v_request_id, v_request_number, v_created_at;

  if v_request_id is null then
    select q.id, q.request_number, q.created_at, q.manager_name
      into v_request_id, v_request_number, v_created_at, v_existing_manager_name
    from public.marketing_requests q
    where q.public_submission_id = p_submission_id;
    v_manager_name := v_existing_manager_name;
  else
    v_inserted := true;
  end if;

  if v_inserted then
    insert into public.marketing_request_events (
      request_id,
      event_type,
      from_status,
      to_status,
      actor_user_id,
      actor_name,
      details
    ) values (
      v_request_id,
      'criado_publicamente',
      null,
      'solicitado',
      null,
      v_requester_name,
      jsonb_build_object(
        'requesterName', v_requester_name,
        'teamId', p_team_id,
        'origin', 'public',
        'isExclusive', p_is_exclusive,
        'urgencyRequested', coalesce(p_urgency_requested, false),
        'preferredCaptureAt', case when p_request_kind = 'capture_edit' then p_preferred_capture_at else null end,
        'preferredCaptureDurationMinutes', case when p_request_kind = 'capture_edit' then p_preferred_capture_duration_minutes else null end
      )
    );

    if p_request_kind = 'capture_edit' and p_preferred_capture_at is not null then
      insert into public.marketing_request_events (
        request_id,
        event_type,
        from_status,
        to_status,
        actor_user_id,
        actor_name,
        details
      ) values (
        v_request_id,
        'data_solicitada',
        'solicitado',
        'solicitado',
        null,
        v_requester_name,
        jsonb_build_object(
          'preferredCaptureAt', p_preferred_capture_at,
          'preferredCaptureDurationMinutes', p_preferred_capture_duration_minutes
        )
      );
    end if;

    perform private.marketing_notify_manager(
      v_request_id,
      'novo_pedido_equipe',
      'Novo pedido da sua equipe',
      format(
        'Pedido #%s · solicitado por %s · corretor %s. Enviado diretamente ao Marketing.',
        v_request_number,
        v_requester_name,
        v_broker_name
      ),
      null,
      v_requester_name
    );
  end if;

  return query select v_request_number, v_manager_name, v_created_at;
end;
$$;

revoke all on function public.marketing_public_get_options() from public, anon, authenticated;
revoke all on function public.marketing_public_get_availability() from public, anon, authenticated;
revoke all on function public.marketing_public_create_request(uuid, text, uuid, text, boolean, text, text, text[], boolean, text, timestamptz, integer, text, boolean, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_get_dashboard_review(text) from public, anon, authenticated;
revoke all on function public.marketing_v2_open_manager_review(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.marketing_v2_resolve_manager_review(text, uuid, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.marketing_public_get_options() to anon, authenticated;
grant execute on function public.marketing_public_get_availability() to anon, authenticated;
grant execute on function public.marketing_public_create_request(uuid, text, uuid, text, boolean, text, text, text[], boolean, text, timestamptz, integer, text, boolean, text, boolean, text, text) to anon, authenticated;
grant execute on function public.marketing_v2_get_dashboard_review(text) to anon, authenticated;
grant execute on function public.marketing_v2_open_manager_review(text, uuid, text, text) to anon, authenticated;
grant execute on function public.marketing_v2_resolve_manager_review(text, uuid, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
