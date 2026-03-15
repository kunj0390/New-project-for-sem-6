# setup.ps1
# Creates/activates virtual environment and installs requirements

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-Not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
} else {
    Write-Host "Virtual environment already exists."
}

Write-Host "Activating virtual environment..."
. .venv\Scripts\Activate.ps1

Write-Host "Upgrading pip and installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

Write-Host "Setup complete. Run .\run.ps1 to start the API."