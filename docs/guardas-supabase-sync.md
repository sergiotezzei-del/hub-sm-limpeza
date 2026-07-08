# Sincronizacao Supabase dos guardas

## Situacao atual

O login local continua igual:
- Carlos Clemente: `carlos1234`
- Salomao: `salomao1234`

A fase 2.2 cria uma ponte discreta com Supabase Auth. Depois que Carlos ou Salomao passa pelo login local, o app tenta criar uma sessao Supabase Auth com `supabase.auth.signInWithPassword`, usando o email tecnico configurado em env e a mesma senha digitada no login local.

Nao existe novo campo de login, nao existe pedido de email para o guarda e nao existe `service_role` no frontend.

Se as envs ou os usuarios do Supabase Auth ainda nao existirem, o app mantem fallback local em `localStorage`. Os guardas veem apenas mensagens simples, e as pendencias aparecem no diagnostico tecnico do Painel Tezzei.

## Envs obrigatorias para sincronizacao real

Configurar no Vercel:
- `VITE_DB_URL`
- `VITE_DB_PUBLIC_KEY`
- `VITE_GUARD_CARLOS_AUTH_EMAIL`
- `VITE_GUARD_SALOMAO_AUTH_EMAIL`
- `VITE_GUARD_CARLOS_USER_ID`
- `VITE_GUARD_SALOMAO_USER_ID`

As envs de email sao usadas somente para iniciar a sessao Supabase Auth. As senhas nao ficam em env; o app usa a senha que o guarda digitou no login local.

## Checklist manual

1. Criar usuarios reais no Supabase Auth para Carlos Clemente e Salomao, se ainda nao existirem.
2. Definir para esses usuarios as mesmas senhas locais aprovadas: `carlos1234` e `salomao1234`.
3. Copiar os UUIDs desses usuarios.
4. Configurar as envs `VITE_GUARD_CARLOS_AUTH_EMAIL`, `VITE_GUARD_SALOMAO_AUTH_EMAIL`, `VITE_GUARD_CARLOS_USER_ID` e `VITE_GUARD_SALOMAO_USER_ID`.
5. Fazer redeploy do app.
6. Entrar como Carlos ou Salomao pelo login local normal.
7. Abrir `Painel Tezzei > Seguranca > Guardas` e verificar o diagnostico.
8. Testar ativacao e encerramento de turno.
9. Confirmar registros nas tabelas `shift_sessions` e `audit_logs`.

## Regras de seguranca

Nao usar `service_role` no frontend.

Nao abrir RLS para escrita anonima.

Nao duplicar usuarios locais nem criar tabela `guards`.

A gravacao remota so deve acontecer quando houver sessao Supabase Auth real e o UUID autenticado conferir com `VITE_GUARD_CARLOS_USER_ID` ou `VITE_GUARD_SALOMAO_USER_ID`.
