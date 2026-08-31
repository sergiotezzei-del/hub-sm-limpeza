# Rádio Santa Maria — ponte local

Ponte entre o HUB/Supabase e o AudioCast da Santa Maria.

## Equipamentos atuais

- PC da ponte: `10.11.22.50`
- AudioCast: `10.11.22.53`
- Dispositivo: `SOM SANTAMARIATEM`
- Porta HTTP local da ponte: `8091`

## Como funciona

1. O HUB grava um comunicado na tabela `radio_announcements`.
2. A ponte consulta a fila a cada poucos segundos.
3. O arquivo MP3 indicado no comunicado é servido pelo próprio PC em HTTP local.
4. A ponte envia `playPromptUrl` ao AudioCast.
5. O AudioCast reduz temporariamente o Spotify, toca o comunicado e devolve o Spotify ao volume anterior.
6. A ponte marca o comunicado como concluído ou com falha.

## Requisitos

- Windows na mesma rede do AudioCast.
- Node.js 18 ou superior. Testado no ambiente com Node.js 24.
- O MP3 deve existir dentro da pasta configurada em `RADIO_AUDIO_DIR`. O launcher do Windows usa `%USERPROFILE%`.

## Executar no Windows

Abra PowerShell dentro desta pasta e rode:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-windows.ps1
```

O script pedirá a chave da ponte sem deixá-la gravada no repositório.

## Variáveis opcionais

- `RADIO_AUDIOCAST_IP` — padrão `10.11.22.53`
- `RADIO_BIND_IP` — padrão `10.11.22.50`
- `RADIO_HTTP_PORT` — padrão `8091`
- `RADIO_AUDIO_DIR` — padrão `%USERPROFILE%`
- `RADIO_POLL_MS` — padrão `2500`

## Segurança

A chave real da ponte não deve ser commitada. O banco guarda apenas o hash SHA-256 usado para validar as chamadas RPC do agente local.
