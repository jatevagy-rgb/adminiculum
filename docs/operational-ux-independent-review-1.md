# Operational UX Independent Review 1

## Executive Summary

Independent review completed on the isolated branch `codex/operational-ux-review-1` in:

`C:\Users\hubay\Documents\Adminiculum-operational-ux-review`

The production reference was `origin/release/editor-ops-workflow-1` at `e447168`.

The ticket named `247b95a` as the expected source head. Before review started, the product owner explicitly requested that the dashboard card grid remain, but be simpler. That approved follow-up was already committed and pushed as `84774be`, so the review used `84774be` as the actual source head. Review corrections were committed as `01949dc`.

Decision:

`GO_FOR_OPERATIONAL_UX_RELEASE_APPROVAL`

No deployment, Azure change, database operation, schema change, migration, package change, auth change, Client Portal change, or feature-flag change was performed.

## Exact Diff Inventory

Comparison: `e447168..01949dc`

| Area | Files | Result |
| --- | ---: | --- |
| Frontend runtime | 24 | All classified and reviewed |
| Backend runtime | 3 | Compatibility-only read-path corrections |
| Backend tests | 9 | Focused regression and static safety coverage |
| Documentation | 2 | Original implementation and visual QA records |
| Unexpected/other | 0 | None |
| Total | 38 | 6 added, 32 modified, 0 deleted |

Aggregate diff: `2364` insertions and `1383` deletions.

No unexpected runtime file was found.

## Product Surface Review

### Dashboard

- Preserves the user-approved four-card semantic grid.
- Shows exact total case count from pagination instead of a first-page count.
- Uses `—` and `Most nem elérhető` when a source is unavailable instead of displaying false zeroes.
- Keeps one dominant `Itt folytasd` handoff and real operational content in the first viewport.
- Uses Hungarian matter/status labels rather than raw enum values.

### Tasks

- Keeps the card/list workflow and real actions.
- Removes explanatory launcher noise and duplicate route entry points.
- Preserves start, submit, approve, return, and block behavior.
- Uses server-provided capabilities; no unsupported action was introduced.

### Cases And Case Center

- Case filters and rows are visible in the first viewport.
- Matter identity is centralized in the canonical header.
- The populated case shows next action, active tasks, documents, deadline, communication, and limited recent activity.
- Empty/new case presentation contracts to one clear setup action.
- The large duplicate right rail and competing count grids are removed.

### Documents And Communications

- Case documents keep upload, open, download, review, and delete behavior.
- Delete remains secondary and retains confirmation/authorization behavior.
- Case communication workspace retains compose/list/detail behavior without a permanently empty side rail.
- Document language labels no longer expose `HU_ONLY`.
- No raw document content was added to workflow-summary projections.

### Editor

- Editor chrome and toolbar remain visible.
- The document canvas owns scrolling while window scroll remains stable.
- The export/local warning appears once.
- Review and comment panels switch correctly.
- The existing professional editor route still loads a blank document body for the selected local record; comparison with `e447168` confirmed this is a pre-existing content-hydration limitation, not a branch regression.

### Litigation, Handoff, Deadlines, Time And Clause Library

- Litigation uses a three-step progression with one dominant active step.
- Handoff keeps prerequisites, save action, and document/review navigation together.
- Deadlines and time entry surfaces keep real actions and compact empty states.
- Clause Library keeps real loaded clauses and a truthful unavailable state.
- No fake local persistence, AI, document-review, or litigation-strategy claim was introduced.

## Backend Compatibility Review

### Agenda Case Status

The previous query used task-like values as case statuses:

`COMPLETED`, `DONE`, `APPROVED`, `ARCHIVED`, `CANCELLED`

The corrected closed case set is:

`FINAL`, `CANCELLED`, `ARCHIVED`

Open work requires `completedAt: null` and a non-closed case. Completed work accepts a completed timestamp or a closed case. Ordering and pagination remain unchanged. A case-scoped request resolves through accessible cases and returns `404` when inaccessible, avoiding a direct existence signal.

### Workflow Summary Communication Projection

The production-compatible communication projection now selects only:

- `id`
- `subject`
- `summary`
- `createdAt`

The response retains `direction: null` for DTO stability. It does not broaden to content, body, attachments, or relations.

### Document Text Projection

The previous full scalar selection included the production-absent `currentVersionInt`. The explicit projection now selects:

- `id`
- `documentType`
- `workspaceText`
- `updatedAt`
- `spItemId`
- `mimeType`
- `fileName`
- `name`

No relation include was added. Existing workspace-text and SharePoint extraction behavior is unchanged.

### Contract Capability Preflight

The capability request is authenticated, read-only, and not cached across users. The caller now distinguishes a truthful disabled capability from an unexpected capability request error. It no longer converts every failure into an empty contract list.

## Authorization Review

- No auth middleware or role hierarchy changed.
- No new admin-only control was exposed.
- Case-scoped agenda uses accessible-case resolution.
- Contract capability remains behind authentication.
- Destructive actions were not exercised against production.
- Existing risk: the document text route has authentication but no document-scoped access middleware. This predates the reviewed branch and requires a separate authorization ticket.
- Existing risk: local test data can appear in `/cases` while case-scoped agenda returns `404` for an unassigned case. This access-model inconsistency predates the branch.

## Runtime Error Review

The review independently tested:

- known safe `404`;
- known disabled `501`;
- unexpected `500`;
- network failure.

Unexpected agenda failure and network failure render a compact error state, preserve console observability, and support retry. A genuine unexpected error is not rendered as normal empty data.

Authenticated contract generation remains truthfully disabled:

- status `501`;
- error `FEATURE_NOT_AVAILABLE`;
- feature `CONTRACTS`;
- reason `CONTRACTS_NOT_ENABLED`.

## Copy Audit

Target screens were checked for technical/developer vocabulary, raw enums, internal event identifiers, and unsupported claims.

Corrections included:

- Hungarian case matter/status display labels;
- removal of `backend`, `later patch`, and implementation-oriented wording;
- `HU_ONLY` mapped to `Magyar` / `Csak magyar`;
- local-only review messages described as session-local;
- no raw `Internal server error` in normal UI.

Synthetic local task names containing runtime-like identifiers remain test data values, not UI enum labels.

## Authenticated Visual QA

Environment:

- frontend `http://localhost:3000`;
- backend `http://127.0.0.1:3001`;
- database host confirmed as local before startup;
- authenticated local `ADMIN`;
- no production/Azure access.

Matrix:

- 15 routes;
- 3 viewports: `1366×768`, `1440×900`, `1920×1080`;
- 45/45 navigations returned `200`;
- 0 visible auth errors;
- 0 raw internal errors;
- 0 unexpected `500`;
- 0 unexpected `501`;
- 0 horizontal overflow.

Screenshots and sanitized reports remain outside the repository at:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-review-runtime`

## Editor Scroll Evidence

| Viewport | Canvas client height | Scroll height | Maximum | Midpoint | Window scroll |
| --- | ---: | ---: | ---: | ---: | ---: |
| `1366×768` | 571 | 1149 | 578 | 289 | 0 |
| `1440×900` | 703 | 1149 | 446 | 223 | 0 |
| `1920×1080` | 883 | 1149 | 266 | 133 | 0 |

The canvas, not the browser window, owns editor scrolling.

## Corrections Made During Independent Review

Commit: `01949dc`

- Corrected dashboard case count and unavailable-data truthfulness.
- Stopped capability preflight from hiding unexpected errors.
- Added Hungarian case matter/status display mapping.
- Removed remaining technical/developer copy.
- Corrected house-style language display.
- Strengthened focused static tests.

Request/response contracts and action behavior remain unchanged.

## Validation

Frontend:

- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run verify:prod-env`: passed.
- No frontend `test` script exists.
- `npm audit`: 4 moderate findings; no package changes made.

Backend:

- `npx.cmd prisma validate`: passed with a process-only dummy local URL and no DB connection.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd test -- --runInBand`: 42/42 suites, 422/422 tests passed.
- `npm.cmd run build`: passed.
- `npm audit`: 19 findings: 2 low, 9 moderate, 7 high, 1 critical; no package changes made.

Repository:

- `git diff --check`: passed.
- `git diff --cached --check`: passed.

## Remaining Risks

1. Professional editor content hydration is blank for the selected existing local document; this is unchanged from `e447168`.
2. Document text authorization is authenticated but not document-scoped.
3. Case list visibility and case-scoped agenda access can disagree for local test records.
4. Existing dependency audit findings require a separate package review.
5. The source/Oryx frontend ZIP contains intentional source-only localhost references for local development and the production bundle guard. The production-built `.next` output contains no forbidden localhost API/auth target.

## Final Decision

`GO_FOR_OPERATIONAL_UX_RELEASE_APPROVAL`

This decision approves a separate human-controlled release decision only. It does not authorize deployment.
