$ErrorActionPreference = "Stop"

$panelHost = if ($env:INTELBRAS_PANEL_HOST) { $env:INTELBRAS_PANEL_HOST } else { "10.11.22.11" }
$panelPort = if ($env:INTELBRAS_PANEL_PORT) { $env:INTELBRAS_PANEL_PORT } else { "9009" }
$scanIntervalMs = if ($env:INTELBRAS_AGENT_SCAN_INTERVAL_MS) { $env:INTELBRAS_AGENT_SCAN_INTERVAL_MS } else { "300000" }
$historyLimit = if ($env:INTELBRAS_AGENT_HISTORY_LIMIT) { $env:INTELBRAS_AGENT_HISTORY_LIMIT } else { "200" }

Write-Host "HUB Santa Maria - Intelbras AMT 8000 LITE" -ForegroundColor Cyan
Write-Host "Agente local SOMENTE LEITURA em $panelHost`:$panelPort" -ForegroundColor Yellow
Write-Host "Fonte: comando oficial 3900 (BUFFER_EVENTOS). Intervalo: $scanIntervalMs ms. Historico: $historyLimit eventos." -ForegroundColor Yellow
Write-Host "Nenhum comando de arme, desarme, bypass, panic ou alteracao existe neste agente." -ForegroundColor Yellow
Write-Host "Use Ctrl+C para encerrar." -ForegroundColor Yellow
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
    $env:INTELBRAS_AGENT_SCAN_INTERVAL_MS = $scanIntervalMs
    $env:INTELBRAS_AGENT_HISTORY_LIMIT = $historyLimit

    node "$PSScriptRoot\readonly-agent.mjs"
    exit $LASTEXITCODE
}
finally {
    $env:INTELBRAS_REMOTE_PASSWORD = $null
    $env:INTELBRAS_AGENT_SCAN_INTERVAL_MS = $null
    $env:INTELBRAS_AGENT_HISTORY_LIMIT = $null
    $plainPassword = $null
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}
