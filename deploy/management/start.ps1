$ErrorActionPreference = 'Stop'

$deployDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Resolve-Path (Join-Path $deployDirectory '..\..')
$apiEnvironment = Join-Path $repositoryRoot 'apps\api\.env'

if (-not (Test-Path -LiteralPath $apiEnvironment)) {
    Write-Error "Thiếu apps/api/.env. Hãy sao chép apps/api/.env.example và điền cấu hình trước khi chạy."
}

Push-Location $repositoryRoot
try {
    docker compose -f infrastructure/docker-compose.yml up -d redis
    npm run dev:management
}
finally {
    Pop-Location
}
