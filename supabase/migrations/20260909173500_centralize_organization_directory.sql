update public.organization_people
set team_name = 'Equipe Ramzy/Adriana',
    updated_at = now()
where department = 'Locação'
  and team_name in ('Equipe Ramzy', 'Equipe Adriana');

create or replace view public.organization_directory
with (security_invoker = true)
as
select
  id,
  name,
  person_type,
  department,
  team_name,
  case
    when team_name is null then null
    else regexp_replace(team_name, '^Equipe\\s+', '', 'i')
  end as manager_team,
  job_title,
  email,
  phone,
  managed_user_id,
  ihome_user_id,
  directory_source,
  active,
  notes,
  created_at,
  updated_at
from public.organization_people;

comment on view public.organization_directory is
  'Diretório central e reutilizável de pessoas do HUB. Nome, setor, equipe, função e vínculos iHome devem ser consultados aqui por novos módulos.';

grant select on public.organization_directory to authenticated;
