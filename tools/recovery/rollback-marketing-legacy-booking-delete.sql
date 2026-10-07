-- Run only after explicit approval. Restores the audited pre-fix trigger.
-- Does not restore/delete requests, events or reservation rows.
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

CREATE OR REPLACE FUNCTION private.marketing_sync_capture_reservation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_old_key uuid;
  v_new_key uuid;
begin
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


drop function if exists private.marketing_reduce_capture_reservation_on_soft_delete(uuid, uuid);

commit;
