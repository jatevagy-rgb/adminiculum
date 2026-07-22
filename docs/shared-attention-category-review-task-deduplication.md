# Shared Attention Category — Review/Task Deduplication (Phase 6)

Date: 2026-07-22

## Data relationship (proven)

- `TaskSubmission.taskId` is **required** (non-nullable) — every submission
  belongs to exactly one `Task`.
- A `Task` can have many `TaskSubmission` rows (revision chain), but at most one
  is the current review item.
- The Review queue contains two `source` kinds
  (`Backend/src/modules/tasks/services.ts`):
  - `TASK_SUBMISSION` — a real submission awaiting review;
  - `LEGACY_TASK` — a task in a review-ish state **without** a submission
    (`requestedAttention = null`).
- Therefore **there are no submission-less "standalone" reviews** in the sense of
  reviews not tied to a task: a review item is always either a submission of a
  task, or a legacy task itself.

## Two distinct planning surfaces, two distinct owners

| Surface | Question | Whose workload | Category source |
|---|---|---|---|
| Dashboard "my workload" | "What kind of work is waiting **for me to do**?" | the **assignee** of the task | `Task.attentionCategory` |
| Review queue | "What is waiting **for me to review**?" | the **reviewer** | `TaskSubmission.requestedAttention` |

These are different people and different work. `requestedAttention` is the
submitter's request to the reviewer; `Task.attentionCategory` is the assignee's
own classification of the task. They share the **vocabulary** (one enum) but are
**not the same value** and must not be summed together.

## Authoritative category

- For **task workload** aggregation: `Task.attentionCategory` is authoritative.
- For **review workload** aggregation: `TaskSubmission.requestedAttention` is
  authoritative.
- Review does **not** inherit the task category, and the task does not inherit the
  submission's requested attention. A reviewer changing `requestedAttention` on a
  submission does **not** change the source `Task.attentionCategory` (they are
  separate fields on separate rows).

## No-double-counting rule (the resolution)

The Dashboard workload block aggregates **Tasks assigned to the current user**,
counted **once per Task** by `Task.attentionCategory`. Specifically:

1. Aggregate over the authenticated user's **assigned, open tasks** (one row per
   task). A task in review status is still **one task** and is counted once.
2. Do **not** also add the task's `TaskSubmission` rows into the same total — the
   submission is the same underlying work item, already represented by its task.
3. The **Review queue** remains a **separate** view for the reviewer and is
   **not** merged into the assignee's "my workload" totals. (A user who is both
   assignee of task A and reviewer of task B sees task A in "my workload" and
   task B in the review queue — no overlap, because reviewer≠assignee for a given
   submission: self-review is prohibited, `SELF_REVIEW_NOT_ALLOWED`.)
4. Revision chains: count the **task**, never the number of submission revisions.

Because self-review is disallowed, a single item can never be in both a user's
"my tasks to do" and that same user's "my reviews" — eliminating cross-surface
double counting for one person.

## Scope decision for v1 Dashboard workload block

The v1 "Milyen munkák várnak rám?" block aggregates **assigned open Tasks by
`Task.attentionCategory`** only. It deliberately does **not** blend in review-queue
items, so there is structurally no double count. A later slice may add a separate
reviewer-workload view sourced from `requestedAttention`, kept visually and
numerically distinct.

## Guard

Implementation must not aggregate a task and its submission into the same bucket.
A test (see test-matrix #7) asserts a task that is both assigned-to-me and has a
submission is counted exactly once in "my workload".
