create table if not exists public.guard_round_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sequence_order integer not null,
  qr_token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint guard_round_points_sequence_check check (sequence_order > 0),
  constraint guard_round_points_sequence_unique unique (sequence_order),
  constraint guard_round_points_qr_token_unique unique (qr_token)
);

create table if not exists public.guard_round_schedules (
  id uuid primary key default gen_random_uuid(),
  scheduled_time time not null,
  sequence_order integer not null,
  tolerance_minutes integer not null default 10,
  point_interval_tolerance_minutes integer not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint guard_round_schedules_sequence_check check (sequence_order > 0),
  constraint guard_round_schedules_tolerance_check check (tolerance_minutes >= 0 and point_interval_tolerance_minutes >= 0),
  constraint guard_round_schedules_time_unique unique (scheduled_time),
  constraint guard_round_schedules_sequence_unique unique (sequence_order)
);

create table if not exists public.guard_round_checkins (
  id uuid primary key default gen_random_uuid(),
  shift_session_id uuid not null references public.shift_sessions(id) on delete cascade,
  guard_id uuid not null references auth.users(id),
  scheduled_date date not null,
  round_schedule_id uuid not null references public.guard_round_schedules(id),
  round_point_id uuid not null references public.guard_round_points(id),
  point_sequence_order integer not null,
  scheduled_time time not null,
  checked_at timestamptz not null default now(),
  latitude decimal,
  longitude decimal,
  accuracy decimal,
  status text not null default 'on_time',
  source text not null default 'manual',
  qr_token text,
  created_at timestamptz not null default now(),
  constraint guard_round_checkins_status_check check (status in ('on_time', 'late', 'out_of_sequence')),
  constraint guard_round_checkins_source_check check (source in ('manual', 'qr')),
  constraint guard_round_checkins_point_sequence_check check (point_sequence_order > 0),
  constraint guard_round_checkins_unique_point unique (shift_session_id, round_schedule_id, round_point_id)
);

create index if not exists guard_round_checkins_guard_id_idx on public.guard_round_checkins (guard_id);
create index if not exists guard_round_checkins_shift_session_id_idx on public.guard_round_checkins (shift_session_id);
create index if not exists guard_round_checkins_scheduled_date_idx on public.guard_round_checkins (scheduled_date);
create index if not exists guard_round_checkins_checked_at_idx on public.guard_round_checkins (checked_at desc);
create index if not exists guard_round_checkins_round_schedule_id_idx on public.guard_round_checkins (round_schedule_id);

alter table public.guard_round_points enable row level security;
alter table public.guard_round_schedules enable row level security;
alter table public.guard_round_checkins enable row level security;

revoke all on table public.guard_round_points from anon;
revoke all on table public.guard_round_schedules from anon;
revoke all on table public.guard_round_checkins from anon;

grant select on table public.guard_round_points to authenticated;
grant select on table public.guard_round_schedules to authenticated;
grant select, insert on table public.guard_round_checkins to authenticated;
grant select, insert, update, delete on table public.guard_round_points to service_role;
grant select, insert, update, delete on table public.guard_round_schedules to service_role;
grant select, insert, update, delete on table public.guard_round_checkins to service_role;

drop policy if exists "guard_round_points_select_authenticated" on public.guard_round_points;
create policy "guard_round_points_select_authenticated"
on public.guard_round_points
for select
to authenticated
using (
  active = true
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_round_schedules_select_authenticated" on public.guard_round_schedules;
create policy "guard_round_schedules_select_authenticated"
on public.guard_round_schedules
for select
to authenticated
using (
  active = true
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_round_checkins_select_own_or_admin" on public.guard_round_checkins;
create policy "guard_round_checkins_select_own_or_admin"
on public.guard_round_checkins
for select
to authenticated
using (
  guard_id = (select auth.uid())
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('admin', 'Admin', 'tezzei'), false)
  or coalesce(((select auth.jwt()) -> 'app_metadata' -> 'permissions') ? 'painel-admin', false)
);

drop policy if exists "guard_round_checkins_insert_own_active_shift" on public.guard_round_checkins;
create policy "guard_round_checkins_insert_own_active_shift"
on public.guard_round_checkins
for insert
to authenticated
with check (
  guard_id = (select auth.uid())
  and exists (
    select 1
    from public.shift_sessions
    where shift_sessions.id = guard_round_checkins.shift_session_id
      and shift_sessions.guard_id = (select auth.uid())
      and shift_sessions.status = 'active'
  )
);

insert into public.guard_round_points (name, sequence_order, qr_token)
values
  ('Entrada principal', 1, 'round-point-entrada-principal'),
  ('Subsolo', 2, 'round-point-subsolo'),
  ('Gourmet', 3, 'round-point-gourmet'),
  ('Porta pátio', 4, 'round-point-porta-patio'),
  ('Portas laje técnica', 5, 'round-point-portas-laje-tecnica'),
  ('Recepção', 6, 'round-point-recepcao')
on conflict (sequence_order) do update
set name = excluded.name,
    qr_token = excluded.qr_token,
    active = true;

insert into public.guard_round_schedules (scheduled_time, sequence_order, tolerance_minutes, point_interval_tolerance_minutes)
values
  ('00:00', 1, 10, 10),
  ('01:30', 2, 10, 10),
  ('03:00', 3, 10, 10),
  ('04:30', 4, 10, 10),
  ('06:00', 5, 10, 10)
on conflict (scheduled_time) do update
set sequence_order = excluded.sequence_order,
    tolerance_minutes = excluded.tolerance_minutes,
    point_interval_tolerance_minutes = excluded.point_interval_tolerance_minutes,
    active = true;
