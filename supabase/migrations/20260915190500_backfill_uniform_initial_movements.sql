with uniform_seed(code, uniform_proposal_number, quantity, proposal_date) as (
  values
    ('UNI-001','752',6::numeric,'2026-05-29'::date),
    ('UNI-002','752',21::numeric,'2026-05-29'::date),
    ('UNI-003','752',11::numeric,'2026-05-29'::date),
    ('UNI-004','752',2::numeric,'2026-05-29'::date),
    ('UNI-005','752',3::numeric,'2026-05-29'::date),
    ('UNI-006','752',4::numeric,'2026-05-29'::date),
    ('UNI-007','752',2::numeric,'2026-05-29'::date),
    ('UNI-008','752',6::numeric,'2026-05-29'::date),
    ('UNI-009','752',8::numeric,'2026-05-29'::date),
    ('UNI-010','752',2::numeric,'2026-05-29'::date),
    ('UNI-011','752',4::numeric,'2026-05-29'::date),
    ('UNI-012','752',2::numeric,'2026-05-29'::date),
    ('UNI-013','752',2::numeric,'2026-05-29'::date),
    ('UNI-014','752',7::numeric,'2026-05-29'::date),
    ('UNI-015','752',4::numeric,'2026-05-29'::date),
    ('UNI-016','752',1::numeric,'2026-05-29'::date),
    ('UNI-017','752',2::numeric,'2026-05-29'::date),
    ('UNI-018','752',7::numeric,'2026-05-29'::date),
    ('UNI-019','752',4::numeric,'2026-05-29'::date),
    ('UNI-020','752',1::numeric,'2026-05-29'::date),
    ('UNI-021','688',1::numeric,'2026-03-17'::date),
    ('UNI-022','688',1::numeric,'2026-03-17'::date),
    ('UNI-023','688',1::numeric,'2026-03-17'::date),
    ('UNI-024','688',1::numeric,'2026-03-17'::date)
)
insert into public.patrimony_movements(movement_type,item_id,space_id,quantity,actor_name,notes,created_at)
select
  'entrada_estoque',
  i.id,
  ps.id,
  s.quantity,
  'Importação inicial',
  'Entrada inicial de uniformes conforme Proposta Nº ' || s.uniform_proposal_number || ' de ' || to_char(s.proposal_date, 'DD/MM/YYYY'),
  now()
from uniform_seed s
join public.patrimony_items i on i.code = s.code
join public.patrimony_spaces ps on ps.code = 'ESTOQUE-UNIFORMES'
where lower(i.category) = 'uniforme'
  and not exists (
    select 1
    from public.patrimony_movements pm
    where pm.item_id = i.id
      and pm.movement_type = 'entrada_estoque'
      and pm.notes = 'Entrada inicial de uniformes conforme Proposta Nº ' || s.uniform_proposal_number || ' de ' || to_char(s.proposal_date, 'DD/MM/YYYY')
  );
