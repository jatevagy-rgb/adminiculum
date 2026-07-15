# Operational Pages UX Cleanup 1

## Purpose

This checkpoint makes three internal operational pages feel like daily work tools rather than prototype or configuration surfaces:

- `/time-entries` — Munkaórák
- `/deadlines` — Határidők
- `/clause-library` — Záradéktár

The pass is frontend-only and does not add persistence, backend routes, schema changes, migrations, feature enablement, or fake records.

## Existing Problems

- The time-entry page opened with report setup before actual recorded work.
- The deadlines page used a narrow board and implementation-heavy copy.
- The clause library rendered unavailable controls and future-state panels while the capability remains gated.
- All three pages carried more explanatory scaffolding than operational user guidance.

## Munkaórák

- Default view is now `Bejegyzések`.
- Header shows period, recorded total, current authenticated user label where available, and the primary `Munkaóra rögzítése` action.
- Search, period, and matter filters sit above the list.
- Report generation remains available under the secondary `Kimutatás` tab.
- Empty and no-result states are compact and action-oriented.

## Határidők

- The page still uses the canonical `GET /api/v1/agenda` frontend helper.
- Header copy is short and operational.
- Urgency summary items act as filters for `Lejárt`, `Ma`, `Holnap`, `Ezen a héten`, and `Később`.
- Agenda rows are compact and grouped by urgency.
- Empty copy avoids data-source and implementation explanations.

## Záradéktár

- The feature remains gated.
- When unavailable, the page renders one truthful unavailable panel.
- Disabled filters, fake details, related-workflow panels, and roadmap/foundation copy were removed from the unavailable state.
- If the capability becomes available later, the page keeps a compact search/filter/list/detail structure without automatic legal recommendations.

## Shared Design Rules

- Primary action first.
- Current work and state before configuration.
- Compact rows and filters over equal-weight card grids.
- No local durable state.
- No fake records, fake AI, fake external sync, or simulated persistence.
- No global shell, editor, backend, schema, migration, package, auth, Client Portal, OpenAPI, CORS, Azure, or deployment changes.

## Capability Truthfulness

- Time entries use existing time-entry and report APIs.
- Deadlines use existing agenda/deadline APIs.
- Clause library remains unavailable where the backend returns the disabled capability response.

## Browser Verification

Required visual routes:

- `/time-entries`
- `/deadlines`
- `/clause-library`

Verification checks:

- Munkaórák opens on entries and recording, with report tools secondary.
- Határidők uses the available width, urgency filters, and operational empty copy.
- Záradéktár unavailable mode renders one concise state with no inactive catalog controls.

## Validation

Required validation:

- `git diff --check`
- `git diff --cached --check`
- backend Prisma validate, TypeScript, and tests
- frontend TypeScript, production build, audit JSON
- clean production-env guard
- browser verification for the three routes
