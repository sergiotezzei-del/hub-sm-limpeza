# Exclusão de captação agrupada legada

Base: `main`/produção `d341bfd2073e23bb39fe22c6bdd9afe09337155f`, confirmada no remoto em 2026-10-06. Branch independente `fix/marketing-legacy-booking-delete`; sem dependência da PR #212.

## Problema e alteração

Os pedidos #172 e #173 são membros de uma reserva antiga de 150 minutos (60 + 90), iniciada às 08:30 de São Paulo em 2026-09-01. A exclusão administrativa atual apenas preenche `deleted_at` e registra `pedido_excluido_admin`, mas o trigger de sincronização reconstrói a reserva e revalida o horário restante contra a agenda atual. Esse horário legado causa `MARKETING_CAPTURE_WINDOW_INVALID`.

Migration nova e idempotente: `supabase/migrations/20261006205452_marketing_legacy_booking_soft_delete.sql`.

A migration modifica somente `private.marketing_sync_capture_reservation()` e adiciona `private.marketing_reduce_capture_reservation_on_soft_delete(uuid, uuid)`. Não altera o RPC administrativo, sua autorização, wrappers recovery, frontend, usuários, sessões ou registros operacionais.

O novo caminho requer `deleted_at NULL -> NOT NULL`, com ID, grupo, data confirmada, duração, tipo e status exatamente iguais aos anteriores. O `booking_key` permanece igual. O helper trava o grupo e a reserva existente, verifica horário, grupo, representante e todos os membros restantes. Exige que a duração armazenada corresponda à soma anterior dos membros.

- Havendo membros restantes, escolhe um representante ativo e diminui `end_at` para a soma das durações restantes.
- Sem membros, remove somente a reserva operacional.
- Nunca insere reserva, altera `start_at`/`booking_key` ou aumenta duração. Reserva ausente ou inconsistente causa aborto integral da exclusão, sem evento parcial.
- O horário legado não passa pela validação atual nesse caminho estritamente redutor.
- Grupos do modelo atual que compartilham uma única janela fixa de 60 minutos mantêm o fluxo original de validação; não são confundidos com reservas legadas aditivas.
- INSERT, mudança de horário/grupo/tipo/status/duração e restauração mantêm o fluxo original. A restauração administrativa continua verificando janela e conflitos.

O helper é SECURITY INVOKER e não tem EXECUTE para PUBLIC, anon, authenticated ou service_role. A migration concede EXECUTE ao dono interno do trigger (no recovery auditado: postgres, sem superuser). Preserva dono e ACL do trigger existente. Um hash da implementação auditada impede aplicar sobre um trigger diferente; reaplicar esta mesma versão é permitido.

O botão normal já chama `marketing_v2_admin_delete_request` pelo schema `recovery_api`, cujo wrapper chama o RPC público. Não há alteração do frontend nem exclusão direta de pedidos por SQL.

## Validação local

Executado em PostgreSQL 17 temporário sem rede, portas ou volumes do servidor. A entrada é apenas o DDL exportado do catálogo recovery com ACLs, sem dados reais. O runner rejeita backups de linhas, cria usuários/identidades/sessões sintéticos e remove apenas o container que ele próprio criou.

```bash
python3 -B tools/recovery/test-marketing-legacy-booking-delete.py \
  --schema-only /caminho/ignorado/current-schema.sql
```

Resultado: 27 testes passaram. Cobertura inclui reprodução da falha antes da correção; exclusões sequenciais e concorrentes dos dois membros; ordem inversa; reserva individual; redução 150 -> 90 ou 60 -> remoção; preservação de histórico e do membro restante; auditoria; Admin permitido e Marketing recusado; sessão Auth individual; restauração válida/legada/conflitante; horário inválido, aumento de duração e INSERT bloqueados; alterações combinadas não usam a exceção; inconsistências; ACL; idempotência; proteção contra drift e rollback.

Typecheck (`tsc --noEmit`) e build (`pnpm build`) passaram. Build com schema recovery_api e chave sintética, sem credencial real; apenas avisos existentes de tamanho de chunks e diretivas de dependências. Testes existentes: 9 de login Marketing, 8 do bridge Auth e 13 do bridge Marketing passaram.

Dez suítes SQL existentes foram executadas antes/depois com fixtures sintéticas, datas deslocadas por semanas inteiras e todas as assertions preservadas. Três passaram em ambas as versões: exclusivity, manager_review e status_legacy_compat. As outras sete já falham na baseline e mantiveram exatamente os mesmos erros:

| Suíte | Erro antes e depois |
| --- | --- |
| marketing_admin_soft_delete_rollback | MARKETING_CONFIRMED_CAPTURE_STATE_INVALID |
| marketing_capture_group_capacity_review_rollback | MARKETING_CAPTURE_WINDOW_INVALID |
| marketing_capture_groups_periods_rollback | MARKETING_CAPTURE_WINDOW_INVALID |
| marketing_central_stability_rollback | MARKETING_SCHEDULE_ASSIGNEE_REQUIRED |
| marketing_legacy_restore_compat_rollback | MARKETING_CAPTURE_DURATION_REQUIRED |
| marketing_public_request_rollback | MARKETING_CAPTURE_WINDOW_INVALID |
| marketing_workflow_v2_rollback | MARKETING_CAPTURE_WINDOW_INVALID |

Essas suítes antigas dependem de comportamentos anteriores às regras operacionais atuais. A comparação detecta mudança de resultado, mas não representa execução completa das assertions posteriores a cada falha. A nova suíte cobre diretamente a exclusão administrativa e a restauração com o catálogo atual. Nenhuma assertion antiga foi modificada.

## Aplicação e rollback pendentes

Nenhuma aplicação no banco real foi feita. Os pedidos #172/#173 continuam ativos e agendados. A consulta final read only confirmou o hash original do trigger `010f7ff8e5502c35ba2b9c1ff0a4a643`. Nenhum pedido foi excluído em produção, nenhum usuário alterado, nenhuma senha real gerada e nenhum container existente reiniciado.

Aplicar futuramente somente com autorização específica, pelo executor atual do recovery, sem usar Supabase cloud. A transação da migration contém somente DDL das duas funções e ACL do novo helper, sem DML de pedidos. Após aplicação autorizada, as exclusões devem ocorrer pelo botão normal com Tezzei/admin, em duas operações, verificando reserva e auditoria entre elas.

Rollback exato: executar `tools/recovery/rollback-marketing-legacy-booking-delete.sql` pelo executor do recovery, somente com autorização. O script verifica o hash, restaura o trigger auditado e remove o helper, em uma transação idempotente. Não apaga/restaura pedidos ou eventos nem modifica reservas criadas/reduzidas durante testes ou operação. Não restaura automaticamente pedidos excluídos: essa ação continua exclusiva do fluxo administrativo normal e das validações atuais. O rollback da função faz o bug legado voltar; não muda o histórico.
