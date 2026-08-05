# Arquitetura — Chamados públicos do HUB Santa Maria

## Objetivo

Permitir que qualquer pessoa da Imobiliária Santa Maria abra uma solicitação para o Tezzei sem possuir usuário no HUB e sem ter acesso às demais páginas do sistema.

## Link público

`https://hubsantamariatem.vercel.app/chamados`

A rota pública deve renderizar somente o formulário de abertura. Ela não deve carregar o painel, usuários, pedidos, estoque ou qualquer dado administrativo.

## Formulário público

Campos obrigatórios:

1. Nome da pessoa
2. Setor
3. O que precisa
4. Botão Enviar chamado

Após o envio, mostrar:

- confirmação;
- protocolo;
- data e hora de abertura;
- botão Abrir outro chamado.

Não mostrar lista de chamados nem link para o painel administrativo.

## Setores iniciais

- Administração
- Diretoria
- Infraestrutura
- Manutenção
- Limpeza
- Copa / Café
- Segurança
- Recepção
- Financeiro
- Contratos
- Locação
- Vendas
- Marketing
- Jurídico
- Compras / Estoque
- Patrimônio
- Outro

A lista deve ficar centralizada e reutilizável.

## Painel administrativo

Card `Chamados` no menu Gestão do Admin Tezzei.

A tela deve possuir:

- métricas de Novos, Em andamento, Aguardando e Concluídos;
- lista ordenada por abertura, mais recentes primeiro;
- protocolo;
- nome e setor;
- descrição completa;
- data e hora em America/Sao_Paulo;
- filtro por status e setor;
- ações para Iniciar, Aguardar, Concluir, Reabrir e Cancelar;
- observação administrativa opcional;
- histórico de status.

## Estados

- novo
- em_andamento
- aguardando
- concluido
- cancelado

## Banco

### service_requests

Estado atual do chamado.

### service_request_events

Histórico imutável de criação e mudanças de status.

## Segurança

- `anon` não pode consultar, atualizar ou excluir tabelas;
- abertura pública ocorre somente por RPC dedicada;
- RPC valida tamanho dos campos e lista de setores;
- identificador de envio garante idempotência contra toque duplo;
- RPC retorna somente protocolo, id e data de abertura;
- leitura e gestão exigem sessão Supabase Auth do Admin;
- RLS baseada em `public.is_hub_admin()`;
- funções internas de gatilho não podem ser executadas diretamente pela API;
- nenhum dado de outros chamados é retornado ao solicitante.

## Fora do MVP

- anexos;
- comentários entre solicitante e atendente;
- WhatsApp;
- e-mail;
- SLA automático;
- categorias e subcategorias;
- avaliação de atendimento;
- consulta pública do andamento.
