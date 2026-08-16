@echo off
:: Bamboo Launch Script v2.0.0 - Windows Optimized
:: ================================================

setlocal EnableDelayedExpansion

:: Configuration
set "BAMBOO_HOME=%~dp0"
set "BAMBOO_PORT=18720"
set "BAMBOO_MODEL=default"

:: Check for port conflicts and find available port
for /f "tokens=*" %%i in ('powershell -Command "Import-Module NetTCPIP; $ports = Get-NetTCPConnection -LocalPort 18720 -ErrorAction SilentlyContinue; if ($ports) { for ($i=18721; $i -lt 18820; $i++) { $p = Get-NetTCPConnection -LocalPort $i -ErrorAction SilentlyContinue; if (-not $p) { Write-Output $i; break } } } else { Write-Output 18720 }"') do set "BAMBOO_PORT=%%i"

:: Set Windows-compatible paths
set "BAMBOO_DATA_DIR=%LOCALAPPDATA%\Bamboo\Data"
if not exist "%BAMBOO_DATA_DIR%" mkdir "%BAMBOO_DATA_DIR%"

:: Environment setup
set "PYTHONIOENCODING=utf-8"
set "PYTHONUNBUFFERED=1"

:: DLL path fix for Windows
if exist "%BAMBOO_HOME%vendor\python\DLLs" (
    set "PYTHONPATH=%BAMBOO_HOME%vendor\python;%PYTHONPATH%"
)

:: Launch Python bridge
echo [Bamboo] Starting bridge on port %BAMBOO_PORT%...
cd /d "%BAMBOO_HOME%bridge"
python -c "import sys; sys.path.insert(0, r'%BAMBOO_HOME%bridge'); from main import main; import os; os.environ['PORT']='%BAMBOO_PORT%'; main()" --port %BAMBOO_PORT% --config "%BAMBOO_HOME%bridge\cordis.yml"

:: Wait for bridge to start
timeout /t 2 /nobreak >nul

:: Check if frontend exists and start it
if exist "%BAMBOO_HOME%src\dist\index.html" (
    echo [Bamboo] Starting frontend...
    cd /d "%BAMBOO_HOME%src"
    start "" cmd /c "npx vite --port 5173 --host 127.0.0.1 --silent"
    timeout /t 2 /nobreak >nul
    start "" "http://127.0.0.1:5173"
)

echo [Bamboo] Started successfully!
echo Press Ctrl+C to stop

:: Keep script running to maintain bridge process
:waitloop
timeout /t 30 /nobreak >nul
goto waitloop
