param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$backendDir = Join-Path $repoRoot 'Backend'
$frontendDir = Join-Path $repoRoot 'Frontend'
$logsRoot = Join-Path $repoRoot 'logs\dev'
$pidFile = Join-Path $repoRoot '.dev-pids.json'

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $logsRoot $timestamp
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$launcherLog = Join-Path $runDir 'launcher.log'
$backendOut = Join-Path $runDir 'backend.out.log'
$backendErr = Join-Path $runDir 'backend.err.log'
$frontendOut = Join-Path $runDir 'frontend.out.log'
$frontendErr = Join-Path $runDir 'frontend.err.log'

function Write-LaunchLine {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
  Add-Content -Path $launcherLog -Value $line
  Write-Host $line
}

function Get-PortOwner {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    return $conn.OwningProcess
  } catch {
    return $null
  }
}

function Stop-ProcessSafe {
  param(
    [int]$ProcessId,
    [string]$Reason
  )

  if (-not $ProcessId -or $ProcessId -le 0) {
    return
  }

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    Write-LaunchLine "Stopped PID $ProcessId ($Reason)"
  } catch {
    Write-LaunchLine "Failed to stop PID $ProcessId ($Reason): $($_.Exception.Message)"
  }
}

function Stop-ByPort {
  param([int]$Port)

  $owners = @()
  try {
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    $owners = @()
  }

  foreach ($owner in $owners) {
    Stop-ProcessSafe -ProcessId $owner -Reason "port $Port"
  }
}

function Wait-Port {
  param([int]$Port, [int]$TimeoutSeconds = 45)
  for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
    $probe = Test-NetConnection -ComputerName 'localhost' -Port $Port -WarningAction SilentlyContinue
    if ($probe.TcpTestSucceeded) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

Write-LaunchLine "Repo root: $repoRoot"
Write-LaunchLine "Backend dir: $backendDir"
Write-LaunchLine "Frontend dir: $frontendDir"
Write-LaunchLine "Logs: $runDir"

if (-not (Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend directory not found: $frontendDir" }

# Canonical local ports:
# Frontend: 3000, Backend: 3001 (Backend/.env.example + Backend/src/index.ts default).
$backendPort = 3001
$frontendPort = 3000
$backendPid = $null
$frontendPid = $null
$backendStartedByLauncher = $false
$frontendStartedByLauncher = $false

Write-LaunchLine "Restart mode enabled: stopping existing frontend/backend processes"

if (Test-Path $pidFile) {
  try {
    $prev = Get-Content $pidFile -Raw | ConvertFrom-Json
    Stop-ProcessSafe -ProcessId $prev.backendPid -Reason 'previous launcher backendPid'
    Stop-ProcessSafe -ProcessId $prev.frontendPid -Reason 'previous launcher frontendPid'
  } catch {
    Write-LaunchLine "Failed to parse existing PID file: $($_.Exception.Message)"
  }
}

Stop-ByPort -Port $backendPort
Stop-ByPort -Port $frontendPort

Write-LaunchLine "Starting backend command: npm run dev"
$backendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
$backendPid = $backendProc.Id
$backendStartedByLauncher = $true

Write-LaunchLine "Starting frontend command: npm run dev"
$frontendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $frontendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
$frontendPid = $frontendProc.Id
$frontendStartedByLauncher = $true

$backendReady = Wait-Port -Port $backendPort -TimeoutSeconds 45
$frontendReady = Wait-Port -Port $frontendPort -TimeoutSeconds 45

Write-LaunchLine "Backend ready on ${backendPort}: $backendReady"
Write-LaunchLine "Frontend ready on ${frontendPort}: $frontendReady"

$frontendUrl = "http://localhost:$frontendPort"
if (-not $NoOpen -and $frontendReady) {
  Write-LaunchLine "Opening browser: $frontendUrl"
  Start-Process $frontendUrl
}

$pidData = @{
  backendPid = $backendPid
  frontendPid = $frontendPid
  backendStartedByLauncher = $backendStartedByLauncher
  frontendStartedByLauncher = $frontendStartedByLauncher
  runDir = $runDir
  backendDir = $backendDir
  frontendDir = $frontendDir
  frontendUrl = $frontendUrl
  startedAt = (Get-Date).ToString('o')
}

$pidData | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8
$pidData | ConvertTo-Json | Set-Content -Path (Join-Path $runDir 'launcher-summary.json') -Encoding UTF8
Set-Content -Path (Join-Path $logsRoot 'latest-run.txt') -Value $runDir -Encoding UTF8

Write-LaunchLine "Stored PID file: $pidFile"
Write-LaunchLine "Latest run pointer: $(Join-Path $logsRoot 'latest-run.txt')"
Write-LaunchLine "Use Stop-Adminiculum-Dev.bat to stop launcher-managed processes"
