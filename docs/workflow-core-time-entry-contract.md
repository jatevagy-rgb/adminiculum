# Workflow Core Time Entry Contract

## Existing Persistence
`TimeEntry` is persisted against `Matter`, `User`, optional `Department`, date, work type, description, minutes, and billable flag.

## Supported Lifecycle
- List own time entries by default.
- Privileged users may filter another user.
- Create a manual fixed-duration entry for the authenticated user.
- Optionally attach a case timeline event only when supplied `caseId` belongs to the selected `matterId` and the user can participate in the case.
- Update or delete own entries; privileged users may administer others.

## Explicitly Rejected
- Client-provided owner changes.
- Task/document/communication time links before a persisted model exists.
- Active timers and passive tracking.
- Automatic time capture.

## Privacy Notes
Descriptions remain user-entered matter-level work descriptions and must stay client-safe/high-level. No document workspace text or raw communication content is copied into time entries by this workflow.
