# Calendar Product and Data Model Go/No-Go

Date: 2026-07-21

## Classification

**CALENDAR_AUDIT_COMPLETE — READY_FOR_IMPLEMENTATION**

## Summary

This audit produced 20 documentation files covering the complete product and data contract for a shared internal office calendar for the Adminiculum law office management system. All design decisions are documented. The MVP scope is defined. The implementation is sliced into 6 deployable increments.

## Audit inventory

| # | Document | Phase coverage |
|---|---|---|
| 1 | calendar-existing-state-audit.md | Phase 1-2 |
| 2 | calendar-domain-boundaries.md | Phase 3 |
| 3 | calendar-event-type-taxonomy.md | Phase 4 |
| 4 | calendar-source-of-truth-matrix.md | Phase 5 |
| 5 | calendar-proposed-data-model.md | Phase 6-8 |
| 6 | calendar-recurrence-contract.md | Phase 9 |
| 7 | calendar-timezone-and-all-day-contract.md | Phase 10 |
| 8 | calendar-authorization-and-visibility.md | Phase 11-13 |
| 9 | calendar-api-contract.md | Phase 14 |
| 10 | calendar-unified-projection.md | Phase 15 |
| 11 | calendar-task-deadline-interoperability.md | Phase 16 |
| 12 | calendar-audit-and-retention.md | Phase 12, 19 |
| 13 | calendar-outlook-future-boundary.md | Phase 18 |
| 14 | calendar-migration-design.md | Phase 20 |
| 15 | calendar-performance-and-concurrency.md | Phase 21-22 |
| 16 | calendar-frontend-product-contract.md | Phase 23 |
| 17 | calendar-mvp-and-phased-plan.md | Phase 24-25 |
| 18 | calendar-risk-register.md | Phase 26 |
| 19 | calendar-decision-log.md | Phase 27 |
| 20 | calendar-product-data-model-go-no-go.md | Phase 28 |

## Zero-diff verification

This audit modified zero runtime files:

- **Backend/src/**: zero diff
- **Frontend/src/**: zero diff
- **Backend/prisma/schema.prisma**: zero diff
- **Backend/prisma/migrations/**: zero diff
- **package.json / package-lock.json**: zero diff
- **Environment files**: zero diff
- **Azure/config**: zero diff
- **Tests**: zero diff

All changes are confined to `docs/` directory.

## Key design decisions summary

1. New CalendarEvent model (not a Task subtype)
2. Task/Case deadlines projected at runtime (not duplicated)
3. Unified projection API merging 3 sources
4. RFC5545 RRULE for recurrence with structured metadata
5. Virtual occurrences (not materialized rows)
6. Client derived via Case relation (no direct clientId)
7. Soft delete with 2-year retention
8. Optimistic concurrency via integer version
9. Private events show "Foglalt" busy placeholder
10. Dedicated CalendarAuditLog table
11. Existing agenda API unchanged in MVP
12. No Outlook/Graph integration in MVP
13. No notifications in MVP
14. 2-year recurrence boundary
15. Monday as first day of week

## Implementation readiness

| Criterion | Status |
|---|---|
| Data model fully specified | Yes |
| API contract fully specified | Yes |
| Authorization matrix fully specified | Yes |
| Frontend product contract defined | Yes |
| Migration SQL documented | Yes |
| Rollback procedure documented | Yes |
| Implementation slices defined | Yes (6 slices, 16-23 days) |
| Risks registered | Yes (15 risks, 7 questions) |
| Decisions logged | Yes (15 decisions) |
| Phase 2 roadmap defined | Yes (10 features prioritized) |

## Go/No-Go recommendation

**GO** — The audit is complete. All contracts are documented. Implementation can begin with Slice 1 (database foundation).

## Prerequisites before starting implementation

1. Product owner reviews and approves event type taxonomy
2. Product owner confirms MVP scope (included vs. excluded features)
3. Open question Q6 (file attachments on events) resolved
4. RRULE library selected and dependency approved
5. Staging database available for migration testing
