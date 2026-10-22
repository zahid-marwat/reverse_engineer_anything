@echo off
setlocal enabledelayedexpansion

title REA Studio - Reverse Engineer Anything GUI

cd /d "%~dp0"

echo ===================================================
echo     REA Studio - Reverse Engineer Anything GUI
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check if dependencies are installed
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm.cmd ci --engine-strict=false
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm ci failed.
        pause
        exit /b %ERRORLEVEL%
    )
    echo.
)

:: 3. Check if native Windows binaries are present
if not exist "native\windows\build\rea-windows-x64.node" (
    echo [INFO] Windows native controls missing. Fetching from package...
    call npm.cmd pack rea-agents@6.5.0 >nul 2>nul
    tar -xzf rea-agents-6.5.0.tgz >nul 2>nul
    if not exist "native\windows\build" mkdir native\windows\build
    copy /Y package\native\windows\build\manifest.json native\windows\build\ >nul 2>nul
    copy /Y package\native\windows\build\rea-windows-x64.node native\windows\build\ >nul 2>nul
    if exist "package" rmdir /S /Q package
    if exist "rea-agents-6.5.0.tgz" del rea-agents-6.5.0.tgz
    echo.
)

:: 4. Check if runtime is compiled
if not exist "dist\" (
    echo [INFO] Compiled runtime not found in dist\. Building...
    call npm.cmd run build:cached
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Build failed.
        pause
        exit /b %ERRORLEVEL%
    )
    echo.
)

:: 5. Launch GUI in browser
echo [INFO] Launching REA Visual Studio GUI...
echo Opening http://localhost:4123 in your browser...
echo.

start "" "http://localhost:4123"
node gui/server.js

pause
