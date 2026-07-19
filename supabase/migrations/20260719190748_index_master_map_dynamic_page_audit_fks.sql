create index if not exists hub_dynamic_pages_created_by_idx
  on public.hub_dynamic_pages (created_by)
  where created_by is not null;

create index if not exists hub_dynamic_pages_updated_by_idx
  on public.hub_dynamic_pages (updated_by)
  where updated_by is not null;

create index if not exists hub_dynamic_page_blocks_created_by_idx
  on public.hub_dynamic_page_blocks (created_by)
  where created_by is not null;

create index if not exists hub_dynamic_page_blocks_updated_by_idx
  on public.hub_dynamic_page_blocks (updated_by)
  where updated_by is not null;
