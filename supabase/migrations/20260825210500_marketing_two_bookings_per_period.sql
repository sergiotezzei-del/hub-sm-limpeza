-- Marketing: mantém horários flexíveis entre 08:00 e 18:00,
-- mas passa a permitir até 2 saídas pela manhã e 2 à tarde.
-- O período é definido pelo horário de início: manhã < 12:00; tarde >= 12:00.

create or replace function private.marketing_validate_capture_booking(
  p_booking_key uuid,
  p_start_at timestamptz,
  p_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_schedule_settings%rowtype;
  v_local_date date;
  v_local_time time;
  v_other_count integer;
begin
  if not private.marketing_capture_range_is_valid(p_start_at, p_duration_minutes) then
    raise exception 'MARKETING_CAPTURE_WINDOW_INVALID';
  end if;

  select * into v_settings
  from public.marketing_schedule_settings
  where id = 'default';
  if v_settings.id is null then raise exception 'MARKETING_SCHEDULE_NOT_CONFIGURED'; end if;

  v_local_date := (p_start_at at time zone v_settings.timezone)::date;
  v_local_time := (p_start_at at time zone v_settings.timezone)::time;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing_capture_day:' || v_local_date::text, 0)
  );

  select count(*)::integer into v_other_count
  from private.marketing_schedule_occupied_slots() s
  where s.booking_key is distinct from p_booking_key
    and (s.start_at at time zone v_settings.timezone)::date = v_local_date
    and (
      (v_local_time < time '12:00' and (s.start_at at time zone v_settings.timezone)::time < time '12:00')
      or
      (v_local_time >= time '12:00' and (s.start_at at time zone v_settings.timezone)::time >= time '12:00')
    );

  if v_other_count >= 2 then
    raise exception 'MARKETING_CAPTURE_PERIOD_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from private.marketing_schedule_occupied_slots() s
    where s.booking_key is distinct from p_booking_key
      and tstzrange(s.start_at, s.end_at, '[)')
        && tstzrange(p_start_at, p_start_at + p_duration_minutes * interval '1 minute', '[)')
  ) then
    raise exception 'MARKETING_CAPTURE_CONFLICT';
  end if;
end;
$$;

notify pgrst, 'reload schema';
