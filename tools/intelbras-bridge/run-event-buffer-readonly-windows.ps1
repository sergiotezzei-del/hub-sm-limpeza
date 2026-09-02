$ErrorActionPreference = "Stop"

$panelHost = if ($env:INTELBRAS_PANEL_HOST) { $env:INTELBRAS_PANEL_HOST } else { "10.11.22.11" }
$panelPort = if ($env:INTELBRAS_PANEL_PORT) { $env:INTELBRAS_PANEL_PORT } else { "9009" }
$bufferStart = if ($env:INTELBRAS_EVENT_BUFFER_START) { $env:INTELBRAS_EVENT_BUFFER_START } else { "0" }
$bufferCount = if ($env:INTELBRAS_EVENT_BUFFER_COUNT) { $env:INTELBRAS_EVENT_BUFFER_COUNT } else { "512" }
$recentLimit = if ($env:INTELBRAS_EVENT_RECENT_LIMIT) { $env:INTELBRAS_EVENT_RECENT_LIMIT } else { "32" }

Write-Host "HUB Santa Maria - Intelbras AMT 8000 LITE" -ForegroundColor Cyan
Write-Host "Leitura SOMENTE LEITURA do buffer de eventos em $panelHost`:$panelPort" -ForegroundColor Yellow
Write-Host "Comando oficial 3900 (BUFFER_EVENTOS), varredura circular a partir do indice $bufferStart, total $bufferCount." -ForegroundColor Yellow
Write-Host "A tabela final mostra ate $recentLimit registros recentes em ordem cronologica." -ForegroundColor Yellow
Write-Host "Nenhum comando de arme, desarme, bypass, panic ou alteracao existe neste teste." -ForegroundColor Yellow
Write-Host ""

$securePassword = Read-Host "Digite a senha de ACESSO REMOTO da central (6 digitos)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plainPassword -notmatch '^\d{6}$') {
        throw "A senha de acesso remoto deve ter exatamente 6 digitos."
    }

    $env:INTELBRAS_PANEL_HOST = $panelHost
    $env:INTELBRAS_PANEL_PORT = $panelPort
    $env:INTELBRAS_REMOTE_PASSWORD = $plainPassword
    $env:INTELBRAS_EVENT_BUFFER_START = $bufferStart
    $env:INTELBRAS_EVENT_BUFFER_COUNT = $bufferCount
    $env:INTELBRAS_EVENT_RECENT_LIMIT = $recentLimit

    node "$PSScriptRoot\event-buffer-scan.mjs"
    exit $LASTEXITCODE
}
finally {
    $env:INTELBRAS_REMOTE_PASSWORD = $null
    $env:INTELBRAS_EVENT_BUFFER_START = $null
    $env:INTELBRAS_EVENT_BUFFER_COUNT = $null
    $env:INTELBRAS_EVENT_RECENT_LIMIT = $null
    $plainPassword = $null
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}
