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
8. grava snapshot sanitizado completo em `.tmp/intelbras-event-buffer-last-scan.json`;
9. mostra tabela sanitizada em ordem cronológica.

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
$env:INTELBRAS_EVENT_REQUEST_RETRIES="1"  # retries somente leitura por índice, padrão 1
$env:INTELBRAS_EVENT_OUTPUT=".tmp/intelbras-event-buffer-last-scan.json"
```

O script também aceita `INTELBRAS_PANEL_HOST`, `INTELBRAS_PANEL_PORT`, `INTELBRAS_DEVICE_TYPE`, `INTELBRAS_PROBE_TIMEOUT_MS`, `INTELBRAS_EVENT_REQUEST_TIMEOUT_MS` e `INTELBRAS_EVENT_REQUEST_GAP_MS`.

Também é possível chamar diretamente:

```bash
pnpm events:intelbras
```

Essa forma direta exige que `INTELBRAS_REMOTE_PASSWORD` já esteja no ambiente do processo. No Windows, prefira o launcher com `SecureString`.

## Agente local persistente somente leitura

Base preparada para a próxima etapa do HUB:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-readonly-agent-windows.ps1
```

O agente persistente:

1. usa somente `F0F0`, `F0F7` e `3900`;
2. varre o buffer em intervalo configurável;
3. mantém online/offline da conexão local;
4. grava histórico sanitizado em `.tmp/intelbras-readonly-agent-snapshot.json`;
5. não sincroniza segredo, payload bruto ou comando de controle.

Execução direta:

```bash
pnpm agent:intelbras
```

Variáveis úteis:

```powershell
$env:INTELBRAS_AGENT_SCAN_INTERVAL_MS="300000" # minimo 60000
$env:INTELBRAS_AGENT_HISTORY_LIMIT="200"
$env:INTELBRAS_AGENT_OUTPUT=".tmp/intelbras-readonly-agent-snapshot.json"
$env:INTELBRAS_AGENT_ONCE="1" # uma varredura e encerra
$env:INTELBRAS_EVENT_REQUEST_RETRIES="1"
```

O snapshot informa explicitamente `activeStatusQuery.available=false`, porque ainda não existe READ-COMMAND oficial comprovado para status atual da AMT 8000 LITE.

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

Revisão feita em 02/09/2026 nas fontes e documentação derivada disponíveis no repositório, branches remotas de diagnóstico Intelbras e SDK local AMT 8000 em `Downloads`:

- `0B4A STATUS_COMPLETO_CENTRAL_ALARME` aparece documentado como SEND-COMMAND central -> dispositivo;
- o resumo AMT 8000 lista `F0F0`, `F0F1`, `F0F7`, `0BB0`, `0B4A`, `401A`, `401E` e `401F`, mas não lista outro READ-COMMAND de status atual;
- nos testes reais, `0B4A` não chegou espontaneamente após autenticação;
- o diagnóstico bruto confirmou que nenhum `0B4A` estava escondido ou sendo descartado pelo parser;
- não há, no material disponível, outro READ-COMMAND oficial da AMT 8000 para consultar status atual de partições, zonas, bateria, sirene ou falhas;
- documentos antigos de smartphone/ISECMobile com encapsulamento `E9` não comprovam compatibilidade direta com a porta TCP `9009` da AMT 8000 LITE firmware 3.1.5.

Portanto, nesta branch não há implementação de consulta ativa de status atual.

Evidência adicional necessária para avançar:

- trecho oficial do SDK/API AMT 8000 que documente um READ-COMMAND de status, com direção, payload e resposta; ou
- captura controlada do software oficial Intelbras compatível com AMT 8000 LITE firmware 3.1.5 consultando status pela porta `9009`, mostrando comando host -> painel, payload e resposta.

Até existir essa evidência, o HUB deve tratar status atual de partições/zonas/bateria/sirene/falhas como indisponível por leitura ativa.

## Captura passiva do software oficial

Como não há READ-COMMAND oficial de status atual identificado, o próximo passo seguro é observar o software oficial Intelbras enquanto ele consulta a AMT 8000 LITE:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-passive-official-capture-windows.ps1
```

Essa captura:

1. usa `tshark`/Wireshark portátil local quando houver Npcap; caso contrário usa `PktMon` nativo como captura filtrada;
2. filtra apenas `tcp host 10.11.22.11 and port 9009`;
3. não envia nenhum pacote para a central;
4. grava o PCAP bruto somente em `.tmp`;
5. gera um resumo JSON sanitizado dos quadros ISECNet;
6. redige a autenticação `F0F0` e não imprime payload bruto.

Durante a captura, use somente a tela de consulta/status do AMT Remoto. Não acione arme, desarme, bypass, panic ou alteração de configuração.

O PCAP bruto pode conter payload sensível e nunca deve ser commitado ou enviado ao GitHub. O arquivo sanitizado `.summary.json` serve para identificar, com segurança, quais comandos o software oficial realmente envia para consultar status.

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

Os testes cobrem checksum, montagem de quadros ISECNet, fragmentação TCP, decoder passivo `0B4A`, decoder `3900`, varredura circular do buffer, seleção cronológica dos eventos recentes e snapshot sanitizado do agente local.
