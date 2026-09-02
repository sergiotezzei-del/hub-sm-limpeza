# Limpeza: consulta de consumo, compras e alertas

## Resultado esperado

- Em Limpeza → Consultar consumo, a tela passa a funcionar como consulta do histórico da Limpeza.
- A pergunta pode ser feita em linguagem simples pelo nome cadastrado do produto.
- Perguntas com “gastamos”, “consumimos” ou equivalentes consultam consumo.
- Perguntas com “compramos”, “pedimos” ou equivalentes consultam as quantidades registradas nos pedidos da Neia.
- Exemplos suportados: “Quanto de detergente gastamos nos últimos 10 dias?”, “Quanto de detergente gastamos entre as últimas duas conferências?”, “Quanto de álcool compramos no último pedido?” e “Quanto de álcool compramos no último mês?”.
- Para consumo, é possível usar últimos N dias, duas datas com ano, últimas duas conferências ou intervalo entre os últimos pedidos feitos.
- Para compras, é possível usar último pedido, últimas N compras, últimos N dias ou duas datas com ano.
- A opção recolhida “Escolher produto e período” permite fazer a mesma consulta sem escrever a pergunta.
- Os registros que fundamentam a resposta ficam recolhidos para conferência.
- No painel, o card de conferência tem VER CONFERÊNCIA e FEITO. A confirmação já existente no servidor impede seu retorno após atualização.
- Google Agenda ocupa o primeiro espaço dos cards, inclusive após remontagem ou atualização do painel.

## Regras do cálculo

- Consumo não é a mesma coisa que compra.
- Saída para uso soma apenas movimentações `saida` do produto selecionado; pedidos e ajustes não são saídas.
- Quando existem duas contagens válidas da Neia: consumo estimado = contagem inicial + entradas registradas − contagem final.
- Diferença a conferir = consumo estimado − saídas registradas no mesmo intervalo.
- Ajustes no intervalo, unidades incompatíveis, contagens ambíguas ou saldo crescente sem entradas suficientes impedem uma estimativa confiável.
- Para consulta de compras, são considerados somente pedidos com status `Pedido feito`, não pedidos ainda `Novo` nem pedidos excluídos.
- A quantidade comprada/pedida é a soma da quantidade do produto escrita nesses pedidos; isso não comprova recebimento físico no estoque.
- Entradas físicas continuam sendo reconhecidas somente pelas movimentações `entrada` do estoque.
- Dias são calculados no fuso de São Paulo. “Último mês” é tratado como os últimos 30 dias, incluindo hoje até o momento da consulta.
- Intervalos entre conferências/pedidos excluem o instante inicial e incluem o final.
- Uma comparação entre conferências dentro de um período maior mostra suas próprias datas; não é apresentada como consumo estimado de todo o período escolhido.
- A consulta exige leitura online completa das fontes. Uma falha não produz resposta baseada silenciosamente no cache local.
- Nenhuma consulta altera estoque, pedidos ou conferências. FEITO confirma somente o aviso pelo RPC existente, com as mesmas permissões administrativas.

## Validação

- A suíte de testes da consulta foi ampliada para cobrir consumo, último pedido, últimas compras e compras em período mensal.
- O preview Vercel da branch compilou com sucesso após a inclusão da consulta de compras.
- A compilação valida TypeScript e o build de produção; teste manual autenticado com dados reais ainda deve ser feito antes do merge.
- Não houve criação de movimentações, pedidos ou conferências de teste no estoque real.
