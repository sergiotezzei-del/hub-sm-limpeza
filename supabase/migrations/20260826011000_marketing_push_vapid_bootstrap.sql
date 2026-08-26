create or replace function public.marketing_push_store_vapid_keys_server(
  p_public_key text,
  p_private_key text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if coalesce(length(p_public_key), 0) < 40 or coalesce(length(p_public_key), 0) > 500 then
    raise exception 'MARKETING_PUSH_VAPID_PUBLIC_INVALID';
  end if;
  if coalesce(length(p_private_key), 0) < 20 or coalesce(length(p_private_key), 0) > 500 then
    raise exception 'MARKETING_PUSH_VAPID_PRIVATE_INVALID';
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'marketing_push_vapid_public_key') then
    perform vault.create_secret(p_public_key, 'marketing_push_vapid_public_key', 'Chave pública VAPID do Web Push do Marketing');
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'marketing_push_vapid_private_key') then
    perform vault.create_secret(p_private_key, 'marketing_push_vapid_private_key', 'Chave privada VAPID do Web Push do Marketing');
  end if;
end;
$$;

revoke all on function public.marketing_push_store_vapid_keys_server(text, text) from public;
grant execute on function public.marketing_push_store_vapid_keys_server(text, text) to service_role;
