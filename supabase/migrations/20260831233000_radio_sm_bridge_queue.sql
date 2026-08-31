create table if not exists public.radio_announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  title text not null default 'Rádio Santa Maria',
  message text,
  local_file text not null,
  duration_seconds integer not null default 10 check (duration_seconds between 1 and 60),
  scheduled_for timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','claimed','completed','failed','cancelled')),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text
);

create index if not exists radio_announcements_due_idx
  on public.radio_announcements (status, scheduled_for, created_at);

alter table public.radio_announcements enable row level security;

drop policy if exists radio_announcements_admin_select on public.radio_announcements;
create policy radio_announcements_admin_select
  on public.radio_announcements for select to authenticated
  using ((select public.is_hub_admin()));

drop policy if exists radio_announcements_admin_insert on public.radio_announcements;
create policy radio_announcements_admin_insert
  on public.radio_announcements for insert to authenticated
  with check ((select public.is_hub_admin()));

drop policy if exists radio_announcements_admin_update on public.radio_announcements;
create policy radio_announcements_admin_update
  on public.radio_announcements for update to authenticated
  using ((select public.is_hub_admin()))
  with check ((select public.is_hub_admin()));

drop policy if exists radio_announcements_admin_delete on public.radio_announcements;
create policy radio_announcements_admin_delete
  on public.radio_announcements for delete to authenticated
  using ((select public.is_hub_admin()));

grant select, insert, update, delete on public.radio_announcements to authenticated;
revoke all on public.radio_announcements from anon;

create or replace function public.radio_bridge_authorized(p_token text)
returns boolean
language sql
immutable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') =
      'afb3075f890c2643ce527c145760adf4aeee000eb09bf6df22b03b07282aee26',
    false
  );
$$;

create or replace function public.radio_bridge_claim(p_token text)
returns setof public.radio_announcements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.radio_announcements%rowtype;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  select *
    into v_job
    from public.radio_announcements
   where scheduled_for <= now()
     and attempts < 3
     and (
       status = 'queued'
       or (status = 'claimed' and claimed_at < now() - interval '2 minutes')
     )
   order by scheduled_for asc, created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.radio_announcements
     set status = 'claimed',
         claimed_at = now(),
         completed_at = null,
         attempts = attempts + 1,
         last_error = null
   where id = v_job.id
   returning * into v_job;

  return next v_job;
end;
$$;

create or replace function public.radio_bridge_finish(
  p_token text,
  p_id uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if not public.radio_bridge_authorized(p_token) then
    raise exception 'RADIO_BRIDGE_UNAUTHORIZED' using errcode = '28000';
  end if;

  update public.radio_announcements
     set status = case when p_success then 'completed' else 'failed' end,
         completed_at = now(),
         last_error = case when p_success then null else left(coalesce(p_error, 'Falha sem detalhe'), 1000) end
   where id = p_id
     and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.radio_bridge_authorized(text) from public;
revoke all on function public.radio_bridge_claim(text) from public;
revoke all on function public.radio_bridge_finish(text, uuid, boolean, text) from public;
grant execute on function public.radio_bridge_claim(text) to anon, authenticated;
grant execute on function public.radio_bridge_finish(text, uuid, boolean, text) to anon, authenticated;
