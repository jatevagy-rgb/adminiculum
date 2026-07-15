# Narrow Release Authenticated Predeploy Smoke 1

Date: 2026-07-15
Release worktree: `C:\Users\hubay\Documents\Adminiculum-release-editor-ops`
Release branch: `release/editor-ops-workflow-1`
Deployment action: none

## Release commit

- Starting release HEAD for this rerun: `e0d568d`.
- This smoke reused the accepted component baselines and narrow release branch created from the human-approved baseline acceptance.
- Frontend accepted baseline: `dc0780e` (`UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`).
- Backend accepted baseline: `8ce26c0` (`EXACT_COMMIT_PROVEN_BY_OPERATOR_DEPLOY_RECORD_AND_ARTIFACT`).
- Primary hotfix worktree was inspected for prior smoke evidence and local env variable names only; accidental tracked edits in the primary checkout were reverted before this release commit.
- Claude worktree/commit `24bc6c5` was not merged, cherry-picked, copied, or modified.

## Prior successful auth method reused

Prior successful local QA evidence was taken from `C:\Users\hubay\Documents\Adminiculum\docs\authenticated-visual-qa-and-editor-scroll-fix-1.md` and commit `6800b13`.

The reused method was the repository-supported localhost development flow:

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:3000`
- Frontend local-dev auth enabled by process environment only.
- Existing local development database on localhost.
- No synthetic browser token, no localStorage profile injection, and no fake auth state.

## Local environment source

The release worktree still has no copied env files. For this smoke only, the current PowerShell process imported values from the primary checkout's local development env files:

- `C:\Users\hubay\Documents\Adminiculum\Backend\.env`
- `C:\Users\hubay\Documents\Adminiculum\Frontend\.env.local`

Only variable presence and sanitized targets were recorded. No secret values were printed, copied, committed, or written into the release worktree.

Sanitized environment proof:

- `DATABASE_URL`: present.
- Database host: `localhost`.
- Database port: `5432`.
- Database name: `adminiculum`.
- Local DB target: yes.
- `NEXT_PUBLIC_BACKEND_BASE_URL`: `http://localhost:3001`.
- `NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH`: `true`.
- `ENABLE_CLIENT_PORTAL`: absent/off.
- `ENABLE_OUTLOOK_IMPORT`: absent/off.

## Local database safety

A read-only local database proof was run against the sanitized `DATABASE_URL` target only.

- Connected DB: `adminiculum`.
- Connected address: localhost/loopback.
- Connected port: `5432`.
- Production DB targeted: no.
- Clone DB targeted: no.
- DDL/DML executed: no.
- Prisma migrate/deploy/dev/db-push executed: no.
- Secrets printed: no.

## Authentication result

Authentication succeeded through the local development flow.

Observed authenticated shell:

- Display name: `dr. HUBAY Gyula Máté`.
- Role marker: `ADMIN`.
- Auth error visible: no.
- `GET /api/v1/auth/me`: `200` during browser session.
- Unauthenticated `GET /api/v1/auth/me`: `401` in pre-smoke direct backend probe.

## Runtime compatibility fixes made during smoke

Authenticated smoke exposed production-compatible local DB drift in read-only workflow surfaces. The release branch was patched narrowly:

- Agenda task filters now use only valid `TaskStatus` enum values for task queries.
- Task list/detail read projections exclude future-only task intelligence columns absent from the production-compatible DB.
- Case work-item and workflow-summary read projections no longer select absent task blocker columns; blocker output remains `null` unless backed by persisted fields.
- Case summary document projection excludes absent document version-integer drift fields and selects only fields used by the response.

No schema, migration, feature flag, auth, Azure, Client Portal, OpenAPI, CORS, package, or deployment changes were made.

## Backend startup

Backend started from the release worktree using process-only local env.

- Command: `npm.cmd run dev` from `C:\Users\hubay\Documents\Adminiculum-release-editor-ops\Backend`.
- URL: `http://localhost:3001`.
- `/health`: `200`.
- Startup validation: passed with local development configuration.
- Production/Azure touched: no.

## Frontend startup

Frontend started from the release worktree using process-only local env.

- Command: `npm.cmd run dev` from `C:\Users\hubay\Documents\Adminiculum-release-editor-ops\Frontend`.
- URL: `http://localhost:3000`.
- Authenticated shell rendered without auth error.
- Known Next workspace-root warning observed; no runtime blocker.

## Route smoke matrix

Final clean Playwright smoke output directory:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-release-smoke-playwright-1784121057185`

| Route | Result | Authenticated shell | Console/API errors | Notes |
| --- | --- | --- | --- | --- |
| `/` | PASS | yes | 0 | Dashboard rendered with `Itt folytasd`. |
| `/cases` | PASS | yes | 0 | Case list rendered. |
| accessible Case Detail | SKIPPED | n/a | n/a | No case detail anchor was selected by the smoke script. |
| `/tasks` | PASS | yes | 0 | Task page rendered after compatibility fixes. |
| `/deadlines` | PASS | yes | 0 | Agenda page rendered after compatibility fixes. |
| `/workload` | PASS | yes | 0 | Workload page rendered. |
| `/time-entries` | PASS | yes | 0 | Time entries page rendered. |
| `/intake` | PASS | yes | 0 | Intake page rendered; no mutation. |
| `/litigation-workspace` | PASS | yes | 0 | Workspace rendered. |
| `/documents/new/edit` | PASS | yes | 0 | Editor rendered. |
| `/documents/compare` | PASS | yes | 0 | Compare page rendered. |
| `/notifications` | PASS | yes | 0 | Communication workspace rendered. |
| `/clause-library` | PASS | yes | 0 | Clause library rendered. |
| `/portal` | PARKED | no | expected 404 | No Client Portal frontend route exposed in this release. |

## Editor top/middle/bottom

Editor smoke used `/documents/new/edit` at `1366x768` and `1440x900`.

| Viewport | Position | Document scrollTop | Window scrollY | Header | Toolbar | Mode warning | Result |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| 1366x768 | Top | 0 | 0 | visible | visible | visible | PASS |
| 1366x768 | Middle | 2039 | 0 | visible | visible | visible | PASS |
| 1366x768 | Bottom | 4078 | 0 | visible | visible | visible | PASS |
| 1440x900 | Top | 0 | 0 | visible | visible | visible | PASS |
| 1440x900 | Middle | 1973 | 0 | visible | visible | visible | PASS |
| 1440x900 | Bottom | 3946 | 0 | visible | visible | visible | PASS |

No editor save/export/review/comment mutation was performed.

## Operational pages

- `/deadlines`: rendered without agenda API 500 after enum filter fix.
- `/workload`: rendered without console/API errors.
- `/time-entries`: rendered without console/API errors.
- `/tasks`: rendered without task/work-item API 500 after projection fixes.

## Intake

`/intake` rendered successfully. No intake mutation was performed. Parked Claude intake commit `24bc6c5` remains absent from the release branch.

## Clause library

`/clause-library` rendered successfully. No feature flags were changed.

## Client Portal

`/portal` returned the expected frontend 404 parked state. No Client Portal runtime, route expansion, or feature enablement was introduced.

## Network and console audit

Final smoke forbidden-resource scan returned zero matches for:

- Graph/Microsoft Graph.
- SharePoint.
- OpenAI/API provider calls.
- n8n.
- `workspaceText` persistence.
- production Azure backend URLs.

## Screenshots inspected

Screenshots captured in:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-release-smoke-playwright-1784121057185`

Key files:

- `deadlines-1366.png`
- `time-entries-1366.png`
- `clause-library-1366.png`
- `editor-1366x768-top.png`
- `editor-1366x768-middle.png`
- `editor-1366x768-bottom.png`
- `editor-1440x900-top.png`
- `editor-1440x900-middle.png`
- `editor-1440x900-bottom.png`

## Validation

Validation commands run after the compatibility fixes:

- `git status` / branch preflight: release branch `release/editor-ops-workflow-1`, starting HEAD `e0d568d`.
- `git diff --check`: passed with Windows LF/CRLF warnings only.
- `cd Backend && npx.cmd prisma validate`: passed with process-scoped placeholder `DATABASE_URL` for schema parsing only.
- `cd Backend && npx.cmd tsc --noEmit`: passed.
- `cd Backend && npm.cmd test -- --runInBand`: passed, 38 suites / 400 tests.
- `cd Backend && npm.cmd run build`: passed.
- `cd Backend && npm.cmd audit --json`: completed with existing dependency findings: 2 low, 9 moderate, 7 high, 1 critical.
- `cd Frontend && npx.cmd tsc --noEmit`: passed.
- `cd Frontend && npm.cmd run build`: passed after stopping local dev server; known `<img>` warning in `ClientHouseStylePanel.tsx` and workspace-root warning observed.
- `cd Frontend && npm.cmd run verify:prod-env`: passed.
- Clean production-safe artifact verification: `.next` removed, process-only public production env injected, build passed, `npm.cmd run verify:prod-env` passed, strict URL/API-target artifact scan passed.
- `cd Frontend && npm.cmd audit --json`: completed with 4 moderate findings.

## Release blockers

The prior blocker `NO_GO_AUTHENTICATED_SMOKE_BLOCKER` is resolved.

Remaining approval item:

- Dependency audit findings are present and appear pre-existing to this narrow release; backend/frontend package files were not changed in this smoke fix. Deployment approver should explicitly acknowledge these findings.

## Parked Claude intake commit

- Branch: `claude/next-development`
- Commit: `24bc6c5`
- Status: `PARKED_FOR_FUTURE_RELEASE`
- Release branch ancestry check: not present in `release/editor-ops-workflow-1`

## Deployment recommendation

`GO_FOR_EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL`

This document does not authorize deployment. It records that the authenticated local predeploy smoke gate has been completed and the narrow release is ready for an explicit deployment-approval prompt, subject to human acknowledgement of pre-existing dependency audit findings.
