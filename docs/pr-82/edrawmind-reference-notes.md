# Referências visuais do EdrawMind para o PR #82

Este arquivo registra requisitos aprovados a partir das referências visuais enviadas pelo usuário.

## 1. Painel lateral de organização

O HUB SM deve adotar um painel lateral inspirado na lógica do EdrawMind, mas mantendo a identidade visual do HUB.

Seções previstas:

- **Organização**
  - Livre / Manual
  - Horizontal
  - Vertical
  - Mapa mental balanceado
  - Árvore horizontal
  - Árvore vertical

- **Espaçamento**
  - Horizontal
  - Vertical
  - Presets: Compacto, Confortável e Amplo

- **Alinhamento**
  - alinhar à esquerda
  - centralizar horizontalmente
  - alinhar à direita
  - alinhar ao topo
  - centralizar verticalmente
  - alinhar à base
  - distribuir horizontalmente
  - distribuir verticalmente
  - usar um quadro selecionado como referência

- **Quadro**
  - densidade Compacta ou Detalhada
  - formato retangular ou arredondado
  - preenchimento
  - cor da borda
  - espessura e estilo da borda
  - largura por preset
  - contraste automático do texto

- **Ramificação / Conectores**
  - posição de entrada e saída da linha: esquerda, direita, topo ou base
  - orientação automática conforme layout
  - opção de ajuste manual por quadro
  - estilos de conexão controlados
  - nenhuma mudança na semântica das relações

## 2. Cores

Permitir edição de cores dos quadros, porém com controle para evitar poluição visual.

- oferecer paleta oficial do HUB SM;
- permitir cor personalizada validada em formato hexadecimal;
- editar preenchimento e borda;
- texto deve usar contraste automático;
- não incluir fontes livres, sombras arbitrárias ou gradientes neste PR.

Persistência preferencial em `metadata` do nó, sem migration apenas para estilo, salvo necessidade técnica comprovada.

Sugestão de estrutura:

```ts
visualStyle?: {
  fillColor?: string;
  borderColor?: string;
  shape?: 'RECTANGLE' | 'ROUNDED';
  borderStyle?: 'SOLID' | 'DASHED';
  borderWidth?: 1 | 2 | 3;
  widthPreset?: 'COMPACT' | 'STANDARD' | 'WIDE';
  sourcePosition?: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'AUTO';
  targetPosition?: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'AUTO';
}
```

## 3. Alinhamento relativo

O usuário deve poder selecionar dois ou mais quadros e usar um quadro como referência.

Fluxo:

1. Selecionar múltiplos quadros.
2. Definir o quadro de referência.
3. Escolher alinhamento ou distribuição.
4. Mostrar prévia sem persistir.
5. Aplicar ou cancelar.
6. Salvar posições em lote.
7. Permitir desfazer.

Critério: alinhamento não pode causar sobreposição; quando houver risco de colisão, avisar e impedir aplicação ou ajustar com espaçamento mínimo.

## 4. Mapa de árvore

Além de Horizontal, Vertical e Mapa mental balanceado, incluir:

- **Árvore horizontal**: raiz à esquerda, níveis à direita.
- **Árvore vertical**: raiz no topo, níveis abaixo.

Os layouts devem respeitar `BELONGS_TO` como estrutura hierárquica.

Relações operacionais continuam opcionais pela visualização de conexões.

## 5. Handles e linhas

Hoje os handles são fixos na esquerda e direita. O PR #82 deve permitir:

- automático por layout;
- manual por quadro;
- entrada e saída independentes;
- esquerda, direita, topo e base;
- mapa mental balanceado com orientação invertida nos ramos à esquerda;
- árvore vertical usando topo/base;
- árvore horizontal usando esquerda/direita.

Ao mudar orientação, atualizar as arestas sem alterar `source_node_id`, `target_node_id` ou `relation_type`.

## 6. Escopo visual controlado

O PR #82 pode editar:

- layout;
- posição;
- alinhamento;
- espaçamento;
- densidade;
- forma;
- preenchimento;
- borda;
- posição dos handles;
- estilo das conexões dentro de opções pré-definidas.

Fora do escopo:

- fontes livres;
- gradientes;
- sombras personalizadas;
- whiteboard livre;
- criação rápida Enter/Tab;
- F2;
- IA;
- módulos operacionais.

## 7. Critérios adicionais de aceite

1. Selecionar três quadros e alinhar pelo topo usando um quadro como referência.
2. Distribuir quatro quadros verticalmente com espaçamento mínimo.
3. Alterar preenchimento e borda de um quadro e manter após reload.
4. Alterar source para topo e target para base e verificar a conexão.
5. Layout Árvore horizontal sem sobreposição.
6. Layout Árvore vertical sem sobreposição.
7. Mapa mental balanceado com ramos esquerda/direita corretos.
8. Cancelar prévia restaura posições e estilos anteriores.
9. Aplicar salva posições e estilos de forma consistente.
10. Mobile continua usando cards compactos e conexões legíveis.
