# Workflow Core Case Center Acceptance

## Functional acceptance

- [ ] Attorney can understand case state within roughly 30 seconds.
- [ ] `Itt folytasd` is visually prominent and compact.
- [ ] The selected next action is visible, actionable, and route-linked when a safe href exists.
- [ ] The reason for next-action selection is visible and uses safe template text.
- [ ] Task counts show open, overdue, due-soon, blocked, and review counts.
- [ ] Next deadline is visible when `Case.deadline` exists and honest when absent.
- [ ] Responsible lawyer and collaborator context are visible without exposing external/client portal data.
- [ ] Latest communication uses preview/summary metadata only.
- [ ] Active review is metadata-only and links to the existing review route when available.

## Privacy and safety acceptance

- [ ] No `documents.workspaceText` is selected or displayed by the workflow summary.
- [ ] No raw document content, extracted text, prompts, AI output, or storage path appears.
- [ ] No raw communication body/content appears.
- [ ] No raw Prisma row is returned.
- [ ] No broad relation `include` is used in the workflow summary implementation.
- [ ] Missing optional sources degrade gracefully.
- [ ] Handoff unavailable state is honest and does not render a fake active handoff.
- [ ] No Client Portal route, runtime file, mock frontend, or schema plan is modified.

## UX acceptance

- [ ] Case Center panel preserves Adminiculum navy/green/amber/neutral visual language.
- [ ] The UI avoids equal-weight card soup.
- [ ] The layout remains usable on common laptop widths.
- [ ] Interactive elements are real buttons or links.
- [ ] Keyboard focus is visible on new actions.
- [ ] Loading, error, and empty states remain readable and non-blocking.

## API/error acceptance

- [ ] Unauthenticated `GET /api/v1/cases/:caseId/workflow-summary` returns `401`.
- [ ] Missing case returns safe `404`.
- [ ] Available internal case returns explicit DTO.
- [ ] Frontend does not replace API errors with synthetic workflow data.
- [ ] Client Portal static guards remain green.

## Manual smoke matrix

- [ ] `/cases/<caseId>` with open overdue personal task.
- [ ] `/cases/<caseId>` with no tasks and a future deadline.
- [ ] `/cases/<caseId>` with latest communication but no preview summary.
- [ ] `/cases/<caseId>` with no documents/reviews.
- [ ] `/cases/<caseId>` with missing optional handoff source.

## Non-actions confirmed

- [ ] No schema edit.
- [ ] No migration.
- [ ] No manual DB query/apply.
- [ ] No production deploy.
- [ ] No Client Portal enablement.
- [ ] No external visibility.

## WORKFLOW-CORE-TASKS-HANDOFF-1 regression note

Case Center next-action refresh must be verified after task start, submit, approve, return, block, and unblock actions. The frontend refreshes the workflow summary after supported mutations and does not optimistically invent resulting state.
