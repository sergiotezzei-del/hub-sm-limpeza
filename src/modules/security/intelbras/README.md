# Intelbras AMT 8000 LITE — integração HUB

Status: **SDK/API oficial recebido em 31/08/2026. Agente local somente leitura em validação.**

## Central identificada
- Modelo: AMT 8000 LITE
- Firmware observado: 3.1.5
- Nome: Santa Maria
- IP local observado: 192.168.1.100
- Porta de acesso direto LAN: TCP 9009
- Até 16 partições e 64 zonas conforme SDK AMT 8000
- Partições nomeadas conhecidas: 1 Sub Solo, 2 Térreo, 3 1 Andar, 4 Externos

## Comandos oficiais mapeados
- `F0F0` — `AUTENTICA_CONEXAO_REMOTA`
- `F0F7` — `KEEP_ALIVE`
- `0B4A` — `STATUS_COMPLETO_CENTRAL_ALARME` (central → host)
- `401E` — `ARMA_DESARMA_CENTRAL_ALARME`
- `401F` — `EXEC_BYPASS_ZONA`

Os comandos `401E` e `401F` estão documentados, mas permanecem bloqueados no HUB até o transporte somente leitura ser validado contra a central real.

## Regras de segurança
- Nunca armazenar senha Master, Instalador ou Configuração Remota no frontend, repositório, logs ou tabelas abertas.
- A autenticação do agente usa especificamente a senha de acesso remoto e ela deve existir somente na memória/secret local.
- Comandos de arme/desarme devem ocorrer somente no servidor/ponte local autenticada.
- Desarme exige usuário Admin, confirmação explícita e registro de auditoria.
- Cada comando deve registrar usuário, ação, partição/zona, horário, resultado e origem do dispositivo.
- O primeiro teste real é estritamente somente leitura.

## Arquitetura
1. Agente local dentro da rede Santa Maria conecta à central em `192.168.1.100:9009`.
2. Autentica via `F0F0` sem registrar a senha.
3. Mantém sessão via `F0F7` em intervalo inferior a 1 minuto.
4. Recebe `0B4A`, interpreta partições, zonas, sirene, bateria e falhas.
5. Após validação, sincroniza snapshot sanitizado com HUB/Supabase.
6. Somente em etapa posterior uma fila auditada poderá liberar comandos reais.

## Implementação disponível
Veja `tools/intelbras-bridge/`:
- codec de quadros ISECNet;
- parser de stream TCP;
- parser do status 0B4A;
- probe LAN somente leitura;
- launcher Windows que solicita senha em modo oculto;
- testes sem necessidade da central real.

## Funcionalidades-alvo
- Online/offline, bateria, sirene e falhas.
- Lista e estado das 16 partições.
- Lista e estado das 64 zonas/setores.
- Eventos de disparo/falha na Central de Alertas e Push.
- Arme/desarme total e por partição, somente depois da validação de leitura.
- Bypass/restauração de zona, somente depois da validação adicional.
