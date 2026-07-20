# Client Color Dashboard Backend Deployment

Date: 2026-07-20

Runtime source: `30fd4bb8f1f3e3e46edb944501a69f7f6c81779b`

## Artifact

- Component: Backend only.
- Packaging: clean Oryx source ZIP with explicit allowlist.
- Artifact: `adminiculum-backend-client-color-dashboard-30fd4bb8.zip`.
- SHA-256: `9d83d2682b9bc2265a82c54dea40783779056dd8c0556379535bb94b2df8ebcd`.
- Payload files: 156; ZIP entries: 157.
- Payload SHA-256: `a32e22b4dfb57f2ac492808576e7b494e7adb67cd05fe4026425945b4956f80d`.
- No frontend, docs, screenshots, `.git`, `.env`, local DB, tests, credentials, connection string, or unrelated ZIP was included.
- Embedded manifest identifies the exact runtime source, branch, required migration head, and backend target.

## Deployment

- App: `adminiculumbackend-b1-01`.
- Resource group: `Adminiculum`.
- Method: one Oryx ZIP/OneDeploy publish; no slot and no retry.
- Deployment ID: `2ab2eb62-cd3c-4dc9-9475-308d1e10d07b`.
- Kudu: status 4, complete, active.
- Start: `2026-07-20T11:32:37.580246Z`.
- End: `2026-07-20T11:35:51.786405Z`.
- Deployment log: 0 errors; deployment successful.

## Smoke

- `/health` returned 200.
- Protected clients, Dashboard operational, tasks, review, and communications reads rejected unauthenticated access with 401.
- Bogus route returned 404 without raw stack or Prisma leakage.
- Delegated authenticated reads passed for `/auth/me`, Clients, Cases, Tasks, Dashboard operational/stats, Communications, Review, Notifications, Time Entries, Intake, and Agenda.
- Client Portal spoofed summary/export remained 501 `FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.
- Production-origin CORS preflight returned 204 with the expected origin and headers, including `Idempotency-Key` and `If-Match`.
- No production data mutation was performed.
