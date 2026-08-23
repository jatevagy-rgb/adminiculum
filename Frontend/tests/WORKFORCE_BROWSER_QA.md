# Workforce browser QA

The default command runs UI contract QA against a production Next server:

```bash
npm run qa:workforce
```

It builds the frontend, starts `next start`, creates a clean Playwright
context, seeds a synthetic workforce profile/token in browser storage, and
intercepts `/api/v1/**` with deterministic responses. It does not contact
Azure, PostgreSQL, or production data. Screenshots are written to the local
ignored QA screenshot directory.

The backend foundation is environment-gated:

```bash
cd ../Backend
WORKFORCE_QA_DATABASE_URL='postgresql://...' npm run test:workforce-qa
```

The database URL must point to a disposable, non-production PostgreSQL
database. The fixture creates only `qa-*` records and is rejected when
`NODE_ENV=production`. The test verifies that the related workforce user can
read the client projection and that an active workforce user without a case
relationship is denied.

Production OIDC/MSAL, local-development auth, Azure configuration, Prisma
schema, and migrations are not changed by this harness. The browser runner
uses `127.0.0.1` and `next start` so localhost dev-login behavior and Next
development overlays are not part of the acceptance path. A clean context
must contain zero `devin-hidden` attributes; any such attribute fails QA.

The canonical release currently does not contain the 7C-A Compliance Overview
component. The runner reports that coverage as unavailable on this base; once
the component is canonical, its route-level contract can be added without
changing the auth or fixture boundary.
