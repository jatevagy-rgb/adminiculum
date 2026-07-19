# Task Leadás And Review API Integration

Date: 2026-07-19
Status: typed integration implemented; browser mutations blocked by backend CORS preflight

## Consumed Routes

- `GET /api/v1/tasks/:taskId/workflow`
- `GET /api/v1/tasks/:taskId/eligible-reviewers`
- `POST /api/v1/tasks/:taskId/submissions`
- `PATCH /api/v1/tasks/:taskId/submissions/:submissionId`
- `GET /api/v1/tasks/:taskId/submissions/:submissionId/readiness`
- `POST|DELETE /api/v1/tasks/:taskId/submissions/:submissionId/documents[/... ]`
- `POST|DELETE /api/v1/tasks/:taskId/submissions/:submissionId/time-entries[/... ]`
- `POST /api/v1/tasks/:taskId/submissions/:submissionId/submit`
- `GET /api/v1/tasks/:taskId/submissions/:submissionId/review`
- `POST /api/v1/tasks/:taskId/submissions/:submissionId/return`
- `POST /api/v1/tasks/:taskId/submissions/:submissionId/approve`
- `POST /api/v1/tasks/:taskId/submissions/:submissionId/revise`
- `POST /api/v1/tasks/:taskId/submissions/:submissionId/external-completion`

## Contract Safety

- Request/response DTOs are explicit and omit raw Prisma shapes.
- Bearer authentication remains unchanged.
- One deliberate mutation attempt keeps one stable `Idempotency-Key`; a new action gets a new key.
- Review decisions send the quoted backend ETag through `If-Match`.
- Uncertain network outcomes and stale review versions trigger a backend reread before another mutation.
- Document linking sends only `documentId` and the backend-supported role. Time linking sends only `timeEntryId`.

## Verified CORS Contract Gap

The localhost preflight returned `204` and allowed the frontend origin, but advertised only:

`Authorization, Content-Type, X-Requested-With, Accept, Origin`

It omitted required mutation headers:

- `Idempotency-Key`
- `If-Match`

The browser therefore reported a content-free `Failed to fetch` before the submit route was reached. Direct mutation bypass was intentionally not used as browser acceptance evidence.

Required next action: separately authorize and test a backend CORS allow-header change, then rerun the full ordinary, returned/revised, zero-time and external-action browser lifecycles.
