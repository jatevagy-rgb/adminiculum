param(
    [switch]$Apply
)

$ErrorActionPreference = "Continue"
$RepoRoot = "C:\Users\hubay\Documents\Adminiculum"
$ArchiveRoot = "C:\Users\hubay\Documents\Adminiculum-local-cleanup-archive"
$ModeLabel = if ($Apply) { "APPLY" } else { "DRY-RUN" }

Write-Host "=== Adminiculum Active Cleanup ===" -ForegroundColor Cyan
Write-Host ("Mode: " + $ModeLabel) -ForegroundColor Yellow
Write-Host ""

$ProtectedPatterns = @(
    ".git/",
    ".gitignore",
    ".env",
    ".env.*",
    "Backend/src/",
    "Frontend/src/",
    "node_modules/",
    "Backend/node_modules/",
    "Frontend/node_modules/",
    "Backend/prisma/schema.prisma",
    "Backend/prisma/migrations/",
    "Backend/scripts/",
    "Backend/templates/",
    "Backend/uploads/",
    "Backend/dist/",
    "Backend/check-table.mjs",
    "Backend/SECRETS.md",
    "Backend/backend-dev.log",
    "Backend/backend_build_result.txt",
    "templates/",
    "docs/",
    "Frontend/public/",
    "Frontend/uploads/",
    "Frontend/.next/",
    "Frontend/dist/",
    "Frontend/dev.log",
    "Frontend/dev.err.log",
    "Frontend/next-dev.log",
    "Frontend/frontend-dev.log",
    "Frontend/frontend_build_result.txt",
    "Frontend/build-output.txt",
    "Frontend/test-results/",
    "Frontend/tmp-ui-runtime-check.cjs",
    "package.json",
    "package-lock.json",
    "tsconfig",
    "next.config",
    ".nvmrc",
    "README.md",
    "Infrastructure/",
    "frontend-dev.ps1",
    "build-output.txt",
    "backend-dev.log",
    "backend_deploy_staging/",
    "frontend-dev.err.log",
    "frontend-dev.out.log",
    "frontend3002.log",
    "test-results/",
    ".frontend-dev.pid",
    ".kilo/",
    ".kilocodemodes",
    "Frontend/next-env.d.ts"
)

function Test-Protected {
    param($Path)
    foreach ($pattern in $ProtectedPatterns) {
        if ($Path -like ("*" + $pattern + "*")) { return $true }
    }
    return $false
}

function Get-SafeMoveTarget {
    param($ItemPath)

    $name = Split-Path $ItemPath -Leaf
    $isReport = $name -match "^(FINAL_REPORT|DEBUG_PASS|DEBUG_PASS_REPORT|IMPLEMENTATION_REPORT|PATCH_|PATCH_REPORT|PHASE_|BOXED_PRODUCT_PHASE|CASE_ID_FIX|CORRECTION_PASS|.*_VERIFICATION|.*_CORRECTION|.*_HANDOFF|.*_HANDOVER|CREATE_CASE|FEATURE_PACK|FIRST_DEPLOY|STAGING_SMOKE|TENANT_|REHEARSAL|POST_TOPOLOGY|UPLOAD_AND_GENERATE|DEMO_|E2_|FRONTEND_PACK|ANONYMIZATION_QA|.*_REPORT|CONTRACT_PATCH|CASE_ID_|TIME_ENTRY_|UI3_CLOSEOUT|PROJECT_HANDOFF)"
    $isTemp = $name -match "^(repair|report|remote_services|write-phase|frontend-patch|backend-redeploy|tmp_zip|patch-temp|generation-draft)" -or $name -match "\.(tmp|bak)$" -or $name -match "^tsc" -or $name -eq "logs" -or $name -eq "tmp" -or $name -eq "plans" -or $name -eq "screenshots" -or $name -eq "Archive" -or $name -eq "generation-draft-patch"
    $isLog = $name -match "^(webapp-logs|webapp_logs)" -or $name -eq "Archive"
    $isDesign = $name -match "^(ADMINICULUM_FRONTEND_UI_INVENTORY|gpt csomag|.*.j.*szerz|Frontend_UI_Extraction|stitch-workstations-fixed-proof|stitch-workstations-implementation-proof|gpt-csomag-vs-workstations-audit)"
    $isZip = $name -match "\.(zip|7z|tar|gz)$" -or $name -match "^(Backend|Frontend)_?(live|deploy|hotfix|hygiene|current|canonical|fixed|oryx|backend).*\.zip$"

    if ($isReport) { return $ArchiveRoot + "\reports\" + $name }
    if ($isTemp) { return $ArchiveRoot + "\temp\" + $name }
    if ($isLog) { return $ArchiveRoot + "\logs-archive\" + $name }
    if ($isDesign) { return $ArchiveRoot + "\design-ref\" + $name }
    if ($isZip) { return $ArchiveRoot + "\zips\" + $name }
    return $ArchiveRoot + "\other\" + $name
}

function Remove-QuoteChars {
    param($Text)
    return $Text.Trim().Replace('"', '').Replace("'", '').Replace('`', '')
}

# Use -c core.quotePath=false to get raw unquoted paths from git
$ignoredOutput = git -c core.quotePath=false status --ignored --short 2>&1 | Out-String
$lines = $ignoredOutput -split "`n" | Where-Object { $_.Trim() -ne "" }

$toMove = @()
$skippedInvalid = 0

foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "") { continue }

    if ($trimmed.Length -lt 3) { continue }

    $status = $trimmed.Substring(0, 2)
    $rawPath = $trimmed.Substring(3).Trim()

    if ($status -ne "!!") { continue }

    # Strip any残留 quote or escape characters from git output
    $path = Remove-QuoteChars $rawPath

    if ($path -eq "" -or $path -eq $null) { continue }

    # Build full path safely
    $fullPath = $RepoRoot + "\" + $path

    # Skip if Test-Path fails (invalid chars, too long, etc.)
    $pathExists = $false
    try {
        $pathExists = Test-Path -LiteralPath $fullPath -ErrorAction SilentlyContinue
    } catch {
        Write-Host "[SKIP INVALID PATH] " + $path -ForegroundColor DarkRed
        $skippedInvalid++
        continue
    }

    if (-not $pathExists) {
        continue
    }

    if (Test-Protected $path) {
        Write-Host "[PROTECTED]  " + $path -ForegroundColor DarkGray
        continue
    }

    $target = Get-SafeMoveTarget $path
    $toMove += [PSCustomObject]@{
        Status = "!!"
        RelativePath = $path
        FullPath = $fullPath
        TargetBase = $target
        TargetName = Split-Path $target -Leaf
    }
}

$reports = $toMove | Where-Object { $_.TargetBase -like "*\reports\*" }
$temps = $toMove | Where-Object { $_.TargetBase -like "*\temp\*" }
$logs = $toMove | Where-Object { $_.TargetBase -like "*\logs-archive\*" }
$design = $toMove | Where-Object { $_.TargetBase -like "*\design-ref\*" }
$zips = $toMove | Where-Object { $_.TargetBase -like "*\zips\*" }
$other = $toMove | Where-Object { $_.TargetBase -like "*\other\*" }

Write-Host "=== Items to move (" + $toMove.Count + " total) ===" -ForegroundColor White
Write-Host ""

function Print-Category {
    param($Title, $Items, $Color)
    if ($Items.Count -eq 0) { return }
    Write-Host ($Title + " (" + $Items.Count + " items)") -ForegroundColor $Color
    foreach ($item in $Items) {
        Write-Host "  " + $item.RelativePath -ForegroundColor Gray
    }
    Write-Host ""
}

Print-Category "A) Report/handoff/debug" $reports "Cyan"
Print-Category "B) Temp/debug" $temps "Yellow"
Print-Category "C) Log/archive" $logs "DarkCyan"
Print-Category "D) Design/reference" $design "Magenta"
Print-Category "E) Zip archives" $zips "Green"
Print-Category "F) Other" $other "DarkGray"

if ($skippedInvalid -gt 0) {
    Write-Host ("[SKIPPED INVALID PATH count: " + $skippedInvalid + "]") -ForegroundColor DarkRed
    Write-Host ""
}

Write-Host "=== Summary ===" -ForegroundColor White
Write-Host ("Total items to move: " + $toMove.Count) -ForegroundColor White
Write-Host ""

if ($Apply) {
    Write-Host "Applying moves..." -ForegroundColor Yellow

    @("reports", "temp", "logs-archive", "design-ref", "zips", "other") | ForEach-Object {
        $dir = Join-Path $ArchiveRoot $_
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }

    $moved = 0
    $skipped = 0

    foreach ($item in $toMove) {
        try {
            $targetDir = Split-Path $item.TargetBase -Parent
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Move-Item -LiteralPath $item.FullPath -Destination $item.TargetBase -ErrorAction Stop
            Write-Host "[MOVED] " + $item.RelativePath -ForegroundColor Green
            $moved++
        } catch {
            Write-Host "[SKIPPED] " + $item.RelativePath + " -- " + $_.Exception.Message -ForegroundColor Red
            $skipped++
        }
    }

    Write-Host ""
    Write-Host ("Done: " + $moved + " moved, " + $skipped + " skipped.") -ForegroundColor White
} else {
    Write-Host "Dry-run complete. Run with -Apply to actually move files." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor White
    Write-Host ""
    Write-Host "  DRY-RUN (default -- safe, no files moved):" -ForegroundColor Gray
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts/repo-active-cleanup.ps1" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  APPLY (actually moves files to archive directory):" -ForegroundColor Gray
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts/repo-active-cleanup.ps1 -Apply" -ForegroundColor DarkGray
}