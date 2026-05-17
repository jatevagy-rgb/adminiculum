param(
  [switch]$WhatIf,
  [switch]$ArchiveRootBackend,
  [switch]$ArchivePowerApps,
  [switch]$ArchiveGptCsomag,
  [switch]$ArchiveDeployArtifacts,
  [switch]$ArchiveLegacyScripts,
  [switch]$DeleteZips,
  [switch]$DeleteRepoAudit,
  [switch]$DeletePid
)

$ErrorActionPreference = 'Stop'

$root = "C:\Users\hubay\Documents\Adminiculum"
$archiveRoot = Join-Path $root "Archive\Repo-Cleanup-20260326"

function Ensure-Dir($path) {
  if (-not (Test-Path $path)) {
    if ($WhatIf) {
      Write-Host "[WhatIf] New-Item -ItemType Directory -Path $path" -ForegroundColor Yellow
    } else {
      New-Item -ItemType Directory -Path $path | Out-Null
    }
  }
}

function Move-IfExists($source, $dest) {
  if (Test-Path $source) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Move-Item $source $dest" -ForegroundColor Yellow
    } else {
      Move-Item $source $dest -Force
    }
  }
}

function Remove-IfExists($source) {
  if (Test-Path $source) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Remove-Item $source" -ForegroundColor Yellow
    } else {
      Remove-Item $source -Force -Recurse
    }
  }
}

Ensure-Dir $archiveRoot
Ensure-Dir (Join-Path $archiveRoot 'Legacy')
Ensure-Dir (Join-Path $archiveRoot 'PowerApps')
Ensure-Dir (Join-Path $archiveRoot 'Deploy')
Ensure-Dir (Join-Path $archiveRoot 'Debug')
Ensure-Dir (Join-Path $archiveRoot 'Reference')

# --- Legacy root backend (archive, opt-in) ---
if ($ArchiveRootBackend) {
  $legacyRootItems = @(
    'package.json','package-lock.json','tsconfig.json','start.bat','startup.sh','src','prisma'
  )
  foreach ($item in $legacyRootItems) {
    Move-IfExists (Join-Path $root $item) (Join-Path $archiveRoot 'Legacy')
  }
}

# --- Root env legacy (archive) ---
$rootEnvItems = @('.env','.env.example')
foreach ($item in $rootEnvItems) {
  Move-IfExists (Join-Path $root $item) (Join-Path $archiveRoot 'Legacy')
}

# --- Legacy scripts (archive) ---
if ($ArchiveLegacyScripts) {
  $legacyScripts = @('launch-adminiculum.bat','Backend\start.bat')
  foreach ($item in $legacyScripts) {
    Move-IfExists (Join-Path $root $item) (Join-Path $archiveRoot 'Legacy')
  }
}

# --- Power Apps (archive, opt-in) ---
if ($ArchivePowerApps) {
  $powerAppsFiles = @(
    'POWER_APPS_CONNECTOR_ACTIONS.md','POWER_APPS_FULL_SETUP.md','POWER_APPS_OAUTH_CONFIG.md','POWER_APPS_TUNNEL_SETUP.md',
    'powerapps-openapi.json','powerapps-openapi-clean.yaml','powerapps-swagger2-clean-whoami.yaml','powerapps-swagger2-runtime-aligned.yaml'
  )
  foreach ($item in $powerAppsFiles) {
    Move-IfExists (Join-Path $root $item) (Join-Path $archiveRoot 'PowerApps')
  }
}

# --- Deploy/build artifacts (archive, opt-in) ---
if ($ArchiveDeployArtifacts) {
  $deployItems = @('deploy','deploy-check','deploy-check2','temp_deploy','export','dist','deploy-azure.bat','deploy-azure.sh','deploy.sh')
  foreach ($item in $deployItems) {
    Move-IfExists (Join-Path $root $item) (Join-Path $archiveRoot 'Deploy')
  }
}

# --- Reference: gpt csomag (archive, opt-in) ---
if ($ArchiveGptCsomag) {
  Move-IfExists (Join-Path $root 'gpt csomag') (Join-Path $archiveRoot 'Reference')
}

# --- Debug bundles (delete, opt-in) ---
if ($DeleteZips) {
  $debugDelete = @('debug-bundle-case-contracts.zip','debug-bundle-frontend.zip','Adminiculum-repo-audit.zip')
  foreach ($item in $debugDelete) {
    Remove-IfExists (Join-Path $root $item)
  }

  $zipDelete = @('package-lock.zip','Backend.zip','dist.zip','deploy-azure.zip','azuredeploy.zip')
  foreach ($item in $zipDelete) {
    Remove-IfExists (Join-Path $root $item)
  }
}

# --- Repo audit artifacts (delete, opt-in) ---
if ($DeleteRepoAudit) {
  Remove-IfExists (Join-Path $root '_repo_audit')
  Remove-IfExists (Join-Path $root '_repo_audit_script.ps1')
}

# --- PID file (delete, opt-in) ---
if ($DeletePid) {
  Remove-IfExists (Join-Path $root '.dev-pids.json')
}

Write-Host "Cleanup staged. Review Archive/Repo-Cleanup-20260326 before final removal." -ForegroundColor Green
