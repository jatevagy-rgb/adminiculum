# Shared Attention Category — Audit Contract (Phase 7)

Date: 2026-07-22

## Events

- `TASK_ATTENTION_CATEGORY_CHANGED`
- `TASK_ESTIMATE_CHANGED`

## Payload (content-light only)

Record exactly:
- task ID;
- old value;
- new value;
- actor ID;
- timestamp.

**Never** include: task title/description, document content, client
communications, or legal analysis. Consistent with the existing content-light
audit posture.

## Reuse vs new events

- If the existing generic Task-update audit already records field-level changes
  **safely and content-light**, prefer emitting through it with the field name
  (`attentionCategory` / `estimatedMinutes`) rather than adding bespoke events —
  avoiding duplicate audit rows for one change.
- Only introduce the dedicated event names above if the generic mechanism does
  not capture the old→new field transition, or logs content that would violate
  the content-light rule.
- The implementation slice must first inspect the current task audit mechanism
  (`TaskAssignmentHistory` / task update audit) and choose one path; it must not
  emit **both** a generic and a bespoke event for the same change.

## Determination (for the slice)

Decision deferred to Slice 3 implementation after inspecting the live audit
mechanism; the **contract** (fields recorded, content-light, no duplicates) is
fixed here. No audit code is added in this ticket.
