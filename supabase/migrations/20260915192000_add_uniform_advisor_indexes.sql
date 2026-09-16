create index if not exists uniform_delivery_batch_items_item_idx
  on public.uniform_delivery_batch_items(item_id);

create index if not exists uniform_delivery_terms_template_version_idx
  on public.uniform_delivery_terms(template_version);
