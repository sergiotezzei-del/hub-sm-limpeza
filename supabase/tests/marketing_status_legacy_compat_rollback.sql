begin;

do $test$
declare
  v_edit_only uuid := gen_random_uuid();
  v_team_id uuid;
begin
  select team_id into v_team_id
  from public.marketing_requests
  where request_number = 207;

  if v_team_id is null then raise exception 'TEST_TEAM_NOT_FOUND'; end if;

  insert into public.marketing_requests(
    id, team_id, manager_name, broker_name, has_property_code, property_reference,
    request_kind, content_types, created_by_name, status
  ) values (
    v_edit_only, v_team_id, 'Fixture', 'Fixture status', true, 'TEST-STATUS',
    'edit_only', array['video'], 'Teste transacional', 'solicitado'
  );

  update public.marketing_requests
  set assigned_marketing_name = 'Arthur', status = 'em_edicao'
  where id = v_edit_only;

  if not exists (select 1 from public.marketing_requests where id = v_edit_only and status = 'em_edicao') then
    raise exception 'TEST_EDIT_ONLY_DIRECT_STATUS_FAILED';
  end if;

  update public.marketing_requests set status = 'em_aprovacao' where id = v_edit_only;
  update public.marketing_requests set status = 'pronto' where id = v_edit_only;

  begin
    update public.marketing_requests set status = 'em_edicao' where id = v_edit_only;
    raise exception 'TEST_EXPECTED_CLOSED_REOPEN_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_STATUS_TRANSITION_INVALID%' then raise; end if;
  end;

  -- The real legacy shape of #208 is exercised only inside this transaction.
  update public.marketing_requests
  set assigned_marketing_name = 'Arthur', status = 'em_edicao'
  where request_number = 208;

  if not exists (
    select 1 from public.marketing_requests
    where request_number = 208 and status = 'em_edicao' and assigned_marketing_name = 'Arthur'
  ) then raise exception 'TEST_LEGACY_208_RECOVERY_FAILED'; end if;

  begin
    update public.marketing_requests
    set assigned_marketing_name = 'Arthur', status = 'em_edicao'
    where request_number = 209;
    raise exception 'TEST_EXPECTED_UNCONFIRMED_CAPTURE_REJECTION';
  exception when others then
    if sqlerrm not like '%MARKETING_CAPTURE_DURATION_REQUIRED%' then raise; end if;
  end;
end;
$test$;

rollback;
