alter table public.organization_people
  add column if not exists notebook_offsite_use boolean not null default false;

comment on column public.organization_people.notebook_offsite_use is
  'Indica se a pessoa utiliza o notebook corporativo fora do prédio da empresa.';

create or replace function public.update_person_notebook_offsite_with_audit(
  p_person_id uuid,
  p_offsite_use boolean,
  p_actor_name text default 'Admin Tezzei',
  p_reason text default null
)
returns table(person_id uuid, audit_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_person public.organization_people%rowtype;
  v_actor text := btrim(coalesce(p_actor_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_before boolean;
  v_after boolean := coalesce(p_offsite_use, false);
  v_summary text;
  v_audit_id uuid;
  v_assignment_id uuid;
  v_item_id uuid;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissao para editar o inventario';
  end if;
  if p_person_id is null then raise exception 'Pessoa obrigatoria'; end if;
  if v_actor = '' then raise exception 'Responsavel pela alteracao invalido'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da alteracao'; end if;

  select * into v_person
    from public.organization_people
   where id = p_person_id
     and active
   for update;

  if not found then raise exception 'Pessoa nao encontrada ou inativa'; end if;

  v_before := coalesce(v_person.notebook_offsite_use, false);
  if v_before is not distinct from v_after then
    raise exception 'Nenhuma alteracao foi identificada';
  end if;

  select a.id, a.item_id
    into v_assignment_id, v_item_id
    from public.patrimony_assignments a
   where a.person_id = v_person.id
     and a.quantity > a.returned_quantity
   order by a.assigned_at desc
   limit 1;

  update public.organization_people
     set notebook_offsite_use = v_after,
         updated_at = now()
   where id = v_person.id;

  v_summary := format(
    'Uso do notebook fora do predio: %s -> %s',
    case when v_before then 'Sim' else 'Nao' end,
    case when v_after then 'Sim' else 'Nao' end
  );

  insert into public.patrimony_audit_log(
    action,
    person_id,
    item_id,
    assignment_id,
    actor_name,
    reason,
    change_summary,
    before_data,
    after_data
  ) values (
    'person_notebook_update',
    v_person.id,
    v_item_id,
    v_assignment_id,
    v_actor,
    v_reason,
    v_summary,
    jsonb_build_object('person_id', v_person.id, 'notebook_offsite_use', v_before),
    jsonb_build_object('person_id', v_person.id, 'notebook_offsite_use', v_after)
  ) returning id into v_audit_id;

  person_id := v_person.id;
  audit_id := v_audit_id;
  return next;
end;
$$;

revoke all on function public.update_person_notebook_offsite_with_audit(uuid,boolean,text,text) from public, anon;
grant execute on function public.update_person_notebook_offsite_with_audit(uuid,boolean,text,text) to authenticated;

update public.organization_people
   set department = 'iHome Seguros',
       team_name = 'Equipe iHome Seguros',
       updated_at = now()
 where name in ('Anderson Caram', 'Jessica Simões', 'Cleonice Jesus');