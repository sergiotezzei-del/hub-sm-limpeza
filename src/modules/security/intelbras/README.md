# Intelbras AMT 8000 LITE — integração HUB

Status: aguardando SDK/API oficial da Intelbras.

## Central identificada
- Modelo: AMT 8000 LITE
- Firmware observado: 3.1.5
- Nome: Santa Maria
- IP local observado: 192.168.1.100
- Partições conhecidas: 1 Sub Solo, 2 Terreo, 3 1 Andar, 4 Externos

## Regras de segurança
- Nunca armazenar senha Master, Instalador ou Configuração Remota no frontend, repositório, logs ou tabelas abertas.
- Comandos de arme/desarme devem ocorrer somente no servidor/ponte local autenticada.
- Desarme exige usuário Admin, confirmação explícita e registro de auditoria.
- Cada comando deve registrar: usuário, ação, partição/zona, horário, resultado e origem do dispositivo.
- Leitura de status pode ser mais permissiva que comandos, mas continua protegida por autenticação do HUB.
- Nenhum comando real será enviado até o protocolo oficial estar validado.

## Arquitetura preferida
1. HUB/Vercel solicita operação autenticada.
2. Backend valida usuário e permissão.
3. Integração usa SDK/API oficial Intelbras; se o SDK exigir LAN, usar um agente local dentro da rede Santa Maria.
4. Agente local conversa com a central 192.168.1.100 sem expor essa rede à internet.
5. Eventos retornam para o HUB e alimentam a Central de Alertas.

## Funcionalidades planejadas
- Online/offline, bateria, sirene e falhas.
- Lista e estado de partições.
- Lista e estado de zonas/setores.
- Arme/desarme total e por partição.
- Bypass/restauração de zona quando suportado oficialmente.
- Eventos de disparo/falha na Central de Alertas e Push.

## Pendência externa
Solicitação de SDK/API enviada ao suporte Intelbras em 30/08/2026. Integrar apenas após receber documentação/licença oficial.
