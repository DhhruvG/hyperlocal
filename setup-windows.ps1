$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Get-Command python -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $python) {
    throw 'Python was not found. Install Python 3.11 or newer and run this script again.'
}

if (-not $node) {
    throw 'Node.js was not found. Install Node.js 20 or newer and run this script again.'
}

if (-not (Test-Path (Join-Path $backend '.venv\Scripts\python.exe'))) {
    Write-Host 'Creating backend virtual environment...'
    & $python.Source -m venv (Join-Path $backend '.venv')
}

$venvPython = Join-Path $backend '.venv\Scripts\python.exe'
Write-Host 'Installing backend dependencies...'
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $backend 'requirements.txt')

$backendEnv = Join-Path $backend '.env'
if (-not (Test-Path $backendEnv)) {
    @'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="http://localhost:3000"
JWT_SECRET="localprice-windows-development-secret-change-me"
RAZORPAY_KEY_ID="rzp_test_placeholder"
RAZORPAY_KEY_SECRET="placeholder_secret"
RAZORPAY_MODE="mock"
SEED_DEMO="1"
'@ | Set-Content -Path $backendEnv -Encoding utf8
}

$frontendEnv = Join-Path $frontend '.env'
@'
REACT_APP_BACKEND_URL=http://localhost:8000
WDS_SOCKET_PORT=3000
ENABLE_HEALTH_CHECK=false
'@ | Set-Content -Path $frontendEnv -Encoding utf8

Push-Location $frontend
try {
    if (Get-Command yarn -ErrorAction SilentlyContinue) {
        Write-Host 'Installing frontend dependencies with Yarn...'
        yarn install
    } else {
        Write-Host 'Yarn was not found; installing frontend dependencies with npm...'
        npm install
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Setup complete. Start LocalPrice with .\run-windows.ps1'