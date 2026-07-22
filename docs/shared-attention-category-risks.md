# Shared Attention Category — Authorization, Audit & Risks (Phases 14 + risk register)

Date: 2026-07-22

## Authorization (Phase 14)

- **Assign/edit attention category:** the task assignee, or a user with existing
  task-manage authorization for that task (reuse the current task-edit
  authorization; do **not** invent a new permission).
- **Edit estimate:** same authorization as category.
- **Dashboard "my workload" default:** the **authenticated user's assigned
  workload only**. Aggregation is server-scoped to the caller; no other lawyer's
  workload is returned by default.
- **Team totals:** out of scope for v1. If added later, gate behind an explicit
  team-lead authorization; never expose team/other-user workload without it.
- **Review `requestedAttention`:** unchanged — set by the submitter, edited while
  DRAFT, governed by existing submission authorization; self-review remains
  prohibited (`SELF_REVIEW_NOT_ALLOWED`).

## Audit logging

- Category/estimate changes emit a **content-light** audit event: field,
  old→new value, actor id, timestamp. Reuse the existing task
  assignment/lifecycle audit mechanism.
- **No** document text, legal content, client content, or free-text notes in the
  audit payload (consistent with existing content-light audit posture).

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **Schema change required** — `Task.attentionCategory` + `Task.estimatedMinutes` need a migration, and historical replay is broken | High (gating) | Additive nullable columns, reuse existing enum, zero destructive statements; apply via a **separate approved** production-head-additive migration ticket (pattern: `20260719120000_add_client_color_key`). Not created here. |
| **Double counting** task + its submission | High | Resolved: aggregate at task level, once per task; review queue kept separate; self-review prohibition prevents same-user overlap (see deduplication doc). |
| **Concept conflation** (attention vs urgency/priority/actual-time) | Medium | Separate fields, separate formatting (`formatEstimateRange` ≠ `formatMinutes`), tests #8/#9; estimate never summed into `TimeEntry`. |
| **False precision** in duration display | Medium | Range-only unless all-explicit; no "270 perc"; rounding rules fixed in duration-bands. |
| **Unclassified silently defaulted** | Medium | Explicit "Nincs besorolva", count-only, never folded into QUICK_SCAN, no fabricated minutes. |
| **Dashboard aggregation from truncated task page** | Medium | API plan: prefer server-computed summary (Option A) unless the task payload is proven complete; never aggregate a first page. |
| **Extra Dashboard request / regression of partial-load** | Medium | No new polling; fold into existing payload; conform to `dashboardLoadState` (local unavailable, honest empty, no fake zero). |
| **Enum rename temptation** (`ReviewAttentionLevel` → `AttentionCategory`) | Low | Keep the deployed enum name (renaming = migration); expose a neutral alias in the app layer only. |
| **Duplicate taxonomy drift** across surfaces | Low | Single shared module; Review/Tasks/Dashboard re-export it; test asserts one source. |
| **Authorization leakage** of other users' workload | Medium | Server-scoped to caller; team totals gated behind explicit future permission. |

## Constraints reaffirmed

- No independent second task category system (one shared enum).
- No runtime, schema, migration, or deployment change in this audit.
- Six-card "Napi munka összefoglaló" and four light Quick Actions preserved by
  every future slice.
