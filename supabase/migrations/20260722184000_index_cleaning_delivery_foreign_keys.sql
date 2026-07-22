-- Adiciona indices nas chaves estrangeiras usadas pelo recebimento da Limpeza.

create index if not exists cleaning_deliveries_approval_idx
  on public.cleaning_deliveries(approval_id);

create index if not exists cleaning_delivery_approvals_stock_check_idx
  on public.cleaning_delivery_approvals(stock_check_id);

create index if not exists cleaning_delivery_items_product_slug_idx
  on public.cleaning_delivery_items(product_slug);
