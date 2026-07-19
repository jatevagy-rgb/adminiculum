# Task Leadás And Review Release Readiness

Date: 2026-07-19
Branch: `codex/task-leadas-review-frontend-1`

## Green Evidence

- Frontend implementation is narrow and contract-driven.
- Frontend TypeScript passed.
- Focused frontend tests passed: 21/21.
- Production build and bundle env guard passed.
- Frontend audit was read-only: 4 moderate inherited findings; no package/lock change or audit fix.
- Backend regression passed: Prisma validation, TypeScript, build, 47 passed suites/3 skipped, 463 passed tests/47 skipped.
- Disposable localhost database was deleted after synthetic QA.
- Backend source, Prisma, migrations, packages, auth, OpenAPI, Azure, Client Portal, Graph, AI and env files have zero diff.

## Blocking Evidence

Browser submission cannot cross the production-shaped frontend/backend origin boundary. The backend CORS allow-header list lacks `Idempotency-Key` and `If-Match`, while the authoritative submit and review-decision contracts require those headers.

This branch is not ready for release integration. The frontend must not weaken idempotency or concurrency controls to work around the gap.

## Required Unblock Sequence

1. Separate backend CORS hardening ticket adds only the required headers and targeted unauthenticated/preflight tests.
2. Backend validation and deployment planning remain separate.
3. Rerun this branch’s authenticated browser lifecycle against a disposable local database.
4. Capture ordinary return/revision-2/approval, zero-time and external-action completion states at both target viewports.
5. Reclassify only after console and network logs are clean.

Classification: `TASK_LEADAS_REVIEW_FRONTEND_API_CONTRACT_BLOCKER`
