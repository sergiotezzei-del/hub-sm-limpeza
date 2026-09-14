# Inventário de Notebooks — estudo antes da implementação

## Objetivo
Criar um fluxo operacional para inventariar todos os notebooks da Santa Maria, com contagem exata por equipamento, vínculo individual a uma pessoa, setor e equipe, sem duplicar o módulo de Patrimônio.

## Decisão de arquitetura
O inventário de notebooks será implementado sobre a estrutura existente de Patrimônio:

- `organization_people`: pessoa responsável, setor e equipe;
- `patrimony_items`: notebook individual, marca, modelo, série e código patrimonial;
- `patrimony_assignments`: vínculo notebook → pessoa;
- `patrimony_movements`: histórico de entrega/devolução/transferência.

Não será criada tabela paralela de notebooks.

## Regras
1. Cada notebook é um patrimônio individual (`tracking_mode = individual`).
2. Um notebook só conta como vinculado quando existe uma entrega ativa para uma pessoa.
3. A quantidade exata será calculada pelos registros individuais, nunca digitada como total manual.
4. Setor e equipe são informações diferentes.
5. Número de série deve ser único quando informado.
6. O sistema deve permitir notebook sem responsável para equipamentos em estoque/reserva.
7. Mudança de responsável deve preservar histórico.
8. Não inventar quantidade física nem modelo que ainda não foram conferidos.

## Estrutura inicial de setores/equipes conhecida
- Vendas: equipes Fernando, Fabio, Peres, Cacilda, Angela e Andreia.
- Locação: Ramzy e Adriana.
- Contratos: gestão de Priscila.
- Encerramento / SAC / Boletos: Julio.
- Cadastro: Zé Alberto.
- Financeiro: Eliane.
- Recepção: equipe a identificar durante a conferência física.

## Critério para main
Somente depois de:
- build sem erro;
- tela responsiva;
- teste de cadastro de pessoa, notebook e vínculo;
- teste de equipamento sem responsável;
- teste dos filtros por setor/equipe;
- confirmação de que os módulos atuais de Patrimônio continuam funcionando.
