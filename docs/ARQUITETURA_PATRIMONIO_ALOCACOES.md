# Patrimônio e Alocações — Arquitetura Oficial

## Objetivo

O módulo deve responder com rapidez:

1. Quem está com cada equipamento?
2. Quais equipamentos estão guardados e em qual quantidade?
3. Quem ocupa cada mesa, gaveta ou locker?
4. Onde está cada chave vinculada a esses espaços?

O módulo não é contabilidade patrimonial e não é um sistema de controle de acesso.

## Estrutura operacional

```text
Patrimônio e Alocações
├── Pessoas
├── Itens individuais
├── Itens controlados por quantidade
├── Entrega e devolução
├── Mesas, gavetas e lockers
└── Histórico
```

## Conceitos

### Pessoas

Cadastro único para funcionários, corretores e consultores terceirizados, prestadores, temporários e outros usuários físicos.

Uma pessoa pode existir sem possuir login no HUB. Quando houver usuário correspondente, o vínculo com `managed_users` é opcional.

### Itens individuais

Usar quando o bem precisa ser identificado separadamente:

- notebook;
- celular;
- telefone;
- monitor;
- impressora;
- equipamento de rede;
- chave de gaveta ou locker;
- qualquer item com etiqueta ou número de série.

A quantidade de um item individual é sempre 1.

### Itens por quantidade

Usar quando o resultado importante é saber quantos estão guardados e quantos foram distribuídos:

- mouse novo;
- teclado novo;
- carregador;
- headset;
- adaptador;
- periféricos equivalentes.

Não cadastrar dezenas de unidades idênticas separadamente sem necessidade operacional.

### Espaços

Mesas, lockers, gavetas, salas e estoques são espaços ocupáveis ou localizações. Não são tratados como notebooks ou periféricos.

Uma chave pode ser cadastrada como item individual e vinculada ao espaço correspondente.

## Modelo de dados

- `organization_people`: diretório operacional de pessoas.
- `patrimony_items`: itens individuais ou controlados por quantidade.
- `patrimony_assignments`: entregas e devoluções de itens.
- `patrimony_spaces`: mesas, lockers, gavetas, salas e estoques.
- `patrimony_space_assignments`: ocupação e liberação de espaços.
- `patrimony_movements`: histórico imutável das operações.

## Regras obrigatórias

- Uma entrega não pode ultrapassar a quantidade disponível.
- Um item individual só pode ser entregue em quantidade 1.
- Repetir a mesma operação não pode descontar novamente.
- Reutilizar o mesmo identificador com dados diferentes deve falhar.
- Devolução pode ser classificada como bom estado, danificado ou perdido.
- Um espaço só pode ter uma ocupação ativa por vez.
- Usuário comum não pode ler nem alterar dados patrimoniais.
- As operações precisam de sessão Supabase Auth válida com perfil de administrador.
- Histórico não pode ser alterado diretamente pela interface.

## Primeira interface operacional

A primeira versão terá cinco áreas dentro de uma única tela/módulo:

1. Visão geral.
2. Pessoas.
3. Itens.
4. Entregar ou devolver.
5. Espaços e histórico.

A ação principal deve exigir no máximo:

```text
Pessoa → Item → Quantidade → Confirmar
```

Na devolução:

```text
Entrega ativa → Quantidade → Estado → Confirmar
```

## Lockers

Foram preparados 72 lockers, de `LKR-001` a `LKR-072`.

A interface inicial deve usar grade simples com:

- número;
- livre ou ocupado;
- pessoa atual;
- ação atribuir ou liberar.

Sem arrastar e soltar na primeira versão.

## Mesas da Locação

Não cadastrar mesas fictícias.

O cadastro e o mapa serão feitos depois do levantamento real, contendo:

- código de cada mesa;
- posição real;
- ocupante atual;
- gaveta vinculada;
- chave vinculada;
- localização atual da chave.

O banco já possui campos percentuais de posição e dimensão para permitir um mapa futuro sem alterar o modelo.

## Fora do escopo inicial

- RFID, NFC ou sensores;
- reconhecimento facial integrado;
- QR Code obrigatório;
- planta completa de todos os setores;
- drag-and-drop;
- depreciação e controle contábil;
- aprovações em várias etapas;
- funcionamento offline;
- fotos obrigatórias;
- relatórios complexos.

## Dados iniciais já preparados

- oito pessoas importadas dos usuários existentes do HUB;
- um espaço `ESTOQUE-PATRIMONIO`;
- 72 lockers;
- nenhum item patrimonial inventado;
- nenhuma mesa da Locação inventada.

## Próximos dados necessários da operação

1. Relação inicial de funcionários, consultores e corretores que não possuem login no HUB.
2. Lista física dos equipamentos e periféricos guardados.
3. Identificação dos equipamentos já entregues.
4. Numeração real e posição das mesas da Locação.
5. Situação das chaves de gaveta e lockers.
