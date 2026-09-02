# Validação — consulta de histórico da Limpeza

Critérios antes do merge:

- branch criada diretamente da `main` atual;
- sem alterações no `App.tsx` ou na central de alertas;
- card aparece somente quando o menu Gestão de Limpeza está montado;
- consulta abre em tela sobreposta e retorna ao menu sem alterar o estado do HUB;
- consumo e compras são tratados como intenções distintas;
- pedidos `Novo` e excluídos não contam como compra;
- build Vercel precisa concluir em `READY` antes do merge;
- nenhuma escrita em estoque, pedidos ou conferências é realizada pela consulta.
