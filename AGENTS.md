# AGENTS.md — Adminiculum Agent Guidelines

**This file defines rules for all agents operating on this repository. Read before making any changes.**

---

## A) PROJECT STRUCTURE

### Canonical Source Roots

| Directory | Technology | Purpose |
|-----------|-----------|---------|
| `Frontend/` | Next.js App Router | React frontend with MSAL auth |
| `Backend/` | Express + TypeScript + Prisma | REST API + PostgreSQL |

**Everything outside `Frontend/` and `Backend/` is non-source or auxiliary.** This includes root-level documentation, scripts, archives, zip artifacts, and configuration files. Only modify files in `Frontend/` or `Backend/` when implementing features.

### Key Technology Notes

- **Database**: PostgreSQL via Prisma ORM
- **Auth**: Azure/MSAL (frontend + backend token validation)
- **Document Storage**: SharePoint via Microsoft Graph API
- **Template System**: DOCX templates stored in `Backend/templates/` — 22 tracked templates
- **Generation**: `POST /api/v1/contracts/generate` — template-based contract draft generation

### Known Sensitive Systems

- Azure/MSAL authentication logic
- SharePoint upload/download logic
- Contract generation pipeline (`Backend/src/modules/generation-draft/`)
- Anonymization/rehydration pipeline (`Backend/src/modules/anonymize/`)
- Prisma schema and migrations (`Backend/prisma/`)

---

## B) SOURCE OF TRUTH

- **GitHub `main`** is the canonical source of truth.
- **Local work must start from updated `main`.**
- Do **NOT** treat an uncommitted local working tree as canonical.
- Do **NOT** make parallel edits to the same production files from different agents.

---

## C) BRANCH RULES

- **Never work directly on `main`.**
- **Never commit directly to `main`.**
- Create a new branch per task.
- **Branch name conventions**:
  - `kilo/<short-task-name>` — Kilo/MiniMax agent work
  - `codex/<short-task-name>` — Codex agent work
  - `fix/<short-task-name>` — bug fixes
  - `ui-lab/<short-task-name>` — UI exploration
- **Kilo/MiniMax and Codex work must happen on separate branches.**
- Merge to `main` only after review.

---

## D) GIT DISCIPLINE (CRITICAL — READ CAREFULLY)

### NEVER use these commands:

```bash
git add .              # NEVER — adds ALL untracked files including junk
git add -A             # NEVER — same problem
git stage .            # NEVER
```

### ALWAYS stage explicitly:

```bash
git add Backend/src/modules/cases/routes.ts
git add Frontend/src/app/dashboard/page.tsx
git add docs/CHANGELOG.md
```

### Before ANY commit:

```bash
git status              # Always inspect first
git diff               # Review every change
```

### Standard safe workflow:

```bash
# Start fresh from main
git checkout main
git pull origin main
git checkout -b codex/my-feature

# ... make changes ...

# Stage only the specific files changed
git add Backend/src/modules/cases/routes.ts
git add Frontend/src/app/cases/page.tsx

# Verify what will be committed
git diff --cached

# Commit with clear message
git commit -m "fix: correct case list sort order in API response"

# Push to your branch
git push -u origin codex/my-feature
```

---

## E) FILES AND PATTERNS TO NEVER ADD TO GIT

### By file type:

| Pattern | Reason |
|---------|--------|
| `*.zip` | Large binaries, local backups |
| `build-output.txt` | Build artifacts |
| `*_result.txt` | Build/test result logs |
| `tsc*.txt` | TypeScript compiler output |
| `*.tsbuildinfo` | TypeScript incremental build info |
| `screenshots/` | Local test screenshots |
| `test-results/` | Test runner output |
| `tmp_*` | Temporary directories |
| `*.log` | Local log files |
| `$null` | Malformed Windows artifact |
| `{` | Malformed file name |

### By directory:

| Directory | Reason |
|-----------|--------|
| `Archive/` | Legacy/recovered files — not part of boxed product |
| `deploy/` | Old deployment scripts |
| `docs/_archive/` | Superseded documentation |

### By file name (specific):

| File | Reason |
|------|--------|
| `.env` | Secrets — never committed |
| `Backend/SECRETS.md` | Secret documentation |
| `Azure-*.md` | Azure configuration docs may contain sensitive info |

### CRITICAL PROTECTED FILES:

| File/Directory | Reason |
|----------------|--------|
| `Backend/templates/*.docx` | 22 production contract templates — MUST stay tracked |
| `Backend/prisma/migrations/` | Database migration history — never modify casually |
| `Backend/prisma/schema.prisma` | Prisma schema — protected unless migration pass explicitly instructed |
| `.github/workflows/deploy*.yml` | GitHub Actions — protected unless deploy explicitly instructed |

---

## F) CODEX WORKFLOW (specific to Codex agent)

1. **Start by reading**: `AGENTS.md` and `docs/CODEX_REPO_READINESS.md`
2. **Create your own branch**: `git checkout -b codex/<task-name>`
3. **Summarize plan**: List files to change, files to avoid, verification steps
4. **Implement narrowly**: Only touch files needed for the task
5. **Stage explicitly**: Use `git add <specific-file>` — never `git add .`
6. **Verify before commit**: Run `git diff --cached` to review
7. **Report on completion**: List changed files, build verification, files intentionally not touched

**Codex must NOT modify** unless explicitly instructed:
- Backend/auth logic
- Prisma schema or migrations
- SharePoint upload/download
- Contract generation backend
- Anonymization/rehydration backend
- Azure/MSAL authentication

---

## G) PARALLEL WORK RULES

- Do **NOT** run Kilo/MiniMax and Codex on the same files simultaneously.
- Do **NOT** edit the following in two parallel branches without explicit coordination:
  - `CaseDetail` page
  - `Dashboard` surface
  - API client modules
  - Prisma schema
  - Authentication modules
  - SharePoint integration
- If Codex has an open PR touching a file, do **NOT** ask Kilo to modify the same file until PR is merged/closed.
- If Kilo has unpushed local changes, push them before asking Codex to work from GitHub.

---

## H) PROTECTED/SENSITIVE AREAS

**Do not touch unless explicitly requested:**

| Area | Reason |
|------|--------|
| `Backend/prisma/migrations/` | Database migration history |
| `Backend/prisma/schema.prisma` | Prisma schema |
| Azure/MSAL auth logic | Production auth security |
| SharePoint upload/download logic | Document storage integrity |
| Contract generation backend | `Backend/src/modules/generation-draft/` |
| Anonymize/rehydrate backend | `Backend/src/modules/anonymize/` |
| `.env` files | Secrets |
| `Backend/templates/` | 22 DOCX production templates |
| `uploads/` | Runtime user uploads |

---

## I) PRODUCT TRUTHFULNESS RULES

- **Do NOT add fake analytics.** Only real usage data.
- **Do NOT add fake AI scores.** Only actual AI responses.
- **Do NOT add unsupported legal-certainty claims.** The app assists legal work; it does not certify legal outcomes.
- **Preserve honest empty states.** Show "no data" messages honestly.
- **Preserve case-centered workflow.** The app is organized around legal cases.
- **Do NOT mix global communications with case-level notes.** Keep communications and case notes separate.
- **Do NOT invent backend capabilities not present in repo.** Only use APIs that exist in the codebase.
- **Use existing API routes first** before suggesting new backend endpoints.

---

## J) DEVELOPMENT RULES

### Frontend-first preference

- Prefer frontend-only changes where possible
- Minimize the patch surface area
- Avoid broad refactors without explicit instruction

### Before coding:

1. Inspect current branch: `git branch`
2. Inspect git status: `git status`
3. Summarize plan: "I will change X, avoid Y, verify with Z"
4. List likely files to change

### After coding:

1. Summarize changed files
2. Summarize tests/build checks run
3. Mention files intentionally not touched
4. Mention uncertainties or observations

### Build verification:

```bash
# Frontend
cd Frontend && npx tsc --noEmit

# Backend
cd Backend && npx tsc --noEmit
```

---

## K) BEFORE/AFTER REQUIREMENTS SUMMARY

### Before any implementation:

- [ ] Read `AGENTS.md`
- [ ] Read `docs/CODEX_REPO_READINESS.md`
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

## L) KNOWN PRODUCT CONSTRAINTS

### Backend templates must remain in git

`Backend/templates/` contains 22 tracked DOCX templates used for contract generation. These templates are:
- Part of the boxed product
- Required for `POST /api/v1/contracts/generate` to function
- Must be included in Docker images and deploy artifacts

### Anonymize → Rehydrate flow is critical

The anonymization workflow is:
1. Select document → Open AnonymizeModal
2. Edit text in workspace → Select AI task → Submit
3. Backend returns anonymized text
4. User can copy or proceed to RehydrateModal
5. RehydrateModal imports AI response → Restores original names

Do not break this flow. Any changes to `AnonymizeModal.tsx` or `RehydrateModal.tsx` must preserve the workspace text, AI task selection, and clipboard handling.

### Contract generation uses existing templates

The generation system does NOT create new templates. It fills existing DOCX templates with case data via `Backend/src/modules/generation-draft/service.ts`. Any changes to the generation pipeline must maintain template compatibility.

### Document comparison is metadata-only

The `/documents/compare` surface shows metadata comparison (versions, dates, authors), NOT text-diff. Text-diff is not currently implemented. Do not claim text-diff capability.

---

## M) REPORTING FORMAT

When completing a task, use this format:

```
## Changed Files
- file1.ts — description of change
- file2.tsx — description of change

## Verification
- [x] `tsc --noEmit` passed
- [x] `next build` succeeded
- [x] Manual verification steps completed

## Files Not Touched
- Backend/src/modules/generation-draft/ — intentionally not modified
- Backend/prisma/ — migrations untouched

## Uncertainties
- The compare surface metadata layout has unknown responsive breakpoints
- Document state machine transitions need runtime verification
