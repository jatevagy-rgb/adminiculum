# Communication Workspace Closeout Snapshot

Date: 2026-06-28
Branch: `hotfix/runtime-shape-20260308`

## Purpose

This note captures the stable deployed communication workspace state before any new backend data model, provider integration, reply-state, classification, or workflow automation work begins.

It is documentation only. It does not change runtime behavior.

## Deployed Work State

| Work item | Commit | State |
| --- | --- | --- |
| COMM2B read-only communication contract | `e310508` | Deployed and smoked |
| COMM3A `/notifications` read-only wiring | `dd03bac` | Deployed and smoked |
| COMM3B communication workspace UI refinement | `586a726` | Deployed and smoked |
| COMM4A dashboard communication consistency | `4a92fd8` | Deployed and smoked |

Recent final classifications:

- `communication_readonly_contract_deployed_smoke_passed`
- `communication_workspace_readonly_wired_frontend_deployed_smoke_passed`
- `communication_workspace_ui_refined_frontend_deployed_smoke_passed`
- `dashboard_communication_consistency_refined_frontend_deployed_smoke_passed`

## Current Backend Contract

The deployed communication backend exposes an authenticated read-only list endpoint:

- `GET /api/v1/communications`
- authenticated route;
- intentionally ungated by `ENABLE_COMMUNICATIONS_PERSISTENCE`;
- mutating and detail communication endpoints remain gated by `ENABLE_COMMUNICATIONS_PERSISTENCE`;
- scalar-only list contract, avoiding fragile relation includes;
- includes `contentPreview`, `attachmentCount`, and `sourceTaskCount`;
- default `limit` is `20`;
- maximum `limit` is `50`;
- returns an empty list safely if scalar list lookup or count helpers cannot read drift-prone data.

The read-only list shape is the frontend-supported source for the dashboard and communication workspace. It is not a provider sync API and does not imply Outlook, Microsoft Graph, AI classification, or reply-state tracking.

## Current `/notifications` Behavior

The deployed communication workspace is `/notifications`.

Current behavior:

- calls `getCommunications({ limit: 50 })`;
- renders real read-only communication rows when records are returned;
- preserves compact honest empty states when no records are returned;
- handles failed list load with a quiet non-blocking error state;
- does not call mutating or detail communication endpoints;
- does not invent reply-state.

Route-safe views:

- `/notifications`
- `/notifications?view=external`
- `/notifications?view=internal`
- `/notifications?view=clients`
- `/notifications?view=replies`

The `replies` view is deliberately honest: the current read-only contract has no reliable reply-state field, so the UI does not claim reply tracking.

## Current Dashboard Wiring

Dashboard communication entry points are wired into the workspace:

- `Külső kommunikáció` → `/notifications?view=external`
- `Belső kommunikáció` → `/notifications?view=internal`
- `Kommunikációs figyelő` → `/notifications`
- `Ügyfélhez sorolt kommunikáció` → `/notifications?view=clients`
- communication item in `Mai sor` → `/notifications?view=external`

Dashboard communication colors align with the workspace semantic family:

- external communication: `#219EBC`;
- internal communication: `#126782`;
- client-linked communication: cyan/petrol family;
- command/review/document control: `#023047`.

## Explicit Non-Goals / Not Yet Built

The stable deployed state does not include:

- Outlook provider sync;
- Microsoft Graph import;
- provider sync status;
- AI communication classification;
- AI prioritization;
- reply-state model;
- remembered communication rules;
- `CommunicationThread`;
- `CommunicationClassification`;
- `CommunicationAssignment`;
- `CommunicationRule`;
- communication exposure in the client portal;
- fake rows, fake messages, fake reply-state, or fake provider metadata.

These items require separate design, schema, migration, auth/security review, and deployment work before product claims should be made.

## Known Smoke Status

Last known smoke status from the deployed communication closeout sequence:

- backend `/health` → `200`;
- unauthenticated `GET /api/v1/communications` → `401`;
- frontend `/` → `200`;
- frontend `/notifications` → `200`;
- frontend `/notifications?view=external` → `200`;
- frontend `/notifications?view=internal` → `200`;
- frontend `/notifications?view=clients` → `200`;
- frontend `/notifications?view=replies` → `200`;
- spoofed client portal summary/export routes → `501 FEATURE_NOT_AVAILABLE`;
- client portal guard reason remains `CLIENT_PORTAL_NOT_ENABLED`;
- authenticated communications list smoke was skipped because no auth token was available.

## Recommended Next Options

Recommended next tracks, each as a separate scoped task:

1. **Data model implementation planning** — turn `docs/communication-workspace-data-model.md` into a migration-ready implementation plan, still no migration until approved.
2. **Reply-state design** — define persisted fields and transitions before any UI claims reply tracking.
3. **Provider integration design** — plan Outlook/Graph ingestion and consent boundaries before adding provider claims.
4. **Classification workflow design** — specify manual classification, audit history, and remembered-rule behavior before adding rules or automation.
5. **Authenticated list smoke** — run `GET /api/v1/communications?limit=8` with a valid token and verify the deployed scalar shape against production data.
