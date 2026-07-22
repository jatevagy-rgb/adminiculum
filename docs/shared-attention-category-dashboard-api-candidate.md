# Shared Attention Category — Dashboard API Candidate (Phases 9–10)

Date: 2026-07-22

## No-double-counting rule (executable, tested)

`isCountableWorkloadTask(task, userId)` (backend domain module) encodes the rule:
a task counts iff `assignedToId === userId` **and** it is not closed
(`isClosedTaskStatus`). Aggregation is **per-Task** (one item per task), so:

| Case | Handling |
|---|---|
| assigned task with active submission | one task → counted once (submission not added separately) |
| task with multiple submissions | still one task → counted once (never per revision) |
| legacy review task without submission | if assigned+open, counted once by `Task.attentionCategory` (null → unclassified) |
| closed / completed task | excluded (`isClosedTaskStatus`) |
| delegated task (assigned to someone else) | excluded from my workload; appears in the assignee's |
| self-review prohibited | a user is never both assignee and reviewer of the same item → no cross-surface overlap |

The Review queue stays a **separate reviewer-facing view** (sourced from
`requestedAttention`) and is **not** merged into "my workload".

## Aggregation strategy (Phase 10)

**Recommendation: extend an existing authenticated Dashboard read model** with a
server-computed `attentionWorkload` block. Do **not** compute from a paginated
frontend task list, and do **not** add a new polling endpoint.

Endpoint audit:
- `getMyTasks()` (`/tasks/my/tasks`) — currently drives the dashboard task
  sections; **must be confirmed complete (non-paginated)** before any client-side
  aggregation. If complete, safe-client aggregation is permitted (zero extra
  requests). If capped, do not aggregate from it.
- **Operational overview** (`/cases/dashboard/operational-overview`) or
  **dashboard stats** (`/cases/dashboard/stats`) — the preferred host for a
  server-computed `attentionWorkload` (server sees all of the user's open tasks,
  correct regardless of pagination, one request).

**Default plan:** fold `attentionWorkload` into the existing operational/stats
payload (server-computed). Correct under pagination; **no extra Dashboard
request**.

### Shape
```json
{
  "attentionWorkload": {
    "categories": [
      { "attentionCategory": "QUICK_SCAN", "count": 3, "minMinutes": 15, "maxMinutes": 45, "nearestDeadline": "2026-07-24T…" }
    ],
    "unclassified": { "count": 2 }
  }
}
```
Computed by `aggregateAttentionWorkload` over `isCountableWorkloadTask`-filtered
tasks; `nearestDeadline` is the earliest `dueDate` in the bucket (optional).

## Partial-load behaviour

Conforms to the deployed `dashboardLoadState` contract: source failure → local
"Most nem elérhető" (no global banner, no fake zero); successful empty → honest
empty; no new global-critical trigger; no new request cycle.

## Not implemented here

The endpoint is **not** implemented in this ticket: it depends on the proposed
`Task.attentionCategory` / `estimatedMinutes` columns, which require the separate
migration. Phase 10's "implement only if doable without the proposed Prisma
fields" is therefore not met — deferred to the post-migration slice. The pure
aggregation + scope logic it will use **is** implemented and tested now.
