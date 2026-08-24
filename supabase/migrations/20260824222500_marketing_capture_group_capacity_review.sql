-- Revisão de segurança/consistência da PR #124.
-- Mantém os dois períodos operacionais, limita durações novas a 120 min,
-- impede grupos acima da capacidade e sanitiza a agenda para sales_manager.

update public.marketing_schedule_settings
set duration_options_minutes = array[30, 60, 90, 120]::integer[],
    updated_at = now()
where id = 'default';

create or replace function private.marketing_capture_period_capacity_minutes(
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    extract(epoch from (b.period_end_at - b.period_start_at))::integer / 60,
    0
  )
  from private.marketing_capture_period_bounds(p_start_at, p_duration_minutes) b;
$$;

create or replace function private.marketing_validate_public_capture_group_capacity(
  p_capture_group_id uuid,
  p_preferred_capture_at timestamptz,
  p_preferred_capture_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count integer;
  v_with_preference integer;
  v_without_preference integer;
  v_existing_start timestamptz;
  v_existing_duration integer;
  v_existing_bounds record;
  v_new_bounds record;
  v_existing_total integer;
  v_capacity integer;
begin
  if p_capture_group_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing_capture_group:' || p_capture_group_id::text, 0)
  );

  select
    count(*)::integer,
    count(*) filter (where q.preferred_capture_at is not null)::integer,
    count(*) filter (where q.preferred_capture_at is null)::integer
  into v_active_count, v_with_preference, v_without_preference
  from public.marketing_requests q
  where q.capture_group_id = p_capture_group_id
    and q.deleted_at is null
    and q.status <> 'cancelado'
    and q.request_kind = 'capture_edit';

  if v_active_count = 0 then
    return;
  end if;

  -- Um grupo representa uma única saída: ou todos deixam o Marketing definir,
  -- ou todos usam a mesma data/período preferido.
  if p_preferred_capture_at is null then
    if v_with_preference > 0 then
      raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
    end if;
    return;
  end if;

  if p_preferred_capture_duration_minutes is null then
    raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
  end if;

  if v_without_preference > 0 then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;

  select q.preferred_capture_at, q.preferred_capture_duration_minutes
    into v_existing_start, v_existing_duration
  from public.marketing_requests q
  where q.capture_group_id = p_capture_group_id
    and q.deleted_at is null
    and q.status <> 'cancelado'
    and q.request_kind = 'capture_edit'
    and q.preferred_capture_at is not null
  order by q.request_number, q.id
  limit 1;

  if v_existing_start is null or v_existing_duration is null then
    raise exception 'MARKETING_CAPTURE_GROUP_DATA_INVALID';
  end if;

  select * into v_existing_bounds
  from private.marketing_capture_period_bounds(v_existing_start, v_existing_duration);

  select * into v_new_bounds
  from private.marketing_capture_period_bounds(
    p_preferred_capture_at,
    p_preferred_capture_duration_minutes
  );

  if v_existing_bounds.period_start_at is distinct from v_new_bounds.period_start_at
    or v_existing_bounds.period_end_at is distinct from v_new_bounds.period_end_at then
    raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
  end if;

  if exists (
    select 1
    from public.marketing_requests q
    where q.capture_group_id = p_capture_group_id
      and q.deleted_at is null
      and q.status <> 'cancelado'
      and q.request_kind = 'capture_edit'
      and q.preferred_capture_at is not null
      and q.preferred_capture_duration_minutes is null
  ) then
    raise exception 'MARKETING_CAPTURE_GROUP_DATA_INVALID';
  end if;

  select coalesce(sum(q.preferred_capture_duration_minutes), 0)::integer
    into v_existing_total
  from public.marketing_requests q
  where q.capture_group_id = p_capture_group_id
    and q.deleted_at is null
    and q.status <> 'cancelado'
    and q.request_kind = 'capture_edit'
    and q.preferred_capture_at is not null;

  v_capacity := private.marketing_capture_period_capacity_minutes(
    p_preferred_capture_at,
    p_preferred_capture_duration_minutes
  );

  if v_capacity <= 0
    or v_existing_total + p_preferred_capture_duration_minutes > v_capacity then
    raise exception 'MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED';
  end if;
end;
$$;

revoke all on function private.marketing_capture_period_capacity_minutes(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.marketing_validate_public_capture_group_capacity(uuid, timestamptz, integer) from public, anon, authenticated;

-- Preserva a implementação da primeira revisão da PR #124 e adiciona uma
-- camada de validação transacional para o fluxo público agrupado.
alter function public.marketing_public_create_grouped_request(
  uuid, text, uuid, text, boolean, text, text, text[], boolean,
  text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid
)
  rename to marketing_public_create_grouped_request_v124_base;

alter function public.marketing_public_create_grouped_request_v124_base(
  uuid, text, uuid, text, boolean, text, text, text[], boolean,
  text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid
)
  set schema private;

revoke all on function private.marketing_public_create_grouped_request_v124_base(
  uuid, text, uuid, text, boolean, text, text, text[], boolean,
  text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid
) from public, anon, authenticated;

create function public.marketing_public_create_grouped_request(
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
  p_website text default null,
  p_capture_group_id uuid default null
)
returns table (request_number bigint, team_name text, created_at timestamptz, capture_group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_capture_group_id is not null then
    if p_request_kind <> 'capture_edit' then
      raise exception 'MARKETING_CAPTURE_GROUP_KIND_INVALID';
    end if;

    perform private.marketing_validate_public_capture_group_capacity(
      p_capture_group_id,
      p_preferred_capture_at,
      p_preferred_capture_duration_minutes
    );
  end if;

  return query
  select *
  from private.marketing_public_create_grouped_request_v124_base(
    p_submission_id,
    p_requester_name,
    p_team_id,
    p_broker_name,
    p_has_property_code,
    p_property_reference,
    p_request_kind,
    p_content_types,
    p_is_exclusive,
    p_capture_location,
    p_preferred_capture_at,
    p_preferred_capture_duration_minutes,
    p_asset_link,
    p_paid_traffic,
    p_requester_notes,
    p_urgency_requested,
    p_urgency_reason,
    p_website,
    p_capture_group_id
  );
end;
$$;

revoke all on function public.marketing_public_create_grouped_request(
  uuid, text, uuid, text, boolean, text, text, text[], boolean,
  text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.marketing_public_create_grouped_request(
  uuid, text, uuid, text, boolean, text, text, text[], boolean,
  text, timestamptz, integer, text, boolean, text, boolean, text, text, uuid
) to anon, authenticated;

-- Mesma proteção para confirmação/alteração operacional do Marketing.
alter function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb)
  rename to marketing_v2_update_request_grouped_v124_base;

alter function public.marketing_v2_update_request_grouped_v124_base(text, uuid, text, jsonb)
  set schema private;

revoke all on function private.marketing_v2_update_request_grouped_v124_base(text, uuid, text, jsonb)
from public, anon, authenticated;

create function public.marketing_v2_update_request_grouped(
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
  v_request public.marketing_requests%rowtype;
  v_confirmed timestamptz;
  v_duration integer;
  v_status text;
  v_existing_start timestamptz;
  v_existing_duration integer;
  v_existing_bounds record;
  v_new_bounds record;
  v_existing_total integer;
  v_capacity integer;
begin
  select r.user_id into v_user_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_request
  from public.marketing_requests q
  where q.id = p_request_id
    and q.deleted_at is null
  for update;
  if v_request.id is null then raise exception 'MARKETING_REQUEST_NOT_FOUND'; end if;

  if p_action = 'save_management'
    and v_request.request_kind = 'capture_edit'
    and v_request.capture_group_id is not null then

    v_confirmed := case
      when p_payload ? 'confirmedCaptureAt' then nullif(p_payload->>'confirmedCaptureAt', '')::timestamptz
      else v_request.confirmed_capture_at
    end;
    v_duration := case
      when p_payload ? 'confirmedCaptureDurationMinutes' then nullif(p_payload->>'confirmedCaptureDurationMinutes', '')::integer
      else v_request.confirmed_capture_duration_minutes
    end;
    v_status := coalesce(nullif(p_payload->>'status', ''), v_request.status);

    if (v_confirmed is null) <> (v_duration is null) then
      raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
    end if;

    if v_confirmed is not null and v_status <> 'cancelado' then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('marketing_capture_group:' || v_request.capture_group_id::text, 0)
      );

      select * into v_new_bounds
      from private.marketing_capture_period_bounds(v_confirmed, v_duration);

      select q.confirmed_capture_at, q.confirmed_capture_duration_minutes
        into v_existing_start, v_existing_duration
      from public.marketing_requests q
      where q.capture_group_id = v_request.capture_group_id
        and q.id <> v_request.id
        and q.deleted_at is null
        and q.status <> 'cancelado'
        and q.request_kind = 'capture_edit'
        and q.confirmed_capture_at is not null
      order by q.request_number, q.id
      limit 1;

      if v_existing_start is not null then
        if v_existing_duration is null then
          raise exception 'MARKETING_CAPTURE_GROUP_DATA_INVALID';
        end if;

        select * into v_existing_bounds
        from private.marketing_capture_period_bounds(v_existing_start, v_existing_duration);

        if v_existing_bounds.period_start_at is distinct from v_new_bounds.period_start_at
          or v_existing_bounds.period_end_at is distinct from v_new_bounds.period_end_at then
          raise exception 'MARKETING_CAPTURE_GROUP_SLOT_MISMATCH';
        end if;
      end if;

      if exists (
        select 1
        from public.marketing_requests q
        where q.capture_group_id = v_request.capture_group_id
          and q.id <> v_request.id
          and q.deleted_at is null
          and q.status <> 'cancelado'
          and q.request_kind = 'capture_edit'
          and q.confirmed_capture_at is not null
          and q.confirmed_capture_duration_minutes is null
      ) then
        raise exception 'MARKETING_CAPTURE_GROUP_DATA_INVALID';
      end if;

      select coalesce(sum(q.confirmed_capture_duration_minutes), 0)::integer
        into v_existing_total
      from public.marketing_requests q
      where q.capture_group_id = v_request.capture_group_id
        and q.id <> v_request.id
        and q.deleted_at is null
        and q.status <> 'cancelado'
        and q.request_kind = 'capture_edit'
        and q.confirmed_capture_at is not null;

      v_capacity := private.marketing_capture_period_capacity_minutes(v_confirmed, v_duration);

      if v_capacity <= 0 or v_existing_total + v_duration > v_capacity then
        raise exception 'MARKETING_CAPTURE_GROUP_CAPACITY_EXCEEDED';
      end if;
    end if;
  end if;

  perform private.marketing_v2_update_request_grouped_v124_base(
    p_session_token,
    p_request_id,
    p_action,
    p_payload
  );
end;
$$;

revoke all on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.marketing_v2_update_request_grouped(text, uuid, text, jsonb)
to anon, authenticated;

-- A agenda operacional precisa informar ocupação para todos, mas um gerente
-- não recebe IDs internos de reservas pertencentes a outras equipes.
create or replace function public.marketing_v2_get_operation_schedule(p_session_token text)
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
  v_settings public.marketing_schedule_settings%rowtype;
begin
  select r.user_id, r.access_role, r.team_id
    into v_user_id, v_role, v_team_id
  from private.marketing_resolve_session(p_session_token) r;
  if v_user_id is null then raise exception 'MARKETING_SESSION_EXPIRED'; end if;

  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  return jsonb_build_object(
    'scheduleConfig', jsonb_build_object(
      'timezone', v_settings.timezone,
      'workingDays', v_settings.working_days,
      'workdayStart', to_char(v_settings.workday_start, 'HH24:MI'),
      'workdayEnd', to_char(v_settings.workday_end, 'HH24:MI'),
      'durationOptionsMinutes', v_settings.duration_options_minutes,
      'captureWindows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id,
          'label', w.label,
          'start', to_char(w.start_time, 'HH24:MI'),
          'end', to_char(w.end_time, 'HH24:MI')
        ) order by w.sort_order, w.id)
        from public.marketing_capture_windows w
        where w.active is true
      ), '[]'::jsonb)
    ),
    'occupiedCaptureSlots', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'requestId', case
            when v_role <> 'sales_manager' or q.team_id = v_team_id then r.representative_request_id
            else null
          end,
          'captureGroupId', case
            when v_role <> 'sales_manager' or q.team_id = v_team_id then r.capture_group_id
            else null
          end,
          'startAt', r.start_at,
          'durationMinutes', extract(epoch from (r.end_at - r.start_at))::integer / 60
        ))
        order by r.start_at, r.booking_key
      )
      from private.marketing_capture_reservations r
      join public.marketing_requests q on q.id = r.representative_request_id
    ), '[]'::jsonb),
    'captureGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'captureGroupId', grouped.capture_group_id,
        'requestIds', grouped.request_ids,
        'requestNumbers', grouped.request_numbers
      ) order by grouped.first_request_number)
      from (
        select
          q.capture_group_id,
          array_agg(q.id order by q.request_number) as request_ids,
          array_agg(q.request_number order by q.request_number) as request_numbers,
          min(q.request_number) as first_request_number
        from public.marketing_requests q
        where q.capture_group_id is not null
          and q.deleted_at is null
          and (v_role <> 'sales_manager' or q.team_id = v_team_id)
        group by q.capture_group_id
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.marketing_v2_get_operation_schedule(text) from public, anon, authenticated;
grant execute on function public.marketing_v2_get_operation_schedule(text) to anon, authenticated;

notify pgrst, 'reload schema';
