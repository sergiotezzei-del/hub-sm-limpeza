begin;

create or replace function private.hub_public_push_create_claim(
  p_source_type text,
  p_source_id uuid,
  p_source_reference text
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
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_reference text := trim(coalesce(p_source_reference, ''));
  v_token text;
  v_pair text;
  v_expires timestamptz := clock_timestamp() + interval '90 days';
begin
  if p_source_id is null or length(v_source_type) < 2 or length(v_reference) < 1 then
    raise exception 'HUB_PUBLIC_PUSH_SOURCE_INVALID';
  end if;

  delete from private.hub_public_push_claims c
  where c.expires_at <= clock_timestamp();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_pair := upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 12));

  insert into private.hub_public_push_claims (
    source_type, source_id, source_reference, token_hash, pair_code_hash, expires_at
  ) values (
    v_source_type,
    p_source_id,
    left(v_reference, 120),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_pair, 'sha256'), 'hex'),
    v_expires
  );

  return query select v_token, v_pair, v_source_type, left(v_reference, 120), v_expires;
end;
$$;

revoke execute on function private.hub_public_push_create_claim(text, uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
