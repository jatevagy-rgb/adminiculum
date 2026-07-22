# Shared Attention Category — Task DTO Candidate (Phase 5)

Date: 2026-07-22
Status: **candidate** — not wired into routes/services in this ticket (no runtime
rollout of Task attention fields).

## Fields

Two optional fields added to Task create / update / read / list DTOs:

- `attentionCategory: "QUICK_SCAN" | "APPROVAL" | "SIGNATURE" | "EDITING" | "DETAILED_REVIEW" | null`
- `estimatedMinutes: integer (1..480) | null`

## JSON forms

Create/update (classified with explicit estimate):
```json
{ "attentionCategory": "DETAILED_REVIEW", "estimatedMinutes": 90 }
```
Classified, band default (no explicit estimate):
```json
{ "attentionCategory": "EDITING", "estimatedMinutes": null }
```
Unclassified:
```json
{ "attentionCategory": null, "estimatedMinutes": null }
```

Read/list rows echo the stored values (nullable). Absent keys on PATCH mean
"unchanged" (do not clear).

## Validation (reuse the shared domain module)

- `attentionCategory`: must pass `isAttentionCategory`; otherwise stable
  **`400 INVALID_ATTENTION_CATEGORY`** (mirrors the existing
  `INVALID_REVIEW_ATTENTION` used for submissions). Arbitrary strings rejected.
- `estimatedMinutes`: must pass `parseEstimatedMinutes`; otherwise stable
  **`400 INVALID_ESTIMATED_MINUTES`** with the typed reason. No silent clamp.
- Both optional; `null` explicitly clears.

## Dashboard workload projection

The read model exposes the aggregate (see dashboard-api-candidate):
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

## Audit representation

Category/estimate changes surface as content-light audit events (see
audit-contract): field, old→new value, actor, timestamp — no task text or content.

## Not implemented here

Route/service wiring, the Task form, and the workload endpoint are **candidates**
only; they depend on the separately-approved migration landing the Task columns.
