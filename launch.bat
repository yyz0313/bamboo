@echo off
chcp 65001 >nul
title Bamboo - AI Coding Agent Desktop

REM ============================================================
REM Bamboo Launcher
REM ============================================================

set "PYTHON=C:\Users\yyz20\AppData\Local\Programs\Python\Python312\python.exe"
set "NODE=C:\Users\yyz20\.workbuddy\binaries\node\versions\22.22.2\node.exe"
set "ROOT=%~dp0"
set "BRIDGE=%ROOT%bridge\main.py"
set "UI_DIST=%ROOT%src\dist"
set "VITE_BIN=%ROOT%src\node_modules\vite\bin\vite.js"

REM Check prerequisites
if not exist "%PYTHON%" (
    echo [ERROR] Python not found at %PYTHON%
    echo        Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

if not exist "%NODE%" (
    echo [ERROR] Node.js not found at %NODE%
    echo        Bamboo requires Node.js 22+
    pause
    exit /b 1
)

echo ============================================================
echo   Bamboo v0.1.0 - AI Coding Agent Desktop
echo ============================================================
echo.

REM Start bridge
echo [1/2] Starting Python bridge on :18720...
start "" /b "%PYTHON%" "%BRIDGE%" --port 18720
timeout /t 3 /nobreak >nul

REM Check bridge health
curl -s http://127.0.0.1:18720/api/health >nul 2>&1
if errorlevel 1 (
    echo [WARN] Bridge may not be ready, continuing anyway (mock mode)
) else (
    echo [OK] Bridge ready
)

REM Start Vite dev server
echo [2/2] Starting UI server on :1420...
start "" "http://localhost:1420"
"%NODE%" "%VITE_BIN%" run dev --port 1420 --host 127.0.0.1

echo.
echo Done. Open http://localhost:1420 in your browser.
echo Press any key to stop servers...
pause >nul

REM Cleanup
taskkill /f /im python.exe 2>nul
exit /b 0
