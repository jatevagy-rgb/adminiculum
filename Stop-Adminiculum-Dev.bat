@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\dev-stop.ps1"
echo [launcher-stop] Exit code: %errorlevel%
endlocal
