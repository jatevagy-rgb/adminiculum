param(
  [switch]$NoOpen,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$backendDir = Join-Path $repoRoot 'Backend'
$frontendDir = Join-Path $repoRoot 'Frontend'
$frontendCache = Join-Path $frontendDir '.next'
$ports = @(3000, 3001, 4000, 5000, 5173)

function Write-Step {
  param([string]$Message)
  Write-Host "[adminiculum-local] $Message"
}

function Stop-PortListeners {
  param([int]$Port)

  $owners = @()
  try {
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    $owners = @()
  }

  foreach ($owner in $owners) {
    if (-not $owner) {
      continue
    }

    try {
      Stop-Process -Id $owner -Force -ErrorAction Stop
      Write-Step "Stopped PID $owner listening on localhost port $Port"
    } catch {
      Write-Step "Could not stop PID $owner on port ${Port}: $($_.Exception.Message)"
    }
  }
}

function Start-DevWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $quotedTitle = $Title.Replace("'", "''")
  $quotedDir = $WorkingDirectory.Replace("'", "''")
  $quotedCommand = $Command.Replace("'", "''")
  $psCommand = "cd '$quotedDir'; `$Host.UI.RawUI.WindowTitle = '$quotedTitle'; $quotedCommand"

  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $psCommand
  ) -WorkingDirectory $WorkingDirectory | Out-Null
}

Write-Step "Restarting LOCALHOST development servers only. Azure is not touched."
Write-Step "Repo root: $repoRoot"

if (-not (Test-Path $backendDir)) {
  throw "Backend directory not found: $backendDir"
}
if (-not (Test-Path $frontendDir)) {
  throw "Frontend directory not found: $frontendDir"
}

foreach ($port in $ports) {
  Stop-PortListeners -Port $port
}

if (Test-Path $frontendCache) {
  $resolvedCache = Resolve-Path $frontendCache
  if (-not $resolvedCache.Path.StartsWith((Resolve-Path $frontendDir).Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected cache path: $resolvedCache"
  }
  Remove-Item -LiteralPath $resolvedCache.Path -Recurse -Force
  Write-Step "Cleared frontend Next cache: $resolvedCache"
} else {
  Write-Step "Frontend Next cache not present; nothing to clear."
}

Write-Step "Starting backend dev server in a new PowerShell window: http://localhost:3001"
Start-DevWindow -Title 'Adminiculum Backend Dev' -WorkingDirectory $backendDir -Command 'npm.cmd run dev'

Write-Step "Starting frontend dev server in a new PowerShell window: http://localhost:3000"
Start-DevWindow -Title 'Adminiculum Frontend Dev' -WorkingDirectory $frontendDir -Command 'npm.cmd run dev'

if (-not $NoOpen -and -not $NoBrowser) {
  Write-Step "Opening frontend in browser."
  Start-Process 'http://localhost:3000'
}

Write-Step "Done. This helper stopped local port listeners only and did not modify source files or database data."

