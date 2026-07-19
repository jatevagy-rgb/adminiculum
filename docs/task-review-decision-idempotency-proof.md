# Task Review Decision Idempotency Proof

Date: 2026-07-18

## Persisted Receipt

No schema field was added. Each review mutation derives a deterministic UUID from the raw `Idempotency-Key` and uses the existing `timeline_events.id` uniqueness as the transaction-local receipt. The raw key is not stored in timeline metadata.

The receipt contains only operation, task/submission/actor IDs, safe state/timestamp fields, and a SHA-256 request fingerprint. Review text is never copied to the receipt.

## Ordering And Conflict Rules

- Authorization runs before receipt lookup.
- Existing TaskSubmission submit keys are checked to prevent cross-operation reuse.
- Same key + same actor/operation/target/payload returns the persisted result.
- Same key with a different actor, operation, target, or payload returns `409 IDEMPOTENCY_KEY_REUSED` after access checks.
- A concurrent unique conflict retries through persisted receipt resolution.

## Proof

Real PostgreSQL tests used parallel identical calls for return, approve, and external completion and proved retries create no duplicate decision, task transition, event, or notification. Revise replay was also persisted and single-result. The proof also showed unrelated actors cannot replay a known key and a key cannot move between return and revise.
