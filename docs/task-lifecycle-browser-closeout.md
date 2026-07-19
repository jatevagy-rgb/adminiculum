# Task Lifecycle Authenticated Browser Closeout

Date: 2026-07-19

## Safe Test Environment

- Disposable localhost PostgreSQL database with a unique task-lifecycle QA name.
- Synthetic worker, reviewer, unrelated actor, client, matter, case, tasks, documents, and time entries.
- Existing local password/JWT login route; no authentication bypass.
- No production data, production token, Azure resource, shared database, Graph, SharePoint, or external service.

## Ordinary Return And Approval Lifecycle

1. Worker created revision 1, saved summary/open points/reviewer note, selected detailed review, linked two documents and 45 minutes, and submitted.
2. Refresh preserved `Review alatt`, immutable revision 1, and worker read-only state.
3. Reviewer saw one active item, returned it with mandatory note, corrections, full-review requirement, and a correction deadline.
4. Refresh removed it from the reviewer active queue and showed `Visszaküldve` to the worker.
5. Worker created revision 2. Frozen revision-1 time was not copied as new work.
6. Worker linked the revised output and a new 20-minute entry, then resubmitted.
7. Reviewer approved revision 2. Refresh showed the task as `DONE` and removed it from the active queue.

Persisted summary: 2 revisions, 2 decisions, 6 timeline events, 4 notifications, no duplicates.

## Zero-Time Lifecycle

A separate synthetic task used one output and explicit zero-time confirmation with no time entry. Submit, reviewer approval, refresh, persisted zero-time state, and task closure all passed.

Persisted summary: 1 revision, 1 decision, 3 timeline events, 2 notifications, task `DONE`.

## External-Action Lifecycle

A separate task required `CLIENT_SEND`. Approval correctly left it waiting for an external action rather than falsely closing it. Browser QA exposed one genuine frontend contract mismatch: queue refresh immediately replaced the approved item with a legacy projection and unmounted the authorized completion control.

The narrow frontend correction keeps the selected review detail mounted after an approval that still requires an external action. The reviewer then recorded the supported completion action, refreshed, and verified closure.

Persisted summary: 1 revision, 1 decision, 1 external-completion event, 1 task-completed event, task `DONE`, no duplicate completion.

## Outcome

The authenticated worker/reviewer lifecycle, zero-time path, external-action path, CORS preflights, refresh persistence, and final active-queue removal passed without production or deployment activity.

Classification: `TASK_LIFECYCLE_BROWSER_CLOSEOUT_READY_FOR_RELEASE_INTEGRATION`
