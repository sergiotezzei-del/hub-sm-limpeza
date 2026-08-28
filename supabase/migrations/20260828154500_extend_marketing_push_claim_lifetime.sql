do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.marketing_public_prepare_push(uuid)'::regprocedure)
    into v_definition;

  if position('interval ''30 minutes''' in v_definition) > 0 then
    v_definition := replace(v_definition, 'interval ''30 minutes''', 'interval ''45 days''');
    execute v_definition;
  end if;
end;
$$;
