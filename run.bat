@echo off
rem run.bat - Create venv, install requirements, and start API
cd /d "%~dp0"
if not exist .venv (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installing dependencies...
pip install --upgrade pip
pip install -r requirements.txt

echo Starting Flask API...
python app.py