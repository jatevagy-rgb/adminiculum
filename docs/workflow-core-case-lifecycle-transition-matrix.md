# Workflow Core — Case Lifecycle Transition Matrix

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`

All transitions use **only persistable `CaseStatus` enum values** and the
existing `completedAt` column. The pure decision logic lives in
`Backend/src/modules/cases/lifecycle.ts`
(`validateCaseLifecycleTransition`); persistence lives in
`lifecycleService.ts`. No automatic transitions occur — every transition is an
explicit, authorized action.

## Lifecycle categories (read model)

| `CaseStatus` value | Lifecycle category |
|---|---|
| `CLIENT_INPUT` | `INTAKE` |
| `DRAFT`, `IN_REVIEW`, `APPROVED`, `SENT_TO_CLIENT`, `CLIENT_FEEDBACK` | `ACTIVE` |
| `ON_HOLD` | `ON_HOLD` |
| `FINAL`, `CANCELLED` | `CLOSED` |
| `ARCHIVED` | `ARCHIVED` |

There is **no `CLOSING` category** because the enum has no such value
(`availability.closingState = false`).

## Supported transitions

| Current category | Action | Allowed actor | Required conditions | New status (category) | Repeat behavior | Error |
|---|---|---|---|---|---|---|
| `INTAKE` / `ACTIVE` / `ON_HOLD` | `close` (`POST /cases/:id/close`) | Case manager (assigned lawyer, creator, ADMIN, PARTNER) | Closure readiness: no operational blockers | `FINAL` (`CLOSED`), sets `completedAt` | Re-close of already-closed case → `409 INVALID_LIFECYCLE_TRANSITION` | `403 CASE_MANAGE_FORBIDDEN` / `409 CLOSURE_BLOCKED` (with `blockers`) / `409 INVALID_LIFECYCLE_TRANSITION` |
| `CLOSED` / `ARCHIVED` | `reopen` (`POST /cases/:id/reopen`) | Case manager | Case is closed or archived | `IN_REVIEW` (`ACTIVE`), clears `completedAt` | Reopen of already-active case → `409` | `403` / `409 INVALID_LIFECYCLE_TRANSITION` |
| `CLOSED` | `archive` (`POST /cases/:id/archive`) | Case manager | Case is closed (not already archived) | `ARCHIVED` (`ARCHIVED`) | Archive of already-archived case → `409` | `403` / `409 INVALID_LIFECYCLE_TRANSITION` |

Notes:

- **Closure is hard-gated** (option A of the product rules): if any operational
  blocker remains, `close` returns `409 CLOSURE_BLOCKED` with the explicit
  `blockers` array. No override mechanism (`confirmOpenItems`) is invented,
  because none exists in the current design.
- **Reopen re-entry is a fixed deterministic status** (`IN_REVIEW`) because the
  prior status is not persisted anywhere; this is documented product behavior,
  not inferred.
- **Archive never deletes** any task, deadline, document, collaborator, or matter
  data, and never changes Client Portal state.
- Each transition writes one content-minimized `CASE_STATUS_CHANGED` timeline
  event (`metadata.lifecycleAction`), which surfaces in Case Activity.

## Unsupported / not-simulated lifecycle transitions

| Requested transition | Why unsupported |
|---|---|
| Any transition to a dedicated `CLOSED` status | `CaseStatus` enum has no `CLOSED` value (aspirational only in `constants.ts`) |
| Two-phase `→ CLOSING → CLOSED` | No `CLOSING` enum value |
| `ON_HOLD` toggle as a lifecycle action | Not part of this package's action set (readable category only); would reuse existing status change |
| Automatic close/reopen from a document or task event | Prohibited — lifecycle changes are explicit, authorized actions only |
| Setting a dedicated `closedAt`/`archivedAt` timestamp | No such columns; only `completedAt` is available |

## Capabilities (backend-derived)

`deriveLifecycleCapabilities` returns:

- `canChangeStatus`: manager and not archived.
- `canStartClosing`: **always false** (no `CLOSING` state).
- `canClose`: manager and category ∈ {`INTAKE`, `ACTIVE`, `ON_HOLD`}.
- `canReopen`: manager and category ∈ {`CLOSED`, `ARCHIVED`}.
- `canArchive`: manager and category = `CLOSED`.
