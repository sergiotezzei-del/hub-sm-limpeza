begin;

do $auditorio_test$
declare
  v_future_date date := ((now() at time zone 'America/Sao_Paulo')::date + 14);
  v_receipt record;
  v_non_conflict record;
  v_status jsonb;
  v_conflict_blocked boolean := false;
  v_wrong_code_blocked boolean := false;
begin
  if has_table_privilege('anon', 'public.auditorio_reservas', 'select') then
    raise exception 'anon nao deve selecionar auditorio_reservas diretamente';
  end if;

  if has_table_privilege('anon', 'public.auditorio_reservas', 'update') then
    raise exception 'anon nao deve atualizar auditorio_reservas diretamente';
  end if;

  if not has_function_privilege(
    'anon',
    'public.auditorio_public_create_reserva(uuid,text,text,text,text,text,text,text,text,text,text,date,time without time zone,time without time zone,time without time zone,time without time zone,integer,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text)',
    'execute'
  ) then
    raise exception 'anon deve executar a RPC publica de criacao';
  end if;

  select *
  into v_receipt
  from public.auditorio_public_create_reserva(
    gen_random_uuid(),
    'TEST-1234',
    'Solicitante Teste',
    '(11) 99999-0000',
    'teste@example.com',
    'Marketing',
    'Santa Maria',
    'lancamento',
    'Lancamento Residencial XPTO',
    'Residencial XPTO',
    'Construtora Teste',
    v_future_date,
    '17:30',
    '19:00',
    '21:00',
    '22:00',
    80,
    'coffee_break',
    'construtora',
    null,
    true,
    true,
    true,
    true,
    false,
    'Acesso prioritario',
    'Teste automatizado transacional',
    null
  );

  if v_receipt.status <> 'pendente' then
    raise exception 'solicitacao publica deve entrar como pendente';
  end if;

  update public.auditorio_reservas
  set status = 'aprovado',
      aprovado_por = 'test',
      aprovado_por_nome = 'Teste SQL',
      aprovado_em = now(),
      observacao_administrativa = 'Aprovado no teste transacional.'
  where id = v_receipt.reserva_id;

  begin
    perform public.auditorio_public_create_reserva(
      gen_random_uuid(),
      'TEST-5678',
      'Solicitante Conflito',
      '(11) 98888-0000',
      null,
      'Vendas',
      null,
      'reuniao',
      'Reuniao conflitante',
      null,
      null,
      v_future_date,
      '20:00',
      '20:30',
      '21:30',
      '22:30',
      12,
      'nao',
      null,
      null,
      false,
      false,
      false,
      false,
      false,
      null,
      null,
      null
    );
  exception
    when others then
      if position('AUDITORIO_RESERVA_CONFLITO' in SQLERRM) > 0 then
        v_conflict_blocked := true;
      else
        raise;
      end if;
  end;

  if not v_conflict_blocked then
    raise exception 'sobreposicao deveria ser bloqueada';
  end if;

  select *
  into v_non_conflict
  from public.auditorio_public_create_reserva(
    gen_random_uuid(),
    'TEST-9012',
    'Solicitante Livre',
    '(11) 97777-0000',
    null,
    'Administracao',
    null,
    'treinamento',
    'Treinamento sem conflito',
    null,
    null,
    v_future_date,
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    25,
    'nao',
    null,
    null,
    false,
    false,
    true,
    true,
    false,
    null,
    null,
    null
  );

  if v_non_conflict.status <> 'pendente' then
    raise exception 'horario livre deve criar nova solicitacao pendente';
  end if;

  v_status := public.auditorio_public_get_reserva(v_receipt.protocolo, 'TEST-1234');
  if v_status->>'status' <> 'aprovado' then
    raise exception 'consulta publica deve refletir status aprovado';
  end if;

  if v_status ? 'requesterName' or v_status ? 'requesterPhone' then
    raise exception 'consulta publica nao deve expor dados pessoais';
  end if;

  begin
    perform public.auditorio_public_get_reserva(v_receipt.protocolo, 'CODIGO-ERRADO');
  exception
    when others then
      if position('AUDITORIO_SOLICITACAO_NAO_ENCONTRADA' in SQLERRM) > 0 then
        v_wrong_code_blocked := true;
      else
        raise;
      end if;
  end;

  if not v_wrong_code_blocked then
    raise exception 'consulta com codigo incorreto deveria ser bloqueada';
  end if;
end;
$auditorio_test$;

rollback;
