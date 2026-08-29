alter table private.hub_email_inbox_state
  add column if not exists last_push_uidnext bigint;

update private.hub_email_inbox_state
set last_push_uidnext = case
  when last_uidnext is null then null
  else greatest(last_uidnext - pending_new_count, 1)
end
where id = 1
  and last_push_uidnext is null;

create table if not exists private.hub_admin_push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null,
  endpoint text not null,
  endpoint_hash text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_seen_at timestamptz not null default clock_timestamp(),
  last_sent_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

revoke all on table private.hub_admin_push_subscriptions from public, anon, authenticated;

create or replace function public.hub_admin_push_register(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint text := trim(coalesce(p_endpoint, ''));
  v_p256dh text := trim(coalesce(p_p256dh, ''));
  v_auth text := trim(coalesce(p_auth, ''));
  v_hash text;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_hub_admin() then
    raise exception 'HUB_ADMIN_REQUIRED';
  end if;
  if length(v_endpoint) < 20 or length(v_endpoint) > 4000
     or length(v_p256dh) < 20 or length(v_p256dh) > 2000
     or length(v_auth) < 8 or length(v_auth) > 1000 then
    raise exception 'HUB_ADMIN_PUSH_SUBSCRIPTION_INVALID';
  end if;

  v_hash := encode(extensions.digest(v_endpoint, 'sha256'), 'hex');

  insert into private.hub_admin_push_subscriptions (
    auth_user_id, endpoint, endpoint_hash, p256dh, auth, user_agent,
    active, last_seen_at, last_error, updated_at
  ) values (
    auth.uid(), v_endpoint, v_hash, v_p256dh, v_auth,
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 1000),
    true, clock_timestamp(), null, clock_timestamp()
  )
  on conflict (endpoint_hash) do update
  set auth_user_id = excluded.auth_user_id,
      endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      active = true,
      last_seen_at = clock_timestamp(),
      last_error = null,
      updated_at = clock_timestamp()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.hub_admin_push_register(text, text, text, text) from public, anon;
grant execute on function public.hub_admin_push_register(text, text, text, text) to authenticated;

create or replace function public.hub_admin_push_get_status()
returns table(active_count integer, last_sent_at timestamptz, last_error text)
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
    count(*) filter (where s.active)::integer,
    max(s.last_sent_at),
    (array_agg(s.last_error order by s.updated_at desc) filter (where s.last_error is not null))[1]
  from private.hub_admin_push_subscriptions s
  where s.auth_user_id = auth.uid();
end;
$$;

revoke execute on function public.hub_admin_push_get_status() from public, anon;
grant execute on function public.hub_admin_push_get_status() to authenticated;

create or replace function public.hub_email_inbox_server_record_check_v2(
  p_secret text,
  p_uidnext bigint,
  p_uidvalidity bigint
)
returns table(new_count integer, push_count integer, current_uidnext bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.hub_email_inbox_state%rowtype;
  v_delta bigint := 0;
  v_push_delta bigint := 0;
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
        last_push_uidnext = p_uidnext,
        pending_new_count = 0,
        last_checked_at = clock_timestamp(),
        last_error = null,
        updated_at = clock_timestamp()
    where id = 1;
    return query select 0, 0, p_uidnext;
    return;
  end if;

  v_delta := greatest(p_uidnext - v_state.last_uidnext, 0);
  v_push_delta := greatest(p_uidnext - coalesce(v_state.last_push_uidnext, v_state.last_uidnext), 0);

  update private.hub_email_inbox_state
  set last_uidnext = p_uidnext,
      last_uidvalidity = p_uidvalidity,
      pending_new_count = pending_new_count + least(v_delta, 1000)::integer,
      last_new_mail_at = case when v_delta > 0 then clock_timestamp() else last_new_mail_at end,
      last_checked_at = clock_timestamp(),
      last_error = null,
      updated_at = clock_timestamp()
  where id = 1;

  return query select least(v_delta, 1000)::integer, least(v_push_delta, 1000)::integer, p_uidnext;
end;
$$;

revoke execute on function public.hub_email_inbox_server_record_check_v2(text, bigint, bigint) from public, authenticated;
grant execute on function public.hub_email_inbox_server_record_check_v2(text, bigint, bigint) to anon;

notify pgrst, 'reload schema';
