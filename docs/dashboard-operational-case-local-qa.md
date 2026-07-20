# Dashboard Operational Case Local QA

## Environment

- Disposable PostgreSQL database on `localhost` only: `adminiculum_dashboard_operational_qa`.
- Synthetic local actor and records only; no production data.
- Local backend: port `3201`.
- Local frontend: port `3200`.
- No environment file was created or committed.

## Synthetic Coverage

- Active pending task.
- Draft submission.
- Returned submission.
- Assigned submitted review.
- Approved external-action-pending item.
- Most-recently-updated completed task.
- Explicit client-waiting task.
- Overdue and approaching deadlines.
- Colored and neutral clients.
- Deadline, office-action, review, client-waiting, and unspecified groups.

## Results

- Completed work never appeared in `Itt folytasd`.
- The actionable draft was selected with `Leadás folytatása` and the correct task deep link.
- Two browser reloads preserved the same eligible selection.
- Mixed operational groups and nearest deadlines rendered in deterministic order.
- BLUE and neutral client accents remained visually distinct from workflow status.
- Clearing the synthetic client's color removed the accent without changing workflow state; the color was restored afterward.
- After making all synthetic tasks terminal, the exact honest resume empty state rendered.
- The duplicate Dashboard title did not return.
- All observed local Dashboard API requests returned `200` or cache-valid `304`; no `4xx`/`5xx` occurred.

## Cleanup

The local servers were stopped and the exact disposable loopback database was dropped. No migration or data operation targeted production or Azure.
