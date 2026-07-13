# Intake Readiness Contract (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)

## Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/v1/cases/:caseId/intake-readiness` | authenticate + case-read | Canonical readiness DTO |
| `POST /api/v1/cases/:caseId/opening-tasks` | authenticate + case-manage | Explicit, user-confirmed opening task bundle |
| `POST /api/v1/cases/:caseId/activate` | authenticate + case-manage | Explicit intake activation (`CLIENT_INPUT → DRAFT`) |
| `POST /api/v1/cases/:caseId/decline-intake` | authenticate + case-manage | Explicit intake decline (`CLIENT_INPUT → CANCELLED`) |
| `GET /api/v1/intake` | authenticate | Bounded intake queue |

## `MatterIntakeReadinessDto`

Implemented in `Backend/src/modules/cases/intakeService.ts`; pure derivation in
`Backend/src/modules/cases/intakeReadiness.ts`.

- `case` — displayName, reference (caseNumber), status (real `CaseStatus`), clientRole, timestamps.
- `client` — id, displayName, `type: null` (no person/org field exists), `identityStatus: null`
  (no verification status exists), email, phone. **Never** includes tax/registration numbers,
  address, notes.
- `responsibility` — responsible lawyer + up to 12 collaborators (id, displayName, role).
- `conflictReview` — **always** `{ status: "UNAVAILABLE", reviewedAt: null, reviewer: null }` with a
  safe Hungarian label; there is no persistence, and the other statuses are unreachable by design.
- `checklist` — 8 deterministic items (see below).
- `blockers` — subset of `MISSING_CLIENT`, `MISSING_CLIENT_ROLE`, `MISSING_RESPONSIBLE_LAWYER`,
  `MISSING_REQUIRED_INFORMATION`. `CONFLICT_REVIEW_REQUIRED` / `CONFLICT_BLOCKED` are **never
  emitted** (no persistence — not simulated).
- `readiness` — `readyForActivation` (all required+available items complete and no blockers),
  `completedRequiredItems`, `totalRequiredItems`.
- `capabilities` — backend-derived; see matrix below.
- `availability` — constant truthful matrix (`INTAKE_AVAILABILITY`).

### Checklist semantics

| Code | Required | Available | Complete when |
| --- | --- | --- | --- |
| `CLIENT_SELECTED` | yes | yes | case has a linked `Client` |
| `CLIENT_IDENTITY` | no | yes | client has ≥1 of email/phone/taxNumber/companyRegistrationNumber — labeled explicitly as *not* identity verification |
| `CLIENT_ROLE` | yes | yes | `cases.clientRole` non-empty |
| `RESPONSIBLE_LAWYER` | yes | yes | `assignedLawyerId` set |
| `CONFLICT_REVIEW` | no | **no** | never (no persistence) |
| `MATTER_DESCRIPTION` | yes | yes | `description` non-empty |
| `INITIAL_TASKS` | no | yes | ≥1 open task on the case |
| `INITIAL_DEADLINE` | no | yes | `cases.deadline` set |

### Capability matrix

Manager = ADMIN/PARTNER role, assigned lawyer, or case creator (same as case authorization).
Terminal = `FINAL`/`CANCELLED`/`ARCHIVED`. Intake = `CLIENT_INPUT`.

| Capability | Rule |
| --- | --- |
| `canEditClientLink` | **always false** — `PATCH /cases` cannot re-link `clientId` |
| `canEditClientRole` | manager ∧ ¬terminal |
| `canChangeResponsibleLawyer` | manager ∧ ¬terminal |
| `canManageCollaborators` | manager ∧ ¬terminal |
| `canRecordConflictReview` | **always false** — no persistence |
| `canCreateOpeningTasks` | manager ∧ ¬terminal |
| `canSetInitialDeadline` | manager ∧ ¬terminal |
| `canActivateMatter` | manager ∧ intake ∧ readyForActivation |
| `canDeclineMatter` | manager ∧ intake |

### Availability matrix (constant, truthful)

`clientIdentity: true` (contact fields exist; verification status does not), `clientRole: true`,
`parties: false`, `opposingParties: false`, `conflictReviewPersistence: false`,
`engagementState: false`, `openingTaskBundle: true`, `initialDeadline: true`.

## Opening tasks request/response

Request: `{ tasks: [{ code, assigneeId?, dueAt? }] }` — codes from the backend-owned list only;
forbidden fields (`status`, `caseId`, `createdById`, `assignedById`, `description`, `metadata`,
`workspaceText`) → 400. Response: `{ caseId, created: [{ id, code, title, dueAt }],
skippedExisting: string[], availableCodes }`.

## Intake queue DTO

`GET /api/v1/intake?scope=&status=&limit=&offset=` — summary (`total`, `missingClient`,
`missingResponsibleLawyer`, `conflictReviewRequired` (always 0), `readyForActivation`, `blocked`),
items (case/client/lawyer display names, readiness, blockers, next incomplete required step,
href), pagination (limit ≤ 50, bounded scan 200), availability (`conflictReview: false`,
`engagementState: false`, `teamScope` by role).

## Error behavior

| Status | Code | When |
| --- | --- | --- |
| 400 | `QUERY_TOO_SHORT`, `INVALID_INTAKE_SCOPE`, `INVALID_INTAKE_STATUS_FILTER`, `NO_TASKS_SELECTED`, `INVALID_OPENING_TASK_CODE`, `UNSUPPORTED_OPENING_TASK_FIELD`, `INVALID_DUE_DATE`, `ASSIGNEE_NOT_ON_CASE_TEAM` | malformed input |
| 401 | `NOT_AUTHENTICATED` | missing/invalid token |
| 403 | `CASE_ACCESS_FORBIDDEN` / `CASE_MANAGE_FORBIDDEN` / `TEAM_SCOPE_FORBIDDEN` | unauthorized actor |
| 404 | `CASE_NOT_FOUND` | missing or inaccessible case (safe 404) |
| 409 | `ACTIVATION_BLOCKED` (with structured `blockers`), `INVALID_INTAKE_STATE` | invalid transition / unresolved blockers / stale state |

## Query bounds

Readiness: 1 case select + 1 task count + 1 collaborator page (≤12). Queue: 1 case scan (≤200,
explicit select) + 1 task select (≤2000, `caseId` only). Lookup: ≤10 candidates. No `include`
anywhere on the intake surface (static-guarded).
