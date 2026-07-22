# Task attention authorization

Task attention edits reuse existing Task authorization. A user may update `attentionCategory` or `estimatedMinutes` only when they already have authority to act on that Task.

## Preserved boundaries

- No broad new permission is introduced.
- Cross-client and cross-case access remains controlled by existing Task access checks.
- Dashboard workload is scoped to Tasks assigned to the authenticated user.
- Team workload totals are out of scope.

## Security posture

Changing attention fields must never grant visibility into another lawyer's private workload, another client's matter, or unrelated case content.
