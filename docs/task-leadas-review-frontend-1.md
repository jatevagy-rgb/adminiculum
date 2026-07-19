# Task Leadás And Review Frontend Slice

Date: 2026-07-19
Branch: `codex/task-leadas-review-frontend-1`
Base: `ace09d7a6bc39f34ea5028eac26e602b6e6134a0`
Status: frontend implementation complete; release integration blocked by backend CORS headers

## Implemented Frontend Scope

- `/tasks` presents task state and Leadás state in separate semantic columns.
- Backend `nextActionCode` controls the single safe row action; unknown codes stay inert.
- A responsive task drawer shows task context, the editable draft, immutable revisions and revision history.
- Draft editing supports explicit save, eligible reviewer selection, attention level, existing case-document links, existing time-entry links, zero-time confirmation and backend readiness.
- Submission, return, revise, approve and external-completion clients use explicit typed routes and reread lifecycle truth after mutations.
- `/reviews` is an operational queue with attention and urgency kept separate, a safe detail workbench and decision dialogs.

No backend, schema, migration, package, auth, Client Portal, Graph, AI, Azure or deployment change is included.

## Validation Summary

- Frontend TypeScript passed.
- 21/21 focused API and presentation tests passed.
- Production frontend build passed.
- Production bundle env guard passed.
- Backend Prisma validation, TypeScript, build and the full 47-suite/510-test run passed before the final frontend-only copy refinement; backend source remained unchanged.

## Release Blocker

Authenticated localhost QA reached a backend-ready revision with a document, 45 minutes, an eligible reviewer and a detailed-review selection. Browser submission then failed at CORS preflight because `Backend/src/index.ts` allows neither `Idempotency-Key` nor `If-Match` in `Access-Control-Allow-Headers`.

The frontend must not remove these headers because they are required by the authoritative mutation contract. Release integration remains blocked pending a separate backend CORS hardening slice and a rerun of the complete browser lifecycle.

Classification: `TASK_LEADAS_REVIEW_FRONTEND_API_CONTRACT_BLOCKER`
