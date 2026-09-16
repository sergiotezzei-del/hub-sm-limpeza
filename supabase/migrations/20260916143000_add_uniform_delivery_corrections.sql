alter table public.uniform_delivery_batch_items
  add column if not exists active boolean not null default true,
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by_name text,
  add column if not exists correction_reason text;

create index if not exists uniform_delivery_batch_items_active_batch_idx
  on public.uniform_delivery_batch_items(batch_id, created_at)
  where active;

alter table public.uniform_delivery_terms
  add column if not exists replaced_by_term_id uuid references public.uniform_delivery_terms(id) on delete restrict,
  add column if not exists replaced_at timestamptz,
  add column if not exists replaced_by_name text,
  add column if not exists replacement_reason text;

alter table public.uniform_delivery_terms drop constraint if exists uniform_delivery_terms_status_check;
alter table public.uniform_delivery_terms
  add constraint uniform_delivery_terms_status_check
  check (status in ('aguardando_assinatura','assinado','substituido'));

alter table public.uniform_delivery_terms drop constraint if exists uniform_delivery_terms_batch_id_key;
create unique index if not exists uniform_delivery_terms_one_current_per_batch
  on public.uniform_delivery_terms(batch_id)
  where status in ('aguardando_assinatura','assinado');

create index if not exists uniform_delivery_terms_replaced_by_term_idx
  on public.uniform_delivery_terms(replaced_by_term_id);

create table if not exists public.uniform_delivery_corrections (
  id uuid primary key,
  correction_type text not null check (correction_type in ('pessoa','tamanho')),
  correction_mode text not null check (correction_mode in ('correcao_administrativa','troca_fisica','retificacao_termo_assinado')),
  source_batch_id uuid not null references public.uniform_delivery_batches(id) on delete restrict,
  source_term_id uuid references public.uniform_delivery_terms(id) on delete restrict,
  result_batch_id uuid references public.uniform_delivery_batches(id) on delete restrict,
  result_term_id uuid references public.uniform_delivery_terms(id) on delete restrict,
  source_person_id uuid references public.organization_people(id) on delete restrict,
  target_person_id uuid references public.organization_people(id) on delete restrict,
  source_assignment_id uuid references public.patrimony_assignments(id) on delete restrict,
  source_batch_item_id uuid references public.uniform_delivery_batch_items(id) on delete restrict,
  source_item_id uuid references public.patrimony_items(id) on delete restrict,
  target_item_id uuid references public.patrimony_items(id) on delete restrict,
  quantity numeric check (quantity is null or quantity > 0),
  reason text not null check (btrim(reason) <> ''),
  actor_auth_user uuid default auth.uid(),
  actor_name text not null check (btrim(actor_name) <> ''),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.uniform_delivery_corrections
  add column if not exists before_data jsonb not null default '{}'::jsonb,
  add column if not exists after_data jsonb not null default '{}'::jsonb;

create index if not exists uniform_delivery_corrections_source_batch_idx
  on public.uniform_delivery_corrections(source_batch_id);
create index if not exists uniform_delivery_corrections_source_term_idx
  on public.uniform_delivery_corrections(source_term_id);
create index if not exists uniform_delivery_corrections_result_batch_idx
  on public.uniform_delivery_corrections(result_batch_id);
create index if not exists uniform_delivery_corrections_result_term_idx
  on public.uniform_delivery_corrections(result_term_id);
create index if not exists uniform_delivery_corrections_source_person_idx
  on public.uniform_delivery_corrections(source_person_id);
create index if not exists uniform_delivery_corrections_target_person_idx
  on public.uniform_delivery_corrections(target_person_id);
create index if not exists uniform_delivery_corrections_source_assignment_idx
  on public.uniform_delivery_corrections(source_assignment_id);
create index if not exists uniform_delivery_corrections_source_batch_item_idx
  on public.uniform_delivery_corrections(source_batch_item_id);
create index if not exists uniform_delivery_corrections_source_item_idx
  on public.uniform_delivery_corrections(source_item_id);
create index if not exists uniform_delivery_corrections_target_item_idx
  on public.uniform_delivery_corrections(target_item_id);

alter table public.uniform_delivery_corrections enable row level security;
grant select, insert on public.uniform_delivery_corrections to authenticated;
revoke all on public.uniform_delivery_corrections from anon;

drop policy if exists uniform_delivery_corrections_admin_select on public.uniform_delivery_corrections;
create policy uniform_delivery_corrections_admin_select
  on public.uniform_delivery_corrections for select to authenticated
  using ((select public.is_hub_admin()));

drop policy if exists uniform_delivery_corrections_admin_insert on public.uniform_delivery_corrections;
create policy uniform_delivery_corrections_admin_insert
  on public.uniform_delivery_corrections for insert to authenticated
  with check ((select public.is_hub_admin()));

alter table public.patrimony_audit_log drop constraint if exists patrimony_audit_log_action_check;
alter table public.patrimony_audit_log add constraint patrimony_audit_log_action_check check (action in (
  'person_notebook_update', 'notebook_item_update', 'person_inactivation', 'notebook_transfer',
  'uniform_delivery', 'uniform_return', 'uniform_stock_receipt', 'uniform_term_attachment',
  'uniform_term_print', 'person_document_update', 'uniform_delivery_correction'
));

create or replace function public.recalculate_uniform_item_status(p_item_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.patrimony_items%rowtype;
  v_remaining_assigned numeric;
  v_status text;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para recalcular uniforme'; end if;
  if p_item_id is null then raise exception 'Uniforme obrigatorio'; end if;

  select * into v_item
    from public.patrimony_items
   where id = p_item_id
   for update;
  if not found or lower(v_item.category) <> 'uniforme' then raise exception 'Uniforme nao encontrado'; end if;

  if v_item.available_quantity < 0 then raise exception 'Saldo disponivel negativo para %', v_item.code; end if;
  if v_item.available_quantity + v_item.maintenance_quantity + v_item.lost_quantity > v_item.total_quantity then
    raise exception 'Saldos maiores que o total recebido para %', v_item.code;
  end if;

  select coalesce(sum(quantity - returned_quantity), 0)
    into v_remaining_assigned
    from public.patrimony_assignments
   where item_id = p_item_id
     and returned_at is null;

  v_status := case
    when v_remaining_assigned > 0 and v_item.available_quantity > 0 then 'parcialmente_em_uso'
    when v_remaining_assigned > 0 then 'em_uso'
    when v_item.available_quantity > 0 then 'disponivel'
    when v_item.maintenance_quantity > 0 then 'manutencao'
    when v_item.lost_quantity >= v_item.total_quantity then 'extraviado'
    else 'indisponivel'
  end;

  update public.patrimony_items
     set status = v_status,
         updated_at = now()
   where id = p_item_id;

  return v_status;
end;
$$;

revoke all on function public.recalculate_uniform_item_status(uuid) from public, anon;
grant execute on function public.recalculate_uniform_item_status(uuid) to authenticated;

create or replace function public.correct_uniform_delivery_person(
  p_correction_id uuid,
  p_batch_id uuid,
  p_new_person_id uuid,
  p_reason text,
  p_actor_name text default 'Admin Tezzei',
  p_new_batch_id uuid default null,
  p_new_term_id uuid default null,
  p_template_version text default null
)
returns table(correction_id uuid, batch_id uuid, term_id uuid, created_new_batch boolean, term_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.uniform_delivery_corrections%rowtype;
  v_batch public.uniform_delivery_batches%rowtype;
  v_term public.uniform_delivery_terms%rowtype;
  v_old_person public.organization_people%rowtype;
  v_new_person public.organization_people%rowtype;
  v_line record;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_template_version text;
  v_new_assignment_id uuid;
  v_total numeric := 0;
  v_items_summary jsonb := '[]'::jsonb;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para corrigir entrega de uniformes'; end if;
  if p_correction_id is null then raise exception 'Identificador da correcao obrigatorio'; end if;
  if p_batch_id is null then raise exception 'Entrega obrigatoria'; end if;
  if p_new_person_id is null then raise exception 'Novo funcionario obrigatorio'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da correcao'; end if;

  select * into v_existing
    from public.uniform_delivery_corrections
   where id = p_correction_id;
  if found then
    correction_id := v_existing.id;
    batch_id := coalesce(v_existing.result_batch_id, v_existing.source_batch_id);
    term_id := v_existing.result_term_id;
    created_new_batch := v_existing.result_batch_id is distinct from v_existing.source_batch_id;
    select status into term_status from public.uniform_delivery_terms where id = v_existing.result_term_id;
    term_status := coalesce(term_status, 'aguardando_assinatura');
    return next;
    return;
  end if;

  select * into v_batch
    from public.uniform_delivery_batches
   where id = p_batch_id
   for update;
  if not found then raise exception 'Entrega nao encontrada'; end if;

  select udt.* into v_term
    from public.uniform_delivery_terms udt
   where udt.batch_id = p_batch_id
     and udt.status <> 'substituido'
   order by udt.generated_at desc
   limit 1
   for update;
  if not found then raise exception 'Termo vigente nao encontrado'; end if;

  select * into v_old_person from public.organization_people where id = v_batch.person_id;
  select * into v_new_person
    from public.organization_people
   where id = p_new_person_id
   for update;
  if not found or not v_new_person.active then raise exception 'Funcionario correto nao encontrado ou inativo'; end if;
  if v_batch.person_id = p_new_person_id then raise exception 'Funcionario correto ja e o funcionario atual da entrega'; end if;

  v_template_version := coalesce(nullif(btrim(coalesce(p_template_version, '')), ''), v_term.template_version);
  if not exists(select 1 from public.uniform_term_template_versions where version = v_template_version and active) then
    raise exception 'Versao de template de termo invalida';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', i.id,
        'code', i.code,
        'name', i.name,
        'size', i.uniform_size,
        'quantity', a.quantity - a.returned_quantity
      )
      order by bi.created_at
    ),
    '[]'::jsonb
  )
    into v_items_summary
  from public.uniform_delivery_batch_items bi
  join public.patrimony_assignments a on a.id = bi.patrimony_assignment_id
  join public.patrimony_items i on i.id = bi.item_id
  where bi.batch_id = p_batch_id
    and bi.active
    and a.returned_at is null
    and a.quantity > a.returned_quantity;

  if v_term.status = 'assinado' then
    if p_new_batch_id is null or p_new_term_id is null then
      raise exception 'Identificadores de retificacao obrigatorios para termo assinado';
    end if;
    if exists(select 1 from public.uniform_delivery_batches where id = p_new_batch_id)
       or exists(select 1 from public.uniform_delivery_terms where id = p_new_term_id) then
      raise exception 'Identificador de retificacao ja utilizado';
    end if;

    insert into public.uniform_delivery_batches(id, person_id, delivered_by_auth_user, delivered_by_name, notes, status)
    values (p_new_batch_id, p_new_person_id, auth.uid(), v_actor, concat_ws(' · ', 'Retificacao de termo assinado', v_reason), 'aguardando_assinatura');

    insert into public.uniform_delivery_terms(id, batch_id, template_version, status)
    values (p_new_term_id, p_new_batch_id, v_template_version, 'aguardando_assinatura');

    for v_line in
      select bi.*, a.quantity - a.returned_quantity as open_quantity, a.assigned_at
        from public.uniform_delivery_batch_items bi
        join public.patrimony_assignments a on a.id = bi.patrimony_assignment_id
       where bi.batch_id = p_batch_id
         and bi.active
         and a.returned_at is null
         and a.quantity > a.returned_quantity
       order by bi.created_at
       for update of bi, a
    loop
      update public.patrimony_assignments
         set returned_quantity = quantity,
             returned_at = now(),
             last_return_condition = 'bom',
             returned_by_auth_user = auth.uid(),
             returned_by_name = v_actor,
             return_notes = concat_ws(' · ', nullif(return_notes, ''), 'Retificacao de termo assinado: ' || v_reason),
             updated_at = now()
       where id = v_line.patrimony_assignment_id;

      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, condition, actor_name, notes)
      values ('devolucao', v_line.item_id, v_line.patrimony_assignment_id, v_batch.person_id, v_line.open_quantity, 'bom', v_actor,
              concat_ws(' · ', 'Retificacao de termo assinado', v_old_person.name || ' -> ' || v_new_person.name, v_reason));

      v_new_assignment_id := gen_random_uuid();
      insert into public.patrimony_assignments(id, item_id, person_id, quantity, assigned_at, assigned_by_auth_user, assigned_by_name, notes)
      values (v_new_assignment_id, v_line.item_id, p_new_person_id, v_line.open_quantity, now(), auth.uid(), v_actor,
              concat_ws(' · ', 'Retificacao de termo assinado', 'Entrega original ' || p_batch_id::text, v_reason));

      insert into public.uniform_delivery_batch_items(batch_id, patrimony_assignment_id, item_id, quantity, observation)
      values (p_new_batch_id, v_new_assignment_id, v_line.item_id, v_line.open_quantity, v_line.observation);

      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes)
      values ('entrega', v_line.item_id, v_new_assignment_id, p_new_person_id, v_line.open_quantity, v_actor,
              concat_ws(' · ', 'Retificacao de termo assinado', v_old_person.name || ' -> ' || v_new_person.name, v_reason));

      v_total := v_total + v_line.open_quantity;
    end loop;
    if v_total <= 0 then raise exception 'Entrega nao possui uniformes pendentes para corrigir'; end if;

    insert into public.uniform_delivery_corrections(
      id, correction_type, correction_mode, source_batch_id, source_term_id, result_batch_id, result_term_id,
      source_person_id, target_person_id, quantity, reason, actor_name, before_data, after_data
    ) values (
      p_correction_id, 'pessoa', 'retificacao_termo_assinado', p_batch_id, v_term.id, p_new_batch_id, p_new_term_id,
      v_batch.person_id, p_new_person_id, v_total, v_reason, v_actor,
      jsonb_build_object('batch_id', p_batch_id, 'term_id', v_term.id, 'person_id', v_batch.person_id, 'person_name', v_old_person.name, 'term_status', v_term.status, 'items', v_items_summary),
      jsonb_build_object('batch_id', p_new_batch_id, 'term_id', p_new_term_id, 'person_id', p_new_person_id, 'person_name', v_new_person.name, 'term_status', 'aguardando_assinatura', 'items', v_items_summary)
    );

    correction_id := p_correction_id; batch_id := p_new_batch_id; term_id := p_new_term_id; created_new_batch := true; term_status := 'aguardando_assinatura';
  else
    if p_new_term_id is null then raise exception 'Identificador do novo termo obrigatorio'; end if;
    if exists(select 1 from public.uniform_delivery_terms where id = p_new_term_id) then
      raise exception 'Identificador do novo termo ja utilizado';
    end if;

    update public.uniform_delivery_terms
       set status = 'substituido',
           replaced_at = now(),
           replaced_by_name = v_actor,
           replacement_reason = v_reason,
           updated_at = now()
     where id = v_term.id;

    insert into public.uniform_delivery_terms(id, batch_id, template_version, status)
    values (p_new_term_id, p_batch_id, v_template_version, 'aguardando_assinatura');

    update public.uniform_delivery_terms
       set replaced_by_term_id = p_new_term_id,
           updated_at = now()
     where id = v_term.id;

    update public.uniform_delivery_batches
       set person_id = p_new_person_id,
           notes = concat_ws(' · ', nullif(notes, ''), 'Correcao de pessoa: ' || coalesce(v_old_person.name, v_batch.person_id::text) || ' -> ' || v_new_person.name || '. ' || v_reason),
           status = 'aguardando_assinatura',
           updated_at = now()
     where id = p_batch_id;

    for v_line in
      select bi.*, a.quantity - a.returned_quantity as open_quantity
        from public.uniform_delivery_batch_items bi
        join public.patrimony_assignments a on a.id = bi.patrimony_assignment_id
       where bi.batch_id = p_batch_id
         and bi.active
         and a.returned_at is null
         and a.quantity > a.returned_quantity
       order by bi.created_at
       for update of bi, a
    loop
      update public.patrimony_assignments
         set person_id = p_new_person_id,
             notes = concat_ws(' · ', nullif(notes, ''), 'Correcao administrativa de pessoa: ' || coalesce(v_old_person.name, v_batch.person_id::text) || ' -> ' || v_new_person.name || '. ' || v_reason),
             updated_at = now()
       where id = v_line.patrimony_assignment_id;

      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes)
      values ('transferencia', v_line.item_id, v_line.patrimony_assignment_id, p_new_person_id, v_line.open_quantity, v_actor,
              concat_ws(' · ', 'Correcao administrativa de pessoa', coalesce(v_old_person.name, v_batch.person_id::text) || ' -> ' || v_new_person.name, v_reason));

      v_total := v_total + v_line.open_quantity;
    end loop;
    if v_total <= 0 then raise exception 'Entrega nao possui uniformes pendentes para corrigir'; end if;

    insert into public.uniform_delivery_corrections(
      id, correction_type, correction_mode, source_batch_id, source_term_id, result_batch_id, result_term_id,
      source_person_id, target_person_id, quantity, reason, actor_name, before_data, after_data
    ) values (
      p_correction_id, 'pessoa', 'correcao_administrativa', p_batch_id, v_term.id, p_batch_id, p_new_term_id,
      v_batch.person_id, p_new_person_id, v_total, v_reason, v_actor,
      jsonb_build_object('batch_id', p_batch_id, 'term_id', v_term.id, 'person_id', v_batch.person_id, 'person_name', v_old_person.name, 'term_status', v_term.status, 'items', v_items_summary),
      jsonb_build_object('batch_id', p_batch_id, 'term_id', p_new_term_id, 'person_id', p_new_person_id, 'person_name', v_new_person.name, 'term_status', 'aguardando_assinatura', 'items', v_items_summary)
    );

    correction_id := p_correction_id; batch_id := p_batch_id; term_id := p_new_term_id; created_new_batch := false; term_status := 'aguardando_assinatura';
  end if;

  insert into public.patrimony_audit_log(action, person_id, actor_name, reason, change_summary, before_data, after_data)
  values (
    'uniform_delivery_correction',
    p_new_person_id,
    v_actor,
    v_reason,
    'Correcao de pessoa em entrega de uniformes',
    jsonb_build_object('batch_id', p_batch_id, 'term_id', v_term.id, 'person_id', v_batch.person_id, 'person_name', v_old_person.name, 'items', v_items_summary),
    jsonb_build_object('batch_id', batch_id, 'term_id', term_id, 'person_id', p_new_person_id, 'person_name', v_new_person.name, 'quantity', v_total, 'items', v_items_summary)
  );

  return next;
end;
$$;

create or replace function public.correct_uniform_delivery_size(
  p_correction_id uuid,
  p_batch_item_id uuid,
  p_target_item_id uuid,
  p_quantity numeric,
  p_mode text,
  p_reason text,
  p_actor_name text default 'Admin Tezzei',
  p_new_batch_id uuid default null,
  p_new_term_id uuid default null,
  p_template_version text default null
)
returns table(correction_id uuid, batch_id uuid, term_id uuid, created_new_batch boolean, term_status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.uniform_delivery_corrections%rowtype;
  v_batch_item public.uniform_delivery_batch_items%rowtype;
  v_assignment public.patrimony_assignments%rowtype;
  v_batch public.uniform_delivery_batches%rowtype;
  v_term public.uniform_delivery_terms%rowtype;
  v_old_item public.patrimony_items%rowtype;
  v_target_item public.patrimony_items%rowtype;
  v_person public.organization_people%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_mode text := btrim(coalesce(p_mode, ''));
  v_template_version text;
  v_open_quantity numeric;
  v_new_assignment_id uuid;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para corrigir tamanho de uniforme'; end if;
  if p_correction_id is null then raise exception 'Identificador da correcao obrigatorio'; end if;
  if p_batch_item_id is null then raise exception 'Peca entregue obrigatoria'; end if;
  if p_target_item_id is null then raise exception 'Tamanho correto obrigatorio'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade invalida'; end if;
  if v_mode not in ('correcao_administrativa','troca_fisica') then raise exception 'Modo de correcao invalido'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da correcao'; end if;

  select * into v_existing from public.uniform_delivery_corrections where id = p_correction_id;
  if found then
    correction_id := v_existing.id;
    batch_id := coalesce(v_existing.result_batch_id, v_existing.source_batch_id);
    term_id := v_existing.result_term_id;
    created_new_batch := v_existing.result_batch_id is distinct from v_existing.source_batch_id;
    select status into term_status from public.uniform_delivery_terms where id = v_existing.result_term_id;
    term_status := coalesce(term_status, 'aguardando_assinatura');
    return next;
    return;
  end if;

  select * into v_batch_item
    from public.uniform_delivery_batch_items
   where id = p_batch_item_id
   for update;
  if not found or not v_batch_item.active then raise exception 'Peca da entrega nao encontrada ou ja corrigida'; end if;

  select * into v_assignment
    from public.patrimony_assignments
   where id = v_batch_item.patrimony_assignment_id
   for update;
  if not found then raise exception 'Vinculo patrimonial nao encontrado'; end if;

  select * into v_batch
    from public.uniform_delivery_batches
   where id = v_batch_item.batch_id
   for update;
  if not found then raise exception 'Entrega nao encontrada'; end if;

  select udt.* into v_term
    from public.uniform_delivery_terms udt
   where udt.batch_id = v_batch.id
     and udt.status <> 'substituido'
   order by udt.generated_at desc
   limit 1
   for update;
  if not found then raise exception 'Termo vigente nao encontrado'; end if;

  if v_term.status = 'assinado' and v_mode = 'correcao_administrativa' then
    raise exception 'Termo assinado exige retificacao explicita com devolucao e nova entrega';
  end if;

  select * into v_old_item from public.patrimony_items where id = v_batch_item.item_id for update;
  select * into v_target_item from public.patrimony_items where id = p_target_item_id for update;
  if not found or not v_target_item.active or lower(v_target_item.category) <> 'uniforme' or v_target_item.tracking_mode <> 'quantidade' then
    raise exception 'Tamanho correto nao encontrado ou inativo';
  end if;
  if v_target_item.id = v_old_item.id then raise exception 'Selecione um tamanho diferente do tamanho atual'; end if;
  if p_quantity > v_batch_item.quantity then raise exception 'Quantidade maior que a quantidade do item no termo'; end if;
  v_open_quantity := v_assignment.quantity - v_assignment.returned_quantity;
  if p_quantity > v_open_quantity then raise exception 'Quantidade maior que a quantidade pendente'; end if;
  if p_quantity > v_target_item.available_quantity then
    raise exception 'Estoque insuficiente para %. Disponivel: %', v_target_item.code, v_target_item.available_quantity;
  end if;

  select * into v_person from public.organization_people where id = v_assignment.person_id;
  v_template_version := coalesce(nullif(btrim(coalesce(p_template_version, '')), ''), v_term.template_version);
  if not exists(select 1 from public.uniform_term_template_versions where version = v_template_version and active) then
    raise exception 'Versao de template de termo invalida';
  end if;

  if v_term.status = 'assinado' then
    if p_new_batch_id is null or p_new_term_id is null then
      raise exception 'Identificadores de retificacao obrigatorios para termo assinado';
    end if;
    if exists(select 1 from public.uniform_delivery_batches where id = p_new_batch_id)
       or exists(select 1 from public.uniform_delivery_terms where id = p_new_term_id) then
      raise exception 'Identificador de retificacao ja utilizado';
    end if;

    update public.patrimony_assignments
       set returned_quantity = returned_quantity + p_quantity,
           returned_at = case when returned_quantity + p_quantity = quantity then now() else null end,
           last_return_condition = 'bom',
           returned_by_auth_user = auth.uid(),
           returned_by_name = v_actor,
           return_notes = concat_ws(' · ', nullif(return_notes, ''), 'Retificacao de termo assinado: ' || v_reason),
           updated_at = now()
     where id = v_assignment.id;

    update public.patrimony_items set available_quantity = available_quantity + p_quantity, updated_at = now() where id = v_old_item.id;
    perform public.recalculate_uniform_item_status(v_old_item.id);
    update public.patrimony_items set available_quantity = available_quantity - p_quantity, updated_at = now() where id = v_target_item.id;

    insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, condition, actor_name, notes)
    values ('devolucao', v_old_item.id, v_assignment.id, v_assignment.person_id, p_quantity, 'bom', v_actor,
            concat_ws(' · ', 'Retificacao de tamanho em termo assinado', v_old_item.code || ' -> ' || v_target_item.code, v_reason));

    insert into public.uniform_delivery_batches(id, person_id, delivered_by_auth_user, delivered_by_name, notes, status)
    values (p_new_batch_id, v_assignment.person_id, auth.uid(), v_actor, concat_ws(' · ', 'Retificacao de tamanho em termo assinado', v_reason), 'aguardando_assinatura');

    insert into public.uniform_delivery_terms(id, batch_id, template_version, status)
    values (p_new_term_id, p_new_batch_id, v_template_version, 'aguardando_assinatura');

    v_new_assignment_id := gen_random_uuid();
    insert into public.patrimony_assignments(id, item_id, person_id, quantity, assigned_by_auth_user, assigned_by_name, notes)
    values (v_new_assignment_id, v_target_item.id, v_assignment.person_id, p_quantity, auth.uid(), v_actor,
            concat_ws(' · ', 'Retificacao de tamanho em termo assinado', v_old_item.code || ' -> ' || v_target_item.code, v_reason));

    insert into public.uniform_delivery_batch_items(batch_id, patrimony_assignment_id, item_id, quantity, observation)
    values (p_new_batch_id, v_new_assignment_id, v_target_item.id, p_quantity, concat_ws(' · ', 'Tamanho corrigido', v_reason));

    insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes)
    values ('entrega', v_target_item.id, v_new_assignment_id, v_assignment.person_id, p_quantity, v_actor,
            concat_ws(' · ', 'Retificacao de tamanho em termo assinado', v_old_item.code || ' -> ' || v_target_item.code, v_reason));
    perform public.recalculate_uniform_item_status(v_target_item.id);

    insert into public.uniform_delivery_corrections(
      id, correction_type, correction_mode, source_batch_id, source_term_id, result_batch_id, result_term_id,
      source_person_id, target_person_id, source_assignment_id, source_batch_item_id, source_item_id, target_item_id,
      quantity, reason, actor_name, before_data, after_data
    ) values (
      p_correction_id, 'tamanho', 'retificacao_termo_assinado', v_batch.id, v_term.id, p_new_batch_id, p_new_term_id,
      v_assignment.person_id, v_assignment.person_id, v_assignment.id, v_batch_item.id, v_old_item.id, v_target_item.id,
      p_quantity, v_reason, v_actor,
      jsonb_build_object('batch_id', v_batch.id, 'term_id', v_term.id, 'person_id', v_assignment.person_id, 'item_id', v_old_item.id, 'code', v_old_item.code, 'name', v_old_item.name, 'size', v_old_item.uniform_size, 'quantity', p_quantity, 'term_status', v_term.status),
      jsonb_build_object('batch_id', p_new_batch_id, 'term_id', p_new_term_id, 'person_id', v_assignment.person_id, 'item_id', v_target_item.id, 'code', v_target_item.code, 'name', v_target_item.name, 'size', v_target_item.uniform_size, 'quantity', p_quantity, 'term_status', 'aguardando_assinatura', 'mode', 'retificacao_termo_assinado')
    );

    correction_id := p_correction_id; batch_id := p_new_batch_id; term_id := p_new_term_id; created_new_batch := true; term_status := 'aguardando_assinatura';
  else
    if p_new_term_id is null then raise exception 'Identificador do novo termo obrigatorio'; end if;
    if exists(select 1 from public.uniform_delivery_terms where id = p_new_term_id) then
      raise exception 'Identificador do novo termo ja utilizado';
    end if;

    update public.uniform_delivery_terms
       set status = 'substituido',
           replaced_at = now(),
           replaced_by_name = v_actor,
           replacement_reason = v_reason,
           updated_at = now()
     where id = v_term.id;

    insert into public.uniform_delivery_terms(id, batch_id, template_version, status)
    values (p_new_term_id, v_batch.id, v_template_version, 'aguardando_assinatura');

    update public.uniform_delivery_terms
       set replaced_by_term_id = p_new_term_id,
           updated_at = now()
     where id = v_term.id;

    update public.patrimony_items set available_quantity = available_quantity + p_quantity, updated_at = now() where id = v_old_item.id;
    update public.patrimony_items set available_quantity = available_quantity - p_quantity, updated_at = now() where id = v_target_item.id;

    if v_mode = 'correcao_administrativa' then
      if v_assignment.returned_quantity > 0 then raise exception 'Correcao administrativa exige entrega sem devolucao parcial anterior'; end if;

      if p_quantity = v_assignment.quantity and p_quantity = v_batch_item.quantity then
        update public.patrimony_assignments
           set item_id = v_target_item.id,
               notes = concat_ws(' · ', nullif(notes, ''), 'Correcao administrativa de tamanho: ' || v_old_item.code || ' -> ' || v_target_item.code || '. ' || v_reason),
               updated_at = now()
         where id = v_assignment.id;
        update public.uniform_delivery_batch_items
           set item_id = v_target_item.id,
               observation = concat_ws(' · ', nullif(observation, ''), 'Tamanho corrigido administrativamente. ' || v_reason),
               corrected_at = now(),
               corrected_by_name = v_actor,
               correction_reason = v_reason
         where id = v_batch_item.id;
        v_new_assignment_id := v_assignment.id;
      else
        if p_quantity >= v_assignment.quantity then raise exception 'Quantidade invalida para correcao parcial'; end if;
        update public.patrimony_assignments
           set quantity = quantity - p_quantity,
               notes = concat_ws(' · ', nullif(notes, ''), 'Correcao administrativa parcial de tamanho. ' || v_reason),
               updated_at = now()
         where id = v_assignment.id;
        update public.uniform_delivery_batch_items
           set quantity = quantity - p_quantity,
               corrected_at = now(),
               corrected_by_name = v_actor,
               correction_reason = v_reason
         where id = v_batch_item.id;

        v_new_assignment_id := gen_random_uuid();
        insert into public.patrimony_assignments(id, item_id, person_id, quantity, assigned_at, assigned_by_auth_user, assigned_by_name, notes)
        values (v_new_assignment_id, v_target_item.id, v_assignment.person_id, p_quantity, v_assignment.assigned_at, auth.uid(), v_actor,
                concat_ws(' · ', 'Correcao administrativa de tamanho', v_old_item.code || ' -> ' || v_target_item.code, v_reason));
        insert into public.uniform_delivery_batch_items(batch_id, patrimony_assignment_id, item_id, quantity, observation)
        values (v_batch.id, v_new_assignment_id, v_target_item.id, p_quantity, concat_ws(' · ', 'Tamanho corrigido administrativamente', v_reason));
      end if;

      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes)
      values ('ajuste', v_old_item.id, v_assignment.id, v_assignment.person_id, p_quantity, v_actor,
              concat_ws(' · ', 'Correcao administrativa de tamanho - devolve saldo ao tamanho lancado errado', v_old_item.code || ' -> ' || v_target_item.code, v_reason));
      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes)
      values ('ajuste', v_target_item.id, v_new_assignment_id, v_assignment.person_id, p_quantity, v_actor,
              concat_ws(' · ', 'Correcao administrativa de tamanho - baixa saldo do tamanho correto', v_old_item.code || ' -> ' || v_target_item.code, v_reason));
    else
      update public.patrimony_assignments
         set returned_quantity = returned_quantity + p_quantity,
             returned_at = case when returned_quantity + p_quantity = quantity then now() else null end,
             last_return_condition = 'bom',
             returned_by_auth_user = auth.uid(),
             returned_by_name = v_actor,
             return_notes = concat_ws(' · ', nullif(return_notes, ''), 'Troca fisica de tamanho: ' || v_reason),
             updated_at = now()
       where id = v_assignment.id;

      if p_quantity = v_batch_item.quantity then
        update public.uniform_delivery_batch_items
           set active = false,
               corrected_at = now(),
               corrected_by_name = v_actor,
               correction_reason = v_reason
         where id = v_batch_item.id;
      else
        update public.uniform_delivery_batch_items
           set quantity = quantity - p_quantity,
               corrected_at = now(),
               corrected_by_name = v_actor,
               correction_reason = v_reason
         where id = v_batch_item.id;
      end if;

      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, condition, actor_name, notes)
      values ('devolucao', v_old_item.id, v_assignment.id, v_assignment.person_id, p_quantity, 'bom', v_actor,
              concat_ws(' · ', 'Troca fisica de tamanho', v_old_item.code || ' -> ' || v_target_item.code, v_reason));

      v_new_assignment_id := gen_random_uuid();
      insert into public.patrimony_assignments(id, item_id, person_id, quantity, assigned_by_auth_user, assigned_by_name, notes)
      values (v_new_assignment_id, v_target_item.id, v_assignment.person_id, p_quantity, auth.uid(), v_actor,
              concat_ws(' · ', 'Troca fisica de tamanho', v_old_item.code || ' -> ' || v_target_item.code, v_reason));
      insert into public.uniform_delivery_batch_items(batch_id, patrimony_assignment_id, item_id, quantity, observation)
      values (v_batch.id, v_new_assignment_id, v_target_item.id, p_quantity, concat_ws(' · ', 'Tamanho trocado fisicamente', v_reason));
      insert into public.patrimony_movements(movement_type, item_id, assignment_id, person_id, quantity, actor_name, notes)
      values ('entrega', v_target_item.id, v_new_assignment_id, v_assignment.person_id, p_quantity, v_actor,
              concat_ws(' · ', 'Troca fisica de tamanho', v_old_item.code || ' -> ' || v_target_item.code, v_reason));
    end if;

    insert into public.uniform_delivery_corrections(
      id, correction_type, correction_mode, source_batch_id, source_term_id, result_batch_id, result_term_id,
      source_person_id, target_person_id, source_assignment_id, source_batch_item_id, source_item_id, target_item_id,
      quantity, reason, actor_name, before_data, after_data
    ) values (
      p_correction_id, 'tamanho', v_mode, v_batch.id, v_term.id, v_batch.id, p_new_term_id,
      v_assignment.person_id, v_assignment.person_id, v_assignment.id, v_batch_item.id, v_old_item.id, v_target_item.id,
      p_quantity, v_reason, v_actor,
      jsonb_build_object('batch_id', v_batch.id, 'term_id', v_term.id, 'person_id', v_assignment.person_id, 'item_id', v_old_item.id, 'code', v_old_item.code, 'name', v_old_item.name, 'size', v_old_item.uniform_size, 'quantity', p_quantity, 'term_status', v_term.status),
      jsonb_build_object('batch_id', v_batch.id, 'term_id', p_new_term_id, 'person_id', v_assignment.person_id, 'item_id', v_target_item.id, 'code', v_target_item.code, 'name', v_target_item.name, 'size', v_target_item.uniform_size, 'quantity', p_quantity, 'term_status', 'aguardando_assinatura', 'mode', v_mode)
    );

    correction_id := p_correction_id; batch_id := v_batch.id; term_id := p_new_term_id; created_new_batch := false; term_status := 'aguardando_assinatura';
    perform public.recalculate_uniform_item_status(v_old_item.id);
    perform public.recalculate_uniform_item_status(v_target_item.id);
  end if;

  insert into public.patrimony_audit_log(action, person_id, item_id, assignment_id, actor_name, reason, change_summary, before_data, after_data)
  values (
    'uniform_delivery_correction',
    v_assignment.person_id,
    v_old_item.id,
    v_assignment.id,
    v_actor,
    v_reason,
    'Correcao de tamanho em entrega de uniformes',
    jsonb_build_object('batch_id', v_batch.id, 'term_id', v_term.id, 'item_id', v_old_item.id, 'code', v_old_item.code, 'size', v_old_item.uniform_size, 'quantity', p_quantity),
    jsonb_build_object('batch_id', batch_id, 'term_id', term_id, 'item_id', v_target_item.id, 'code', v_target_item.code, 'size', v_target_item.uniform_size, 'mode', v_mode)
  );

  return next;
end;
$$;

revoke all on function public.correct_uniform_delivery_person(uuid,uuid,uuid,text,text,uuid,uuid,text) from public, anon;
revoke all on function public.correct_uniform_delivery_size(uuid,uuid,uuid,numeric,text,text,text,uuid,uuid,text) from public, anon;
grant execute on function public.correct_uniform_delivery_person(uuid,uuid,uuid,text,text,uuid,uuid,text) to authenticated;
grant execute on function public.correct_uniform_delivery_size(uuid,uuid,uuid,numeric,text,text,text,uuid,uuid,text) to authenticated;

create or replace function public.mark_uniform_term_printed(
  p_term_id uuid,
  p_actor_name text default 'Admin Tezzei'
)
returns table(term_id uuid, printed_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_term public.uniform_delivery_terms%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para registrar impressao do termo'; end if;
  if p_term_id is null then raise exception 'Termo obrigatorio'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;
  select * into v_term
  from public.uniform_delivery_terms
  where id = p_term_id
  for update;
  if not found then raise exception 'Termo nao encontrado'; end if;
  if v_term.status = 'substituido' then raise exception 'Termo substituido nao pode ser impresso'; end if;

  update public.uniform_delivery_terms
     set printed_at = coalesce(public.uniform_delivery_terms.printed_at, now()),
         updated_at = now()
   where id = p_term_id
   returning public.uniform_delivery_terms.id,
             public.uniform_delivery_terms.printed_at
        into term_id, printed_at;

  insert into public.patrimony_audit_log(action,actor_name,reason,change_summary,after_data)
  values (
    'uniform_term_print',
    v_actor,
    'Impressao do termo',
    'Termo de entrega de uniformes marcado como impresso',
    jsonb_build_object('term_id', p_term_id)
  );

  return next;
end;
$$;

create or replace function public.record_uniform_signed_term_attachment(
  p_attachment_id uuid,
  p_term_id uuid,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_actor_name text default 'Admin Tezzei',
  p_notes text default null
)
returns table(attachment_id uuid, term_status text, version integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_term public.uniform_delivery_terms%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_file_name text := btrim(coalesce(p_file_name, ''));
  v_content_type text := btrim(coalesce(p_content_type, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_version integer;
begin
  if not public.is_hub_admin() then raise exception 'Sem permissao para registrar termo assinado'; end if;
  if p_attachment_id is null then raise exception 'Identificador do anexo obrigatorio'; end if;
  if p_term_id is null then raise exception 'Termo obrigatorio'; end if;
  if v_path = '' then raise exception 'Caminho do arquivo obrigatorio'; end if;
  if v_file_name = '' then raise exception 'Nome do arquivo obrigatorio'; end if;
  if v_content_type not in ('image/jpeg','image/png','image/webp','application/pdf') then
    raise exception 'Tipo de arquivo nao permitido';
  end if;
  if v_path !~ '^uniforms/[0-9a-fA-F-]+/[0-9a-fA-F-]+/[^/]+$' then
    raise exception 'Caminho do arquivo assinado invalido';
  end if;
  if p_file_size is null or p_file_size <= 0 then raise exception 'Tamanho do arquivo invalido'; end if;
  if v_actor = '' then raise exception 'Responsavel invalido'; end if;

  if exists(select 1 from public.uniform_term_attachments where id = p_attachment_id) then
    select a.id, t.status, a.version
      into attachment_id, term_status, version
    from public.uniform_term_attachments a
    join public.uniform_delivery_terms t on t.id = a.term_id
    where a.id = p_attachment_id;
    return next;
    return;
  end if;

  select * into v_term
  from public.uniform_delivery_terms
  where id = p_term_id
  for update;
  if not found then raise exception 'Termo nao encontrado'; end if;
  if v_term.status = 'substituido' then raise exception 'Termo substituido nao pode receber assinatura'; end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'uniform-signed-terms'
      and name = v_path
  ) then
    raise exception 'Arquivo assinado nao encontrado no Storage';
  end if;

  select coalesce(max(a.version),0) + 1
    into v_version
  from public.uniform_term_attachments a
  where a.term_id = p_term_id;

  update public.uniform_term_attachments
     set active = false
   where term_id = p_term_id
     and active;

  insert into public.uniform_term_attachments(
    id,
    term_id,
    storage_path,
    file_name,
    content_type,
    file_size,
    version,
    active,
    uploaded_by,
    uploaded_by_name,
    notes
  ) values (
    p_attachment_id,
    p_term_id,
    v_path,
    v_file_name,
    v_content_type,
    p_file_size,
    v_version,
    true,
    auth.uid(),
    v_actor,
    v_notes
  );

  update public.uniform_delivery_terms
     set status = 'assinado',
         signed_document_path = v_path,
         signed_uploaded_at = now(),
         signed_uploaded_by = auth.uid(),
         signed_uploaded_by_name = v_actor,
         updated_at = now()
   where id = p_term_id;

  update public.uniform_delivery_batches b
     set status = 'assinado',
         updated_at = now()
    from public.uniform_delivery_terms t
   where t.id = p_term_id
     and b.id = t.batch_id;

  insert into public.patrimony_audit_log(
    action,
    actor_name,
    reason,
    change_summary,
    after_data
  ) values (
    'uniform_term_attachment',
    v_actor,
    coalesce(v_notes, 'Registro de termo assinado'),
    'Termo assinado de uniformes registrado ou substituido',
    jsonb_build_object('term_id', p_term_id, 'storage_path', v_path, 'version', v_version)
  );

  attachment_id := p_attachment_id;
  term_status := 'assinado';
  version := v_version;
  return next;
end;
$$;

revoke all on function public.mark_uniform_term_printed(uuid,text) from public, anon;
revoke all on function public.record_uniform_signed_term_attachment(uuid,uuid,text,text,text,bigint,text,text) from public, anon;
grant execute on function public.mark_uniform_term_printed(uuid,text) to authenticated;
grant execute on function public.record_uniform_signed_term_attachment(uuid,uuid,text,text,text,bigint,text,text) to authenticated;
