# Dashboard Operational Case API Contract

## Endpoint

`GET /api/v1/cases/dashboard/operational-overview`

The endpoint is authenticated and actor-scoped. It is registered before dynamic case-id routes.

## Authorization

- `ADMIN` and `PARTNER` receive non-terminal cases.
- Other internal roles receive only cases where they are assigned lawyer, creator, or collaborator.
- Review candidates require explicit `assignedReviewerId` equality.
- Resume candidates additionally require actor-owned task/submission eligibility.

## Safe Response

The response contains:

- generated timestamp;
- at most one resumable item with deterministic action code, label, href, due date, and safe case/client summary;
- open authorized case count;
- supported group counts;
- safe operational case rows with case id/number/title, client id/name/color key, responsible user safe summary, status, priority, group, waiting label, nearest deadline, open task/review counts, next action, and case href.

It does not contain document bodies, communication bodies, reviewer notes, workspace text, storage paths, attachment bodies, or sensitive free-text legal content.

## Performance

The service performs exactly two top-level Prisma reads in parallel:

1. one bounded case projection with nested safe task/submission metadata;
2. one bounded assigned-reviewer submission projection.

There is no request per case and no per-row client lookup. The frontend calls the endpoint once in the existing Dashboard parallel load.

## Failure Behavior

Authentication remains mandatory. Unexpected service failures are mapped to a bounded server error; the frontend shows a quiet unavailable state and does not fabricate counts or actions.
