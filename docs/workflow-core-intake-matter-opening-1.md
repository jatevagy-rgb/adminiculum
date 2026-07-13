# Workflow Core Intake and Matter Opening 1

Package: **WORKFLOW-CORE-INTAKE-MATTER-OPENING-1** · Branch: `hotfix/runtime-shape-20260308` · Base: `77381ce`

## Purpose

Add the missing beginning of the matter lifecycle — client selection, matter intake, opening
readiness, explicit human activation/decline, opening tasks and initial deadline — as a truthful,
human-controlled workflow layer over the **existing production-compatible persistence only**, and
connect it to Case Center, Workbench, Tasks, Agenda, Case Activity, Lifecycle, and Dashboard.

## Repository findings

See `docs/workflow-core-intake-matter-opening-data-source-audit.md`. Summary:

- `Client` has structured contact/identifier fields but **no** person/org type, prospective state,
  or identity-verification status.
- `Case` supports intake via the `CLIENT_INPUT` default status, `clientRole`,
  `assignedLawyerId`, `description`, `deadline`; `CaseCollaborator` covers the team.
- `Task.type` string codes are the existing structured convention for task-kind markers.
- **No** conflict-review, engagement, party/opposing-party, or task-template persistence exists —
  none of these were simulated.
- `casesService.createCase` has a SharePoint side effect → combined client+case creation is not
  atomic under current architecture (see “Matter creation”).

## Client selection and creation

- New bounded lookup: `GET /api/v1/clients/lookup?q=` — authenticated, minimum 2-character query
  (400 `QUERY_TOO_SHORT` below), max 10 candidates, deterministic ordering, explicit scalar
  `select`. Identity managers (ADMIN/PARTNER) search all clients; other users search only clients
  on their accessible cases (same model as `GET /clients`).
- Match signals limited to real fields: `EXACT_EMAIL` (normalized), `EXACT_TAX_ID`,
  `EXACT_REGISTRATION_ID`, `SIMILAR_NAME` (contains, case-insensitive). Every candidate carries
  `warning: "REVIEW_REQUIRED"` — a match is **never** a duplicate confirmation and there is **no**
  merge path. Tax/registration identifiers are match inputs only and are not echoed in candidates.
- Client creation (`POST /clients`) already used an explicit allow-list, ADMIN/PARTNER gating and
  P2002 → 409; kept as the single creation boundary (no duplicate endpoint).

## Intake readiness contract

`GET /api/v1/cases/:caseId/intake-readiness` (authenticated + case-read access) returns
`MatterIntakeReadinessDto` — see `docs/workflow-core-intake-readiness-contract.md`. Derivation is
pure and deterministic (`Backend/src/modules/cases/intakeReadiness.ts`):
`deriveIntakeChecklist`, `deriveIntakeBlockers`, `deriveIntakeReadiness`,
`deriveIntakeCapabilities`, `validateMatterActivation`, `validateMatterDecline` — no DB access, no
free-text inference, no e-mail-based authorization.

Required checklist items: client linked, client role, responsible lawyer, matter description.
Optional: client contact data present (explicitly *not* identity verification), initial tasks,
initial deadline. Conflict review is `available: false`.

## Conflict-review boundary

No structured conflict-review persistence exists, therefore per the package rules:
**no route was added**, nothing is persisted in task/case descriptions, timeline metadata, or JSON;
`conflictReview.status = "UNAVAILABLE"`, `availability.conflictReviewPersistence = false`,
`canRecordConflictReview = false`; the UI shows a truthful unavailable notice (no fake checkbox);
and the queue's `conflictReviewRequired` count is always 0. See
`docs/workflow-core-conflict-review-safety.md` for the safety rules and the future-model
recommendation.

## Responsibility and collaborators

Reuses the existing boundaries unchanged: `POST /cases/:id/assign` (case-manage) for the
responsible lawyer and the existing collaborator routes. The wizard offers explicit human
selection only — no automatic assignment or recommendation.

## Opening task bundle

`POST /api/v1/cases/:caseId/opening-tasks` (authenticated + case-manage):

- backend-owned definitions (8 codes: `VERIFY_CLIENT_DETAILS`, `RECORD_CLIENT_ROLE`,
  `COMPLETE_CONFLICT_REVIEW` (manual, outside-the-system wording), `CONFIRM_RESPONSIBLE_LAWYER`,
  `COLLECT_INITIAL_DOCUMENTS`, `REVIEW_INITIAL_DOCUMENTS`, `CONFIRM_SCOPE_AND_NEXT_STEP`,
  `SET_INITIAL_DEADLINE`) with safe Hungarian titles containing no client data;
- **explicit selection required** (`NO_TASKS_SELECTED` 400 on empty; nothing on page load);
- forbidden payload fields rejected (`status`, `caseId`, `createdById`, `assignedById`,
  `description`, `metadata`, `workspaceText`);
- assignee must be on the case team (assigned lawyer, creator, or collaborator);
- dedupe against open tasks with the same `type = INTAKE_OPENING_<CODE>` (deterministic repeat:
  `skippedExisting`);
- created through the existing `createTask` service, so the tasks appear in Case Workbench, global
  Tasks, Agenda (when due), Case Activity, and Case Center ranking automatically.

These tasks organize work; completing them does **not** claim legal or regulatory obligations are
satisfied.

## Initial deadline

The wizard sets **`Case.deadline` only**, via the existing `PATCH /cases/:id` — explicitly labeled
in the UI; task due dates are separate optional per-task fields. The canonical deadline engine
(`2818b0b`) renders both in Agenda/Case Center; no second deadline implementation, no free-text
extraction, no statutory/court-ordered claim.

## Matter activation and decline

Real `CaseStatus` values only (no `OPEN`/`ACTIVE`/`INTAKE` invented):

- `POST /cases/:id/activate` — `CLIENT_INPUT → DRAFT` (the pre-existing valid transition), only
  for case managers, only when readiness has no blockers; otherwise **409 `ACTIVATION_BLOCKED`
  with the structured blocker list**. Repeat on non-intake state → 409 `INVALID_INTAKE_STATE`.
- `POST /cases/:id/decline-intake` — `CLIENT_INPUT → CANCELLED` (persistable; CLOSED lifecycle
  category). No deletion, no document/client removal, no notification.
- Both write one content-minimized `CASE_STATUS_CHANGED` timeline event
  (`{ intakeAction, fromStatus, toStatus }` — no client data) inside a transaction with the status
  update, and return the refreshed readiness DTO.

See `docs/workflow-core-matter-opening-transition-matrix.md`.

## Intake queue

`GET /api/v1/intake` — scopes `MY_INTAKES` (assigned/created by me), `MY_CASES` (+ collaborator),
`TEAM` (ADMIN/PARTNER only, 403 otherwise); filters `ALL`/`NEEDS_ATTENTION`/`READY`; limit capped
at 50 with offset pagination over a bounded scan (200 cases); deterministic ordering
(`updatedAt desc, id asc`); backend-derived readiness/blockers/next step per item; queue items
expose client display name only (no contact data, no identifiers).

## Intake and Case UI

- `/intake` (`Frontend/src/app/intake/page.tsx`): queue panel + step-based wizard
  (Ügyfél → Ügy → Felelősség → Összeférhetetlenség (unavailable notice) → Nyitási terv →
  Áttekintés). The review step lists exactly what will be created and what is unavailable. The
  wizard calls the existing safe endpoints sequentially and reports per-step success/failure —
  the non-atomicity of the combined flow is a documented limitation (SharePoint side effect in
  `createCase`).
- Case Detail: `CaseIntakeReadinessPanel` — full readiness panel for `CLIENT_INPUT` cases
  (checklist, blockers, capability-gated activate/decline), collapsing to a one-line opening
  summary for already-opened/closed cases.
- No browser persistence of intake state (static-guarded).

## Dashboard and workflow integration

- Dashboard: bounded `DashboardIntakePanel` (canonical intake API, `MY_INTAKES`, max 5 items,
  ready/blocked counts, link to `/intake`); renders nothing when there is no intake work.
- Opening tasks flow through the existing task pipeline into Workbench/Tasks/Agenda/Activity/Case
  Center; activation changes the lifecycle category via the real status enum; declined intakes
  (CANCELLED) drop out of intake and active work queues.

## Privacy and professional safety

DTO mappers are explicit; no raw Prisma rows, no broad `include`, no `workspaceText`, no
document/communication content, no client notes, no identity-document content, no tax/registration
numbers in readiness or queue DTOs, no audit payload exposure. Professional-safety rules (search
match ≠ duplicate confirmation; no match ≠ conflict clearance; operational readiness ≠
legal/compliance certification; activation = internal workflow activation only) are encoded in
wording and documented in `docs/workflow-core-client-selection-duplicate-safety.md` and
`docs/workflow-core-conflict-review-safety.md`.

## AI and n8n compliance

Per `docs/architecture-ai-n8n-boundary.md`: no AI API/SDK, no AI client matching, conflict
checking, classification, risk scoring, or engagement decisions; no n8n ownership or DB access.
Static guards enforce this for the intake surface
(`Backend/tests/intakeMatterOpeningStaticGuards.test.ts`).

## Production-env verification

The `verify:prod-env` gate was closed non-destructively; procedure and results in
`docs/frontend-production-deploy-env-guard.md` (updated). `.env.local` was not edited; no
environment file is committed.

## Unsupported or deferred functionality

Not representable without schema change, therefore not simulated: prospective-client state,
person/org type, identity verification status, parties/opposing/related parties, conflict-review
persistence (status/result/evidence/reviewer), engagement acceptance/letter linkage, structured
decline reason codes, client merge, task templates. Each is documented with its blocker in the
data-source audit.

## Validation

- Backend: `prisma validate` OK, `tsc --noEmit` OK, Jest **38 suites / 408 tests** (up from
  33/344), no weakened tests.
- Frontend: `tsc --noEmit` OK, `next build` OK, clean-env `verify:prod-env` OK.
- No schema change, no migration, no manual DB query, no deployment, no Client Portal change, no
  AI API, no n8n, no automatic conflict decision, no client merge, no external onboarding or
  client communication.

## Remaining workflow work

- Structured conflict-review persistence (dedicated model) — schema change + PR.
- Engagement acceptance/letter state — schema change.
- Party/opposing-party model — schema change.
- Client type + identity-verification status — schema change.
- Intake-specific notifications and TEAM-scope workload views — product decision.
