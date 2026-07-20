# Client Color Dashboard Frontend Deployment

Date: 2026-07-20

Runtime source: `30fd4bb8f1f3e3e46edb944501a69f7f6c81779b`

## Artifact

- Component: Frontend only.
- Packaging: clean Oryx source ZIP.
- Artifact: `adminiculum-frontend-client-color-dashboard-30fd4bb8.zip`.
- SHA-256: `abbdbe30274e611074cbf57765dda46bafefaa597fddec3afa0b924a460e4848`.
- Payload files: 125; ZIP entries: 126.
- Payload SHA-256: `90f41c6990365b93e163b702c542b11047d6aaef1fae05b0f4a582bf99666a5c`.
- Production API target: `https://adminiculumbackend-b1-01.azurewebsites.net`.
- Compatible backend deployment: `2ab2eb62-cd3c-4dc9-9475-308d1e10d07b`.
- No backend, docs, screenshots, `.git`, `.env`, `node_modules`, `.next`, tests, credentials, DB URL, or unrelated ZIP was included.
- Isolated validation used `npm ci --include=dev`; no package or lockfile was changed.
- Generated bundle scan found no localhost, loopback, clone host, Windows path, temporary path, credential, parked commit, or development API target.

## Deployment

- App: `adminiculumfrontend-austriaeast-01`.
- Resource group: `Adminiculum`.
- Method: one asynchronous Oryx ZIP/OneDeploy publish followed by read-only Kudu polling.
- Deployment ID: `fe10254d-397a-4cc8-b9d4-4eee9b59d4e0`.
- Kudu: status 4, complete, active.
- Start: `2026-07-20T11:50:58.161353Z`.
- End: `2026-07-20T12:01:40.097135Z`.
- Deployment log: 0 errors; no retry.
- Deployed manifest proves the exact runtime commit, release branch, migration head, backend deployment compatibility, and target app.

## Route smoke

Production returned 200 for Dashboard, Clients, Cases, Tasks, all required Notifications/Communications view variants, Review, Documents Compare, Time Entries, Intake, Deadlines, and a real Case Detail route.
