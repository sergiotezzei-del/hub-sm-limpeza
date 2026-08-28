create schema if not exists private;

create table if not exists private.hub_email_inbox_state (
  id smallint primary key default 1 check (id = 1),
  email_address text,
  password_secret_id uuid,
  imap_host text not null default 'email-ssl.com.br',
  imap_port integer not null default 993 check (imap_port between 1 and 65535),
  last_uidnext bigint,
  last_uidvalidity bigint,
  pending_new_count integer not null default 0 check (pending_new_count >= 0),
  last_checked_at timestamptz,
  last_new_mail_at timestamptz,
  last_error text,
  acknowledged_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

insert into private.hub_email_inbox_state (id)
values (1)
on conflict (id) do nothing;

revoke all on table private.hub_email_inbox_state from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'hub_email_inbox_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'hub_email_inbox_cron_secret',
      'Autorizacao interna para consultar a caixa de entrada Locaweb do HUB'
    );
  end if;
end;
$$;

create or replace function private.hub_email_inbox_server_secret_valid(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(length(p_secret), 0) >= 40
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name = 'hub_email_inbox_cron_secret'
        and s.decrypted_secret = p_secret
    );
$$;

revoke execute on function private.hub_email_inbox_server_secret_valid(text) from public, anon, authenticated;

create or replace function public.hub_email_inbox_server_credentials(p_secret text)
returns table (
  email_address text,
  mailbox_password text,
  imap_host text,
  imap_port integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.hub_email_inbox_server_secret_valid(p_secret) then
    raise exception 'HUB_EMAIL_SERVER_SECRET_INVALID';
  end if;

  return query
  select
    st.email_address,
    v.decrypted_secret,
    st.imap_host,
    st.imap_port
  from private.hub_email_inbox_state st
  left join vault.decrypted_secrets v on v.id = st.password_secret_id
  where st.id = 1
    and nullif(trim(st.email_address), '') is not null
    and v.decrypted_secret is not null;
end;
$$;

revoke execute on function public.hub_email_inbox_server_credentials(text) from public, authenticated;
grant execute on function public.hub_email_inbox_server_credentials(text) to anon;

create or replace function public.hub_email_inbox_server_record_check(
  p_secret text,
  p_uidnext bigint,
  p_uidvalidity bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.hub_email_inbox_state%rowtype;
  v_delta bigint := 0;
begin
  if not private.hub_email_inbox_server_secret_valid(p_secret) then
    raise exception 'HUB_EMAIL_SERVER_SECRET_INVALID';
  end if;
  if p_uidnext is null or p_uidnext < 1 or p_uidvalidity is null or p_uidvalidity < 1 then
    raise exception 'HUB_EMAIL_IMAP_STATUS_INVALID';
  end if;

  select * into v_state
  from private.hub_email_inbox_state
  where id = 1
  for update;

  if v_state.last_uidnext is null
     or v_state.last_uidvalidity is null
     or v_state.last_uidvalidity <> p_uidvalidity
     or p_uidnext < v_state.last_uidnext then
    update private.hub_email_inbox_state
    set last_uidnext = p_uidnext,
        last_uidvalidity = p_uidvalidity,
        pending_new_count = 0,
        last_checked_at = clock_timestamp(),
        last_error = null,
        updated_at = clock_timestamp()
    where id = 1;
    return;
  end if;

  v_delta := greatest(p_uidnext - v_state.last_uidnext, 0);

  update private.hub_email_inbox_state
  set last_uidnext = p_uidnext,
      last_uidvalidity = p_uidvalidity,
      pending_new_count = pending_new_count + least(v_delta, 1000)::integer,
      last_new_mail_at = case when v_delta > 0 then clock_timestamp() else last_new_mail_at end,
      last_checked_at = clock_timestamp(),
      last_error = null,
      updated_at = clock_timestamp()
  where id = 1;
end;
$$;

revoke execute on function public.hub_email_inbox_server_record_check(text, bigint, bigint) from public, authenticated;
grant execute on function public.hub_email_inbox_server_record_check(text, bigint, bigint) to anon;

create or replace function public.hub_email_inbox_server_record_error(
  p_secret text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.hub_email_inbox_server_secret_valid(p_secret) then
    raise exception 'HUB_EMAIL_SERVER_SECRET_INVALID';
  end if;

  update private.hub_email_inbox_state
  set last_error = left(coalesce(nullif(trim(p_error), ''), 'Falha ao verificar a caixa de entrada.'), 500),
      last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = 1;
end;
$$;

revoke execute on function public.hub_email_inbox_server_record_error(text, text) from public, authenticated;
grant execute on function public.hub_email_inbox_server_record_error(text, text) to anon;

create or replace function private.hub_email_inbox_cron_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1
    from private.hub_email_inbox_state st
    join vault.decrypted_secrets v on v.id = st.password_secret_id
    where st.id = 1
      and nullif(trim(st.email_address), '') is not null
      and v.decrypted_secret is not null
  ) then
    return;
  end if;

  select s.decrypted_secret into v_secret
  from vault.decrypted_secrets s
  where s.name = 'hub_email_inbox_cron_secret'
  limit 1;

  if v_secret is null then
    update private.hub_email_inbox_state
    set last_error = 'Segredo interno da verificacao de e-mail indisponivel.',
        updated_at = clock_timestamp()
    where id = 1;
    return;
  end if;

  perform net.http_post(
    url := 'https://hubsantamariatem.vercel.app/api/email-inbox-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hub-email-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
exception
  when others then
    update private.hub_email_inbox_state
    set last_error = 'Falha ao agendar a verificacao automatica de e-mail.',
        updated_at = clock_timestamp()
    where id = 1;
end;
$$;

revoke execute on function private.hub_email_inbox_cron_dispatch() from public, anon, authenticated;

create or replace function public.hub_email_inbox_get_status()
returns table (
  email_address text,
  configured boolean,
  pending_new_count integer,
  last_checked_at timestamptz,
  last_new_mail_at timestamptz,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED';
  end if;

  return query
  select
    st.email_address,
    (nullif(trim(st.email_address), '') is not null and st.password_secret_id is not null),
    st.pending_new_count,
    st.last_checked_at,
    st.last_new_mail_at,
    st.last_error
  from private.hub_email_inbox_state st
  where st.id = 1;
end;
$$;

revoke execute on function public.hub_email_inbox_get_status() from public, anon;
grant execute on function public.hub_email_inbox_get_status() to authenticated;

create or replace function public.hub_email_inbox_save_config(
  p_email text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_password text := coalesce(p_password, '');
  v_secret_id uuid;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED';
  end if;
  if length(v_email) < 5 or position('@' in v_email) <= 1 or length(v_email) > 320 then
    raise exception 'HUB_EMAIL_ADDRESS_INVALID';
  end if;
  if length(v_password) < 1 or length(v_password) > 1000 then
    raise exception 'HUB_EMAIL_PASSWORD_INVALID';
  end if;

  select st.password_secret_id into v_secret_id
  from private.hub_email_inbox_state st
  where st.id = 1
  for update;

  if v_secret_id is null or not exists (select 1 from vault.secrets s where s.id = v_secret_id) then
    v_secret_id := vault.create_secret(
      v_password,
      'hub_email_inbox_password',
      'Senha IMAP da caixa Locaweb monitorada pelo HUB'
    );
  else
    perform vault.update_secret(v_secret_id, v_password);
  end if;

  update private.hub_email_inbox_state
  set email_address = v_email,
      password_secret_id = v_secret_id,
      imap_host = 'email-ssl.com.br',
      imap_port = 993,
      last_uidnext = null,
      last_uidvalidity = null,
      pending_new_count = 0,
      last_checked_at = null,
      last_new_mail_at = null,
      last_error = null,
      acknowledged_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = 1;

  perform private.hub_email_inbox_cron_dispatch();
end;
$$;

revoke execute on function public.hub_email_inbox_save_config(text, text) from public, anon;
grant execute on function public.hub_email_inbox_save_config(text, text) to authenticated;

create or replace function public.hub_email_inbox_acknowledge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED';
  end if;

  update private.hub_email_inbox_state
  set pending_new_count = 0,
      acknowledged_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = 1;
end;
$$;

revoke execute on function public.hub_email_inbox_acknowledge() from public, anon;
grant execute on function public.hub_email_inbox_acknowledge() to authenticated;

select cron.schedule(
  'hub-email-inbox-check',
  '*/5 * * * *',
  'select private.hub_email_inbox_cron_dispatch();'
);

notify pgrst, 'reload schema';
