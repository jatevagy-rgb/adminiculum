# Shared Attention Category — API Plan (Phase 15)

Date: 2026-07-22

## Task DTO changes (create / update / read)

Add two optional fields to the Task create/update/read DTOs:

- `attentionCategory: ReviewAttentionLevel | null`
- `estimatedMinutes: number | null`

Validation (reuse the existing pattern):
- `attentionCategory` validated against the shared `ATTENTION_VALUES` allow-set;
  invalid → `400 INVALID_ATTENTION_CATEGORY` (mirroring the existing
  `INVALID_REVIEW_ATTENTION` on submissions).
- `estimatedMinutes` — integer ≥ 0 (or null); reject negatives/non-integers with
  `400 INVALID_ESTIMATED_MINUTES`.
- Both optional; omitting them leaves existing values unchanged (PATCH-safe).

Read DTOs (`TaskItem`, task list rows, dashboard task payload) gain the same two
fields so the frontend can render badges/estimates without extra calls.

## Dashboard workload aggregation — strategy choice

Options evaluated:

| Option | Correctness | Requests | Authorization | Pagination risk | Double-count | Verdict |
|---|---|---|---|---|---|---|
| A. extend an existing Dashboard stats endpoint | high (server aggregates) | 0 extra | server-enforced (user-scoped) | none (server sees all) | server-controlled | strong |
| B. dedicated read-only `workload-summary` endpoint | high | +1 | server-enforced | none | server-controlled | strong, but adds a request |
| C. aggregate in frontend from loaded tasks | **risky** | 0 | client | **high** — the dashboard task fetch is capped/paginated | client-controlled | **rejected if source is truncated** |

### Recommendation

**Prefer no additional Dashboard request** *only if* an already-loaded,
**non-truncated** task payload contains `attentionCategory` + `estimatedMinutes`
for all of the user's open tasks. The current dashboard fetches tasks via
`getMyTasks()` (see `DashboardFocused.tsx`); its completeness must be confirmed
during implementation:

- If `getMyTasks()` returns the user's **complete** open-task set (not a first
  page), aggregate in the frontend from that payload (**Option C-safe**) — zero
  extra requests, consistent with the resilience contract, no new endpoint.
- If `getMyTasks()` is paginated/capped, do **not** aggregate from an incomplete
  first page. Instead extend the existing operational/stats Dashboard endpoint
  (**Option A**) to return a server-computed per-category
  `{count, minMinutes, maxMinutes, nearestDeadline}` plus an `unclassifiedCount`
  — zero extra requests and correct totals.

Default plan: **Option A** (server-computed summary folded into the existing
operational-overview or stats payload) because it is correct regardless of task
pagination and keeps request count unchanged. Option C-safe is an allowed
optimization only after proving completeness.

Do **not** introduce a separate polling endpoint; no new request cycle for the
cards beyond the existing dashboard load (consistent with the deployed
partial-load contract).

## Aggregation contract (server or safe-client)

Per category bucket + `unclassified`:
```
{ category, count, minMinutes, maxMinutes, nearestDeadline? }
```
computed by the rules in duration-bands (explicit estimate → min=max; band →
min/max; unclassified → count only, no minutes). Scoped to the authenticated
user's assigned open tasks; counted once per task (see deduplication).

## Partial-load behavior

The workload block conforms to the deployed `dashboardLoadState` contract:
- source failure → local unavailable state ("Most nem elérhető"), **not** a
  global banner and **not** a fake zero;
- successful empty → honest empty ("Nincs rám váró besorolt munka.");
- no new global-critical trigger.

## Review endpoints

Unchanged. `requestedAttention` on submissions and the review queue stay as-is;
the shared taxonomy module simply becomes their single source of labels/values.
