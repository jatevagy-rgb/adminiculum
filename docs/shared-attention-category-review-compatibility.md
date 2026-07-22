# Shared Attention Category — Review Compatibility (Phase 8)

Date: 2026-07-22

## Two fields, one vocabulary

| Field | Entity | Meaning | Owner |
|---|---|---|---|
| `TaskSubmission.requestedAttention` | submission | requested **form of Review** for a submission | submitter → reviewer |
| `Task.attentionCategory` (candidate) | task | classification of the **assigned Task workload** | assignee / task manager |

Both use the same `ReviewAttentionLevel` values (one taxonomy) but are **distinct
fields on distinct rows** carrying distinct meanings.

## `requestedAttention` is unchanged

No edit to the submission model, its validation, or Review decision behaviour.

## Initial rollout relationship

- Task creation/edit uses **`Task.attentionCategory`**.
- Review submission continues to **require** `requestedAttention`
  (`REVIEW_ATTENTION_REQUIRED`).
- The UI **may** offer the Task's category as a **suggested default** when
  preparing a submission, but the submitter **must still confirm** the Review
  category.

## Why automatic synchronization would be wrong

- The task's attention (how the assignee must *do* the work) and the requested
  review attention (how the reviewer should *check* it) legitimately differ. E.g.
  a task classified `EDITING` may warrant a `DETAILED_REVIEW`, or a heavily
  drafted task may need only an `APPROVAL`.
- Overwriting one from the other would erase the reviewer's deliberate choice and
  could misroute review effort.
- A reviewer changing `requestedAttention` must **not** mutate the source
  `Task.attentionCategory` (separate planning record for the assignee), and vice
  versa.

Therefore: **suggested default, explicit confirmation, no automatic
overwrite.**
