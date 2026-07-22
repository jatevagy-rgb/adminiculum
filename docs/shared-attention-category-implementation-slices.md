# Shared Attention Category — Implementation Slices (Phase 13)

Date: 2026-07-22

Each slice is independently releasable and testable. **No migration is created or
run in this audit.** The schema change (Slice 2) requires a separate approved
migration ticket because historical migration replay is broken in this project.

## Slice 1 — Shared attention-category domain contract + duration config
- Add one shared module (front + backend constant) exposing: ordered values,
  labels, icons, tones, `ATTENTION_VALUES` allow-set, duration bands, and
  `formatEstimateRange()`.
- Re-point `taskWorkflowPresentation.ATTENTION_LABELS` and
  `reviews/page.ATTENTION_MARKS` at the shared module (no visual change).
- **No schema, no API, no UI behavior change.** Pure refactor + new constants.
- Releasable alone; unit tests for labels/order/bands/formatting.

## Slice 2 — Task API/model support (schema candidate; migration deferred)
- Add `Task.attentionCategory: ReviewAttentionLevel?` and
  `Task.estimatedMinutes: Int?` (nullable, additive, reuse enum).
- Extend Task create/update/read DTOs + validation
  (`INVALID_ATTENTION_CATEGORY`, `INVALID_ESTIMATED_MINUTES`).
- **Migration NOT executed here** — produce the Prisma schema candidate for a
  separate approved migration ticket (production-head-additive, like
  `20260719120000_add_client_color_key`).
- Until the migration lands, the fields are dormant; reads treat them as null.

## Slice 3 — Task create/edit/read UI
- Add **Figyelmi kategória** select + **Becsült idő** (band default + optional
  override) to the Task form; render category/estimate on task read.
- Category optional at creation; editable while open; content-light audit event.

## Slice 4 — Tasks filter + badges
- Category badge, category filter, estimated-effort display, optional
  grouping/sorting (quick-work vs deep-work). Status/deadline/priority/assignee
  untouched.

## Slice 5 — Dashboard workload aggregation + cards
- Add "Milyen munkák várnak rám?" block (after Napi munka összefoglaló, before
  Ügyek, ahol lépés szükséges), server-computed aggregation (API plan Option A)
  or safe-client if task payload proven complete.
- Nincs besorolva card; partial-load-safe; no new Quick Actions change; six-card
  KPI grid preserved.

## Slice 6 — Review consolidation onto the shared taxonomy
- Review continues to use `requestedAttention`, now sourced from the shared
  module. No behavior change; ensures one canonical taxonomy across surfaces.

## Slice 7 — Backfill / legacy classification workflow
- A separate data workflow to let users classify legacy `attentionCategory =
  null` tasks over time. No silent defaulting; unclassified stays explicit until
  a human classifies it.

## Dependency order

1 → 2 → (3, 4 depend on 2) → 5 (depends on 2) → 6 (depends on 1) → 7 (depends on 2).

Slice 1 and Slice 6 ship without any schema change. Slices 2–5 and 7 depend on
the separately-approved migration.

## Hard constraints

- No migration created/run in this audit.
- No runtime change in this audit (docs only).
- Six-card "Napi munka összefoglaló" and the four light Quick Actions preserved
  in every slice.
- Attention category never merged with urgency/priority/status; estimate never
  merged with actual time.
