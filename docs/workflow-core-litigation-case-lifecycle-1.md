# Workflow Core Litigation and Case Lifecycle 1

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`

## Purpose

Connect the legal-work layer to the operational workflow so an attorney can see,
for a matter: current procedural/operational status, the litigation items that
exist as structured data, which document is evidence vs. a pleading, which
procedural date is next, what is blocking closure, and who may close/reopen the
matter — without the system making any legal judgement.

## Repository findings

The single binding constraint is `Backend/prisma/schema.prisma`, which cannot be
changed in this package. Key facts (full detail in
`workflow-core-litigation-case-lifecycle-data-source-audit.md`):

- `CaseStatus` has **no `CLOSED`/`CLOSING`** value; persistable terminal states
  are `FINAL`, `CANCELLED`, `ARCHIVED`, plus `ON_HOLD`. `utils/constants.ts`
  contains an aspirational `CLOSED` and `CASE_COMPLETED`/`CASE_REOPENED` that are
  **not** in the Prisma enums and are therefore not persistable.
- There is **no structured model** for legal issues, claims, allegations,
  evidence items/relations, pleading filing status, hearings, parties, court
  references, or burden of proof. The only structured litigation signal is the
  human-assigned `DocumentCategory` (`EVIDENCE`, `COURT_FILING`, …).
- Tasks, the canonical deadline/agenda engine, timeline/activity, responsibility,
  and lawyer-handoff packages are all reusable.

## Case lifecycle contract

`GET /api/v1/cases/:caseId/lifecycle` returns `CaseLifecycleDto`: status,
`lifecycleCategory`, `openedAt` (from `receivedAt`/`createdAt`), proxy
`closedAt`/`archivedAt` (from `completedAt`), responsible lawyer, operational
`blockers`, `closureReadiness`, backend-derived `capabilities`, and truthful
`availability` flags. Categories map onto the real enum only; `CLOSING` is never
emitted.

## Supported lifecycle transitions

`POST /cases/:id/close`, `/reopen`, `/archive` (see
`workflow-core-case-lifecycle-transition-matrix.md`). Close → `FINAL`
(+`completedAt`), gated by closure readiness (`409 CLOSURE_BLOCKED`). Reopen →
`IN_REVIEW` (clears `completedAt`). Archive (from closed) → `ARCHIVED`. Each
writes one content-minimized `CASE_STATUS_CHANGED` timeline event. No automatic
transitions; no data deletion; no Client Portal effect.

## Closure readiness

Operational blockers derived from existing data: `MISSING_RESPONSIBLE_LAWYER`,
`OVERDUE_TASKS`, `OPEN_TASKS`, `ACTIVE_REVIEW`, `OPEN_DEADLINES`,
`ACTIVE_HANDOFF`. `UNRESOLVED_LITIGATION_ITEM` is never produced (no structured
litigation item; `availability.litigationBlockers = false`). Readiness wording is
operational, never legal.

## Litigation dossier

`GET /api/v1/cases/:caseId/litigation-dossier` returns `LitigationDossierDto` (see
`workflow-core-litigation-dossier-contract.md`): evidence from `EVIDENCE`
documents, pleadings from `COURT_FILING` documents, procedural dates from the
canonical engine, and `availability` flags that mark issues, issue↔evidence
relations, filing status, parties, and burden of proof as unavailable.

## Issues and positions

Not persistable in V1 → `issues: []`, `availability.issues = false`. No
frontend-only issue cards; the schema blocker is documented. Pure helpers for a
future issue model were intentionally **not** added as fictional persistence.

## Evidence workflow

Read-only: documents categorized `EVIDENCE` are surfaced as evidence metadata
with `relation = UNCLASSIFIED`. Creating/linking/classifying evidence requires a
schema change and is deferred. Evidence is never auto-classified from text; a
document’s existence never auto-creates an evidence relationship.

## Pleadings and submissions

Read-only: documents categorized `COURT_FILING` are surfaced as pleadings.
Review runs through the existing task-backed review flow (`canCreateReviewTask`).
Filing status and supersede are not persisted → `canMarkFiled = false`,
`canSupersede = false`; marking filed is never automatic.

## Procedural dates

Reuse of the canonical deadline/agenda engine only (no second implementation).
Event type/legal significance are never inferred. Integrated into the dossier and
available to Agenda, Case Detail, and Case Center via existing contracts.

## Litigation Workspace

The existing `/litigation-workspace` gains an operational **matter dossier**
header/section backed by the lifecycle + dossier contracts (status, responsible
lawyer, next procedural date, closure readiness, evidence/pleading counts) and
truthfully shows unavailable areas (issues, evidence relations, filing status)
rather than decorative empty panels.

## Case Detail integration

Case Detail surfaces a compact litigation/lifecycle summary using the same
backend contracts and links to the Litigation Workspace, without duplicating it.

## Case Center, Tasks, Agenda and Activity integration

Litigation-linked work continues to flow through existing task/deadline/review
contracts, so it already appears in Case Workbench, global Tasks, Agenda, and
Case Activity. Lifecycle transitions write content-minimized timeline events that
appear in Case Activity and let Case Center recompute the next action. No new
unsafe litigation source is queried.

## Privacy, security and legal safety

See `workflow-core-litigation-legal-safety-rules.md`. Metadata-only DTOs; explicit
`select`; bounded queries; content-minimized audit; no raw text/content/paths; no
legal-truth claims.

## AI and n8n compliance

No AI API/SDK and no n8n are introduced. Static guards assert the litigation/
lifecycle source imports no AI provider, no n8n, and no Client Portal surface, and
writes no non-persistable status/timeline value. See
`docs/architecture-ai-n8n-boundary.md`.

## Unsupported or deferred functionality

Structured legal issues/claims/allegations/defences; evidence items as first-class
records and evidence↔issue relations with supporting/contradicting/neutral
classification; pleading filing status and supersede; hearing/procedural-event
typing; opposing party, court/authority reference; legal significance; burden of
proof; dedicated `CLOSING` state and `closedAt`/`archivedAt` columns. All require
a future schema change and are surfaced via `availability` flags.

## Validation

- Backend: `npx prisma validate`, `tsc --noEmit`, `jest --runInBand`
  (**33 suites / 344 tests**, up from 30 / 305).
- Frontend: `tsc --noEmit`, `npm run build`, `npm run verify:prod-env`.
- Safety: no `schema.prisma` diff; no migration; no manual DB query; no Client
  Portal diff; no Azure/OpenAPI/CORS/package diff.

## Explicit statements

- No schema change. No migration. No manual DB query. No Client Portal change.
- No AI API. No n8n. No external filing. No legal outcome prediction.
- No production deployment.

## Remaining workflow work

A future package (with an approved schema change) can add structured
issue/claim/evidence-relation/pleading-filing/hearing/party models and their
mutation/validation engines, reusing the availability flags established here.
