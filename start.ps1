<#
.SYNOPSIS
    Starts the Driver Drowsiness Detection system: FastAPI backend + React frontend.

.DESCRIPTION
    First run: creates the Python virtual environment and installs all
    dependencies (Python and npm). Every run: opens the backend and the
    frontend in their own windows, waits until both answer, then opens the
    dashboard in your browser. Close the two server windows to stop.

.EXAMPLE
    .\start.ps1            # or double-click start.bat
    .\start.ps1 -NoBrowser
#>
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Venv = Join-Path $Backend '.venv'
$VenvPython = Join-Path $Venv 'Scripts\python.exe'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

function Find-Python311 {
    # Prefer the Windows "py" launcher, fall back to "python" on PATH
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.11 --version *> $null
        if ($LASTEXITCODE -eq 0) { return @{ Exe = 'py'; Args = @('-3.11') } }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $version = (& python --version 2>&1) | Out-String
        if ($version -match 'Python 3\.11') { return @{ Exe = 'python'; Args = @() } }
    }
    return $null
}

function Start-ServerWindow([string]$Title, [string]$Directory, [string]$Command) {
    # -EncodedCommand avoids every quoting problem with spaces in paths
    $script = "`$host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$Directory'; $Command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
}

function Wait-ForPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $client = New-Object Net.Sockets.TcpClient
        try { $client.Connect($HostName, $Port); return $true } catch { Start-Sleep -Milliseconds 500 } finally { $client.Dispose() }
    }
    return $false
}

Write-Host ''
Write-Host '  Driver Drowsiness Detection System' -ForegroundColor White
Write-Host ''

# ---- 1. Python environment (first run only) --------------------------------
if (-not (Test-Path $VenvPython)) {
    Write-Step 'First run: creating the Python 3.11 virtual environment...'
    $python = Find-Python311
    if (-not $python) {
        throw 'Python 3.11 was not found. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and run this script again.'
    }
    $pyArgs = $python.Args
    & $python.Exe @pyArgs -m venv $Venv
    Write-Step 'Installing Python packages (MediaPipe, OpenCV, FastAPI...) - this takes a few minutes...'
    & $VenvPython -m pip install --upgrade pip --quiet
    & $VenvPython -m pip install -r (Join-Path $Backend 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed - see the messages above.' }
}

# ---- 2. Node packages (first run only) --------------------------------------
if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Node.js was not found. Install the LTS version from https://nodejs.org/ and run this script again.'
    }
    Write-Step 'First run: installing frontend packages (npm install)...'
    Push-Location $Frontend
    try { npm install --no-audit --no-fund } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed - see the messages above.' }
}

# ---- 3. Start both servers in their own windows ------------------------------
if (Wait-ForPort '127.0.0.1' 8000 1) {
    Write-Step 'Backend is already running on port 8000 - reusing it.'
} else {
    Write-Step 'Starting the backend  (http://127.0.0.1:8000)...'
    Start-ServerWindow -Title 'Drowsiness - backend (FastAPI)' -Directory $Backend -Command "& '$VenvPython' run.py"
}

if (Wait-ForPort 'localhost' 5173 1) {
    Write-Step 'Frontend is already running on port 5173 - reusing it.'
} else {
    Write-Step 'Starting the frontend (http://localhost:5173)...'
    Start-ServerWindow -Title 'Drowsiness - frontend (Vite)' -Directory $Frontend -Command 'npm run dev'
}

# ---- 4. Wait until both answer, then open the dashboard ----------------------
Write-Step 'Waiting for the servers to come up...'
$backendUp = Wait-ForPort '127.0.0.1' 8000 90
$frontendUp = Wait-ForPort 'localhost' 5173 90

if (-not $backendUp) { Write-Host '    Backend did not start - check the "backend" window for errors.' -ForegroundColor Yellow }
if (-not $frontendUp) { Write-Host '    Frontend did not start - check the "frontend" window for errors.' -ForegroundColor Yellow }

if ($frontendUp) {
    Write-Host ''
    Write-Host '  Ready!  Dashboard: http://localhost:5173' -ForegroundColor Green
    Write-Host '          API docs:  http://127.0.0.1:8000/docs' -ForegroundColor Green
    Write-Host '  To stop: close the two server windows (or press Ctrl+C in them).' -ForegroundColor Gray
    Write-Host ''
    if (-not $NoBrowser) { Start-Process 'http://localhost:5173' }
}
