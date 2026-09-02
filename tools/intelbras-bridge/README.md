# Agente local Intelbras AMT 8000 LITE

Baseado no SDK/API oficial entregue pela Intelbras em 31/08/2026 e nos testes reais feitos na central Santa Maria.

## Estado desta fase

A etapa atual é estritamente **somente leitura**. O que está permitido no código executável desta ponte:

- `F0F0` - `AUTENTICA_CONEXAO_REMOTA`;
- `F0F7` - `KEEP_ALIVE`;
- `3900` - `BUFFER_EVENTOS`, usado como READ-COMMAND;
- escuta passiva de quadros enviados pela central.

O código desta fase não envia `401E` arme/desarme, `401F` bypass, panic, gravação de configuração ou qualquer comando de alteração.

## Central Santa Maria

- Modelo: AMT 8000 LITE
- Firmware observado: 3.1.5
- IP local atual: `10.11.22.11`
- Porta TCP ISECNet: `9009`
- ID do painel: `00 00`
- ID do software remoto: `8F FF`
- Device types `1`, `2` e `3` autenticam com `F0F0`
- `F0F7` funciona como keepalive e recebe `F0FE`
- Até 16 partições e 64 zonas

## Leitura automatizada do BUFFER_EVENTOS

Comando Windows recomendado:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-event-buffer-readonly-windows.ps1
```

O script:

1. pede a senha de acesso remoto com `SecureString`;
2. abre uma sessão TCP com `10.11.22.11:9009`;
3. autentica uma vez com `F0F0`;
4. mantém a sessão com `F0F7`;
5. percorre o buffer circular `0..511` com READ-COMMAND `3900`;
6. decodifica os registros recebidos;
7. seleciona automaticamente os registros mais recentes com data/código válidos;
8. mostra tabela sanitizada em ordem cronológica.

Tabela exibida:

- `data/hora`
- `indice`
- `codigo`
- `new/restore`
- `zona/usuario`
- `particao`

Nenhum payload bruto e nenhuma senha são impressos.

Parâmetros opcionais por variável de ambiente:

```powershell
$env:INTELBRAS_EVENT_BUFFER_START="0"      # 0..511, padrão 0
$env:INTELBRAS_EVENT_BUFFER_COUNT="512"   # 1..512, padrão 512
$env:INTELBRAS_EVENT_RECENT_LIMIT="32"    # 1..512, padrão 32
```

O script também aceita `INTELBRAS_PANEL_HOST`, `INTELBRAS_PANEL_PORT`, `INTELBRAS_DEVICE_TYPE`, `INTELBRAS_PROBE_TIMEOUT_MS`, `INTELBRAS_EVENT_REQUEST_TIMEOUT_MS` e `INTELBRAS_EVENT_REQUEST_GAP_MS`.

Também é possível chamar diretamente:

```bash
pnpm events:intelbras
```

Essa forma direta exige que `INTELBRAS_REMOTE_PASSWORD` já esteja no ambiente do processo. No Windows, prefira o launcher com `SecureString`.

## Evidência real do buffer

O comando `3900` foi confirmado na central real como leitura. Exemplo já observado:

- índice `0000`: `2026-08-05 22:20:16`, `new`, código `130`, zona/usuário `13`, partição `1`;
- índice `0001`: restore do mesmo evento;
- índice `0004`: código `407`, partição `1`.

## Diagnóstico passivo de status

O arquivo `probe.mjs` continua existindo apenas para diagnóstico passivo. Ele autentica, envia keepalive e decodifica `0B4A` somente se a central enviar esse quadro por iniciativa própria.

Comando Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-readonly-windows.ps1
```

Esse diagnóstico não transforma `0B4A` em consulta e não tenta comandos ISECMobile encapsulados em `E9`.

## Lacuna sobre status atual

Revisão feita em 02/09/2026 nas fontes e documentação derivada disponíveis no repositório, incluindo branches remotas de diagnóstico Intelbras:

- `0B4A STATUS_COMPLETO_CENTRAL_ALARME` aparece documentado como SEND-COMMAND central -> dispositivo;
- nos testes reais, `0B4A` não chegou espontaneamente após autenticação;
- o diagnóstico bruto confirmou que nenhum `0B4A` estava escondido ou sendo descartado pelo parser;
- não há, no material disponível, outro READ-COMMAND oficial da AMT 8000 para consultar status atual de partições, zonas, bateria, sirene ou falhas;
- documentos antigos de smartphone/ISECMobile com encapsulamento `E9` não comprovam compatibilidade direta com a porta TCP `9009` da AMT 8000 LITE firmware 3.1.5.

Portanto, nesta branch não há implementação de consulta ativa de status atual.

Evidência adicional necessária para avançar:

- trecho oficial do SDK/API AMT 8000 que documente um READ-COMMAND de status, com direção, payload e resposta; ou
- captura controlada do software oficial Intelbras compatível com AMT 8000 LITE firmware 3.1.5 consultando status pela porta `9009`, mostrando comando host -> painel, payload e resposta.

Até existir essa evidência, o HUB deve tratar status atual de partições/zonas/bateria/sirene/falhas como indisponível por leitura ativa.

## Segurança da senha

Nunca:

- salve a senha no GitHub;
- cole a senha em chat;
- coloque a senha em código fonte;
- imprima payload sensível;
- exponha a porta `9009` na internet;
- publique SDK original/licenciado em repositório público.

Use somente a senha de acesso remoto da central, digitada localmente.

## Testes locais sem central

```bash
pnpm test:intelbras
node --test tools/**/*.test.mjs
pnpm build
```

Os testes cobrem checksum, montagem de quadros ISECNet, fragmentação TCP, decoder passivo `0B4A`, decoder `3900`, varredura circular do buffer e seleção cronológica dos eventos recentes.
