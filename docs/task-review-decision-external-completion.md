# Task Review External Completion

Date: 2026-07-18

## Mapping

When an approved submission has `externalActionRequired = true`, the submission becomes `APPROVED` but the task remains `IN_REVIEW` with `completedAt = null`. The read model returns `RECORD_EXTERNAL_COMPLETION`.

An authorized task/case-scoped supervisor records completion with the persisted action type and optional completion timestamp. The service then sets `externalCompletedAt` and `externalCompletedById`, closes the task through the existing `APPROVE` transition (`DONE`), and returns `VIEW_COMPLETED`.

## Supported Types

`CLIENT_SEND`, `SIGNATURE`, `COURT_FILING`, `AUTHORITY_SUBMISSION`, and `OTHER`.

## Boundary

This is metadata recording only. It does not send email, request signatures, file with a court/authority, call Graph, download/upload attachments, or store provider responses. The current schema has no approved safe field for external reference or completion note, so those values are rejected rather than falsely accepted.
