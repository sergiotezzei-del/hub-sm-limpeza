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

revoke all on function public.mark_uniform_term_printed(uuid,text) from public, anon;
grant execute on function public.mark_uniform_term_printed(uuid,text) to authenticated;
