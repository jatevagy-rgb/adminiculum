# Matter Opening Transition Matrix (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)

Real `CaseStatus` values only. Intake-compatible state: `CLIENT_INPUT` (the case-creation
default). No `OPEN`, `ACTIVE`, or `INTAKE` Prisma status exists and none was invented.

## Supported intake transitions

| Current state | Action | Allowed actor | Required conditions | New state | Repeat behavior | Error |
| --- | --- | --- | --- | --- | --- | --- |
| `CLIENT_INPUT` | `POST /cases/:id/activate` | case manager (ADMIN/PARTNER/assigned lawyer/creator) | readiness has **no blockers** (client linked, client role, responsible lawyer, description) | `DRAFT` | second call → 409 `INVALID_INTAKE_STATE` (already activated) | 401 unauthenticated · 404 missing/inaccessible · 403 non-manager · 409 `ACTIVATION_BLOCKED` with structured blockers |
| `CLIENT_INPUT` | `POST /cases/:id/decline-intake` | case manager | none beyond state + authorization | `CANCELLED` | second call → 409 `INVALID_INTAKE_STATE` | 401 / 404 / 403 / 409 as above |

Both transitions: explicit human action only; status update + content-minimized
`CASE_STATUS_CHANGED` timeline event (`{ intakeAction, fromStatus, toStatus }`) in one
transaction; **no** automatic conflict clearance, responsibility assignment, task
creation/completion/deletion, document changes, client changes, notifications, or Client Portal
effect. Decline is **not** deletion and **not** archive.

## Relationship to the existing engines

- Activation reuses the pre-existing valid workflow transition `CLIENT_INPUT → DRAFT`
  (`ALLOWED_TRANSITIONS` in `workflow.types.ts`); the generic `PATCH /cases/:id/status` route
  remains available and unchanged for the ordinary workflow.
- `CANCELLED` is already classified by the lifecycle engine
  (WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1) as a CLOSED-category status, so declined intakes
  leave intake and active work queues consistently.

## Unsupported transitions (not implemented, not simulated)

| Concept | Why unsupported |
| --- | --- |
| `CLIENT_INPUT → ON_HOLD` ("parked intake") | no product rule; ON_HOLD semantics belong to active matters |
| Activation into any state other than `DRAFT` | arbitrary target status prohibited; `DRAFT` is the only valid successor |
| Reopen of a declined intake | no product rule for CANCELLED → active; would need explicit product decision |
| Decline with structured reason code | no schema field for a reason code — not encoded in descriptions/JSON |
| Conflict-gated activation | no conflict-review persistence — a conflict gate cannot be truthfully enforced (documented in the conflict-review safety doc) |
