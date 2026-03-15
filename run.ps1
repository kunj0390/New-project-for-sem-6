# run.ps1
# Activates virtual environment and starts the Flask backend

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-Not (Test-Path ".venv")) {
    Write-Error "Virtual environment not found. Run .\setup.ps1 first."
    exit 1
}

Write-Host "Activating virtual environment..."
. .venv\Scripts\Activate.ps1

Write-Host "Starting Flask API..."
python app.py