-- A tela antiga do aplicativo é exclusiva para saídas e usa o texto "Retirado por".
-- Entradas e ajustes da Conferência de Entrega são consultados na própria tela de recebimento.
drop policy if exists "allow read stock movements" on public.stock_movements;
create policy "allow read stock movements"
on public.stock_movements
for select
to anon, authenticated
using (
  not (
    source = 'cleaning-delivery'
    and movement_type in ('entrada', 'ajuste')
  )
);
