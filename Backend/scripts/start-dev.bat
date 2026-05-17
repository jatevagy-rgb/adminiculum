@echo off

REM Launcher-compatible helper that starts the backend dev server from the scripts folder.
cd /d "%~dp0.."
call npm run dev
if errorlevel 1 (
    echo.
    echo npm run dev failed with exit code %errorlevel%.
    pause
)
