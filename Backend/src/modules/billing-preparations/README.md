# Billing Preparations (T3B + T4)

Persistent billing review ("Számlázás előkészítése") per client + inclusive
Budapest-day period. Mounted at `/api/v1/billing-preparations` (distinct from
the preserved hours-only `/api/v1/billing-preparation/case/:caseId`).

## Rules

- Money: `billingMinutes × hourlyRate / 60`, `Prisma.Decimal` only, HALF_UP to
  2 decimals, HUF. Policy: `PER_ENTRY_MINUTES_X_RATE_HALF_UP_2DP_V1` persisted
  on every preparation. Amounts serialize as decimal strings.
- Rate precedence per item: row `rateOverride` → T3A `resolveHourlyRate`
  (CASE → CLIENT → UNRESOLVED). Overrides carry reason+author+timestamp and
  never write back to `hourly_rate_versions`.
- Sources are never mutated: items capture a source snapshot + a SHA-256
  fingerprint over every financially relevant field/relation (incl. task→
  requester→organization group). Reopening a preparation does not regenerate;
  divergence is derived as `STALE` / `SOURCE_MISSING`; `POST /:id/refresh` and
  `POST /:id/items/:itemId/resync` are the explicit sync paths.
- `sourceTimeEntryId` is intentionally not an FK: TimeEntry CRUD (incl. delete)
  stays unchanged; a deleted source is detected as `SOURCE_MISSING`.
- Inclusion gates: `MATTER_ONLY`/`AMBIGUOUS` and non-billable rows require
  review acknowledgment (`markReviewed`); `NO_RATE`, `ZERO_MINUTES`, `STALE`,
  `SOURCE_MISSING` rows cannot be included.
- One `OPEN` preparation per client+period (partial unique index);
  `OPEN`/`CLOSED` status only — no invoice lifecycle.
- Access: `authenticate` + `requireRole(ADMIN, PARTNER)` plus a DB-side
  reviewer re-check (`requireBillingReviewer`) — the surface exposes rates and
  money, so it follows the rate-management sensitivity class. No portal routes.
