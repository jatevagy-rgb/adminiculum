# Shared Attention Category — Slice 1 Readiness

Date: 2026-07-22
Branch: `claude/shared-attention-category-domain-1` (base `a578c2a`)

## Delivered in this ticket

| Item | Artifact |
|---|---|
| Shared backend domain contract | `Backend/src/modules/tasks/attentionCategory.ts` |
| Duration bands (one authoritative source) | same module (`ATTENTION_DURATION_BANDS`) |
| Estimate validation | `parseEstimatedMinutes` (typed reasons, no clamp) |
| Aggregation + no-double-count scope | `aggregateAttentionWorkload`, `isCountableWorkloadTask` |
| Frontend presentation mapping (unwired) | `Frontend/src/lib/attentionCategory.ts` |
| Prisma schema candidate (nullable, additive) | `Backend/prisma/schema.prisma` (Task fields only; no first-migration index) |
| Backend tests (21) | `Backend/tests/attentionCategory.test.ts` |
| Frontend tests (10) | `Frontend/tests/attentionCategory.test.ts` |
| DTO / auth / audit / review / dashboard-API contracts | this docs set |

## Validation

- Frontend: `tsc` clean, `build` clean, new tests 10/10.
- Backend: `prisma validate` valid, `prisma generate` OK, `tsc` clean,
  **56 suites / 525 tests** pass, `build` clean.
- Zero-diff gates: migrations, packages, lockfiles — all clean.

## Semantic distinctions preserved

- Attention category ≠ urgency/priority/status (independent).
- Estimate (bands / `estimatedMinutes`) ≠ actual time (`TimeEntry`).
- Task vs Review attention are distinct fields sharing one vocabulary.
- Unclassified is explicit, count-only, never defaulted.
- Production metadata rejected the standalone `attentionCategory` index for the
  first migration; future indexing must be based on query evidence.

## DONE-MEANS status

1. one canonical shared domain contract — ✅
2. existing Review values unchanged — ✅
3. one authoritative backend duration source — ✅
4. Task schema candidate nullable/additive — ✅
5. no migration created and no attention-category index — ✅
6. exact DTO validation — ✅ (`INVALID_ATTENTION_CATEGORY` / `INVALID_ESTIMATED_MINUTES`)
7. Task/Review distinction documented — ✅
8. no-double-counting executable + tested — ✅
9. authorization mapped to existing permissions — ✅
10. TimeEntry remains actual-time-only — ✅
11. Dashboard API strategy selected — ✅ (server-computed `attentionWorkload`)
12. frontend mapping complete — ✅
13. frontend/backend validation passes — ✅
14. no deployment or DB access — ✅

## Next gate

Separate approved **migration ticket** to land the Task columns
(production-head-additive; no blanket `migrate deploy`). After that:
Slices 2–5 (API wiring, Task UI, filters/badges, Dashboard workload block) and
Slice 6/7 (review consolidation, backfill).
