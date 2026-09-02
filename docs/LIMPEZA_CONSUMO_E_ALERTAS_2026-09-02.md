# Limpeza: consulta de consumo e alertas

## Resultado esperado

- Em Limpeza → Consultar consumo, perguntar pelo nome cadastrado do produto e pelos últimos N dias, duas datas com ano, últimas duas conferências ou últimos dois pedidos.
- A opção recolhida “Escolher produto e período” permite selecionar datas e registros específicos.
- A resposta mostra saídas para uso, entradas registradas e, quando há duas contagens válidas da Neia, uma estimativa entre essas contagens.
- Os registros que fundamentam a resposta ficam recolhidos em “Ver registros usados no cálculo”.
- No painel, o card de conferência tem VER CONFERÊNCIA e FEITO. A confirmação já existente no servidor impede seu retorno após atualização.
- Google Agenda ocupa o primeiro espaço dos cards, inclusive após remontagem ou atualização do painel.

## Regras do cálculo

- Saída para uso soma apenas movimentações `saida` do produto selecionado; pedidos e ajustes não são saídas.
- Estimativa = contagem inicial + entradas registradas − contagem final. Não subtrair as saídas novamente dessa fórmula.
- Diferença a conferir = estimativa − saídas registradas no mesmo intervalo.
- Ajustes no intervalo, unidades incompatíveis, contagens ambíguas ou saldo crescente sem entradas suficientes impedem uma estimativa confiável.
- Pedidos servem como referência de datas. Status de pedido feito não comprova recebimento.
- Dias são calculados no fuso de São Paulo. Últimos N dias incluem hoje até a consulta. Datas completas incluem todo o dia final, ou até agora quando o fim é hoje.
- Intervalos entre conferências/pedidos excluem o instante inicial e incluem o final.
- Uma comparação entre conferências dentro de um período maior mostra suas próprias datas; não é apresentada como consumo estimado de todo o período escolhido.
- A consulta exige leitura online completa das fontes. Uma falha não produz resposta baseada silenciosamente no cache local.
- Nenhuma consulta altera estoque, pedidos ou conferências. FEITO confirma somente o aviso pelo RPC existente, com as mesmas permissões administrativas.

## Validação

- `node --test tools/cleaning/*.test.mjs`: 20 testes automatizados, incluindo limites de datas, divergências, entradas, ajustes, ausência de histórico, identificação do produto e alertas já confirmados.
- `pnpm build`: TypeScript e compilação de produção aprovados. Permanecem avisos existentes sobre tamanho dos pacotes e diretivas de dependências.
- Revisão dos componentes React: efeitos com cancelamento, proteção contra retorno de consulta anterior à confirmação, erros visíveis, controles nativos rotulados e detalhes recolhidos.
- Conferência visual e clique autenticado no navegador: não executados; a sessão disponível abriu no login e o acesso ao servidor local foi bloqueado. Não houve criação de operações de teste no banco real.
