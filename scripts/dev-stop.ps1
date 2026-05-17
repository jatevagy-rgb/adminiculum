$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$pidFile = Join-Path $repoRoot '.dev-pids.json'

function Stop-ByPort($port) {
  $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  $owningProcessIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $owningProcessIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped process $processId (port $port)" -ForegroundColor Yellow
    } catch {
      Write-Host "Failed to stop process $processId (port $port): $_" -ForegroundColor Red
    }
  }
}

if (Test-Path $pidFile) {
  $content = Get-Content $pidFile -Raw | ConvertFrom-Json
  foreach ($entry in @(
    @{ pid = $content.backendPid; managed = $content.backendStartedByLauncher },
    @{ pid = $content.frontendPid; managed = $content.frontendStartedByLauncher }
  )) {
    if ($entry.pid -and $entry.managed) {
      try {
        Stop-Process -Id $entry.pid -Force -ErrorAction Stop
        Write-Host "Stopped process $($entry.pid)" -ForegroundColor Yellow
      } catch {
        Write-Host "Failed to stop process $($entry.pid): $_" -ForegroundColor Red
      }
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
} else {
  Write-Host "PID file not found. Falling back to port-based stop." -ForegroundColor Yellow
}

Stop-ByPort 3001
Stop-ByPort 3000
