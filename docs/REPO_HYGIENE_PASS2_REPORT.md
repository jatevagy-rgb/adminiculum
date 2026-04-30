# REPO HYGIENE PASS 2 — REPORT

**Date**: 2026-04-30  
**Branch**: `hotfix/runtime-shape-20260308`  
**Commit**: `3730215` (Harden anonymization clipboard handling and gitignore)

---

## 1. SUMMARY

The repository has been successfully boxed into `Backend/` and `Frontend/` canonical directories. This report catalogs the ~200 untracked files in the working tree and provides recommendations for safe handling.

---

## 2. UNTRACKED FILES CATEGORIZED

### 2.1 SAFE-TO-IGNORE — Generated/Build/Temp Artifacts

These files are safe to delete locally or ignore via .gitignore. They do not contain production logic.

| Pattern | Examples | Action |
|---------|----------|--------|
| Build result logs | `*_result.txt`, `build-output.txt`, `tsc*.txt` | Delete or ignore |
| TypeScript build info | `*.tsbuildinfo` | Delete or ignore |
| Dev server PIDs | `.dev-pids.json` | Already ignored via `*.pid` |
| Test results | `test-results/` | Delete or ignore |
| Screenshots | `screenshots/` | Delete or ignore |
| Webapp logs | `webapp-logs*.zip` | Delete or ignore |
| Temp zip directories | `tmp_zip_new/`, `tmp_zip_old/`, `zip_temp/` | Delete |
| Patch staging | `patch-temp/`, `generation-draft-patch/`, `frontend-patch/` | Delete |
| Deploy staging | `backend_deploy_staging/` | Delete |
| Repair reports | `repair-report.json` | Delete |
| Malformed temp files | `$null`, `{`, `{console.error(e)` | **INVESTIGATE before delete** |
| Malformed Frontend files | `Frontend/{`, `Frontend/String(t).trim()` | **INVESTIGATE before delete** |

**Note**: .gitignore was updated to cover `*_result.txt`, `*_output.txt`, `tsc*.txt`, `build-output.txt`, and `*.tsbuildinfo`.

---

### 2.2 SAFE-TO-IGNORE — Local Archives (NEVER add to git)

These large ZIP archives should remain untracked. They are local backups and deployment artifacts.

| File | Size Estimate | Recommendation |
|------|---------------|----------------|
| `Backend.zip`, `Backend (2).zip`, `Backend (3).zip` | ~100-165 MB each | Keep locally only |
| `Backend_active.zip`, `Backend_current.zip` | ~130-165 MB | Keep locally only |
| `Backend_live_20260408.zip`, `Backend_deploy_hygiene.zip` | ~160-230 MB | Keep locally only |
| `backend-deploy*.zip` (many variants) | Various | Keep locally only |
| `Frontend.zip`, `Frontend_live_20260408.zip` | ~200 MB | Keep locally only |
| `Adminiculum_LIVE_Backend_20260402_2242.zip` | ~2.4 MB | Keep locally only |
| `Adminiculum_LIVE_Frontend_20260402_2242.zip` | ~400 KB | Keep locally only |
| `webapp-logs*.zip` | Various | Keep locally only |
| `generation-draft-*.zip` | ~18 KB | Keep locally only |
| `stitch-workstations-*.zip` | Various | Keep locally only |

**Rule**: Never `git add *.zip`. These are excluded by `deploy*.zip` pattern in .gitignore but the pattern may not cover all. Recommend local-only storage.

---

### 2.3 MANUAL REVIEW REQUIRED — Documentation/Reports

These files contain valuable process documentation but should be reviewed before adding to git.

| File | Recommendation |
|------|----------------|
| `AGENTS.md` | **KEEP** — Project agent rules |
| `BOXED_PRODUCT_PHASE*.md` | Review and potentially keep final versions |
| `IMPLEMENTATION_REPORT_*.md` | Review — keep if they document accepted features |
| `DEBUG_PASS_*.md` | Review — some may be superseded |
| `PATCH_*.md`, `PATCH_REPORT_*.md` | Review — keep if relevant to current state |
| `PHASE_*.md` | Review — many are superseded by boxed topology |
| `UI3_CLOSEOUT_*.md` | Review — UI-3 closeout documentation |
| `ANONYMIZATION_*.md` | Review — relevant to anonymization feature |
| `CASE_ID_FIX_*.md` | Review — may be relevant |
| `DEMO_*.md`, `DEMO_SCENARIO_*.md` | Review — demo scripts |
| `FEATURE_PACK_CONTRACT.md` | Review — feature scope |
| `FRONTEND_PACK_GUARD_STANDARD.md` | Review — frontend standards |
| `PATCH_INTAKE_STANDARD.md`, `PATCH_PACK_STANDARD.md` | Review — process standards |
| `PROJECT_HANDOFF_20260401.md` | Review — handoff documentation |
| `TENANT_INSTALL_RUNBOOK.md` | Review — installation guide |
| `README.md` (root) | Review — project README |
| `swagger.yaml`, `swagger2.yaml` | Review — API specs (may be needed) |

**Note**: A cleaner approach would be to keep only final/accepted documentation and delete drafts, but this requires manual review.

---

### 2.4 MANUAL REVIEW REQUIRED — Development Scripts

These scripts may be useful locally but should be reviewed before committing.

| File | Recommendation |
|------|----------------|
| `Start-Adminiculum-Dev.bat`, `Stop-Adminiculum-Dev.bat` | Review — local dev helpers |
| `frontend-dev.ps1` | Review — local dev helper |
| `scripts/dev-launch.ps1`, `scripts/dev-stop.ps1` | Review — dev scripts |
| `scripts/start-dev.bat` | Review — dev scripts |
| `scripts/smoke.js` | Review — smoke test script |
| `scripts/repo-cleanup.ps1` | Review — cleanup script (do NOT run without review) |
| `remote_services_patched.js` | **INVESTIGATE** — unknown purpose |

---

### 2.5 MANUAL REVIEW REQUIRED — Directories

| Directory | Recommendation |
|-----------|----------------|
| `Archive/` | Review contents — appears to contain legacy/recovered files |
| `docs/` | Review — local documentation |
| `Infrastructure/` | Review — Azure infrastructure (Bicep) — may be needed |
| `gpt csomag/` | Review — GPT-related (space in name is unusual) |
| `gpt-csomag-vs-workstations-audit/` | Review — audit files |
| `Backend/scripts/` | Review — contains MJS debug scripts |
| `Backend/templates/isolation-tests/` | **DO NOT DELETE** — template variants needed for generation |
| `Frontend/docs/` | Review — frontend documentation |

---

### 2.6 MANUAL REVIEW REQUIRED — Config/Lock Files

| File | Status |
|------|--------|
| `.github/dependabot.yml` | **ALREADY TRACKED** — shows as untracked but is in git |
| `.kilocodemodes` | Review — Kilo Code mode settings |
| `.nvmrc` | Review — Node version (4 chars: "20\n") |

---

### 2.7 NEVER ADD TO GIT — Malformed/Suspicious Files

These files have malformed names and should be investigated before any action:

| File | Note |
|------|------|
| `$null` | Windows variable expansion artifact |
| `{` | Malformed file/directory name |
| `{console.error(e)` | JavaScript error object serialized |
| `Frontend/{` | Malformed directory name inside Frontend |
| `Frontend/String(t).trim()` | JavaScript method call serialized |

**Action**: Do NOT `git add` these under any circumstances. Investigate origin before deleting.

---

## 3. WHAT .GITIGNORE NOW COVERS

Updated `.gitignore` with these new patterns:

```gitignore
# Build result logs
*_result.txt
*_output.txt
tsc*.txt
build-output.txt

# TypeScript build info
*.tsbuildinfo
```

**Already covered by existing patterns**:
- `tmp/`, `temp/` → covers `tmp_zip_new/`, `tmp_zip_old/`, `zip_temp/`
- `deploy*.zip` → covers most zip artifacts
- `*.pid` → covers `.dev-pids.json`

---

## 4. WHAT SHOULD NEVER BE ADDED

| Pattern | Reason |
|---------|--------|
| `*.zip` at root | Large binaries, local backups |
| `$null` | Windows artifact, malformed |
| `{`, `{console.error(e)` | Malformed names, suspicious |
| `Archive/` | Legacy files, not part of boxed product |
| `Backend/templates/isolation-tests/` | Template variants for testing — needed |
| `Backend/prisma/migrations/` | **NEVER modify** — protected per AGENTS.md |
| `.env` files | Secrets |
| `Backend/SECRETS.md` | Secrets documentation |

---

## 5. RECOMMENDED FUTURE CLEANUP COMMANDS

**After backing up important files**, these commands will clean up safe artifacts:

```bash
# Delete build artifacts (SAFE - can regenerate)
rm -f */*_result.txt */*_output.txt tsc*.txt build-output.txt
rm -f **/*.tsbuildinfo

# Delete temp directories (SAFE - can regenerate)
rm -rf tmp_zip_new/ tmp_zip_old/ zip_temp/
rm -rf patch-temp/ generation-draft-patch/ frontend-patch/
rm -rf backend_deploy_staging/
rm -rf test-results/ screenshots/

# Delete webapp logs (SAFE - runtime logs)
rm -f webapp-logs*.zip

# Delete malformed files (AFTER INVESTIGATING)
rm -f '$null' '{' '{console.error(e)'
rm -f 'Frontend/{' 'Frontend/String(t).trim()'

# Keep these even if untracked:
# - AGENTS.md (project rules)
# - .nvmrc (node version)
# - Infrastructure/ (may be needed)
# - Backend/templates/ (required for generation)
# - Archive/ (legacy - review before deleting)
```

**WARNING**: Do NOT run cleanup commands without first verifying you have backups of anything important.

---

## 6. PRODUCTION RUNTIME LOGIC — CONFIRMATION

**NO production runtime logic was changed** in this hygiene pass.

Files modified:
- `.gitignore` — only added ignore patterns for generated artifacts

Files NOT modified:
- `Backend/src/` — production code unchanged
- `Frontend/src/` — production code unchanged
- `Backend/prisma/` — migrations untouched
- `Backend/templates/` — templates untouched

---

## 7. NEXT STEPS

1. **User to review** the manual review categories
2. **User to investigate** malformed files (`$null`, `{`, etc.)
3. **User to decide** which documentation to keep/archive
4. **User to run** cleanup commands after backing up important files
5. **Future patches** should not create new untracked artifacts in root

---

## 8. FILES CHANGED THIS PASS

| File | Change |
|------|--------|
| `.gitignore` | Added patterns for `*_result.txt`, `*_output.txt`, `tsc*.txt`, `build-output.txt`, `*.tsbuildinfo` |

**No production code changed. No commits made.**