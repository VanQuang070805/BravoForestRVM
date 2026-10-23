param([switch]$ConfigureFirewallOnly)

$ErrorActionPreference = 'Stop'

$deployDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Resolve-Path (Join-Path $deployDirectory '..\..')
$apiEnvironment = Join-Path $repositoryRoot 'apps\api\.env'
$networkStateDirectory = Join-Path $env:LOCALAPPDATA 'BravoForest'
$networkStateFile = Join-Path $networkStateDirectory 'api-network.txt'

function Get-ActiveLanSubnet {
    $network = Get-NetIPConfiguration |
        Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -and $_.IPv4Address } |
        Select-Object -First 1
    if (-not $network) { throw 'Khong tim thay ket noi mang LAN dang hoat dong.' }
    $address = $network.IPv4Address | Select-Object -First 1
    return "$($address.IPAddress)/$($address.PrefixLength)"
}

function Set-BravoForestFirewallRule {
    $remoteSubnet = Get-ActiveLanSubnet
    $ruleName = 'BravoForest API - LAN'
    $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($rule) {
        Remove-NetFirewallRule -DisplayName $ruleName
    }
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort 4000 -Profile Private,Public -RemoteAddress $remoteSubnet | Out-Null
    New-Item -ItemType Directory -Force -Path $networkStateDirectory | Out-Null
    Set-Content -LiteralPath $networkStateFile -Value $remoteSubnet -Encoding Ascii
}

if ($ConfigureFirewallOnly) {
    Set-BravoForestFirewallRule
    exit 0
}

if (-not (Test-Path -LiteralPath $apiEnvironment)) {
    throw 'Thieu apps/api/.env. Hay sao chep tu .env.example va dien cau hinh.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$firewallRule = Get-NetFirewallRule -DisplayName 'BravoForest API - LAN' -ErrorAction SilentlyContinue
$activeProfile = (Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } | Select-Object -First 1).NetworkCategory
$currentSubnet = Get-ActiveLanSubnet
$configuredSubnet = if (Test-Path -LiteralPath $networkStateFile) { (Get-Content -LiteralPath $networkStateFile -Raw).Trim() } else { '' }
$firewallReady = $firewallRule -and $firewallRule.Enabled -eq 'True' `
    -and ($firewallRule.Profile -eq 'Any' -or "$($firewallRule.Profile)" -match "$activeProfile") `
    -and $configuredSubnet -eq $currentSubnet
if (-not $firewallReady) {
    if ($isAdministrator) {
        Set-BravoForestFirewallRule
    }
    else {
        Write-Host 'Can quyen Administrator mot lan de mo API 4000 cho Raspberry Pi trong mang LAN.'
        $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -ConfigureFirewallOnly"
        $elevated = Start-Process powershell -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        if ($elevated.ExitCode -ne 0) { throw 'Khong cau hinh duoc Windows Firewall cho Raspberry Pi.' }
    }
}

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(800)) { return $false }
        $client.EndConnect($result)
        return $true
    }
    catch { return $false }
    finally { $client.Dispose() }
}

if (-not (Test-LocalPort 3306)) {
    $xamppRoot = Split-Path (Split-Path $repositoryRoot -Parent) -Parent
    $mysqlStart = Join-Path $xamppRoot 'mysql_start.bat'
    if (-not (Test-Path -LiteralPath $mysqlStart)) {
        throw 'MariaDB chua chay va khong tim thay mysql_start.bat cua XAMPP.'
    }
    Write-Host 'Dang khoi dong MariaDB cua XAMPP...'
    Start-Process -FilePath $mysqlStart -WorkingDirectory $xamppRoot -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-LocalPort 3306) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-LocalPort 3306)) { throw 'MariaDB khong san sang tren cong 3306.' }
}

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop chua chay.' }

Push-Location $repositoryRoot
try {
    docker compose -f infrastructure/docker-compose.yml up -d redis
    if ($LASTEXITCODE -ne 0) { throw 'Khong khoi dong duoc Redis.' }
}
finally {
    Pop-Location
}

Write-Host 'Ha tang local da san sang.'
