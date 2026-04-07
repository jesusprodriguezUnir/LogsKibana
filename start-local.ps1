param(
    [switch]$NoInstall
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"

if (-not (Test-Path $backendPath)) {
    throw "No se encontro la carpeta backend en $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "No se encontro la carpeta frontend en $frontendPath"
}

$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$pythonCmd = if (Test-Path $venvPython) { $venvPython } else { "python" }

if (-not $NoInstall) {
    Write-Host "Instalando dependencias backend..." -ForegroundColor Cyan
    Push-Location $backendPath
    & $pythonCmd -m pip install -e .[dev]
    Pop-Location

    Write-Host "Instalando dependencias frontend..." -ForegroundColor Cyan
    Push-Location $frontendPath
    npm install
    Pop-Location
}

$backendEscaped = $backendPath.Replace("'", "''")
$frontendEscaped = $frontendPath.Replace("'", "''")
$pythonEscaped = $pythonCmd.Replace("'", "''")

$backendCommand = "Set-Location '$backendEscaped'; & '$pythonEscaped' -m uvicorn api.main:app --reload --app-dir src --host 127.0.0.1 --port 8000"
$frontendCommand = "Set-Location '$frontendEscaped'; npm run dev"

Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

Write-Host "Servicios lanzados:" -ForegroundColor Green
Write-Host "- Backend:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "- Frontend: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "\nSugerencia: usa .\start-local.ps1 -NoInstall para evitar reinstalar dependencias." -ForegroundColor Yellow
