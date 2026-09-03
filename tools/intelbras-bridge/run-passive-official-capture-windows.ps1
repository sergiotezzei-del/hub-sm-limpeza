param(
    [string]$PanelHost = "10.11.22.11",
    [int]$PanelPort = 9009,
    [int]$DurationSeconds = 120,
    [string]$Interface = "",
    [string]$TsharkPath = "",
    [ValidateSet("auto", "tshark", "pktmon")]
    [string]$CaptureEngine = "auto",
    [switch]$AllowPktmonFilterReset,
    [switch]$ListInterfaces
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outputDir = Join-Path $repoRoot ".tmp"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$etlPath = Join-Path $outputDir "amt8000-official-passive-$timestamp.etl"
$capturePath = Join-Path $outputDir "amt8000-official-passive-$timestamp.pcapng"
$summaryPath = Join-Path $outputDir "amt8000-official-passive-$timestamp.summary.json"
$portableTshark = "C:\Users\user\Desktop\Diagnosticos de Rede\WireShark Portabile\WiresharkPortable64\App\Wireshark\tshark.exe"

function Resolve-Tshark {
    if (-not [string]::IsNullOrWhiteSpace($TsharkPath) -and (Test-Path -LiteralPath $TsharkPath)) {
        return (Resolve-Path -LiteralPath $TsharkPath).Path
    }
    if (-not [string]::IsNullOrWhiteSpace($env:TSHARK_EXE) -and (Test-Path -LiteralPath $env:TSHARK_EXE)) {
        return (Resolve-Path -LiteralPath $env:TSHARK_EXE).Path
    }
    if (Test-Path -LiteralPath $portableTshark) {
        return $portableTshark
    }
    $command = Get-Command tshark.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    throw "tshark.exe nao encontrado. Defina TSHARK_EXE ou use o Wireshark portatil ja baixado."
}

function Get-TsharkInterfaces {
    & cmd.exe /d /c "`"$tshark`" -D 2>&1"
}

function Test-TsharkCanCapture {
    $interfacesText = (Get-TsharkInterfaces | Out-String)
    return $interfacesText -match "\\Device\\NPF_"
}

function Test-PktmonHasFilters {
    $filtersText = (pktmon filter list 2>&1 | Out-String)
    return $filtersText -notmatch "(?i)\bNenhum\b|No filters|There are no"
}

function Invoke-TsharkCapture {
    if ([string]::IsNullOrWhiteSpace($Interface)) {
        Write-Host "Interfaces disponiveis:" -ForegroundColor Cyan
        Get-TsharkInterfaces
        Write-Host ""
        $script:Interface = Read-Host "Digite o numero ou nome da interface conectada a rede da central"
    }

    $captureFilter = "tcp and host $PanelHost and port $PanelPort"
    Write-Host ""
    Write-Host "Capturando com tshark por $DurationSeconds segundo(s) na interface '$Interface'." -ForegroundColor Cyan
    Write-Host "Agora use APENAS a consulta/status do software oficial Intelbras. Nao acione arme, desarme, bypass, panic ou configuracao." -ForegroundColor Yellow
    Write-Host "Arquivo bruto local: $capturePath" -ForegroundColor DarkYellow
    Write-Host ""

    & $tshark -i $Interface -f $captureFilter -a "duration:$DurationSeconds" -w $capturePath
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao capturar com tshark. Codigo: $LASTEXITCODE"
    }
}

function Invoke-PktmonCapture {
    $existingFilters = Test-PktmonHasFilters
    if ($existingFilters -and -not $AllowPktmonFilterReset) {
        throw "PktMon ja possui filtros ativos. Rode com -AllowPktmonFilterReset se puder substituir temporariamente esses filtros."
    }

    Write-Host ""
    Write-Host "Capturando com PktMon nativo por $DurationSeconds segundo(s), filtrando $PanelHost`:$PanelPort." -ForegroundColor Cyan
    Write-Host "Agora use APENAS a consulta/status do software oficial Intelbras. Nao acione arme, desarme, bypass, panic ou configuracao." -ForegroundColor Yellow
    Write-Host "Arquivo ETL local: $etlPath" -ForegroundColor DarkYellow
    Write-Host ""

    $started = $false
    try {
        pktmon filter remove | Out-Null
        pktmon filter add AMT8000_STATUS_PASSIVE -i $PanelHost -t TCP -p $PanelPort | Out-Null
        pktmon start --capture --comp nics --pkt-size 0 --file-name $etlPath | Out-Null
        $started = $true
        Start-Sleep -Seconds $DurationSeconds
    }
    finally {
        if ($started) {
            pktmon stop | Out-Null
        }
        pktmon filter remove | Out-Null
    }

    pktmon etl2pcap $etlPath --out $capturePath | Out-Null
    if (-not (Test-Path -LiteralPath $capturePath)) {
        throw "PktMon nao gerou o PCAP convertido em $capturePath."
    }
}

$tshark = Resolve-Tshark
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Write-Host "HUB Santa Maria - captura PASSIVA AMT 8000 LITE" -ForegroundColor Cyan
Write-Host "Alvo observado: $PanelHost`:$PanelPort" -ForegroundColor Cyan
Write-Host "Esta ferramenta nao envia comandos para a central. Ela apenas observa trafego gerado pelo software oficial." -ForegroundColor Yellow
Write-Host "O PCAP em .tmp pode conter payload sensivel, inclusive autenticacao. Nao publique esse arquivo." -ForegroundColor Yellow
Write-Host "O resumo JSON impresso/salvo e sanitizado e redige autenticacao F0F0." -ForegroundColor Yellow
Write-Host ""

if ($ListInterfaces) {
    Write-Host "Interfaces tshark:" -ForegroundColor Cyan
    Get-TsharkInterfaces
    Write-Host ""
    Write-Host "PktMon tambem esta disponivel e captura por filtro, sem selecionar interface." -ForegroundColor Cyan
    exit 0
}

if ($CaptureEngine -eq "auto") {
    if (Test-TsharkCanCapture) {
        $CaptureEngine = "tshark"
    } else {
        $CaptureEngine = "pktmon"
    }
}

try {
    if ($CaptureEngine -eq "tshark") {
        Invoke-TsharkCapture
    } else {
        Invoke-PktmonCapture
    }
}
catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

$displayFilter = "tcp.port == $PanelPort && ip.addr == $PanelHost && tcp.payload && !tcp.analysis.retransmission"
$extractArgs = @(
    "-r", $capturePath,
    "-Y", $displayFilter,
    "-T", "fields",
    "-E", "header=n",
    "-E", "separator=/t",
    "-e", "frame.number",
    "-e", "frame.time_epoch",
    "-e", "tcp.stream",
    "-e", "ip.src",
    "-e", "tcp.srcport",
    "-e", "ip.dst",
    "-e", "tcp.dstport",
    "-e", "tcp.payload"
)

Write-Host ""
Write-Host "Analisando captura de forma sanitizada..." -ForegroundColor Cyan
& $tshark @extractArgs | node "$PSScriptRoot\passive-capture-analyze.mjs" --stdin --panel-host $PanelHost --panel-port $PanelPort --out $summaryPath
$analysisExitCode = $LASTEXITCODE

Write-Host ""
Write-Host "Resumo sanitizado: $summaryPath" -ForegroundColor Cyan
Write-Host "PCAP bruto sensivel: $capturePath" -ForegroundColor DarkYellow
exit $analysisExitCode
