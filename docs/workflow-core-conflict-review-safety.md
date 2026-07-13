# Conflict-Review Safety (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)

## Finding

There is **no structured conflict-review persistence** in `Backend/prisma/schema.prisma`: no
model, no case-level field, no reviewer/outcome/timestamp columns. Per the truthful-implementation
rule, the feature is exposed as **unavailable** rather than simulated.

## What was implemented

- `conflictReview.status` in the intake-readiness DTO is **always `"UNAVAILABLE"`** with a safe
  label: „Az összeférhetetlenségi ellenőrzés nincs strukturáltan rögzítve."
- `availability.conflictReviewPersistence = false`; `capabilities.canRecordConflictReview = false`.
- **No `POST /cases/:id/conflict-review` route exists.**
- The checklist item `CONFLICT_REVIEW` is `available: false`, `required: false` — it can never
  block or satisfy activation, because pretending either way would be untruthful.
- The queue summary's `conflictReviewRequired` is constantly 0.
- The intake wizard's conflict step is a **notice, not a form**: no checkbox, nothing submitted.
- An optional opening *task* („Összeférhetetlenségi ellenőrzés elvégzése (manuális, rendszeren
  kívüli)") may be created **only by explicit user selection**; it organizes human work and
  records **no outcome**.

## What was deliberately NOT done

- No persistence of conflict state in `Task.description`, `Case.description`,
  `TimelineEvent.metadata`, or any JSON field.
- No automated conflict decision of any kind (no matching heuristics, no AI, no scoring).
- No conflict-search narrative storage or exposure.
- No opposing-party data collection (no structured support exists).

## Safety rules

1. **A potential conflict is not an actual conflict** — and this system cannot even represent a
   potential conflict; humans evaluate outside the system.
2. **No match does not equal conflict clearance.** Client/case search assists a human review; its
   result has no clearance semantics.
3. **Activation does not assert conflict clearance.** Activation is operational workflow
   activation; the readiness DTO carries the explicit unavailable state so no reader can mistake
   an activated matter for a conflict-cleared matter.
4. **Task completion is not clearance.** Completing the manual-review opening task proves nothing
   about the outcome and is never interpreted.

## Future model recommendation (documentation only)

A proper implementation requires a schema change delivered via a separate migration + PR:

```prisma
model CaseConflictReview {
  id             String   @id @default(uuid())
  caseId         String
  outcome        ConflictReviewOutcome // CLEARED | BLOCKED | REVIEW_REQUIRED
  safeReasonCode String?
  reviewerId     String
  reviewedAt     DateTime @default(now())
  supersededAt   DateTime?
}
```

with reviewer derived from authentication, content-minimized audit, deterministic repeat
(supersede, not overwrite), and 409 on incompatible case state. Until that exists, the capability
stays `false` and the UI stays truthful.
