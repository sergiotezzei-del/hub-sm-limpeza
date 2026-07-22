-- Corrige o search_path explicito da funcao auxiliar usada pelo fluxo transacional de recebimento.

create or replace function public.cleaning_delivery_normalize_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$$;

revoke all on function public.cleaning_delivery_normalize_name(text) from public, anon, authenticated;
