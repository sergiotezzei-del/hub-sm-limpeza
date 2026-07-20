# Evidencia complementar - PR #82

## Pendencia 1 - Salvamento atomico

Correcao aplicada:

- nova RPC `public.apply_hub_map_node_layout_updates(p_map_id uuid, p_updates jsonb)`;
- a RPC recebe, em um unico lote, `position_x`, `position_y` e `metadata.visualStyle`;
- validacao de Admin, mapa, nos, coordenadas e estrutura de `visualStyle`;
- aplicacao em transacao unica: tudo grava ou nada grava;
- `Aplicar e salvar` e `Desfazer ultima organizacao` usam a mesma RPC;
- as RPCs de layout ficaram como `SECURITY INVOKER`, apoiadas pelas policies Admin-only ja existentes.

Migrations locais adicionadas:

- `supabase/migrations/20260720211500_create_master_map_layout_updates_rpc.sql`
- `supabase/migrations/20260720212500_set_master_map_layout_rpcs_security_invoker.sql`

Migrations aplicadas no Supabase real `dtdepfpkyiqtnsjztjit`:

- `20260720211718_create_master_map_layout_updates_rpc`
- `20260720212058_set_master_map_layout_rpcs_security_invoker`

Validacoes no Supabase real:

- Admin com `app_metadata.role = admin`: `admin_transactional_rpc_invoker_ok`;
- lote invalido com `visualStyle` invalido: `invalid_batch_no_partial_write_ok`;
- Carlos autenticado sem claim Admin: `carlos_blocked_invoker_ok`;
- Salomao autenticado sem claim Admin: `salomao_blocked_invoker_ok`;
- anon: `anon_blocked_invoker_ok`.

Resultado do advisor:

- os avisos de `SECURITY DEFINER` das RPCs de layout deixaram de aparecer;
- permanecem avisos antigos de outros modulos/tabelas fora do escopo do PR #82.

## Pendencia 2 - Multisselecao sem sobrescrever estilo individual

Correcao aplicada:

- o painel agora rastreia os campos visuais alterados na sessao;
- em multisselecao, a previa aplica apenas esses campos alterados;
- propriedades individuais nao alteradas continuam preservadas em cada quadro;
- foi adicionada a acao explicita `Aplicar estilo completo do quadro de referencia`;
- copiar preenchimento, borda, formato, largura e handles completos so ocorre por essa acao explicita.

Cenario validado por implementacao e build:

1. selecionar tres quadros com estilos diferentes;
2. alterar apenas `borderWidth`;
3. a previa gera um patch contendo somente `borderWidth`;
4. `fillColor`, `borderColor`, `shape`, `widthPreset`, `sourcePosition` e `targetPosition` continuam vindo do estilo individual de cada quadro;
5. usar `Aplicar estilo completo do quadro de referencia` cria uma previa separada copiando o estilo completo.

Checks locais:

- `pnpm run build`: passou;
- `git diff --check`: passou.
