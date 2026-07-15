# Intake Queue UX Hardening 1

Package: INTAKE-QUEUE-UX-HARDENING-1
Branch: `claude/next-development` (isolated worktree; parallel-development safety boundary)
Base: `origin/hotfix/runtime-shape-20260308` @ `e2f606e`

## Scope

Route-local hardening of the existing `/intake` surface (WORKFLOW-CORE-INTAKE-
MATTER-OPENING-1). No new endpoints, no schema impact, no shared-shell or
editor changes, no packages, no browser persistence.

## What changed

**Queue (`IntakeQueuePanel`)**
- Error state gained an "Újrapróbálás" retry button; failures no longer leave
  a dead panel.
- Loading renders skeleton rows instead of a bare text line.
- A polite `aria-live` status region announces loading/error/result counts.
- "Frissítés" button re-fetches with current filters.
- Offset pagination on the existing `GET /api/v1/intake` contract
  (`limit=20`, `offset`, `pagination.hasMore`): Előző/Következő controls with
  item-range display; filter/scope changes reset to the first page; an empty
  later page offers "Vissza az első oldalra".

**New-matter wizard (`NewMatterWizard`)**
- Step/validation rules extracted into the pure, framework-free module
  `Frontend/src/lib/intake/intakeWizardState.ts` (steps, per-step Hungarian
  validation messages, timezone-safe YYYY-MM-DD deadline format check,
  `firstInvalidStep`, forward-navigation gating, submit gating, review-summary
  builder). Validation is operational form-completeness only — no legal
  inference, nothing read from free text.
- Invalid "Tovább"/"Létrehozás" attempts now show an inline `role="alert"`
  error list instead of silently disabling.
- Step chips became real navigation buttons (backwards always; forward only
  when earlier steps validate) with `aria-current="step"`.
- Focus moves to a step heading on every step change (screen-reader/keyboard
  continuity).
- Client lookup and user-list failures show local errors with retry; a users
  load failure no longer silently empties the responsible-lawyer select.
- Double-submit guard on the final create action.
- The sequential create flow, endpoints, payloads, truthful conflict-step
  notice and review-step disclosure are unchanged.

## Unit coverage

`Backend/tests/intakeWizardState.test.ts` — 12 tests over the pure module
(per-step validation, email/date format, navigation gating, submit gating,
summary fallbacks, no-persistence/no-network module safety). Full backend
suite remains green.

## Boundaries honored

No schema/migrations/DB commands; no release-engineering files; no
AppShell/AuthenticatedApp/globals.css/editor files; no Client Portal; no
packages/lockfiles; no OpenAPI/CORS/auth config; no AI/n8n; no environment
files. Wizard data stays in React session memory only.

## Validation

Backend: `prisma validate` ✓, `tsc --noEmit` ✓, full Jest suite ✓ (all
pre-existing suites + the new 12-test suite). Frontend: `tsc --noEmit` ✓,
production build ✓, clean `verify:prod-env` with the documented non-routable
placeholder ✓. Browser smoke: the route is auth-gated; without a local backend
session the page renders the authentication gate — full interactive
verification of the queue/wizard states remains with the operator (the
new states are additionally exercised by the pure unit tests).

## Integration note

Cherry-pick/merge is left to a later explicit integration step. The change is
self-contained: two frontend files + one backend test + this document.
