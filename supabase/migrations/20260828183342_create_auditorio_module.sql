begin;

create schema if not exists private;

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.auditorio_reservas (
  id uuid primary key default gen_random_uuid(),
  protocolo bigint generated always as identity unique,
  public_submission_id uuid not null unique,
  public_access_code_hash text not null,
  solicitante_nome text not null,
  solicitante_telefone text not null,
  solicitante_email text,
  solicitante_setor text,
  solicitante_empresa text,
  tipo_evento text not null,
  nome_evento text not null,
  nome_lancamento text,
  construtora text,
  data_evento date not null,
  horario_montagem time without time zone not null,
  horario_inicio time without time zone not null,
  horario_fim time without time zone not null,
  horario_desmontagem time without time zone not null,
  inicio_reserva timestamptz not null,
  fim_reserva timestamptz not null,
  quantidade_pessoas integer not null,
  tipo_alimentacao text not null default 'nao',
  responsavel_alimentacao text,
  responsavel_alimentacao_outro text,
  precisa_projetor boolean not null default false,
  precisa_microfone boolean not null default false,
  precisa_som boolean not null default false,
  precisa_cadeiras boolean not null default false,
  precisa_mesas boolean not null default false,
  necessidades_especiais text,
  observacoes text,
  status text not null default 'pendente',
  observacao_administrativa text,
  aprovado_por text,
  aprovado_por_nome text,
  aprovado_em timestamptz,
  recusado_por text,
  recusado_por_nome text,
  recusado_em timestamptz,
  cancelado_por text,
  cancelado_por_nome text,
  cancelado_em timestamptz,
  concluido_por text,
  concluido_por_nome text,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auditorio_reservas_status_check check (
    status in ('pendente', 'aprovado', 'recusado', 'cancelado', 'concluido')
  ),
  constraint auditorio_reservas_tipo_evento_check check (
    tipo_evento in ('lancamento', 'treinamento', 'reuniao', 'palestra', 'evento_interno', 'apresentacao', 'outro')
  ),
  constraint auditorio_reservas_alimentacao_check check (
    tipo_alimentacao in ('nao', 'coffee_break', 'buffet')
  ),
  constraint auditorio_reservas_responsavel_alimentacao_check check (
    responsavel_alimentacao is null
    or responsavel_alimentacao in ('santa_maria', 'construtora', 'empresa_evento', 'outro')
  ),
  constraint auditorio_reservas_quantidade_check check (quantidade_pessoas > 0),
  constraint auditorio_reservas_horarios_check check (
    horario_montagem <= horario_inicio
    and horario_inicio < horario_fim
    and horario_fim <= horario_desmontagem
  ),
  constraint auditorio_reservas_lancamento_check check (
    tipo_evento <> 'lancamento'
    or (nullif(btrim(coalesce(nome_lancamento, '')), '') is not null and nullif(btrim(coalesce(construtora, '')), '') is not null)
  ),
  constraint auditorio_reservas_alimentacao_responsavel_check check (
    tipo_alimentacao = 'nao'
    or nullif(btrim(coalesce(responsavel_alimentacao, '')), '') is not null
  ),
  constraint auditorio_reservas_alimentacao_outro_check check (
    responsavel_alimentacao <> 'outro'
    or nullif(btrim(coalesce(responsavel_alimentacao_outro, '')), '') is not null
  ),
  constraint auditorio_reservas_periodo_check check (inicio_reserva < fim_reserva)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'auditorio_reservas_aprovadas_sem_sobreposicao'
      and conrelid = 'public.auditorio_reservas'::regclass
  ) then
    alter table public.auditorio_reservas
      add constraint auditorio_reservas_aprovadas_sem_sobreposicao
      exclude using gist (
        tstzrange(inicio_reserva, fim_reserva, '[)') with &&
      )
      where (status = 'aprovado');
  end if;
end $$;

create index if not exists auditorio_reservas_status_idx
  on public.auditorio_reservas (status, data_evento, inicio_reserva);

create index if not exists auditorio_reservas_data_idx
  on public.auditorio_reservas (data_evento, inicio_reserva);

create index if not exists auditorio_reservas_created_at_idx
  on public.auditorio_reservas (created_at desc);

create table if not exists public.auditorio_reserva_eventos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.auditorio_reservas(id) on delete cascade,
  tipo text not null,
  ator_id text,
  ator_nome text,
  observacao text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auditorio_reserva_eventos_reserva_idx
  on public.auditorio_reserva_eventos (reserva_id, created_at desc);

create table if not exists public.auditorio_notificacoes (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.auditorio_reservas(id) on delete cascade,
  destinatario_id text,
  tipo text not null default 'nova_solicitacao',
  titulo text not null,
  mensagem text not null,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auditorio_notificacoes_destinatario_idx
  on public.auditorio_notificacoes (destinatario_id, lida_em, created_at desc);

create or replace function private.auditorio_normalize_access_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(btrim(coalesce(p_value, '')), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function private.auditorio_hash_access_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(private.auditorio_normalize_access_code(p_value), 'sha256'), 'hex');
$$;

create or replace function private.auditorio_status_label(p_status text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_status
    when 'pendente' then 'Pendente'
    when 'aprovado' then 'Aprovado'
    when 'recusado' then 'Recusado'
    when 'cancelado' then 'Cancelado'
    when 'concluido' then 'Concluído'
    else initcap(coalesce(p_status, ''))
  end;
$$;

create or replace function private.auditorio_tipo_evento_label(p_tipo text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_tipo
    when 'lancamento' then 'Lançamento'
    when 'treinamento' then 'Treinamento'
    when 'reuniao' then 'Reunião'
    when 'palestra' then 'Palestra'
    when 'evento_interno' then 'Evento interno'
    when 'apresentacao' then 'Apresentação'
    when 'outro' then 'Outro'
    else initcap(coalesce(p_tipo, ''))
  end;
$$;

create or replace function private.auditorio_alimentacao_label(p_tipo text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_tipo
    when 'nao' then 'Não'
    when 'coffee_break' then 'Coffee break'
    when 'buffet' then 'Buffet'
    else initcap(coalesce(p_tipo, ''))
  end;
$$;

create or replace function private.auditorio_responsavel_alimentacao_label(p_tipo text, p_outro text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_tipo
    when 'santa_maria' then 'Santa Maria'
    when 'construtora' then 'Construtora'
    when 'empresa_evento' then 'Empresa responsável pelo evento'
    when 'outro' then coalesce(nullif(btrim(p_outro), ''), 'Outro')
    else coalesce(nullif(btrim(p_tipo), ''), 'Nao informado')
  end;
$$;

create or replace function private.auditorio_prepare_reserva_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.solicitante_nome := nullif(btrim(coalesce(new.solicitante_nome, '')), '');
  new.solicitante_telefone := nullif(btrim(coalesce(new.solicitante_telefone, '')), '');
  new.solicitante_email := nullif(lower(btrim(coalesce(new.solicitante_email, ''))), '');
  new.solicitante_setor := nullif(btrim(coalesce(new.solicitante_setor, '')), '');
  new.solicitante_empresa := nullif(btrim(coalesce(new.solicitante_empresa, '')), '');
  new.tipo_evento := lower(btrim(coalesce(new.tipo_evento, '')));
  new.nome_evento := nullif(btrim(coalesce(new.nome_evento, '')), '');
  new.nome_lancamento := nullif(btrim(coalesce(new.nome_lancamento, '')), '');
  new.construtora := nullif(btrim(coalesce(new.construtora, '')), '');
  new.tipo_alimentacao := lower(btrim(coalesce(new.tipo_alimentacao, 'nao')));
  new.responsavel_alimentacao := nullif(lower(btrim(coalesce(new.responsavel_alimentacao, ''))), '');
  new.responsavel_alimentacao_outro := nullif(btrim(coalesce(new.responsavel_alimentacao_outro, '')), '');
  new.necessidades_especiais := nullif(btrim(coalesce(new.necessidades_especiais, '')), '');
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');
  new.observacao_administrativa := nullif(btrim(coalesce(new.observacao_administrativa, '')), '');
  new.updated_at := now();
  new.inicio_reserva := (new.data_evento + new.horario_montagem) at time zone 'America/Sao_Paulo';
  new.fim_reserva := (new.data_evento + new.horario_desmontagem) at time zone 'America/Sao_Paulo';

  if new.tipo_alimentacao = 'nao' then
    new.responsavel_alimentacao := null;
    new.responsavel_alimentacao_outro := null;
  end if;

  if new.responsavel_alimentacao <> 'outro' then
    new.responsavel_alimentacao_outro := null;
  end if;

  if new.tipo_evento <> 'lancamento' then
    new.nome_lancamento := null;
    new.construtora := null;
  end if;

  return new;
end;
$$;

drop trigger if exists auditorio_prepare_reserva_state on public.auditorio_reservas;
create trigger auditorio_prepare_reserva_state
before insert or update on public.auditorio_reservas
for each row execute function private.auditorio_prepare_reserva_state();

create or replace function private.auditorio_conflict_message(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ignored_reserva_id uuid default null
)
returns text
language sql
stable
set search_path = ''
as $$
  select format(
    'Conflito com AUD-%s-%s (%s), reservado em %s das %s as %s.',
    to_char(r.created_at at time zone 'America/Sao_Paulo', 'YYYY'),
    lpad(r.protocolo::text, 6, '0'),
    r.nome_evento,
    to_char(r.data_evento, 'DD/MM/YYYY'),
    to_char(r.horario_montagem, 'HH24:MI'),
    to_char(r.horario_desmontagem, 'HH24:MI')
  )
  from public.auditorio_reservas r
  where r.status = 'aprovado'
    and (p_ignored_reserva_id is null or r.id <> p_ignored_reserva_id)
    and tstzrange(r.inicio_reserva, r.fim_reserva, '[)') && tstzrange(p_inicio, p_fim, '[)')
  order by r.inicio_reserva, r.created_at
  limit 1;
$$;

create or replace function private.auditorio_notify_admins(
  p_reserva_id uuid,
  p_evento_nome text,
  p_data_evento date,
  p_horario_inicio time without time zone,
  p_solicitante_nome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_titulo text := 'Nova solicitação de auditório';
  v_mensagem text := format(
    '%s solicitou %s em %s às %s.',
    p_solicitante_nome,
    p_evento_nome,
    to_char(p_data_evento, 'DD/MM/YYYY'),
    to_char(p_horario_inicio, 'HH24:MI')
  );
begin
  for v_admin in
    select id
    from public.managed_users
    where active is true
      and (
        id = 'tezzei'
        or 'painel-admin' = any(coalesce(permissions, '{}'::text[]))
        or 'auditorio' = any(coalesce(permissions, '{}'::text[]))
      )
  loop
    insert into public.auditorio_notificacoes (
      reserva_id,
      destinatario_id,
      titulo,
      mensagem
    ) values (
      p_reserva_id,
      v_admin.id,
      v_titulo,
      v_mensagem
    )
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.auditorio_public_get_availability(
  p_year integer,
  p_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if p_year < 2024 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'AUDITORIO_PERIODO_INVALIDO';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month')::date;

  select jsonb_build_object(
    'monthStart', v_start,
    'monthEnd', v_end - 1,
    'timezone', 'America/Sao_Paulo',
    'dayStart', '08:00',
    'dayEnd', '22:00',
    'timeStepMinutes', 30,
    'reservedSlots', coalesce(jsonb_agg(
      jsonb_build_object(
        'date', r.data_evento,
        'start', to_char(r.horario_montagem, 'HH24:MI'),
        'end', to_char(r.horario_desmontagem, 'HH24:MI'),
        'label', 'Reservado'
      )
      order by r.data_evento, r.horario_montagem
    ) filter (where r.id is not null), '[]'::jsonb)
  )
  into v_result
  from public.auditorio_reservas r
  where r.status = 'aprovado'
    and r.data_evento >= v_start
    and r.data_evento < v_end;

  return coalesce(v_result, jsonb_build_object(
    'monthStart', v_start,
    'monthEnd', v_end - 1,
    'timezone', 'America/Sao_Paulo',
    'dayStart', '08:00',
    'dayEnd', '22:00',
    'timeStepMinutes', 30,
    'reservedSlots', '[]'::jsonb
  ));
end;
$$;

create or replace function public.auditorio_public_create_reserva(
  p_submission_id uuid,
  p_public_access_code text,
  p_solicitante_nome text,
  p_solicitante_telefone text,
  p_solicitante_email text,
  p_solicitante_setor text,
  p_solicitante_empresa text,
  p_tipo_evento text,
  p_nome_evento text,
  p_nome_lancamento text,
  p_construtora text,
  p_data_evento date,
  p_horario_montagem time without time zone,
  p_horario_inicio time without time zone,
  p_horario_fim time without time zone,
  p_horario_desmontagem time without time zone,
  p_quantidade_pessoas integer,
  p_tipo_alimentacao text,
  p_responsavel_alimentacao text,
  p_responsavel_alimentacao_outro text,
  p_precisa_projetor boolean,
  p_precisa_microfone boolean,
  p_precisa_som boolean,
  p_precisa_cadeiras boolean,
  p_precisa_mesas boolean,
  p_necessidades_especiais text,
  p_observacoes text,
  p_website text default null
)
returns table (
  reserva_id uuid,
  protocolo bigint,
  created_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.auditorio_reservas%rowtype;
  v_hash text;
  v_now_local date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio_reserva timestamptz;
  v_fim_reserva timestamptz;
  v_conflict text;
  v_inserted public.auditorio_reservas%rowtype;
begin
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    raise exception 'AUDITORIO_SOLICITACAO_INVALIDA';
  end if;

  if p_submission_id is null then
    raise exception 'AUDITORIO_SUBMISSION_ID_REQUIRED';
  end if;

  if char_length(private.auditorio_normalize_access_code(p_public_access_code)) < 6 then
    raise exception 'AUDITORIO_CODIGO_CONSULTA_INVALIDO';
  end if;

  v_hash := private.auditorio_hash_access_code(p_public_access_code);

  select *
  into v_existing
  from public.auditorio_reservas r
  where r.public_submission_id = p_submission_id
  limit 1;

  if found then
    if v_existing.public_access_code_hash <> v_hash then
      raise exception 'AUDITORIO_SUBMISSION_ID_EM_USO';
    end if;

    reserva_id := v_existing.id;
    protocolo := v_existing.protocolo;
    created_at := v_existing.created_at;
    status := v_existing.status;
    return next;
    return;
  end if;

  if nullif(btrim(coalesce(p_solicitante_nome, '')), '') is null then
    raise exception 'AUDITORIO_SOLICITANTE_NOME_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_solicitante_telefone, '')), '') is null then
    raise exception 'AUDITORIO_SOLICITANTE_TELEFONE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_nome_evento, '')), '') is null then
    raise exception 'AUDITORIO_NOME_EVENTO_REQUIRED';
  end if;

  if p_data_evento is null or p_data_evento < v_now_local then
    raise exception 'AUDITORIO_DATA_INVALIDA';
  end if;

  if p_horario_montagem is null or p_horario_inicio is null or p_horario_fim is null or p_horario_desmontagem is null then
    raise exception 'AUDITORIO_HORARIOS_REQUIRED';
  end if;

  if not (p_horario_montagem <= p_horario_inicio and p_horario_inicio < p_horario_fim and p_horario_fim <= p_horario_desmontagem) then
    raise exception 'AUDITORIO_HORARIOS_INVALIDOS';
  end if;

  if coalesce(p_quantidade_pessoas, 0) <= 0 then
    raise exception 'AUDITORIO_QUANTIDADE_INVALIDA';
  end if;

  if lower(btrim(coalesce(p_tipo_evento, ''))) = 'lancamento'
     and (
       nullif(btrim(coalesce(p_nome_lancamento, '')), '') is null
       or nullif(btrim(coalesce(p_construtora, '')), '') is null
     ) then
    raise exception 'AUDITORIO_LANCAMENTO_DADOS_REQUIRED';
  end if;

  if lower(btrim(coalesce(p_tipo_alimentacao, 'nao'))) <> 'nao'
     and nullif(btrim(coalesce(p_responsavel_alimentacao, '')), '') is null then
    raise exception 'AUDITORIO_ALIMENTACAO_RESPONSAVEL_REQUIRED';
  end if;

  if lower(btrim(coalesce(p_responsavel_alimentacao, ''))) = 'outro'
     and nullif(btrim(coalesce(p_responsavel_alimentacao_outro, '')), '') is null then
    raise exception 'AUDITORIO_ALIMENTACAO_OUTRO_REQUIRED';
  end if;

  v_inicio_reserva := (p_data_evento + p_horario_montagem) at time zone 'America/Sao_Paulo';
  v_fim_reserva := (p_data_evento + p_horario_desmontagem) at time zone 'America/Sao_Paulo';

  v_conflict := private.auditorio_conflict_message(v_inicio_reserva, v_fim_reserva, null);
  if v_conflict is not null then
    raise exception 'AUDITORIO_RESERVA_CONFLITO: %', v_conflict;
  end if;

  insert into public.auditorio_reservas (
    public_submission_id,
    public_access_code_hash,
    solicitante_nome,
    solicitante_telefone,
    solicitante_email,
    solicitante_setor,
    solicitante_empresa,
    tipo_evento,
    nome_evento,
    nome_lancamento,
    construtora,
    data_evento,
    horario_montagem,
    horario_inicio,
    horario_fim,
    horario_desmontagem,
    inicio_reserva,
    fim_reserva,
    quantidade_pessoas,
    tipo_alimentacao,
    responsavel_alimentacao,
    responsavel_alimentacao_outro,
    precisa_projetor,
    precisa_microfone,
    precisa_som,
    precisa_cadeiras,
    precisa_mesas,
    necessidades_especiais,
    observacoes
  ) values (
    p_submission_id,
    v_hash,
    p_solicitante_nome,
    p_solicitante_telefone,
    p_solicitante_email,
    p_solicitante_setor,
    p_solicitante_empresa,
    lower(btrim(coalesce(p_tipo_evento, ''))),
    p_nome_evento,
    p_nome_lancamento,
    p_construtora,
    p_data_evento,
    p_horario_montagem,
    p_horario_inicio,
    p_horario_fim,
    p_horario_desmontagem,
    v_inicio_reserva,
    v_fim_reserva,
    p_quantidade_pessoas,
    lower(btrim(coalesce(p_tipo_alimentacao, 'nao'))),
    nullif(lower(btrim(coalesce(p_responsavel_alimentacao, ''))), ''),
    p_responsavel_alimentacao_outro,
    coalesce(p_precisa_projetor, false),
    coalesce(p_precisa_microfone, false),
    coalesce(p_precisa_som, false),
    coalesce(p_precisa_cadeiras, false),
    coalesce(p_precisa_mesas, false),
    p_necessidades_especiais,
    p_observacoes
  )
  returning *
  into v_inserted;

  insert into public.auditorio_reserva_eventos (
    reserva_id,
    tipo,
    ator_nome,
    observacao,
    metadata
  ) values (
    v_inserted.id,
    'criada',
    v_inserted.solicitante_nome,
    'Solicitação criada pelo formulário público.',
    jsonb_build_object('origem', 'publico')
  );

  perform private.auditorio_notify_admins(
    v_inserted.id,
    v_inserted.nome_evento,
    v_inserted.data_evento,
    v_inserted.horario_inicio,
    v_inserted.solicitante_nome
  );

  reserva_id := v_inserted.id;
  protocolo := v_inserted.protocolo;
  created_at := v_inserted.created_at;
  status := v_inserted.status;
  return next;
end;
$$;

create or replace function public.auditorio_public_get_reserva(
  p_protocolo bigint,
  p_codigo_consulta text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_reserva public.auditorio_reservas%rowtype;
begin
  if p_protocolo is null or p_protocolo <= 0 then
    raise exception 'AUDITORIO_PROTOCOLO_INVALIDO';
  end if;

  if char_length(private.auditorio_normalize_access_code(p_codigo_consulta)) < 6 then
    raise exception 'AUDITORIO_CODIGO_CONSULTA_INVALIDO';
  end if;

  v_hash := private.auditorio_hash_access_code(p_codigo_consulta);

  select *
  into v_reserva
  from public.auditorio_reservas r
  where r.protocolo = p_protocolo
    and r.public_access_code_hash = v_hash
  limit 1;

  if not found then
    raise exception 'AUDITORIO_SOLICITACAO_NAO_ENCONTRADA';
  end if;

  return jsonb_build_object(
    'id', v_reserva.id,
    'protocol', format('AUD-%s-%s', to_char(v_reserva.created_at at time zone 'America/Sao_Paulo', 'YYYY'), lpad(v_reserva.protocolo::text, 6, '0')),
    'protocolNumber', v_reserva.protocolo,
    'eventName', v_reserva.nome_evento,
    'eventType', v_reserva.tipo_evento,
    'eventTypeLabel', private.auditorio_tipo_evento_label(v_reserva.tipo_evento),
    'eventDate', v_reserva.data_evento,
    'setupTime', to_char(v_reserva.horario_montagem, 'HH24:MI'),
    'startTime', to_char(v_reserva.horario_inicio, 'HH24:MI'),
    'endTime', to_char(v_reserva.horario_fim, 'HH24:MI'),
    'teardownTime', to_char(v_reserva.horario_desmontagem, 'HH24:MI'),
    'status', v_reserva.status,
    'statusLabel', private.auditorio_status_label(v_reserva.status),
    'adminNote', v_reserva.observacao_administrativa,
    'peopleCount', v_reserva.quantidade_pessoas,
    'foodType', v_reserva.tipo_alimentacao,
    'foodTypeLabel', private.auditorio_alimentacao_label(v_reserva.tipo_alimentacao),
    'createdAt', v_reserva.created_at,
    'updatedAt', v_reserva.updated_at
  );
end;
$$;

create or replace function public.auditorio_admin_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := nullif(auth.uid()::text, '');
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'AUDITORIO_ACESSO_NEGADO';
  end if;

  select jsonb_build_object(
    'reservations',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'protocol', format('AUD-%s-%s', to_char(r.created_at at time zone 'America/Sao_Paulo', 'YYYY'), lpad(r.protocolo::text, 6, '0')),
        'protocolNumber', r.protocolo,
        'requesterName', r.solicitante_nome,
        'requesterPhone', r.solicitante_telefone,
        'requesterEmail', r.solicitante_email,
        'requesterDepartment', r.solicitante_setor,
        'requesterCompany', r.solicitante_empresa,
        'eventType', r.tipo_evento,
        'eventTypeLabel', private.auditorio_tipo_evento_label(r.tipo_evento),
        'eventName', r.nome_evento,
        'launchName', r.nome_lancamento,
        'builderName', r.construtora,
        'eventDate', r.data_evento,
        'setupTime', to_char(r.horario_montagem, 'HH24:MI'),
        'startTime', to_char(r.horario_inicio, 'HH24:MI'),
        'endTime', to_char(r.horario_fim, 'HH24:MI'),
        'teardownTime', to_char(r.horario_desmontagem, 'HH24:MI'),
        'reservationStart', r.inicio_reserva,
        'reservationEnd', r.fim_reserva,
        'peopleCount', r.quantidade_pessoas,
        'foodType', r.tipo_alimentacao,
        'foodTypeLabel', private.auditorio_alimentacao_label(r.tipo_alimentacao),
        'foodResponsible', r.responsavel_alimentacao,
        'foodResponsibleLabel', case
          when r.tipo_alimentacao = 'nao' then null
          else private.auditorio_responsavel_alimentacao_label(r.responsavel_alimentacao, r.responsavel_alimentacao_outro)
        end,
        'foodResponsibleOther', r.responsavel_alimentacao_outro,
        'needsProjector', r.precisa_projetor,
        'needsMicrophone', r.precisa_microfone,
        'needsSound', r.precisa_som,
        'needsChairs', r.precisa_cadeiras,
        'needsTables', r.precisa_mesas,
        'specialNeeds', r.necessidades_especiais,
        'notes', r.observacoes,
        'status', r.status,
        'statusLabel', private.auditorio_status_label(r.status),
        'adminNote', r.observacao_administrativa,
        'approvedBy', r.aprovado_por,
        'approvedByName', r.aprovado_por_nome,
        'approvedAt', r.aprovado_em,
        'refusedBy', r.recusado_por,
        'refusedByName', r.recusado_por_nome,
        'refusedAt', r.recusado_em,
        'canceledBy', r.cancelado_por,
        'canceledByName', r.cancelado_por_nome,
        'canceledAt', r.cancelado_em,
        'completedBy', r.concluido_por,
        'completedByName', r.concluido_por_nome,
        'completedAt', r.concluido_em,
        'createdAt', r.created_at,
        'updatedAt', r.updated_at
      )
      order by r.data_evento desc, r.horario_montagem desc, r.created_at desc
    ) filter (where r.id is not null), '[]'::jsonb),
    'events',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'reservationId', e.reserva_id,
          'type', e.tipo,
          'actorId', e.ator_id,
          'actorName', e.ator_nome,
          'note', e.observacao,
          'metadata', e.metadata,
          'createdAt', e.created_at
        )
        order by e.created_at desc
      )
      from public.auditorio_reserva_eventos e
      where e.created_at >= now() - interval '180 days'
    ), '[]'::jsonb),
    'notifications',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'reservationId', n.reserva_id,
          'recipientId', n.destinatario_id,
          'type', n.tipo,
          'title', n.titulo,
          'message', n.mensagem,
          'readAt', n.lida_em,
          'createdAt', n.created_at
        )
        order by n.created_at desc
      )
      from public.auditorio_notificacoes n
      where n.destinatario_id is null
        or n.destinatario_id = coalesce(v_user_id, n.destinatario_id)
    ), '[]'::jsonb),
    'generatedAt', now()
  )
  into v_result
  from public.auditorio_reservas r
  where r.created_at >= now() - interval '365 days'
     or r.status in ('pendente', 'aprovado');

  return coalesce(v_result, jsonb_build_object(
    'reservations', '[]'::jsonb,
    'events', '[]'::jsonb,
    'notifications', '[]'::jsonb,
    'generatedAt', now()
  ));
end;
$$;

create or replace function public.auditorio_admin_decidir_reserva(
  p_reserva_id uuid,
  p_decisao text,
  p_actor_user_id text,
  p_actor_name text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decisao text := lower(btrim(coalesce(p_decisao, '')));
  v_note text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_actor_id text := nullif(btrim(coalesce(p_actor_user_id, '')), '');
  v_actor_name text := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'Administrador');
  v_reserva public.auditorio_reservas%rowtype;
  v_conflict text;
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'AUDITORIO_ACESSO_NEGADO';
  end if;

  if p_reserva_id is null then
    raise exception 'AUDITORIO_RESERVA_REQUIRED';
  end if;

  if v_decisao not in ('aprovar', 'recusar', 'cancelar', 'concluir') then
    raise exception 'AUDITORIO_DECISAO_INVALIDA';
  end if;

  select *
  into v_reserva
  from public.auditorio_reservas r
  where r.id = p_reserva_id
  for update;

  if not found then
    raise exception 'AUDITORIO_RESERVA_NAO_ENCONTRADA';
  end if;

  if v_decisao = 'aprovar' then
    if v_reserva.status in ('cancelado', 'concluido') then
      raise exception 'AUDITORIO_RESERVA_ENCERRADA';
    end if;

    perform pg_advisory_xact_lock(hashtext('auditorio_reservas:' || v_reserva.data_evento::text));

    v_conflict := private.auditorio_conflict_message(v_reserva.inicio_reserva, v_reserva.fim_reserva, v_reserva.id);
    if v_conflict is not null then
      raise exception 'AUDITORIO_RESERVA_CONFLITO: %', v_conflict;
    end if;

    update public.auditorio_reservas
    set status = 'aprovado',
        observacao_administrativa = v_note,
        aprovado_por = v_actor_id,
        aprovado_por_nome = v_actor_name,
        aprovado_em = now(),
        recusado_por = null,
        recusado_por_nome = null,
        recusado_em = null,
        cancelado_por = null,
        cancelado_por_nome = null,
        cancelado_em = null,
        concluido_por = null,
        concluido_por_nome = null,
        concluido_em = null
    where id = v_reserva.id;

    insert into public.auditorio_reserva_eventos (reserva_id, tipo, ator_id, ator_nome, observacao)
    values (v_reserva.id, 'aprovada', v_actor_id, v_actor_name, v_note);
  elsif v_decisao = 'recusar' then
    if v_reserva.status = 'aprovado' then
      raise exception 'AUDITORIO_RESERVA_APROVADA_USE_CANCELAR';
    end if;

    update public.auditorio_reservas
    set status = 'recusado',
        observacao_administrativa = v_note,
        recusado_por = v_actor_id,
        recusado_por_nome = v_actor_name,
        recusado_em = now()
    where id = v_reserva.id;

    insert into public.auditorio_reserva_eventos (reserva_id, tipo, ator_id, ator_nome, observacao)
    values (v_reserva.id, 'recusada', v_actor_id, v_actor_name, v_note);
  elsif v_decisao = 'cancelar' then
    if v_reserva.status not in ('pendente', 'aprovado') then
      raise exception 'AUDITORIO_RESERVA_NAO_CANCELAVEL';
    end if;

    update public.auditorio_reservas
    set status = 'cancelado',
        observacao_administrativa = v_note,
        cancelado_por = v_actor_id,
        cancelado_por_nome = v_actor_name,
        cancelado_em = now()
    where id = v_reserva.id;

    insert into public.auditorio_reserva_eventos (reserva_id, tipo, ator_id, ator_nome, observacao)
    values (v_reserva.id, 'cancelada', v_actor_id, v_actor_name, v_note);
  elsif v_decisao = 'concluir' then
    if v_reserva.status <> 'aprovado' then
      raise exception 'AUDITORIO_RESERVA_NAO_CONCLUIVEL';
    end if;

    update public.auditorio_reservas
    set status = 'concluido',
        observacao_administrativa = coalesce(v_note, observacao_administrativa),
        concluido_por = v_actor_id,
        concluido_por_nome = v_actor_name,
        concluido_em = now()
    where id = v_reserva.id;

    insert into public.auditorio_reserva_eventos (reserva_id, tipo, ator_id, ator_nome, observacao)
    values (v_reserva.id, 'concluida', v_actor_id, v_actor_name, v_note);
  end if;

  update public.auditorio_notificacoes
  set lida_em = coalesce(lida_em, now())
  where reserva_id = v_reserva.id
    and (destinatario_id is null or destinatario_id = coalesce(v_actor_id, destinatario_id));

  select jsonb_build_object(
    'id', r.id,
    'protocol', format('AUD-%s-%s', to_char(r.created_at at time zone 'America/Sao_Paulo', 'YYYY'), lpad(r.protocolo::text, 6, '0')),
    'protocolNumber', r.protocolo,
    'status', r.status,
    'statusLabel', private.auditorio_status_label(r.status),
    'adminNote', r.observacao_administrativa,
    'approvedAt', r.aprovado_em,
    'refusedAt', r.recusado_em,
    'canceledAt', r.cancelado_em,
    'completedAt', r.concluido_em,
    'updatedAt', r.updated_at
  )
  into v_result
  from public.auditorio_reservas r
  where r.id = v_reserva.id;

  return v_result;
end;
$$;

create or replace function public.auditorio_admin_marcar_notificacoes_lidas(
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_user_id text := nullif(auth.uid()::text, '');
begin
  if not public.is_hub_admin() then
    raise exception 'AUDITORIO_ACESSO_NEGADO';
  end if;

  update public.auditorio_notificacoes n
  set lida_em = coalesce(n.lida_em, now())
  where (p_notification_ids is null or n.id = any(p_notification_ids))
    and (n.destinatario_id is null or n.destinatario_id = coalesce(v_user_id, n.destinatario_id));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.auditorio_reservas enable row level security;
alter table public.auditorio_reserva_eventos enable row level security;
alter table public.auditorio_notificacoes enable row level security;

revoke all on table public.auditorio_reservas from public, anon, authenticated;
revoke all on table public.auditorio_reserva_eventos from public, anon, authenticated;
revoke all on table public.auditorio_notificacoes from public, anon, authenticated;

grant select, update on table public.auditorio_reservas to authenticated;
grant select on table public.auditorio_reserva_eventos to authenticated;
grant select, update on table public.auditorio_notificacoes to authenticated;

drop policy if exists "auditorio_reservas_admin_select" on public.auditorio_reservas;
create policy "auditorio_reservas_admin_select"
on public.auditorio_reservas
for select
to authenticated
using (public.is_hub_admin());

drop policy if exists "auditorio_reservas_admin_update" on public.auditorio_reservas;
create policy "auditorio_reservas_admin_update"
on public.auditorio_reservas
for update
to authenticated
using (public.is_hub_admin())
with check (public.is_hub_admin());

drop policy if exists "auditorio_eventos_admin_select" on public.auditorio_reserva_eventos;
create policy "auditorio_eventos_admin_select"
on public.auditorio_reserva_eventos
for select
to authenticated
using (public.is_hub_admin());

drop policy if exists "auditorio_notificacoes_admin_select" on public.auditorio_notificacoes;
create policy "auditorio_notificacoes_admin_select"
on public.auditorio_notificacoes
for select
to authenticated
using (public.is_hub_admin());

drop policy if exists "auditorio_notificacoes_admin_update" on public.auditorio_notificacoes;
create policy "auditorio_notificacoes_admin_update"
on public.auditorio_notificacoes
for update
to authenticated
using (public.is_hub_admin())
with check (public.is_hub_admin());

revoke all on function public.auditorio_public_get_availability(integer, integer) from public, anon, authenticated;
revoke all on function public.auditorio_public_create_reserva(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  time without time zone,
  time without time zone,
  time without time zone,
  time without time zone,
  integer,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.auditorio_public_get_reserva(bigint, text) from public, anon, authenticated;
revoke all on function public.auditorio_admin_get_dashboard() from public, anon, authenticated;
revoke all on function public.auditorio_admin_decidir_reserva(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.auditorio_admin_marcar_notificacoes_lidas(uuid[]) from public, anon, authenticated;

grant execute on function public.auditorio_public_get_availability(integer, integer) to anon, authenticated;
grant execute on function public.auditorio_public_create_reserva(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  time without time zone,
  time without time zone,
  time without time zone,
  time without time zone,
  integer,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text
) to anon, authenticated;
grant execute on function public.auditorio_public_get_reserva(bigint, text) to anon, authenticated;
grant execute on function public.auditorio_admin_get_dashboard() to authenticated;
grant execute on function public.auditorio_admin_decidir_reserva(uuid, text, text, text, text) to authenticated;
grant execute on function public.auditorio_admin_marcar_notificacoes_lidas(uuid[]) to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'managed_users'
  ) then
    update public.managed_users
    set permissions = array_append(coalesce(permissions, '{}'::text[]), 'auditorio'),
        updated_at = now()
    where id = 'tezzei'
      and not ('auditorio' = any(coalesce(permissions, '{}'::text[])));
  end if;
end $$;

commit;
