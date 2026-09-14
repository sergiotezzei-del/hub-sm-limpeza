alter table public.organization_people
  add column if not exists ihome_user_id integer,
  add column if not exists directory_source text not null default 'hub';

create unique index if not exists organization_people_ihome_user_id_uidx
  on public.organization_people(ihome_user_id)
  where ihome_user_id is not null;

comment on column public.organization_people.ihome_user_id is
  'Identificador do usuário no diretório iHome, quando a pessoa foi importada ou conciliada com o iHome.';

comment on column public.organization_people.directory_source is
  'Origem principal do cadastro no diretório de pessoas (hub, ihome ou manual).';
