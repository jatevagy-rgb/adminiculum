# Repo Cleanup Preview Script
# Dry-run: only lists files that would be removed by `git clean -fd`
# Does NOT delete anything.
# Run: powershell -ExecutionPolicy Bypass -File scripts/repo-cleanup-preview.ps1

$ErrorActionPreference = "Continue"
$RepoRoot = "C:\Users\hubay\Documents\Adminiculum"

Write-Host "=== Adminiculum Repository Cleanup Preview ===" -ForegroundColor Cyan
Write-Host "Mode: DRY-RUN (no files will be deleted)" -ForegroundColor Yellow
Write-Host ""

# Count items per category
$agentConfig = @()
$infrastructure = @()
$devScripts = @()
$reportArtifacts = @()
$prismaMigrations = @()
$frontendArtifacts = @()
$webappLogs = @()
$archiveFolders = @()
$miscTemp = @()

# --- Agent config ---
$agentConfig += Join-Path $RepoRoot ".kilo" -ErrorAction SilentlyContinue
$agentConfig += Join-Path $RepoRoot ".kilocodemodes" -ErrorAction SilentlyContinue

# --- Infrastructure ---
$infrastructure += Join-Path $RepoRoot "Infrastructure" -ErrorAction SilentlyContinue

# --- Dev scripts ---
$devScripts += Join-Path $RepoRoot "frontend-dev.ps1" -ErrorAction SilentlyContinue

# --- Report/debug/handoff artifacts ---
$reportPatterns = @(
    "FINAL_REPORT*.md",
    "DEBUG_PASS*.md",
    "DEBUG_PASS_REPORT*.md",
    "IMPLEMENTATION_REPORT*.md",
    "PATCH_*.md",
    "PATCH_REPORT*.md",
    "PHASE_*.md",
    "PHASE_*_REPORT*.md",
    "BOXED_PRODUCT_PHASE*_REPORT*.md",
    "CASE_ID_FIX*.md",
    "CORRECTION_PASS_REPORT*.md",
    "*_VERIFICATION*.md",
    "*_CORRECTION*.md",
    "*_HANDOVER*.md",
    "CREATE_CASE_FIX.md",
    "FEATURE_PACK_CONTRACT.md",
    "FIRST_DEPLOY_VERIFICATION_PLAN.md",
    "STAGING_SMOKE_EXECUTION_CHECKLIST.md",
    "TENANT_INSTALL_RUNBOOK.md",
    "REHEARSAL_LOG_TEMPLATE.md",
    "POST_TOPOLOGY_STABILIZATION_REPORT*.md",
    "UPLOAD_AND_GENERATE_FIX_REPORT*.md",
    "DEMO_SCENARIO_AUDIT*.md",
    "DEMO_SCRIPT*.md",
    "E2E_FLOW_VERIFICATION*.md",
    "FRONTEND_PACK_GUARD_STANDARD.md",
    "ANONYMIZATION_QA_CHECKLIST.md"
)
foreach ($pattern in $reportPatterns) {
    $items = Get-ChildItem -Path $RepoRoot -Filter $pattern -File -ErrorAction SilentlyContinue
    $reportArtifacts += $items.FullName
}

# --- Frontend artifacts ---
$frontendArtifacts += Join-Path $RepoRoot "Frontend\next-env.d.ts" -ErrorAction SilentlyContinue
$frontendArtifacts += Join-Path $RepoRoot "ADMINICULUM_FRONTEND_UI_INVENTORY_PACK" -ErrorAction SilentlyContinue

# --- Webapp logs ---
$webappLogs += Join-Path $RepoRoot "webapp-logs-current" -ErrorAction SilentlyContinue
$webappLogs += Join-Path $RepoRoot "webapp-logs-latest" -ErrorAction SilentlyContinue
$webappLogs += Join-Path $RepoRoot "webapp-logs" -ErrorAction SilentlyContinue
$webappLogs += Join-Path $RepoRoot "webapp_logs_extract" -ErrorAction SilentlyContinue

# --- Archive folder ---
$archiveFolders += Join-Path $RepoRoot "Archive" -ErrorAction SilentlyContinue

# --- Misc temp ---
$miscTemp += Join-Path $RepoRoot "gpt csomag" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot " új szerzgenrész" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "backend-redeploy-temp" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "CONTRACT_PATCH_COMPATIBILITY_MATRIX.md" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "FLOW_VALIDATION_REPORT_20260401.md" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "PROJECT_HANDOFF_20260401.md" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "TIME_ENTRY_FIX_REPORT.md" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "UI3_CLOSEOUT_BOXED_ROLLOUT_REPORT.md" -ErrorAction SilentlyContinue
$miscTemp += Join-Path $RepoRoot "UI3_CLOSEOUT_BOXED_ROLLOUT_REPORT_FINAL.md" -ErrorAction SilentlyContinue

# --- Function to print category ---
function Print-Category {
    param ($Title, $Items, $Color)
    $validItems = $Items | Where-Object { $_ -ne $null -and (Test-Path $_) }
    if ($validItems.Count -eq 0) { return }
    Write-Host "$Title ($($validItems.Count) items)" -ForegroundColor $Color
    foreach ($item in $validItems) {
        Write-Host "  $item" -ForegroundColor Gray
    }
    Write-Host ""
}

Print-Category "A) Agent config" $agentConfig "Magenta"
Print-Category "B) Infrastructure (IaC)" $infrastructure "Cyan"
Print-Category "C) Dev scripts" $devScripts "Yellow"
Print-Category "D) Report/debug/handoff artifacts" $reportArtifacts "DarkGray"
Print-Category "E) Prisma migration directories (untracked)" $prismaMigrations "Red"
Print-Category "F) Frontend artifacts" $frontendArtifacts "Green"
Print-Category "G) Webapp log archives" $webappLogs "DarkCyan"
Print-Category "H) Archive folder" $archiveFolders "DarkMagenta"
Print-Category "I) Misc temp" $miscTemp "DarkGray"

# --- Summary ---
$allItems = @()
$allItems += $agentConfig + $infrastructure + $devScripts + $reportArtifacts + $prismaMigrations + $frontendArtifacts + $webappLogs + $archiveFolders + $miscTemp
$validItems = $allItems | Where-Object { $_ -ne $null -and (Test-Path $_) }

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Total items that would be removed: $($validItems.Count)" -ForegroundColor White
Write-Host ""
Write-Host "After running this cleanup:" -ForegroundColor Yellow
Write-Host "  git status --short" -ForegroundColor White
Write-Host ""
Write-Host "Files NOT touched (protected by .gitignore rules or existing tracked files):" -ForegroundColor Yellow
Write-Host "  - docs/" -ForegroundColor White
Write-Host "  - templates/" -ForegroundColor White
Write-Host "  - Backend/src/" -ForegroundColor White
Write-Host "  - Frontend/src/" -ForegroundColor White
Write-Host "  - Backend/prisma/migrations/*/migration.sql (tracked)" -ForegroundColor White
Write-Host "  - public/client-house-style PNGs" -ForegroundColor White
Write-Host "  - README.md" -ForegroundColor White
Write-Host "  - .nvmrc" -ForegroundColor White
Write-Host ""
Write-Host "Manual cleanup command (run after reviewing the list above):" -ForegroundColor Yellow
Write-Host "  git clean -fd" -ForegroundColor White