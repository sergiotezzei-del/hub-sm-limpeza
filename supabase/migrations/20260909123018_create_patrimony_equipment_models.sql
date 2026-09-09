create table public.patrimony_equipment_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (btrim(slug) <> ''),
  name text not null check (btrim(name) <> ''),
  category text not null default 'Notebook' check (btrim(category) <> ''),
  brand text,
  model text,
  description text not null check (btrim(description) <> ''),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patrimony_equipment_models_active_idx
  on public.patrimony_equipment_models(category, sort_order, name)
  where active;

alter table public.patrimony_items
  add column equipment_model_id uuid references public.patrimony_equipment_models(id) on delete set null;

create index patrimony_items_equipment_model_idx
  on public.patrimony_items(equipment_model_id)
  where equipment_model_id is not null;

create trigger patrimony_equipment_models_updated_at
before update on public.patrimony_equipment_models
for each row execute function public.set_patrimony_updated_at();

alter table public.patrimony_equipment_models enable row level security;

grant select, insert, update, delete on public.patrimony_equipment_models to authenticated;
revoke all on public.patrimony_equipment_models from anon;

create policy patrimony_equipment_models_admin_select
on public.patrimony_equipment_models for select to authenticated
using ((select public.is_hub_admin()));

create policy patrimony_equipment_models_admin_insert
on public.patrimony_equipment_models for insert to authenticated
with check ((select public.is_hub_admin()));

create policy patrimony_equipment_models_admin_update
on public.patrimony_equipment_models for update to authenticated
using ((select public.is_hub_admin()))
with check ((select public.is_hub_admin()));

create policy patrimony_equipment_models_admin_delete
on public.patrimony_equipment_models for delete to authenticated
using ((select public.is_hub_admin()));

insert into public.patrimony_equipment_models (
  slug, name, category, brand, model, description, active, sort_order
)
values (
  'lenovo-thinkpad-t14-i5-10-16gb-256gb',
  'Lenovo ThinkPad T14',
  'Notebook',
  'Lenovo',
  'ThinkPad T14',
  'Intel Core i5 10ª geração · 16 GB RAM · SSD M.2 256 GB · Preto',
  true,
  10
)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  brand = excluded.brand,
  model = excluded.model,
  description = excluded.description,
  active = true,
  sort_order = excluded.sort_order;
