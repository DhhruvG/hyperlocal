$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPython = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    throw 'Backend environment is missing. Run .\setup-windows.ps1 first.'
}

if (-not (Get-Process mongod -ErrorAction SilentlyContinue)) {
    Write-Warning 'mongod is not running. Start MongoDB Community Server before using the app.'
}

$backendCommand = "Set-Location -LiteralPath '$backend'; & '$venvPython' -m uvicorn server:app --host 0.0.0.0 --port 8000"

Start-Process powershell.exe -WorkingDirectory $backend -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand)

Write-Host '======================================================' -ForegroundColor Green
Write-Host ' LocalPrice unified server running!' -ForegroundColor Green
Write-Host ' Unified App (Frontend + Backend): http://localhost:8000' -ForegroundColor Cyan
Write-Host ' API Documentation:                http://localhost:8000/docs' -ForegroundColor Cyan
Write-Host '======================================================' -ForegroundColor Green

Start-Process "http://localhost:8000"