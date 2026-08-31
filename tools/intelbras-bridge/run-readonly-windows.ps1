$ErrorActionPreference = "Stop"

$panelHost = if ($env:INTELBRAS_PANEL_HOST) { $env:INTELBRAS_PANEL_HOST } else { "192.168.1.100" }
$panelPort = if ($env:INTELBRAS_PANEL_PORT) { $env:INTELBRAS_PANEL_PORT } else { "9009" }

Write-Host "HUB Santa Maria - Intelbras AMT 8000 LITE" -ForegroundColor Cyan
Write-Host "Teste SOMENTE LEITURA em $panelHost`:$panelPort" -ForegroundColor Yellow
Write-Host "Nenhum comando de arme, desarme ou bypass existe neste teste." -ForegroundColor Yellow
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

    node "$PSScriptRoot\probe.mjs"
    exit $LASTEXITCODE
}
finally {
    $env:INTELBRAS_REMOTE_PASSWORD = $null
    $plainPassword = $null
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}
