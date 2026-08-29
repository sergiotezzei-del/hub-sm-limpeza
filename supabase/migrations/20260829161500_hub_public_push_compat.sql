begin;

create or replace function public.auditorio_public_prepare_push_by_access(
  p_protocolo bigint,
  p_codigo_consulta text
)
returns table (
  claim_token text,
  pair_code text,
  source_type text,
  source_reference text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva public.auditorio_reservas%rowtype;
  v_hash text;
begin
  if p_protocolo is null or p_protocolo <= 0 then
    raise exception 'AUDITORIO_PROTOCOLO_INVALIDO';
  end if;
  if char_length(private.auditorio_normalize_access_code(p_codigo_consulta)) < 6 then
    raise exception 'AUDITORIO_CODIGO_CONSULTA_INVALIDO';
  end if;

  v_hash := private.auditorio_hash_access_code(p_codigo_consulta);
  select * into v_reserva
  from public.auditorio_reservas r
  where r.protocolo = p_protocolo
    and r.public_access_code_hash = v_hash
  limit 1;

  if not found then
    raise exception 'AUDITORIO_SOLICITACAO_NAO_ENCONTRADA';
  end if;

  return query
  select * from private.hub_public_push_create_claim('auditorio', v_reserva.id, v_reserva.protocolo::text);
end;
$$;

revoke execute on function public.auditorio_public_prepare_push_by_access(bigint, text) from public, anon, authenticated;
grant execute on function public.auditorio_public_prepare_push_by_access(bigint, text) to anon, authenticated;

create or replace function private.hub_sync_marketing_push_to_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text;
begin
  select r.request_number::text into v_reference
  from public.marketing_requests r
  where r.id = new.request_id;

  if v_reference is null then return new; end if;

  perform public.hub_public_push_register_direct_server(
    'marketing',
    new.request_id,
    v_reference,
    new.endpoint,
    new.p256dh,
    new.auth,
    new.user_agent
  );

  if new.active is false then
    update private.hub_public_push_devices d
    set active = case
      when exists (
        select 1
        from private.hub_public_push_links l
        join private.marketing_push_subscriptions s
          on s.request_id = l.source_id
         and s.endpoint_hash = d.endpoint_hash
        where l.device_id = d.id
          and l.source_type = 'marketing'
          and s.active = true
      ) then d.active
      else d.active
    end,
    updated_at = clock_timestamp()
    where d.endpoint_hash = new.endpoint_hash;
  end if;

  return new;
end;
$$;

revoke execute on function private.hub_sync_marketing_push_to_public() from public, anon, authenticated;

drop trigger if exists trg_hub_sync_marketing_push_to_public on private.marketing_push_subscriptions;
create trigger trg_hub_sync_marketing_push_to_public
after insert or update of endpoint, p256dh, auth, user_agent, active
on private.marketing_push_subscriptions
for each row execute function private.hub_sync_marketing_push_to_public();

notify pgrst, 'reload schema';
commit;
