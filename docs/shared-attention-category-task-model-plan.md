# Shared Attention Category — Task Model Plan (Phase 5)

Date: 2026-07-22

## Current Task fields (audit)

| Field | Semantic meaning | Reusable for attention/estimate? | Migration? | Compatibility risk |
|---|---|---|---|---|
| `taskType: TaskType` | classification of the task's *kind of matter/work item* (enum), not attention intensity | No — different concept | — | reusing it would conflate two dimensions |
| `type: String?` | free-text code-compat alias of taskType | No | — | free-text; not a controlled vocabulary |
| `priority: Priority` | urgency/priority | No (must stay independent) | — | conflation risk |
| `complexityScore: Int @default(3)` | 1–5-ish intelligence heuristic | No — not a working-time or attention-form value | — | not user-facing taxonomy |
| `riskScore: Int @default(3)` | risk heuristic | No | — | — |
| `maturityStage`, `stuckReason` | lifecycle intelligence | No | — | — |
| `timeEntries: TimeEntry[]` | **actual** recorded time | No — actual, not estimate | — | must not be conflated with estimate |
| (none) `estimatedMinutes` | — absent — | must be added | **yes** | new nullable column |
| (none) `attentionCategory` | — absent — | must be added | **yes** | new nullable column, reuse enum |

**Conclusion:** `Task` has neither an attention category nor an estimate. Nothing
existing can be safely repurposed without conflating concepts.

## Target Task capability

```prisma
model Task {
  ...
  attentionCategory ReviewAttentionLevel?   // NEW — reuse existing enum, nullable
  estimatedMinutes  Int?                     // NEW — optional explicit override, nullable
  ...
}
```

- `attentionCategory` is **nullable** for migration/backfill and to allow legacy
  tasks to remain unclassified (Phase 11).
- `estimatedMinutes` is **nullable**; when present it overrides the category band
  (see duration-bands precedence). It is an **estimate**, never actual time.
- Both reuse existing types (`ReviewAttentionLevel`, `Int`); **no new enum**.

## Effective estimate logic (restated)

1. explicit `Task.estimatedMinutes` (min = max = value);
2. else `Task.attentionCategory` band (min/max);
3. else unclassified (count only).

## Actual vs estimate — kept separate

`TimeEntry` / `linkedTimeMinutes` remain the record of **actual** work performed.
`estimatedMinutes` and the bands are planning **estimates**. They are stored,
named, formatted, and aggregated separately; no code path sums one into the other.

## Migration requirement

Adding `Task.attentionCategory` and `Task.estimatedMinutes` is an **additive,
nullable** schema change (two nullable columns, zero destructive statements,
reusing the existing enum — no new enum type). It nonetheless **requires a
migration**, which this audit does **not** create or run.

- A Prisma **schema candidate** is captured here for a separate approved
  migration ticket.
- Migration execution is gated because historical migration replay is known
  broken in this project (documented in prior release records); a separate ticket
  must apply it as a production-head-additive migration, as was done for
  `20260719120000_add_client_color_key`.

### Schema candidate (for the separate ticket, not applied here)

```prisma
// enum ReviewAttentionLevel — UNCHANGED (already deployed)

model Task {
  // ... existing fields unchanged ...
  attentionCategory ReviewAttentionLevel?
  estimatedMinutes  Int?

  @@index([attentionCategory])   // supports Dashboard workload aggregation by category
}
```

Backfill (Slice 7) is a **separate** data workflow, not part of the migration:
legacy tasks remain `attentionCategory = null` (unclassified) until explicitly
classified.
