@echo off
setlocal
cd /d "%~dp0"

if exist "local.env.bat" (
  call "local.env.bat"
)

if exist ".venv\Scripts\pythonw.exe" (
  start "" ".venv\Scripts\pythonw.exe" "run.py"
  exit /b 0
)

where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "" pythonw "run.py"
  exit /b 0
)

echo pythonw not found. Install Python or create .venv first.
pause
