# Task Review Decision Backend Slice

Date: 2026-07-18
Branch: `codex/task-review-decision-backend-1`
Base: `354740308d11da516bbd52e5ca2a5e9bcf9522ad`
Status: backend-ready for a separate frontend slice; not deployed

## Scope

This slice adds authenticated review detail, immutable return and approval decisions, corrected revision creation, resubmission compatibility, ordinary task closure, and explicit external-completion recording. It extends the existing TaskSubmission service rather than replacing draft/submit behavior.

No frontend, Prisma schema, migration, package, auth, OpenAPI, Azure, feature flag, Client Portal, Graph, AI, or deployment change is included.

## State Strategy

- `SUBMITTED -> RETURNED`: the decision row and original revision remain immutable; the task returns to `IN_PROGRESS`.
- `RETURNED -> new DRAFT`: explicit `revise` creates the next revision and copies only editable summary/reviewer/attention/external-action metadata.
- New revision submit: the existing submit transaction is reused and emits `TASK_SUBMISSION_RESUBMITTED`.
- Ordinary approval: submission becomes `APPROVED`; the existing task transition closes the task as `DONE`.
- External-action approval: submission becomes `APPROVED`, but the task stays `IN_REVIEW` until metadata-only external completion is recorded.
- External completion: records actor/time/action type, then closes the task through the existing `APPROVE` transition.

## Safety Summary

- Decision access is task/case-scoped; global Admin/Partner role alone does not grant review access.
- Client/external actors and unrelated authenticated actors receive hidden `404` responses.
- Decision mutations require current review detail via `If-Match` plus a persisted `Idempotency-Key` receipt.
- Audit and notifications omit review text, correction text, summaries, filenames, content, storage paths, and provider payloads.
- No actual client send, signature, filing, or authority submission occurs.

## Validation

- Route/queue focused tests: 24/24 passed.
- Real PostgreSQL lifecycle: 16/16 passed.
- Full backend suite: 47 passed suites, 3 skipped; 463 passed tests, 47 skipped.
- Prisma validate/generate, backend typecheck, and backend build passed.
- `npm audit --json`: 19 inherited findings (1 critical, 7 high, 9 moderate, 2 low); no dependency or lockfile change was made.

Classification: `TASK_REVIEW_DECISION_BACKEND_READY_FOR_FRONTEND_SLICE`
