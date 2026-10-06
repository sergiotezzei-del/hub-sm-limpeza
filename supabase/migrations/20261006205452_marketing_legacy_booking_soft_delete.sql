begin;

-- Baseline: production d341bfd, audited recovery trigger. Reapplication is safe.
-- Abort if an unrelated deployment has changed this trigger in the meantime.
do $guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'private.marketing_sync_capture_reservation()'::regprocedure
      and md5(p.prosrc) in ('010f7ff8e5502c35ba2b9c1ff0a4a643', '720e5c0318c7a7a9600ad1f08c937b18')
  ) then raise exception 'MARKETING_CAPTURE_SYNC_BASELINE_CHANGED'; end if;
end;
$guard$;

-- Internal reduction only: invoked by the existing SECURITY DEFINER trigger.
-- Never creates a reservation or changes its key/start. The caller has already
-- verified that deleting the member was the only operational change.
create or replace function private.marketing_reduce_capture_reservation_on_soft_delete(
  p_booking_key uuid,
  p_removed_request_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $helper$
declare
  v_removed public.marketing_requests%rowtype;
  v_reservation private.marketing_capture_reservations%rowtype;
  v_count bigint;
  v_duration bigint;
  v_all_shared_hour boolean;
  v_valid boolean;
  v_representative uuid;
  v_previous_end timestamptz;
  v_new_end timestamptz;
begin
  -- Serialize with existing grouped-booking operations. Do not lock other
  -- requests here: simultaneous deletions already hold their own request lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing_capture_group:' || p_booking_key::text, 0)
  );
  select * into v_removed from public.marketing_requests
  where id = p_removed_request_id;
  if v_removed.id is null or v_removed.deleted_at is null
    or coalesce(v_removed.capture_group_id, v_removed.id) <> p_booking_key
    or v_removed.request_kind <> 'capture_edit' or v_removed.status = 'cancelado'
    or v_removed.confirmed_capture_at is null
    or coalesce(v_removed.confirmed_capture_duration_minutes, 0) <= 0 then
    raise exception 'MARKETING_CAPTURE_RESERVATION_REDUCTION_INVALID';
  end if;

  select * into v_reservation from private.marketing_capture_reservations
  where booking_key = p_booking_key for update;
  if not found then raise exception 'MARKETING_CAPTURE_RESERVATION_MISSING'; end if;
  if v_reservation.start_at is distinct from v_removed.confirmed_capture_at
    or v_reservation.capture_group_id is distinct from v_removed.capture_group_id then
    raise exception 'MARKETING_CAPTURE_RESERVATION_INCONSISTENT';
  end if;

  -- Include every remaining operational member, including malformed ones so
  -- inconsistent legacy data aborts instead of silently losing capacity.
  select count(*), coalesce(sum(q.confirmed_capture_duration_minutes), 0),
    coalesce(bool_and(q.confirmed_capture_duration_minutes = 60), true),
    coalesce(bool_and(q.request_kind = 'capture_edit'
      and q.confirmed_capture_at is not null
      and q.confirmed_capture_at = v_reservation.start_at
      and q.confirmed_capture_duration_minutes is not null
      and q.confirmed_capture_duration_minutes > 0), true),
    (array_agg(q.id order by q.request_number, q.id))[1]
  into v_count, v_duration, v_all_shared_hour, v_valid, v_representative
  from public.marketing_requests q
  where coalesce(q.capture_group_id, q.id) = p_booking_key
    and q.deleted_at is null and q.status <> 'cancelado';

  if not v_valid or not exists (
    select 1 from public.marketing_requests q
    where q.id = v_reservation.representative_request_id
      and coalesce(q.capture_group_id, q.id) = p_booking_key
      and (q.id = p_removed_request_id or (q.deleted_at is null and q.status <> 'cancelado'))
  ) then raise exception 'MARKETING_CAPTURE_RESERVATION_INCONSISTENT'; end if;

  v_previous_end := v_reservation.start_at
    + ((v_duration + v_removed.confirmed_capture_duration_minutes)::text || ' minutes')::interval;
  if v_reservation.end_at is distinct from v_previous_end then
    -- The current model shares one fixed hour between all 60-minute members.
    -- It is not an additive legacy reduction: preserve its original validators.
    if v_count > 0 and v_removed.capture_group_id is not null
      and v_removed.confirmed_capture_duration_minutes = 60 and v_all_shared_hour
      and v_reservation.end_at = v_reservation.start_at + interval '60 minutes' then
      return false;
    end if;
    raise exception 'MARKETING_CAPTURE_RESERVATION_INCONSISTENT';
  end if;

  if v_count = 0 then
    delete from private.marketing_capture_reservations where booking_key = p_booking_key;
  else
    v_new_end := v_reservation.start_at + (v_duration::text || ' minutes')::interval;
    if v_new_end <= v_reservation.start_at or v_new_end >= v_reservation.end_at then
      raise exception 'MARKETING_CAPTURE_RESERVATION_REDUCTION_INVALID';
    end if;
    update private.marketing_capture_reservations
    set representative_request_id = v_representative,
        end_at = v_new_end,
        updated_at = now()
    where booking_key = p_booking_key;
  end if;
  return true;
end;
$helper$;

revoke all on function private.marketing_reduce_capture_reservation_on_soft_delete(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Recovery retains a non-superuser postgres as the definer of this trigger.
-- Only that internal definer needs to invoke the invoker helper.
do $grant_trigger_owner$
declare
  v_owner text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
  from pg_catalog.pg_proc p
  where p.oid = 'private.marketing_sync_capture_reservation()'::regprocedure;
  if v_owner in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'MARKETING_CAPTURE_SYNC_UNSAFE_OWNER';
  end if;
  execute pg_catalog.format(
    'grant execute on function private.marketing_reduce_capture_reservation_on_soft_delete(uuid, uuid) to %I',
    v_owner
  );
end;
$grant_trigger_owner$;

CREATE OR REPLACE FUNCTION private.marketing_sync_capture_reservation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_old_key uuid;
  v_new_key uuid;
begin
  -- Only an unchanged, already-booked soft delete may reduce a legacy reservation.
  -- Restoration and every operational booking change keep the normal validators.
  if tg_op = 'UPDATE'
    and old.deleted_at is null and new.deleted_at is not null
    and new.id is not distinct from old.id
    and new.capture_group_id is not distinct from old.capture_group_id
    and new.confirmed_capture_at is not distinct from old.confirmed_capture_at
    and new.confirmed_capture_duration_minutes is not distinct from old.confirmed_capture_duration_minutes
    and new.request_kind is not distinct from old.request_kind
    and new.status is not distinct from old.status
    and coalesce(new.capture_group_id, new.id) = coalesce(old.capture_group_id, old.id)
    and old.request_kind = 'capture_edit' and old.status <> 'cancelado'
    and old.confirmed_capture_at is not null
    and old.confirmed_capture_duration_minutes is not null then
    if private.marketing_reduce_capture_reservation_on_soft_delete(
      coalesce(old.capture_group_id, old.id), old.id
    ) then
      return new;
    end if;
  end if;

  -- Status changes between active operational stages do not change the booking.
  -- Skipping the refresh prevents historical bookings from being revalidated
  -- against today's scheduling rules. Cancellation still refreshes/removes it.
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

commit;
