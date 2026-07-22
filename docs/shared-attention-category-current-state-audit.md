# Shared Attention Category — Current-State Audit (Phase 1)

Date: 2026-07-22
Branch: `claude/shared-attention-category-audit-1` (base `a578c2a`)
Scope: audit only — no runtime, schema, migration, or deployment change.

## The existing attention taxonomy is real and persisted

The five Review categories the product already exposes are backed by a persisted
Prisma enum. The ticket's assumed internal values are **confirmed correct**.

### Visible label → internal value → persistence → source

| Visible label | Frontend constant | Enum value | Persisted field | Stored entity | Source file(s) |
|---|---|---|---|---|---|
| Gyors átfutás | `ATTENTION_LABELS.QUICK_SCAN` | `QUICK_SCAN` | `requestedAttention` | **TaskSubmission** | `Frontend/src/lib/taskWorkflowPresentation.ts:35`; `Backend/prisma/schema.prisma` enum `ReviewAttentionLevel` |
| Jóváhagyás | `ATTENTION_LABELS.APPROVAL` | `APPROVAL` | `requestedAttention` | TaskSubmission | same |
| Aláírás | `ATTENTION_LABELS.SIGNATURE` | `SIGNATURE` | `requestedAttention` | TaskSubmission | same |
| Szerkesztés | `ATTENTION_LABELS.EDITING` | `EDITING` | `requestedAttention` | TaskSubmission | same |
| Részletes ellenőrzés | `ATTENTION_LABELS.DETAILED_REVIEW` | `DETAILED_REVIEW` | `requestedAttention` | TaskSubmission | same |

Canonical order (`Frontend/src/app/reviews/page.tsx:25` `ATTENTION_ORDER`):
`QUICK_SCAN, APPROVAL, SIGNATURE, EDITING, DETAILED_REVIEW`.

## Prisma persistence

```prisma
enum ReviewAttentionLevel {
  QUICK_SCAN
  APPROVAL
  SIGNATURE
  EDITING
  DETAILED_REVIEW
}

model TaskSubmission {
  ...
  requestedAttention ReviewAttentionLevel?   // nullable at DB level
  ...
}
```

- The enum lives at `Backend/prisma/schema.prisma` (`enum ReviewAttentionLevel`).
- It is stored **only** on `TaskSubmission.requestedAttention` (nullable).
- The `Task` model has **no** attention field.

## API DTO fields

- `TaskReviewQueueItem` (`Frontend/src/lib/taskLifecycleApi.ts`) carries
  `requestedAttention?: string | null`, `source: "TASK_SUBMISSION" | "LEGACY_TASK"`,
  `taskId` (always), `submissionId?`, `linkedTimeMinutes?`, `submissionDocumentCount?`.
- Backend read/write projects `requestedAttention` as a plain string
  (`taskSubmission.service.ts:180`, `taskReviewDecision.service.ts:405/620`).

## Backend validation (existing, reusable)

`Backend/src/modules/tasks/taskSubmission.service.ts:488-492`:
```
if ('requestedAttention' in input) {
  if (input.requestedAttention === null || input.requestedAttention === '') { data.requestedAttention = null; }
  else if (!ATTENTION_VALUES.has(input.requestedAttention as ReviewAttentionLevel)) {
    throw new TaskSubmissionServiceError(400, 'INVALID_REVIEW_ATTENTION', 'requestedAttention is invalid.');
  }
}
```
`ATTENTION_VALUES` is the authoritative server-side allow-set of the five enum
members. Malformed values are rejected with `400 INVALID_REVIEW_ATTENTION`.

## Review flow (creation / edit / grouping)

- **Set at submission time.** `requestedAttention` is chosen when a submitter
  prepares a Leadás (review submission). Readiness code
  `REVIEW_ATTENTION_REQUIRED` ("Válassza ki a review típusát.") makes it
  **required to submit for review**, though the column itself is nullable
  (drafts / legacy rows may be null).
- **Editable** while the submission is a `DRAFT` (`taskSubmission.service.ts`
  update path); read-only afterwards (`isSubmissionReadOnly`).
- **Grouping/counting.** `reviews/page.tsx:88` builds `categoryCounts` by
  `queue.filter(item => item.requestedAttention === attention)` over
  `ATTENTION_ORDER`. A filter bar exposes one button per category with a live
  count, plus an "Összes" button.
- **Queue composition.** The queue merges `TASK_SUBMISSION` items (real
  submissions) and `LEGACY_TASK` items — tasks in a review-ish status **without**
  a submission (`Backend/src/modules/tasks/services.ts:878, 919`). Legacy items
  have `requestedAttention = null` (no submission to read it from) and are shown
  as "korábbi, submission nélküli review tétel … döntési gombot nem kap."

## Visual language already established (reusable)

`reviews/page.tsx:27` `ATTENTION_MARKS`:

| Category | Icon | Pill tone (`AdminStatusPill`) |
|---|---|---|
| QUICK_SCAN | ↗ | gold |
| APPROVAL | ✓ | sage |
| SIGNATURE | ✎ | violet |
| EDITING | ▤ | blue |
| DETAILED_REVIEW | ◎ | burgundy |

These tones come from the `AdminBadge`/`AdminStatusPill` palette
(`Frontend/src/components/adminiculum/ui.tsx`), independent of `ClientColorKey`
and of urgency colors.

## What the field represents today (concept classification)

`requestedAttention` today means **"the form/intensity of review attention the
submitter requests from the reviewer for this submission."** It is a
**review-phase** attribute, not a task-planning attribute:

- It is set by the **submitter** for the **reviewer**.
- It exists only once a submission is prepared (drafts/legacy → null).
- It is **not** urgency, deadline, priority, case status, workflow status,
  responsible lawyer, or approval result — the Review page computes urgency
  independently (`reviewUrgency` from dueDate/priority) and renders it as a
  separate pill.

## Actual vs estimated time (already separated)

- `TimeEntry` / `Task.timeEntries` and `TaskSubmission.linkedTimeMinutes`
  (`formatMinutes(item.linkedTimeMinutes)`) record **actual** worked minutes.
- There is **no** estimate field anywhere on `Task` or `TaskSubmission`
  (no `estimatedMinutes`, `duration`, `effort`, or `workload`).

## Gaps for the product objective

1. Attention category is a **review/submission** attribute, not a **task**
   attribute. To classify a task's work *when it is created* (before any
   submission), the category must exist on `Task`.
2. No estimated-time field exists; the duration bands (Phase 4) must supply the
   planning estimate, with an optional explicit per-task override.

These two gaps drive the schema-candidate finding (see task-model-plan).
