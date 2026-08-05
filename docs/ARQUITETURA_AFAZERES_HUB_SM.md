# Arquitetura do módulo Afazeres — HUB Santa Maria

## Objetivo

Criar um quadro operacional simples, inspirado no Trello, para organizar o trabalho diário de Sérgio Tezzei dentro do HUB Santa Maria.

O módulo deve responder rapidamente:

1. O que precisa ser feito?
2. O que já está em andamento?
3. O que depende de outra pessoa ou fornecedor?
4. O que foi concluído?
5. O que está atrasado?

## Escopo da primeira versão

### Colunas fixas

- A fazer
- Em andamento
- Aguardando
- Concluído

### Dados de cada tarefa

- título obrigatório;
- descrição opcional;
- prioridade: baixa, média, alta ou urgente;
- setor/área;
- responsável, vinculado a `managed_users`;
- prazo opcional;
- posição dentro da coluna;
- criador;
- data de conclusão;
- arquivamento lógico;
- datas de criação e atualização.

### Operações

- criar tarefa;
- editar tarefa;
- mover entre colunas;
- concluir e reabrir;
- arquivar;
- filtrar por responsável, atraso e setor;
- consultar histórico de mudanças.

## Decisões de produto

- O módulo aparece como card direto em `Gestão`.
- Não haverá comentários, subtarefas, anexos, dependências ou automações nesta fase.
- Arrastar e soltar não será a única forma de movimentação. Cada cartão terá comandos claros para funcionar bem no celular.
- Tarefas não serão apagadas fisicamente; serão arquivadas.
- A tela será mobile-first.
- Em celular, uma coluna será exibida por vez por meio de abas.
- Em telas maiores, as quatro colunas serão exibidas lado a lado.
- Tarefas concluídas continuam visíveis até serem arquivadas.

## Segurança e permissões

A primeira versão operacional é restrita ao Admin Tezzei porque os demais usuários gerenciados ainda não possuem uma sessão Supabase Auth individual.

As tarefas podem apontar para qualquer usuário ativo de `managed_users`, mas apenas o Admin autenticado poderá criar, editar, mover e arquivar nesta fase.

O banco usa RLS com `public.is_hub_admin()`.

Uma futura liberação para a equipe deverá acontecer somente após existir autenticação individual segura para os usuários gerenciados.

## Modelo de dados

### `hub_tasks`

Armazena o estado atual de cada tarefa.

Campos principais:

- `id`;
- `title`;
- `description`;
- `status`;
- `priority`;
- `department`;
- `assignee_user_id`;
- `due_date`;
- `sort_order`;
- `source_module`;
- `created_by_user_id`;
- `created_by_name`;
- `last_actor_name`;
- `completed_at`;
- `archived_at`;
- `created_at`;
- `updated_at`.

### `hub_task_events`

Histórico imutável das ações.

Eventos previstos:

- criação;
- edição;
- mudança de status;
- conclusão;
- reabertura;
- arquivamento.

O histórico é criado por trigger no banco para não depender do navegador concluir duas gravações separadas.

## Regras

- Título não pode ficar vazio.
- Prazo é opcional.
- Uma tarefa é atrasada quando o prazo passou e o status não é `concluido`.
- Ao entrar em `concluido`, `completed_at` é preenchido automaticamente.
- Ao sair de `concluido`, `completed_at` volta a ser nulo.
- Arquivamento não altera o histórico.
- O responsável deve existir em `managed_users`.

## Interface

### Cabeçalho

- título `Afazeres`;
- resumo: pendentes, atrasadas e concluídas;
- botão `Nova tarefa`.

### Filtros

- todas;
- minhas;
- atrasadas;
- responsável;
- setor.

### Cartão

- prioridade;
- título;
- responsável;
- setor;
- prazo;
- indicação de atraso;
- botão anterior;
- botão avançar;
- editar;
- arquivar.

## Fora do escopo

- comentários;
- checklists/subtarefas;
- arquivos e fotos;
- notificações;
- WhatsApp;
- calendário completo;
- automações por eventos dos outros módulos;
- dependência entre tarefas;
- múltiplos quadros;
- drag-and-drop como única navegação.

## Critérios de aceite

1. Admin abre o módulo pelo menu Gestão.
2. Admin cria uma tarefa e ela aparece em A fazer.
3. Admin move a tarefa sem recarregar a página.
4. Conclusão preenche a data automaticamente.
5. Reabertura limpa a data de conclusão.
6. Prazo vencido aparece como atrasado.
7. Filtros funcionam no celular e no computador.
8. Histórico registra criação, edição, movimentação e arquivamento.
9. Usuário sem permissão não vê o card.
10. Build, preview e produção não apresentam erro de runtime.
