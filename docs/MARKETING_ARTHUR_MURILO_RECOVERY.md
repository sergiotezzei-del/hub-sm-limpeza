# Troca de Arthur por Murilo no recovery local

Branch: `fix/marketing-replace-arthur-with-murilo`.
Base auditada: `d341bfd2073e23bb39fe22c6bdd9afe09337155f`.
Migration: `20261006163520_marketing_replace_arthur_with_murilo.sql`.

## Escopo e ponto de parada

Esta etapa prepara código, migration, snapshot, rollback e testes locais.
A migration ainda não foi aplicada em produção. Nenhum usuário real ou código
real de Murilo foi criado nesta etapa. Commit, PR, Preview e testes reais ficam
para a próxima etapa, após a revisão do diff solicitada por Sérgio.

Google Calendar permanece indisponível no recovery, como já estava antes desta alteração.
Apenas textos de apresentação citando a equipe foram atualizados. Não foram
alterados endpoints, OAuth, funções Google, tokens ou o bloqueio da integração.
A API antiga de Google permanece fora do fluxo recovery; não executá-la.

## Comportamento preparado

- Novas opções de responsável: Maria e Murilo. O nome completo do usuário é Murilo Mendonça.
- Arthur continua aparecendo nos pedidos e eventos históricos. No seletor de um
  pedido antigo, sua opção está desabilitada e identificada como histórico.
- As ações de reagendamento/exceção exigem IDs `maria` ou `murilo` e role Marketing.
- A migration desativa Arthur e seu acesso Marketing, revoga os refresh tokens,
  expira sessões Auth, marca sessões Marketing como revogadas e bloqueia sua
  identidade local por `auth.users.banned_until`. Nenhum usuário/link é apagado.
- Murilo recebe ID independente `murilo`, tipo Consulta, cargo Marketing,
  departamento Administração e somente a permissão `marketing`.
- O trigger existente gera `access_code_hash`; o provisionador recovery existente
  cria a identidade Auth individual e o vínculo privado com role `hub_user`.
- Uma tabela privada, com RLS e sem grants públicos, registra a aplicação e o SHA256
  do snapshot. Ela permite reaplicação sem trocar senha ou sobrescrever perfis.
  ID Murilo preexistente sem esse registro aborta toda a transaction.
- Seis funções atuais recebem patches de trechos específicos, verificados por
  fingerprints completos antes/depois. Qualquer divergência aborta tudo.
  Não há atualização de pedidos/eventos históricos na migration.

## Antes da futura aplicação

1. Repetir a auditoria de HEAD, banco, usuários e funções. Confirmar que Murilo
   continua ausente e que as definições correspondem aos fingerprints auditados.
2. Capturar `tools/recovery/marketing-staff-snapshot.sql` pelo executor local atual,
   com a saída diretamente em arquivo privado fora de Git. Usar diretório root
   `0700`, arquivo exclusivo `0600`, `umask 077`; não imprimir o JSON ou stderr
   sensível. O snapshot contém os registros completos de Arthur, acesso,
   identidade/link Auth, sessões, refresh tokens, sessões Marketing, os pedidos e
   eventos históricos, e as seis definições anteriores das funções.
3. Calcular e guardar o SHA256 desse arquivo. Conferir 18 pedidos e 150 eventos;
   divergência requer nova revisão. Não restaurar nenhum backup de banco completo.
4. Criar o executor seguro da aplicação fora de Git no servidor. Ler a conexão
   pelo mecanismo local existente, sem senha em argumentos/logs. Gerar o código
   humano com `secrets.token_urlsafe(32)` em memória. Guardá-lo apenas conforme o
   mecanismo de credenciais aprovado, sem criar arquivo versionado.
5. Na mesma conexão de banco, passar com parâmetros vinculados:
   `set_config('app.marketing_staff_backup_sha256', ..., false)` e
   `set_config('app.marketing_murilo_access_code', ..., false)`.
   Não interpolar ou imprimir credenciais e não habilitar logs de parâmetros.
   Executar a migration integral em `hub_restore_test` como `hub_restore_admin`.
   Sem essas entradas, a primeira aplicação aborta sem alterar registros.
6. Executar o `provision-all.mjs` já existente pela imagem/Compose da Auth bridge:
   `docker compose -f /home/user/servidor-hub-sm/hub-restore-test/integration/auth-bridge/compose.yaml run --rm --no-deps --entrypoint node auth-bridge /app/provision-all.mjs`.
   Ele usa `ensureAuthIdentity`, preserva identidades existentes e cria o vínculo
   `private.managed_user_auth_links`. Não executar `finalize-real-users-auth.sh`
   nem `apply-real-users-auth.sh`: são reparos amplos, com inventário antigo.
7. Validar login real Murilo/Maria/Tezzei, negativa Arthur, JWTs, sessões Marketing,
   operações, fingerprints completos do histórico e saúde dos serviços. Não usar
   `runtime-verify.py` sem adaptar seu inventário: após a troca, o cadastro terá
   21 usuários, 19 ativos e 2 inativos, se o inventário auditado não mudar.
8. Informar o código real a Sérgio somente uma vez, depois de validar o login.

## Rollback preciso

O rollback de banco está em `tools/recovery/marketing-staff-rollback.sql`.
Não reutiliza o antigo código humano nem restaura tokens ou sessões revogadas.

1. Conferir o SHA256 do snapshot privado contra o recibo da migration e fazer
   registro privado do estado atual de Arthur/Murilo e seus vínculos.
2. No executor privado, na mesma conexão, criar a tabela temporária
   `CREATE TEMP TABLE marketing_staff_backup(payload jsonb)` e carregar o JSON
   do snapshot usando parâmetro vinculado. Não usar arquivo SQL com senha.
3. Gerar outro código humano forte para Arthur, distinto dos códigos antigos e
   de Murilo. Definir por parâmetros `app.marketing_staff_backup_sha256` e
   `app.marketing_arthur_rollback_access_code` nessa conexão.
4. Executar o rollback integral. Ele valida as seis definições, restaura as
   autorizações anteriores, reativa Arthur/acesso Marketing, retira seu bloqueio
   Auth anterior, aplica o novo hash via trigger e desativa/revoga Murilo.
   As duas identidades e os vínculos permanecem. Sessões revogadas não voltam.
5. Reverter somente os arquivos operacionais desta mudança no frontend e publicar
   a versão validada correspondente. Não reaplicar migrations antigas.
6. Validar novo login Arthur, negativa Murilo, Maria/Tezzei e todo o histórico.
   Os pedidos/eventos criados depois da troca não são removidos nem reatribuídos.
   O recibo registra `rolled_back_at`; reaplicar a migration depois do rollback
   exige revisão explícita e é bloqueado automaticamente.

## Preview Vercel posterior

Após testes locais e revisão do diff: criar commit/PR e capturar a URL exata do
Preview gerado pela Vercel. Somente então preparar, na branch de teste, a origem
exata no frontend, Auth bridge, Marketing bridge e gateway. Não usar wildcard.
Os arquivos de servidor precisam de configuração isolada de teste para validar
sem editar os serviços de produção. Redeployar o Preview e validar o fluxo todo.
Antes do merge, revisar/remover a origem temporária se não necessária em produção.
Nesta fase nenhuma allowlist, porta ou configuração de servidor foi alterada.

## Testes reproduzíveis

- `npx pnpm@10.18.3 exec tsc --noEmit`
- `npx pnpm@10.18.3 build` com variáveis recovery locais válidas.
- `node --test tools/recovery/*.test.mjs`
- Testes existentes das bridges: `server.test.mjs` e `server_test.py` na infraestrutura local.
- Exportar apenas DDL com `pg_dump --schema-only --no-owner` do recovery. Não
  copiar dados. Manter o export em `.tmp`, fora de Git.
- Executar com acesso Docker:
  `python3 -B tools/recovery/test-marketing-staff-replacement.py --schema-only /caminho/schema-only.sql`.
  O runner cria um PostgreSQL 17.6 temporário, sem rede/portas, com dados
  sintéticos em tmpfs, e remove somente o container que ele próprio criou.
  Testa credenciais sintéticas, histórico, revogações, conflitos, idempotência,
  fila, reagendamento, exceções, aprovação Tezzei, cancelamento e rollback.

Os testes locais não equivalem ao login real, ao provisionamento GoTrue real
ou à validação de Preview. Essas verificações continuam obrigatórias antes do deploy.

## Resultado da Fase 2

Typecheck e build aprovados. O build foi executado com schema `recovery_api` e
chave anon sintética para compilação local, sem login/chamada de backend real.
Passaram 14 testes frontend/recovery, 11 testes SQL em PostgreSQL 17.6, 8 testes
existentes da Auth bridge e 13 da Marketing bridge (46 no total).
O teste SQL antigo foi alinhado ao erro de responsável obrigatório atual e ao
bloqueio de sincronização Google do recovery; as migrations antigas não mudaram.
As fixtures verificam 18 pedidos e 150 eventos por igualdade dos registros
completos, manutenção de captação legada de 120 minutos, ações do Murilo,
aprovação exclusiva de Tezzei, fila, revogações, idempotência, colisão e rollback.
Os containers temporários foram removidos; os serviços recovery continuam em
execução. A conferência final somente leitura confirmou Arthur ainda ativo,
Murilo ausente e os contadores históricos reais sem alteração.
