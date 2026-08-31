$ErrorActionPreference = "Stop"

Write-Host "Rádio Santa Maria - ponte local" -ForegroundColor Cyan
Write-Host "AudioCast: 10.11.22.53 | PC: 10.11.22.50" -ForegroundColor DarkGray
Write-Host ""

$secure = Read-Host "Cole a chave da ponte" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
  $env:RADIO_BRIDGE_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $env:RADIO_AUDIO_DIR = $env:USERPROFILE
  $env:RADIO_AUDIOCAST_IP = "10.11.22.53"
  $env:RADIO_BIND_IP = "10.11.22.50"
  $env:RADIO_HTTP_PORT = "8091"

  node "$PSScriptRoot\index.mjs"
}
finally {
  $env:RADIO_BRIDGE_TOKEN = $null
  if ($ptr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}
