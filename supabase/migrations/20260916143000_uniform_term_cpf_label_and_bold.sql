-- Corrige somente a apresentação do recibo V6 (nome/CPF em negrito e rótulo CPF).
-- Preserva lote, assinatura, histórico, estoque e versão jurídica do termo.
-- Novo caminho evita reutilizar HTML antigo em cache nos celulares ao reimprimir.
UPDATE public.uniform_term_template_versions
SET print_template_path = '/templates/uniforms/uniform-term-v6-cpf-bold.html',
    updated_at = now()
WHERE version = 'V6'
  AND print_template_path IN (
    '/templates/uniforms/uniform-term-v6.html',
    '/templates/uniforms/uniform-term-v6-cpf-bold.html'
  );
