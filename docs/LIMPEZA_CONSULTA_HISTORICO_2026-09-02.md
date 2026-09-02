# Limpeza — consulta de histórico

## Objetivo

Adicionar no menu Gestão de Limpeza um acesso simples para responder perguntas sobre consumo e compras usando os registros já existentes.

## Exemplos

- Quanto de detergente gastamos nos últimos 10 dias?
- Quanto de detergente gastamos entre as últimas duas conferências?
- Quanto de álcool compramos no último pedido?
- Quanto de álcool compramos no último mês?
- Quanto de álcool compramos nas últimas 2 compras?

## Regras

- Consumo estimado entre conferências = contagem inicial + entradas registradas − contagem final.
- Saídas registradas são exibidas separadamente para permitir conferência de divergências.
- Compras usam somente pedidos da Néia com status `Pedido feito`.
- Pedidos `Novo` e pedidos excluídos não entram no total comprado.
- Pedido feito não é tratado como recebimento físico. Entrada física continua dependendo de movimentação `entrada`.
- A consulta não altera estoque, pedidos ou conferências.
- Históricos de conferências, movimentações e pedidos são exigidos online; falha de leitura impede resposta silenciosa com dados históricos incompletos.

## Integração

A funcionalidade é montada por `CleaningConsumptionEnhancer` no grid do menu Gestão de Limpeza, seguindo o padrão de enhancers já usado pelo projeto. Isso evita alterar o `App.tsx` e reduz conflito com outros módulos.
