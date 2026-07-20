# Client Color Module Rollout 1

## Scope

This rollout projects the existing `Client.colorKey` through authorized, relationship-backed DTOs into Dashboard, Communications, and Review. It does not change the palette, client CRUD, schema, migrations, authentication, authorization, lifecycle transitions, or deferred modules.

## Relationship Matrix

| Module | Proven relation | Result |
| --- | --- | --- |
| Dashboard | task/case and existing authorized case projections | colored when related; neutral otherwise |
| Communications | persisted `Communication.clientId` | assigned color; unassigned neutral |
| Review queue/detail | `TaskSubmission -> Task -> Case -> Client` | current client color in queue and detail |
| Legacy review | existing `Task -> Case -> Client` only | color only when the relation exists |
| Notifications | no persisted domain relation | explicit `clientColorKey: null` |

## Acceptance Decision

Dashboard, Communications, and Review are the mandatory colored modules. Notifications is the mandatory neutral module.

Notifications currently has no authorization-scoped domain relation, therefore client color is intentionally unavailable and rendered neutrally.

No notification identity is inferred from title, body, link, actor, payload, email, or template data. A future relation-backed notification design remains a separate schema and authorization ticket.

## Result

The rollout is ready for release integration after authenticated disposable-data browser QA, focused query-count tests, full validation, and zero-diff review of protected areas. No deployment is authorized by this document.
