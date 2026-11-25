# Stop any previous process holding port 8000
Stop-Process -Name "python", "python3.13" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# Ensure working directory is backend
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$scriptDir\backend") {
    Set-Location "$scriptDir\backend"
}

$env:PYTHONPATH = '.'
Write-Host "Starting Task Tracking Backend on http://127.0.0.1:8000 with auto-reload..." -ForegroundColor Green
& "venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

