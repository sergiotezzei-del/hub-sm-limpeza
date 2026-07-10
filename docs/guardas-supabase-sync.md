# Sincronizacao Supabase dos guardas

## Situacao atual

O login local continua igual:
- Admin Tezzei: `1234`
- Carlos Clemente: `carlos1234`
- Salomao: `salomao1234`

A fase 2.2 cria uma ponte discreta com Supabase Auth. Depois que Admin, Carlos ou Salomao passa pelo login local, o app tenta criar uma sessao Supabase Auth com `supabase.auth.signInWithPassword`, usando o email tecnico configurado em env e a mesma senha digitada no login local.

Nao existe novo campo de login, nao existe pedido de email para o Admin ou guarda e nao existe `service_role` no frontend.

Se as envs ou os usuarios do Supabase Auth ainda nao existirem, o app mantem fallback local em `localStorage`. Os guardas veem apenas mensagens simples, e as pendencias aparecem no diagnostico tecnico do Painel Tezzei.

## Envs obrigatorias para sincronizacao real

Configurar no Vercel:
- `VITE_DB_URL`
- `VITE_DB_PUBLIC_KEY`
- `VITE_ADMIN_AUTH_EMAIL`
- `VITE_ADMIN_USER_ID`
- `VITE_GUARD_CARLOS_AUTH_EMAIL`
- `VITE_GUARD_SALOMAO_AUTH_EMAIL`
- `VITE_GUARD_CARLOS_USER_ID`
- `VITE_GUARD_SALOMAO_USER_ID`

As envs de email sao usadas somente para iniciar a sessao Supabase Auth. As senhas nao ficam em env; o app usa a senha que o guarda digitou no login local.

## Checklist manual

1. Criar um usuario real no Supabase Auth para Admin/Tezzei, se ainda nao existir.
2. Usar um email tecnico, por exemplo `admin@hubsm.local`, e manter a senha local aprovada `1234`.
3. No usuario Auth do Admin, configurar `app_metadata` com papel administrativo:
   ```json
   { "role": "admin" }
   ```
   Se a politica RLS atual usar permissoes por lista, tambem pode ser usado:
   ```json
   { "permissions": ["painel-admin"] }
   ```
4. Copiar o UUID do usuario Auth do Admin.
5. Configurar as envs `VITE_ADMIN_AUTH_EMAIL` e `VITE_ADMIN_USER_ID`.
6. Criar usuarios reais no Supabase Auth para Carlos Clemente e Salomao, se ainda nao existirem.
7. Definir para esses usuarios as mesmas senhas locais aprovadas: `carlos1234` e `salomao1234`.
8. Copiar os UUIDs desses usuarios.
9. Configurar as envs `VITE_GUARD_CARLOS_AUTH_EMAIL`, `VITE_GUARD_SALOMAO_AUTH_EMAIL`, `VITE_GUARD_CARLOS_USER_ID` e `VITE_GUARD_SALOMAO_USER_ID`.
10. Fazer redeploy do app.
11. Entrar como Admin Tezzei pelo login local normal em um PC e em um celular.
12. Abrir `Painel Tezzei > Seguranca > Guardas` e verificar:
    - `Sessao Supabase Auth atual`: Sim.
    - `Usuario Auth atual`: Admin.
    - `Leitura remota do historico`: Liberada.
13. Entrar como Carlos ou Salomao pelo login local normal.
14. Testar ativacao e encerramento de turno.
15. Confirmar registros nas tabelas `shift_sessions` e `audit_logs`.

## Regras de seguranca

Nao usar `service_role` no frontend.

Nao abrir RLS para escrita anonima nem leitura anonima do historico.

Nao duplicar usuarios locais nem criar tabela `guards`.

A leitura administrativa do historico remoto deve acontecer com sessao Supabase Auth real do Admin e RLS permitindo o papel definido em `app_metadata`.

A gravacao remota so deve acontecer quando houver sessao Supabase Auth real e o UUID autenticado conferir com `VITE_GUARD_CARLOS_USER_ID` ou `VITE_GUARD_SALOMAO_USER_ID`.
