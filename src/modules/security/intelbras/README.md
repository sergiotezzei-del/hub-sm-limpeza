# Intelbras AMT 8000 LITE — integração HUB

Status: **SDK/API oficial recebido em 31/08/2026. Agente local somente leitura com BUFFER_EVENTOS 3900 automatizado; status atual ainda sem READ-COMMAND oficial comprovado.**

## Central identificada
- Modelo: AMT 8000 LITE
- Firmware observado: 3.1.5
- Nome: Santa Maria
- IP local atual: 10.11.22.11
- Porta de acesso direto LAN: TCP 9009
- Até 16 partições e 64 zonas conforme SDK AMT 8000
- Partições nomeadas conhecidas: 1 Sub Solo, 2 Térreo, 3 1 Andar, 4 Externos

## Comandos oficiais mapeados
- `F0F0` — `AUTENTICA_CONEXAO_REMOTA`
- `F0F7` — `KEEP_ALIVE`
- `0B4A` — `STATUS_COMPLETO_CENTRAL_ALARME` (central → host)
- `3900` — `BUFFER_EVENTOS` (host → central, READ-COMMAND confirmado na central real)
- `401E` — `ARMA_DESARMA_CENTRAL_ALARME`
- `401F` — `EXEC_BYPASS_ZONA`

Os comandos `401E` e `401F` estão documentados, mas permanecem bloqueados no HUB até o transporte somente leitura ser validado contra a central real.

O `0B4A` permanece tratado somente como quadro passivo central → host. Ele não deve ser enviado como consulta ativa sem documentação específica para AMT 8000 LITE firmware 3.1.5.

## Regras de segurança
- Nunca armazenar senha Master, Instalador ou Configuração Remota no frontend, repositório, logs ou tabelas abertas.
- A autenticação do agente usa especificamente a senha de acesso remoto e ela deve existir somente na memória/secret local.
- Comandos de arme/desarme devem ocorrer somente no servidor/ponte local autenticada.
- Desarme exige usuário Admin, confirmação explícita e registro de auditoria.
- Cada comando deve registrar usuário, ação, partição/zona, horário, resultado e origem do dispositivo.
- O primeiro teste real é estritamente somente leitura.

## Arquitetura
1. Agente local dentro da rede Santa Maria conecta à central em `10.11.22.11:9009`.
2. Autentica via `F0F0` sem registrar a senha.
3. Mantém sessão via `F0F7` em intervalo inferior a 1 minuto.
4. Lê o buffer circular `0..511` via `3900`, identifica os eventos mais recentes e exibe resumo sanitizado.
5. Se a central enviar `0B4A` espontaneamente, o probe passivo consegue decodificar partições, zonas, sirene, bateria e falhas.
6. Até surgir documentação oficial de consulta ativa de status, o snapshot atual permanece indisponível para sincronização automática.
7. Somente em etapa posterior uma fila auditada poderá liberar comandos reais.

## Implementação disponível
Veja `tools/intelbras-bridge/`:
- codec de quadros ISECNet;
- parser de stream TCP;
- parser do status 0B4A;
- scanner LAN somente leitura do `BUFFER_EVENTOS`;
- agente local persistente somente leitura com snapshot JSON sanitizado;
- probe LAN passivo para `0B4A`;
- launcher Windows que solicita senha em modo oculto;
- testes sem necessidade da central real.

Comando operacional da fase atual:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-event-buffer-readonly-windows.ps1
```

Base persistente local para eventos/online/histórico:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\intelbras-bridge\run-readonly-agent-windows.ps1
```

Ela grava `.tmp/intelbras-readonly-agent-snapshot.json` com dados sanitizados e sem payload bruto. O HUB ainda não consome esse arquivo automaticamente nesta etapa.

## Lacuna documentada

Revisão feita em 02/09/2026 nas fontes disponíveis no repositório, branches remotas de diagnóstico Intelbras e SDK local AMT 8000 em `Downloads` não encontrou outro READ-COMMAND oficial da AMT 8000 para consultar status atual de partições, zonas, bateria, sirene ou falhas. No resumo AMT 8000, `0B4A` aparece como SEND-COMMAND central -> dispositivo; portanto segue somente passivo.

Evidência necessária para avançar: trecho oficial do SDK/API AMT 8000 com direção, payload e resposta do comando de status; ou captura controlada do software oficial Intelbras compatível com AMT 8000 LITE firmware 3.1.5 consultando status pela porta TCP 9009.

## Funcionalidades-alvo
- Online/offline, bateria, sirene e falhas.
- Lista e estado das 16 partições.
- Lista e estado das 64 zonas/setores.
- Eventos de disparo/falha na Central de Alertas e Push.
- Arme/desarme total e por partição, somente depois da validação de leitura.
- Bypass/restauração de zona, somente depois da validação adicional.
