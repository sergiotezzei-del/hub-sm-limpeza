-- The original V5 DOCX remains archived at its existing path, with its original
-- SHA256, for provenance and for receipts already generated under V5.
-- V6 is the approved print revision: only the provisional footer and the
-- six-month observation were removed from the V5 text. Its print layout
-- is stored separately so subsequent changes do not rewrite prior receipts.
insert into public.uniform_term_template_versions (
  version, name, source_file_name, source_sha256, source_docx_path,
  print_template_path, logo_path, active
)
select
  'V6',
  'RECIBO DE ENTREGA DE UNIFORMES - VERSÃO APROVADA V6',
  source_file_name,
  source_sha256,
  source_docx_path,
  '/templates/uniforms/uniform-term-v6.html',
  logo_path,
  true
from public.uniform_term_template_versions
where version = 'V5'
on conflict (version) do update
set name = excluded.name,
    source_file_name = excluded.source_file_name,
    source_sha256 = excluded.source_sha256,
    source_docx_path = excluded.source_docx_path,
    print_template_path = excluded.print_template_path,
    logo_path = excluded.logo_path,
    active = true,
    updated_at = now();

-- Refuse to deactivate V5 if its provenance record was unavailable.
do $$
begin
  if not exists (select 1 from public.uniform_term_template_versions where version = 'V6') then
    raise exception 'V6 not created: preserved V5 template is missing';
  end if;
end $$;

update public.uniform_term_template_versions
set active = false, updated_at = now()
where version <> 'V6' and active;
