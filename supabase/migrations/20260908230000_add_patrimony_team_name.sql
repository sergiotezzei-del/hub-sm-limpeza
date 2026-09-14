alter table public.organization_people
  add column if not exists team_name text;

create index if not exists organization_people_department_team_idx
  on public.organization_people(department, team_name)
  where active;

comment on column public.organization_people.team_name is
  'Equipe operacional da pessoa, separada do setor/departamento. Ex.: setor Vendas, equipe Fernando.';
