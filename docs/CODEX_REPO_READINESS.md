# CODEX_REPO_READINESS.md — Codex Agent Onboarding Guide

**Purpose**: Prepare Codex agent to navigate the Adminiculum repository correctly, avoid common pitfalls, and follow safe development practices.

**Read this document before making any changes to the repository.**

---

## 1. REPOSITORY OVERVIEW

### What is Adminiculum?

Adminiculum is a legal practice management application for Hungarian law firms. It provides:
- Case and client management
- Document generation from DOCX templates
- Document anonymization and rehydration (AI-assisted)
- Time tracking (munkaórák)
- Review and approval workflows
- SharePoint integration for document storage

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js App Router (React, TypeScript) |
| Backend | Express + TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Auth | Azure/MSAL |
| Document Storage | SharePoint via Microsoft Graph API |
| Contract Templates | 22 DOCX files in `Backend/templates/` |

### Canonical Directory Structure

```
Adminiculum/
├── Frontend/          # Next.js App Router — React frontend
│   ├── src/
│   │   ├── app/       # Next.js pages (App Router)
│   │   ├── components/ # React components
│   │   └── lib/       # Utility functions, API clients
│   └── package.json
├── Backend/           # Express + TypeScript API
│   ├── src/
│   │   ├── modules/   # Feature modules (cases, documents, generation-draft, anonymize, etc.)
│   │   ├── routes/    # Express route definitions
│   │   └── ...
│   ├── templates/    # 22 DOCX contract templates (MUST stay tracked)
│   ├── prisma/       # Prisma schema + migrations (protected)
│   └── package.json
├── docs/             # Project documentation
└── AGENTS.md         # Agent rules (read first)
```

**Everything outside `Frontend/` and `Backend/` is auxiliary.** This includes documentation, scripts, archives, and zip files at the root level. When in doubt, check if a file is inside `Frontend/` or `Backend/` before modifying it.

---

## 2. SOURCE OF TRUTH

- **GitHub `main`** is the canonical source of truth
- Local work must start from an updated `main`
- **Never treat uncommitted local changes as canonical**
- **Never work directly on `main`**

---

## 3. WHAT CODEX SHOULD IGNORE

### Root-Level Untracked Files (~200 files)

The working tree contains many untracked files. Most are safe to ignore. **Do NOT attempt to clean these up without explicit instruction.**

#### Safe to Ignore (auxiliary/non-source):

| Pattern | Examples |
|---------|----------|
| `*.zip` | `Backend.zip`, `Frontend.zip`, `Backend_deploy_hygiene.zip` |
| `docs/_archive/` | Legacy documentation |
| `Archive/` | Legacy/recovered files |
| `deploy/` | Old deployment scripts |
| `build-output.txt` | Build logs |
| `*_result.txt` | Test/build result logs |
| `tsc*.txt` | TypeScript compiler output |
| `*.tsbuildinfo` | TypeScript incremental build info |
| `screenshots/` | Test screenshots |
| `test-results/` | Test runner output |
| `tmp_*` | Temporary directories |
| `*.log` | Local log files |
| `$null` | Malformed Windows artifact |
| `{` | Malformed file name |
| `Frontend/{` | Malformed directory inside Frontend |
| `ADMINICULUM_FRONTEND_UI_INVENTORY_PACK/` | UI inventory documentation pack |
| `IMPLEMENTATION_REPORT_*.md` | Implementation reports (review before touching) |
| `PATCH_*.md`, `PATCH_REPORT_*.md` | Patch documentation (review before touching) |

#### Do NOT Add to Git (ever):

- `*.zip` (large binaries)
- `build-output.txt`
- `*_result.txt`
- `tsc*.txt`
- `*.tsbuildinfo`
- `$null`, `{`, `{console.error(e)`
- `Archive/`
- `docs/_archive/`
- `.env` files
- `Backend/SECRETS.md`

---

## 4. WHAT CODEX MUST NEVER TOUCH

These areas are production-critical and must not be modified without explicit, written instruction.

### 4.1 Authentication and Security

| Area | Reason |
|------|--------|
| Azure/MSAL auth logic (Frontend + Backend) | Production authentication security |
| `.env` files | Contain secrets |
| `Backend/SECRETS.md` | Secret documentation |

### 4.2 Database Schema and Migrations

| Area | Reason |
|------|--------|
| `Backend/prisma/schema.prisma` | Prisma schema — protected unless migration pass explicitly instructed |
| `Backend/prisma/migrations/` | Database migration history — **never modify casually** |

### 4.3 Document Storage

| Area | Reason |
|------|--------|
| SharePoint upload/download logic | Document storage integrity |
| `uploads/` | Runtime user uploads |

### 4.4 Contract Generation Pipeline

| Area | Reason |
|------|--------|
| `Backend/src/modules/generation-draft/` | Contract generation service |
| `Backend/templates/` | 22 DOCX production templates — **MUST stay tracked** |
| `POST /api/v1/contracts/generate` | Template-based contract draft generation |

### 4.5 Anonymization/Rehydration Pipeline

| Area | Reason |
|------|--------|
| `Backend/src/modules/anonymize/` | Anonymization/rehydration backend |
| `Frontend/src/components/documents/AnonymizeModal.tsx` | Anonymization modal — workspace text, AI task selection, clipboard handling are critical |
| `Frontend/src/components/documents/RehydrateModal.tsx` | Rehydration modal — same critical flows |

### 4.6 GitHub Actions

| Area | Reason |
|------|--------|
| `.github/workflows/deploy*.yml` | Protected unless deploy explicitly instructed |

---

## 5. KNOWN SENSITIVE SYSTEMS

### Contract Generation (`Backend/src/modules/generation-draft/`)

- Route: `POST /api/v1/contracts/generate`
- Uses DOCX templates from `Backend/templates/`
- Fills templates with case/client/party data
- Does NOT create new templates — only fills existing ones
- Any changes must maintain template compatibility

### Anonymize → Rehydrate Flow

This is a critical user workflow. Do not break it.

**Flow**:
1. Select document → Open AnonymizeModal
2. Edit text in workspace → Select AI task → Submit
3. Backend returns anonymized text
4. User can copy to clipboard OR proceed to RehydrateModal
5. RehydrateModal imports AI response → Restores original names

**Critical components**:
- `AnonymizeModal.tsx` — workspace text, AI task selection, clipboard handling
- `RehydrateModal.tsx` — AI response import, name restoration
- `Backend/src/modules/anonymize/` — backend anonymization/rehydration logic

### Document Comparison

The `/documents/compare` surface is **metadata-only**. It shows:
- Document versions
- Creation dates
- Authors
- Lineage (parent/child relationships)

**It does NOT show text-diff.** Text-diff is not currently implemented. Do not claim or implement text-diff capability.

---

## 6. HOW TO SAFELY MAKE A CHANGE

### Step 1: Inspect Before Coding

```bash
# Always start by reading the rules
cat AGENTS.md

# Confirm branch state
git branch

# Check working tree
git status

# Pull latest from origin
git pull origin main
```

### Step 2: Create a Working Branch

```bash
git checkout -b codex/my-feature
```

### Step 3: Summarize Your Plan

Before coding, write down:
- **Files to change**: List specific files with paths
- **Files to avoid**: List protected areas you will NOT touch
- **Verification**: How you will verify the change works

Example:
```
I will change:
- Frontend/src/app/dashboard/page.tsx — add deadline widget
- Frontend/src/lib/api.ts — add deadlines API call

I will avoid:
- Backend/src/modules/ — no backend changes
- Backend/prisma/ — no schema changes
- Frontend/src/components/auth/ — auth logic untouched

Verification:
- Run `cd Frontend && npx tsc --noEmit`
- Verify `next build` succeeds
- Manual check: navigate to dashboard, verify widget renders
```

### Step 4: Make the Change

- Change only the files listed in your plan
- Avoid broad refactors
- Prefer frontend-only changes where possible

### Step 5: Verify Before Committing

```bash
# Review all changes
git diff

# Stage only specific files — NEVER use git add .
git add Frontend/src/app/dashboard/page.tsx
git add Frontend/src/lib/api.ts

# Verify what will be committed
git diff --cached

# Run build check
cd Frontend && npx tsc --noEmit
```

### Step 6: Commit and Push

```bash
# Commit with clear message
git commit -m "feat: add deadline widget to dashboard"

# Push to your branch
git push -u origin codex/my-feature
```

---

## 6A. CODEX ENVIRONMENT SETUP

### Critical Setup Rule
- Do NOT run `npm ci` at the repository root.

### Active Node Projects
- `Frontend/` — Next.js App Router
- `Backend/` — Express + TypeScript

### Setup Commands
```bash
cd Frontend && npm ci
cd ../Backend && npm ci
```

Do NOT run `npm ci` from the repository root. The root is not a Node project.

---

## 7. SAFE GIT WORKFLOW

### Always:

```bash
# Start fresh
git checkout main
git pull origin main
git checkout -b codex/my-feature

# During work
git status          # Check what changed
git diff            # Review all changes

# Before commit
git add <specific-file>   # Never git add .
git diff --cached         # Verify staged changes

# After commit
git push -u origin codex/my-feature
```

### Never:

```bash
git add .              # CRITICAL: Never do this
git add -A             # CRITICAL: Never do this
git stage .            # CRITICAL: Never do this
```

These commands will add all untracked files including:
- `*.zip` archives (hundreds of MB)
- `$null`, `{`, malformed files
- `Archive/` contents
- Build result logs
- Test screenshots

---

## 8. EXAMPLE SAFE COMMIT COMMANDS

```bash
# Safe: stage specific files
git add Backend/src/modules/cases/routes.ts
git add Frontend/src/app/cases/page.tsx

# Safe: commit with clear message
git commit -m "fix: correct case list sort order in API response"

# Safe: push branch
git push -u origin codex/my-feature
```

---

## 9. EXAMPLE DANGEROUS COMMANDS TO AVOID

```bash
# DANGEROUS — adds everything including *.zip and malformed files
git add .

# DANGEROUS — same problem
git add -A

# DANGEROUS — same problem
git stage .
```

---

## 10. PRODUCT TRUTHFULNESS RULES

- **Do NOT add fake analytics.** Only real usage data.
- **Do NOT add fake AI scores.** Only actual AI responses.
- **Do NOT add unsupported legal-certainty claims.** The app assists legal work; it does not certify legal outcomes.
- **Preserve honest empty states.** Show "no data" messages honestly.
- **Preserve case-centered workflow.** The app is organized around legal cases.
- **Do NOT mix global communications with case-level notes.** Keep communications and case notes separate.
- **Do NOT invent backend capabilities not present in repo.** Only use APIs that exist in the codebase.
- **Use existing API routes first** before suggesting new backend endpoints.

---

## 11. FRONTEND-FIRST PREFERENCE

- Prefer frontend-only changes where possible
- Minimize the patch surface area
- Avoid broad refactors without explicit instruction

**Why**: Frontend-only changes are safer because they:
- Don't risk breaking database migrations
- Don't risk breaking production auth
- Don't risk breaking SharePoint integration
- Are easier to test and rollback

---

## 12. REPORTING FORMAT

When completing a task, always include:

```
## Changed Files
- file1.ts — description of change
- file2.tsx — description of change

## Verification
- [x] `tsc --noEmit` passed
- [x] `next build` succeeded (if frontend change)
- [ ] Manual verification steps completed

## Files Not Touched
- Backend/src/modules/generation-draft/ — intentionally not modified
- Backend/prisma/ — migrations untouched
- Frontend/src/components/documents/AnonymizeModal.tsx — anonymization flow preserved

## Uncertainties
- (Any observations or unknowns)
```

---

## 13. BEFORE/AFTER CHECKLIST

### Before any implementation:

- [ ] Read `AGENTS.md`
- [ ] Read this `CODEX_REPO_READINESS.md`
- [ ] `git branch` — confirm on correct branch
- [ ] `git status` — confirm working tree state
- [ ] Summarize: files to change, files to avoid, verification plan

### After any implementation:

- [ ] `git status` — confirm only intended files changed
- [ ] `git diff` — review all changes
- [ ] `git diff --cached` — review staged changes
- [ ] Run `tsc --noEmit` in affected directories
- [ ] Report: changed files, verification results, files not touched, uncertainties

---

## 14. COMMON MISTAKES TO AVOID

| Mistake | Why It's Bad | Correct Approach |
|---------|-------------|------------------|
| Using `git add .` | Adds all junk files including `*.zip`, `$null`, `Archive/` | Use `git add <specific-file>` |
| Modifying Prisma schema without migration | Can break production database | Never modify unless migration pass explicitly instructed |
| Changing AnonymizeModal clipboard logic | Breaks the anonymize→rehydrate flow | Preserve existing clipboard handling |
| Claiming text-diff in compare surface | Text-diff is not implemented | Document as metadata-only |
| Adding fake analytics/AI scores | Violates product truthfulness rules | Use only real data |
| Broad refactors | Increases risk of breaking production | Prefer narrow, frontend-only changes |

---

## 15. GETTING HELP

If you are unsure about:
- Whether a file is safe to modify
- Whether a change might break something
- What the correct approach is

**DO NOT guess.** Instead:
1. Read `AGENTS.md` and this document again
2. Inspect the specific files involved
3. Summarize your understanding and ask for confirmation before proceeding

---

**End of CODEX_REPO_READINESS.md. Read AGENTS.md and this document before making any changes.**