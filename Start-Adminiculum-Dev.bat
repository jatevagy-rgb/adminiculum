@echo off
setlocal
set SCRIPT_DIR=%~dp0
set REPO_ROOT=%SCRIPT_DIR:~0,-1%
echo [launcher] Repo root: "%REPO_ROOT%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\dev-launch.ps1"
if errorlevel 1 (
  echo [launcher] Launch failed with code %errorlevel%.
  echo [launcher] Check logs\dev\latest-run.txt and launcher.log for details.
)
endlocal
