# Client Color System Foundation 1

Date: 2026-07-19
Branch: `codex/client-color-system-foundation-1`
Base: `7176fd61de271aa1bbc348ca6c162cefabe815f7`
Deployment: none
Production database action: none

## Result

The foundation introduces one optional, persisted, controlled color key on `Client`. Cases inherit it directly from their client and task list rows inherit it through `Task -> Case -> Client`. No task or case override exists.

The first slice covers:

- additive nullable `Client.colorKey` persistence;
- a fixed ten-key palette with Hungarian labels;
- explicit client list/detail/create/update DTOs;
- client color selection and clearing;
- restrained client-card, case-row, and task-row accent bars;
- neutral rendering for missing or malformed values;
- synthetic disposable-database and authenticated browser proof.

## Product Boundaries

- Color is an identity cue, not status, priority, review attention, or urgency.
- Client name remains visible everywhere.
- Existing clients stay valid without backfill.
- Legacy `Client.color` is retained for compatibility but is not read, written, or rendered by this foundation.
- No local storage, client-name mapping, or hash-derived color is used.

## Deferred

Communications, notifications, calendar, review, document editor, clause library, Client Portal, AI, and Outlook/Graph remain unchanged. Later modules must consume `Client.colorKey`; they must not add local color fields.

## Validation

- Targeted client-color tests: 4 suites / 26 tests passed.
- Full backend: 51 suites / 481 tests passed; 3 suites / 47 tests intentionally skipped.
- Prisma validate/generate, backend typecheck, and backend build passed.
- Frontend typecheck, production build, and production-env bundle guard passed.
- Frontend package has no test script; no package file was changed to add one.
- Dependency audit was recorded without fixes: backend 19 findings; frontend 4 moderate findings.
- `git diff --check` and scope gates passed before commit.

Classification candidate: `CLIENT_COLOR_FOUNDATION_READY_FOR_MODULE_ROLLOUT`.
