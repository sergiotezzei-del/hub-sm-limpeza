# Sincronizacao Supabase dos guardas

## Situacao atual

O login local continua igual:
- Carlos Clemente: `carlos1234`
- Salomao: `salomao1234`

A fase atual prepara a sincronizacao, mas nao ativa gravacao remota automaticamente. O motivo e que as policies de RLS de `shift_sessions` e `audit_logs` dependem de `auth.uid()`. Apenas configurar o UUID em env nao cria uma sessao Supabase Auth nem assina as requisicoes.

Sem sessao Supabase Auth real, o app mantem fallback local em `localStorage` e os guardas veem apenas mensagens operacionais simples.

## Checklist manual

1. Criar usuarios reais no Supabase Auth para Carlos Clemente e Salomao, se ainda nao existirem.
2. Copiar os UUIDs desses usuarios.
3. Configurar no Vercel:
   - `VITE_GUARD_CARLOS_USER_ID`
   - `VITE_GUARD_SALOMAO_USER_ID`
4. Confirmar que `VITE_DB_URL` e `VITE_DB_PUBLIC_KEY` estao configurados.
5. Fazer redeploy do app.
6. Abrir `Painel Tezzei > Seguranca > Guardas` e verificar o diagnostico.
7. So considerar a sincronizacao remota ativa quando o diagnostico mostrar uma sessao Supabase Auth real.
8. Testar ativacao e encerramento de turno.
9. Confirmar registros nas tabelas `shift_sessions` e `audit_logs`.

## Bloqueio seguro

Nao usar `service_role` no frontend.

Nao abrir RLS para escrita anonima.

Nao criar tabela duplicada de usuarios.

Para sincronizacao real mantendo a tela de login local, sera necessaria uma ponte segura que gere ou forneca uma sessao Supabase Auth sem expor segredo no cliente. Opcoes seguras para uma proxima fase:
- autenticar Carlos e Salomao em Supabase Auth por um fluxo server-side;
- criar uma Edge Function que valide a identidade no servidor e use segredo somente no ambiente Supabase;
- ou migrar, em etapa aprovada pelo usuario, o login dos guardas para Supabase Auth.
