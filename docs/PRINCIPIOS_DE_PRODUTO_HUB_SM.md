# Princípios de Produto — HUB SM / Tezzei

Este documento é uma regra permanente para qualquer pessoa ou IA que projete, desenvolva, revise ou corrija o HUB SM.

## Papel do arquiteto

O usuário apresenta necessidades, ideias, problemas e experiências reais da operação. O responsável técnico deve transformar isso em uma solução de produto viável, simples e sustentável.

Antes de executar, deve avaliar:

- qual problema real será resolvido;
- quem usará a função;
- com que frequência será usada;
- qual é o menor fluxo capaz de gerar o resultado;
- quais erros o usuário pode cometer;
- quais dados precisam ser registrados;
- quais dados podem ficar escondidos;
- quais efeitos a ação terá em estoque, histórico, permissões, auditoria e outros módulos;
- se a solução reduz trabalho ou apenas cria complexidade;
- se a solução poderá evoluir para um produto comercial.

Quando houver uma alternativa mais simples e segura do que a ideia inicial, a solução melhor deve ser apresentada e executada.

## Regras obrigatórias de experiência

1. Uma tela deve ter uma tarefa principal clara.
2. Mostrar apenas a informação necessária para a etapa atual.
3. Detalhes técnicos e exceções devem ficar em “Mais detalhes”, histórico ou auditoria.
4. Usar valores padrão e preenchimento automático sempre que forem seguros.
5. Pedir confirmação apenas para ações importantes, destrutivas ou irreversíveis.
6. Evitar campos que o sistema consegue calcular.
7. Evitar repetir a mesma informação em vários lugares da tela.
8. Textos devem explicar o que a pessoa precisa fazer, não como o banco de dados funciona.
9. O fluxo principal precisa funcionar bem no celular.
10. O usuário operacional não deve precisar entender a arquitetura do sistema.

## Regra de simplicidade

Antes de liberar uma função, responder:

- é fácil entender sem treinamento?
- a primeira ação está óbvia?
- cada campo é realmente necessário?
- existe algum dado que pode ser calculado?
- existe algum detalhe que pode ficar escondido?
- a tela funciona com uma mão no celular?
- o usuário consegue corrigir um erro sem perder tudo?
- o resultado da ação fica rastreável?

Se a resposta for negativa, o fluxo deve ser redesenhado antes da publicação.

## Regra de ação

Nenhum relatório, diagnóstico ou sugestão deve ser entregue sem uma próxima ação definida, exceto quando o usuário pedir apenas análise.

Toda entrega técnica deve informar:

1. O que aconteceu.
2. O que o usuário precisa fazer agora.
3. Qual resultado deve aparecer.

## Regra do Mapa Mestre

- Cada quadro representa uma tela ou card realmente visível no aplicativo.
- Botões que abrem telas apontam para outro quadro.
- Ações internas ficam dentro de “Ver ação”.
- Componentes internos, filas, tabelas e rotinas técnicas não viram quadros visíveis.
- O mapa deve refletir o produto real, não uma arquitetura imaginada.

## Regra de testes e correções

- Registrar todo teste não executado, erro encontrado, limitação e dúvida operacional.
- Não gastar uma rodada do Codex para cada pequeno ajuste.
- Consolidar correções relacionadas em um único pacote com evidências e critérios de aceite.
- Não afirmar que algo foi testado quando não foi.
- Diferenciar: implementado, validado, testado manualmente, testado automaticamente e pendente.

## Uso de outras IAs

Consultar Claude, DeepSeek, Manus, Perplexity, Grok ou Gemini somente quando houver ganho real, por exemplo:

- decisão de arquitetura com alto impacto;
- dúvida técnica sem resposta confiável;
- comparação de abordagens complexas;
- pesquisa atualizada de mercado, segurança ou legislação;
- revisão independente de um fluxo crítico.

Quando uma segunda opinião for útil, entregar ao usuário um prompt pronto, com contexto, pergunta e formato de resposta esperado.

## Visão de produto

O HUB SM deve nascer da operação real da Santa Maria, mas ser projetado para no futuro se tornar um produto utilizável por outras empresas.

Toda função deve buscar:

- simplicidade operacional;
- rastreabilidade;
- segurança;
- flexibilidade de configuração;
- separação entre regra específica da Santa Maria e regra reutilizável;
- capacidade de evolução sem reconstruir todo o sistema.
