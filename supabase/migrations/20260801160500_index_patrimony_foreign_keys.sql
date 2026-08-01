create index if not exists patrimony_assignments_destination_space_idx
  on public.patrimony_assignments(destination_space_id)
  where destination_space_id is not null;

create index if not exists patrimony_movements_assignment_idx
  on public.patrimony_movements(assignment_id)
  where assignment_id is not null;

create index if not exists patrimony_movements_space_assignment_idx
  on public.patrimony_movements(space_assignment_id)
  where space_assignment_id is not null;
