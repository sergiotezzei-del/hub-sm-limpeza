-- Keeps historical Marketing bookings compatible with the current 60-minute schedule.
-- Legacy 90/120-minute bookings may advance operational status without rewriting
-- their historical booking. New or edited bookings still follow the current rule.

create or replace function private.marketing_validate_operational_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then return new; end if;

  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status is distinct from new.status
    and old.status in ('pronto', 'cancelado') then
    raise exception 'MARKETING_STATUS_TRANSITION_INVALID';
  end if;

  if new.request_kind = 'edit_only'
    and (new.confirmed_capture_at is not null or new.confirmed_capture_duration_minutes is not null) then
    raise exception 'MARKETING_EDIT_ONLY_CAPTURE_DENIED';
  end if;

  if (new.confirmed_capture_at is null) <> (new.confirmed_capture_duration_minutes is null) then
    raise exception 'MARKETING_CAPTURE_DURATION_REQUIRED';
  end if;

  if new.confirmed_capture_at is not null
    and new.confirmed_capture_duration_minutes <> 60
    and (
      tg_op = 'INSERT'
      or new.confirmed_capture_at is distinct from old.confirmed_capture_at
      or new.confirmed_capture_duration_minutes is distinct from old.confirmed_capture_duration_minutes
    ) then
    raise exception 'MARKETING_CAPTURE_DURATION_INVALID';
  end if;

  if new.status = 'solicitado'
    and new.confirmed_capture_at is not null
    and (
      tg_op = 'INSERT'
      or new.status is distinct from old.status
      or new.confirmed_capture_at is distinct from old.confirmed_capture_at
    ) then
    raise exception 'MARKETING_CONFIRMED_CAPTURE_STATE_INVALID';
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
    or (
      new.confirmed_capture_duration_minutes <> 60
      and (
        tg_op = 'INSERT'
        or new.status is distinct from old.status
        or new.confirmed_capture_at is distinct from old.confirmed_capture_at
        or new.confirmed_capture_duration_minutes is distinct from old.confirmed_capture_duration_minutes
      )
    )
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

create or replace function private.marketing_sync_capture_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_key uuid;
  v_new_key uuid;
begin
  -- Moving between active operational statuses does not change the booking.
  -- Avoid revalidating an historical slot against today's scheduling rules.
  -- Crossing into/out of cancellation still refreshes the reservation.
  if tg_op = 'UPDATE'
    and new.capture_group_id is not distinct from old.capture_group_id
    and new.confirmed_capture_at is not distinct from old.confirmed_capture_at
    and new.confirmed_capture_duration_minutes is not distinct from old.confirmed_capture_duration_minutes
    and new.request_kind is not distinct from old.request_kind
    and new.deleted_at is not distinct from old.deleted_at
    and (new.status = 'cancelado') = (old.status = 'cancelado') then
    return new;
  end if;

  if tg_op <> 'INSERT' then v_old_key := coalesce(old.capture_group_id, old.id); end if;
  if tg_op <> 'DELETE' then v_new_key := coalesce(new.capture_group_id, new.id); end if;

  if v_old_key is not null and v_old_key is distinct from v_new_key then
    perform private.marketing_refresh_capture_reservation(v_old_key);
  end if;
  if v_new_key is not null then
    perform private.marketing_refresh_capture_reservation(v_new_key);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.marketing_validate_operational_state() from public, anon, authenticated;
revoke all on function private.marketing_sync_capture_reservation() from public, anon, authenticated;

notify pgrst, 'reload schema';
