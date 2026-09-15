do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- 1) Public grouped RPC: legacy capture duration must only be revalidated when capture actually changes.
  select pg_get_functiondef('public.marketing_v2_update_request_grouped(text,uuid,text,jsonb)'::regprocedure) into v_def;

  v_old := 'if v_confirmed is not null and v_duration <> 60 then raise exception ''MARKETING_CAPTURE_DURATION_INVALID''; end if;';
  v_new := 'if v_confirmed is not null
        and (
          v_confirmed is distinct from v_request.confirmed_capture_at
          or v_duration is distinct from v_request.confirmed_capture_duration_minutes
        )
        and v_duration <> 60 then
        raise exception ''MARKETING_CAPTURE_DURATION_INVALID'';
      end if;';
  if position(v_old in v_def) = 0 then
    raise exception 'PATCH_SOURCE_NOT_FOUND: grouped duration validation';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := 'if v_confirmed is not null and v_status <> ''cancelado'' then';
  v_new := 'if v_confirmed is not null
        and (
          v_confirmed is distinct from v_request.confirmed_capture_at
          or v_duration is distinct from v_request.confirmed_capture_duration_minutes
        )
        and v_status <> ''cancelado'' then';
  if position(v_old in v_def) = 0 then
    raise exception 'PATCH_SOURCE_NOT_FOUND: grouped schedule validation';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  -- 2) Private grouped base: do not revalidate an unchanged historical booking.
  select pg_get_functiondef('private.marketing_v2_update_request_grouped_v124_base(text,uuid,text,jsonb)'::regprocedure) into v_def;
  v_old := 'if v_confirmed is not null and v_status <> ''cancelado'' then';
  v_new := 'if v_confirmed is not null
      and (
        v_confirmed is distinct from v_request.confirmed_capture_at
        or v_duration is distinct from v_request.confirmed_capture_duration_minutes
      )
      and v_status <> ''cancelado'' then';
  if position(v_old in v_def) = 0 then
    raise exception 'PATCH_SOURCE_NOT_FOUND: grouped base schedule validation';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  -- 3) Core update RPC: same rule. New/changed captures still pass all current validations.
  select pg_get_functiondef('public.marketing_v2_update_request(text,uuid,text,jsonb)'::regprocedure) into v_def;
  v_old := 'if v_confirmed is not null and v_status <> ''cancelado'' then';
  v_new := 'if v_confirmed is not null
      and (
        v_confirmed is distinct from v_request.confirmed_capture_at
        or v_confirmed_duration is distinct from v_request.confirmed_capture_duration_minutes
      )
      and v_status <> ''cancelado'' then';
  if position(v_old in v_def) = 0 then
    raise exception 'PATCH_SOURCE_NOT_FOUND: core schedule validation';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end
$$;

notify pgrst, 'reload schema';
