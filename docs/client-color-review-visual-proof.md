# Client Color Review Visual Proof

## Relationship

Submission rows use `TaskSubmission -> Task -> Case -> Client`. Legacy rows use only their existing `Task -> Case -> Client` relation. Missing colors remain neutral.

## Browser Proof

- Queue included QUICK_SCAN, APPROVAL, DETAILED_REVIEW, and a legacy row.
- Client accents included RED, BLUE, GREEN, and neutral.
- Client name, attention label, urgency label/icon, submission status, and selection remained independently visible.
- Selected detail used the same current client color as the queue.
- Changing Beta from BLUE to PURPLE and refreshing updated both queue and detail; BLUE was restored afterward.

## Cache Correction

The detail GET now uses `cache: "no-store"`. This preserves the original API and lifecycle contract while preventing browser reuse of a stale review detail after a client color update.

Review decisions, `reviewVersion`, ETag, idempotency, history, submit, return, revise, approve, and external-completion behavior were not changed.
