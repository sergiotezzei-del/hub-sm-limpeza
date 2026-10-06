# Preview de e-mail e badge

Base: main/produção `d341bfd2073e23bb39fe22c6bdd9afe09337155f`.
Branch: `preview/email-alerts-real-badge`.
Alias autorizado: `hub-santamariatem-git-recover-11cfa4-sergiotezzei-dels-projects.vercel.app`.

## Comparação do recovery local com a main publicada

| Arquivo | Diferença relevante | Escolha para este Preview |
| --- | --- | --- |
| `browserAlertAttention.ts` | Local descarta o contador legado, conta cards pendentes elegíveis e sincroniza remoções/sessões. Main reusa a lista persistida de não vistos. | Transportar a correção local. |
| `App.tsx` | Local tem dois eventos de sincronização do badge; também difere da main em login, usuários, permissões e navegação. | Acrescentar somente os dois eventos à App da main. |
| `public/sw.js` | Local não define badge arbitrário por push e solicita recálculo. Main chama `setAppBadge(1)`. Os nomes de cache também diferem. | Transportar a correção e avançar o shell para `v24-email-badge-preview`. |
| `emailInboxService.ts` | Main retorna zero antecipadamente quando `RECOVERY_MODE=true` e bloqueia acknowledge/configuração. Local consulta as RPCs. | Liberar somente status/acknowledge, mantendo configuração bloqueada. |
| `AlertDashboardEnhancer.tsx` | Idêntico, desconsiderando finais de linha. O card e a agregação de e-mail já existem. | Preservar a main. |
| `supabaseClient.ts` | Local usa gateway em `127.0.0.1:18000`; main usa a origem do frontend, allowlist de origens e instalação/verificação das sessões individuais. | Preservar integralmente a main. |

O bundle oficial `/assets/index-D6Yj69SE.js` ainda contém o retorno antecipado
"Indisponível no recovery local.". A RPC de status foi eliminada desse bundle
pelo build, pois o bloqueio é constante. Portanto, o frontend publicado não
consulta a pendência já disponibilizada no backend.

O SW oficial usa `hub-santa-maria-v23-recovery-wide-final` e ainda chama
`setAppBadge(1)`. A correção local do badge ainda não estava na main.

## Verificação

```sh
npm run build
node --test tests/email-inbox.test.mjs tests/pwa-badge.test.mjs
```

Os testes de acknowledge usam apenas um transporte simulado. O teste HTTP e
o teste visual devem consultar somente status e preservar a pendência existente.

Confirmar no alias autorizado: card de e-mail com uma pendência, contagem de
cards elegíveis, limpeza quando chega a zero, limpeza no logout e SW novo sem
`setAppBadge(1)`. Não fazer merge, promoção ou deploy em produção.

Auth, Marketing, rewrites, gateway, banco e wrappers RPC permanecem iguais à base.

## Resultados locais

- TypeScript e build Vite concluídos; 18 testes passaram.
- Administrador existente autenticado: card real de e-mail com uma pendência.
- Dois cards pendentes elegíveis no painel: chamada real `setAppBadge(2)`.
- Logout pela interface: `clearAppBadge()`, seguido da tela de login.
- Na verificação de logout, somente a resposta de `/auth/v1/logout` foi isolada
  no navegador para não revogar outras sessões do administrador. Nenhuma
  alteração foi feita no código de Auth; as consultas dos cards foram reais.
- Zero pendências, remoção do último card e troca de sessão cobertos pelos
  testes de regressão. Nenhum alerta real foi concluído ou removido.
- Acknowledge validado somente com transporte simulado; configuração de
  e-mail continua bloqueada no recovery.
