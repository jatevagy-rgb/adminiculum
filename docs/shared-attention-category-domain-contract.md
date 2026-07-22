# Shared Attention Category — Domain Contract (Phases 2–3)

Date: 2026-07-22

## Canonical concept (Phase 2)

**Attention category = the form and intensity of legal work required to complete
an item.** One canonical taxonomy, five values, shared by Tasks, Review, and the
Dashboard workload view.

It is **not**, and must stay independent of:
- urgency / deadline / priority;
- case status / workflow status;
- responsible lawyer;
- approval result.

Worked examples (must both be expressible):
- A **Részletes ellenőrzés** that is not urgent (long work, far deadline).
- An **Aláírás** that is urgent but tiny (short work, imminent deadline).

Urgency is already computed independently on the Review page
(`reviewUrgency` from dueDate/priority) and rendered as a separate pill; the
shared contract preserves that separation everywhere.

## Canonical taxonomy (Phase 3)

Reuse the **existing** persisted enum `ReviewAttentionLevel` as the single source
of truth. Do **not** create a second Task-specific enum.

| Order | Enum value | Label (hu) | Icon | Pill tone |
|---|---|---|---|---|
| 1 | `QUICK_SCAN` | Gyors átfutás | ↗ | gold |
| 2 | `APPROVAL` | Jóváhagyás | ✓ | sage |
| 3 | `SIGNATURE` | Aláírás | ✎ | violet |
| 4 | `EDITING` | Szerkesztés | ▤ | blue |
| 5 | `DETAILED_REVIEW` | Részletes ellenőrzés | ◎ | burgundy |

Labels/order/icons/tones already exist in
`Frontend/src/lib/taskWorkflowPresentation.ts` (`ATTENTION_LABELS`) and
`Frontend/src/app/reviews/page.tsx` (`ATTENTION_ORDER`, `ATTENTION_MARKS`).

## Recommended shared contract shape

**One shared enum + one shared application-layer module**, reused by every
surface. No duplicated value lists, no free-text categories, no frontend-only
categorization, no title-derived or AI-inferred category.

### Persistence (single enum, per-entity fields)

- Keep the **one** Prisma enum `ReviewAttentionLevel` (rename optional but not
  required; see below).
- `TaskSubmission.requestedAttention: ReviewAttentionLevel?` — **unchanged**
  (review-phase attention requested of the reviewer).
- **New** `Task.attentionCategory: ReviewAttentionLevel?` — the work the task
  itself requires (assignee planning), set at task creation. Reuses the **same**
  enum — no second enum.

This is "one shared enum used by Task, TaskSubmission/Review, Dashboard workload,
Tasks filters, and Review filters" — the preferred Phase-3 option — with a
distinct **field** per entity because the two carry semantically different (but
same-vocabulary) values (see review-task-deduplication).

### Application layer (shared module)

Promote the taxonomy into a single shared module consumed by all surfaces, e.g.
`Frontend/src/lib/attentionCategory.ts` (front) mirroring a backend
`attentionCategory` constant set, holding: the ordered values, labels, icons,
tones, the `ATTENTION_VALUES` allow-set (already effectively present backend-side),
and the duration bands (see duration-bands). `taskWorkflowPresentation.ATTENTION_LABELS`
and `reviews/page.ATTENTION_MARKS` become re-exports of this module so there is
one authoritative definition.

## Enum naming note (optional, non-blocking)

The enum is named `ReviewAttentionLevel`. Because it becomes shared beyond
review, a future rename to `AttentionCategory` would read better — but **renaming
a Prisma enum is a schema/migration change** and is out of scope here. The
recommended plan **keeps the existing name** to avoid an avoidable migration;
the application layer can expose it under a neutral `AttentionCategory` alias.

## Non-goals / prohibitions honoured

- No independent second category system for tasks.
- No string free-text categories, no title-derivation, no AI inference.
- No merging of attention with urgency/priority/status.
