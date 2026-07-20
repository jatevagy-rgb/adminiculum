# Client Color Module Rollout 1

## Scope

This slice projects the existing `Client.colorKey` into authorized operational DTOs and renders it with the shared frontend palette. It does not alter the client color model, lifecycle behavior, schema, migrations, authentication, CORS, Azure, or packages.

## Relationship Matrix

| Module | Record | Proven path | Safe color | DTO change | Neutral fallback |
| --- | --- | --- | --- | --- | --- |
| Dashboard tasks/review | `Task` | `Task.case.client.colorKey` | yes | already projected; frontend type aligned | missing client/color |
| Dashboard deadlines | agenda item | `caseId` joined to the already authorized case list | yes | none | missing case/color |
| Dashboard communications | `Communication` | persisted `clientId` batched to `Client.colorKey` | yes | `clientColorKey` | unassigned/missing client |
| Communication list/detail | `Communication` | persisted `clientId` | yes | `clientColorKey` | unassigned/missing client |
| Review queue | `TaskSubmission` or legacy `Task` | `task.case.client.colorKey` | yes | `case.clientColorKey` | missing color |
| Review detail | `TaskSubmission` | `task.case.client.colorKey` | yes | `client.clientColorKey` | missing color |
| Notifications | `Notification` | no persisted task/case/document/communication relation | no | explicit `clientColorKey: null` | always neutral |

## Result

Dashboard, communications, and review use one decorative `ClientAccent` component. Notification coloring remains blocked by the current relationless model; the link/title/message are not treated as identity-bearing relations.

## Status

The implemented projection is safe but the complete rollout cannot be release-ready until Notifications has an explicit, authorization-scoped domain relation or the product requirement is narrowed.
