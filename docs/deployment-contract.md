# Adminiculum — Production Deployment Contract

Adminiculum production runs on **Azure App Service** (Linux). There is **one** deployment
story. Azure Container Apps / Bicep is **not** used (the old `deploy-container-apps.yml`
workflow referenced infrastructure that does not exist and has been removed; its history
remains in git).

Canonical workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) —
**manual** (`workflow_dispatch`) and **sequential**.

## Targets

| Component | App Service | Resource group |
|---|---|---|
| Backend | `adminiculumbackend-b1-01` | `Adminiculum` |
| Frontend | `adminiculumfrontend-austriaeast-01` | `Adminiculum` |

Never touch `vikoli-app`.

## Backend — source ZIP → Kudu ZipDeploy → Oryx

- Package the **contents of `Backend/`** so `package.json` is at the **archive ROOT**
  (`package.json`, `package-lock.json`, `tsconfig.json`, `.deployment`, `src/`, `prisma/`,
  `templates/`, `scripts/`, `App_Data/`, and the OpenAPI `swagger2.yaml` the runtime resolver
  looks for). **No `Backend/` wrapper directory**, **no `node_modules`** (Linux dependencies
  and the Prisma engine are built server-side by Oryx), **no `Frontend/`**.
- Deploy via **Kudu ZipDeploy** (`az webapp deployment source config-zip`), which triggers the
  Oryx Linux build (`.deployment` sets `SCM_DO_BUILD_DURING_DEPLOYMENT=true`).
- Do **not** use the historically broken backend OneDeploy path. Do **not** ship
  Windows-built `node_modules` to the Linux runtime.
- Deployment completion is judged by the **server-side** Kudu deployment status (poll it), not
  a local CLI timeout — Kudu can time out the CLI while the build continues.

## Migration — canonical WebJob with pre-backend staging

- The only mechanism allowed to mutate the production schema is the
  **`adminiculum-db-migrate`** triggered WebJob (it runs `prisma migrate deploy` inside the
  deployed wwwroot and verifies the result).
- **No** direct SQL, **no** `prisma db push`, **no** Prisma CLI against production from the web
  app deploy, **no** production `DATABASE_URL` secret in GitHub Actions.
- Run it **only when the release adds a new Prisma migration**.
- When `deploy_backend=true` and `run_migration=true`, the migration runs **before** backend
  runtime deployment:
  1. The workflow verifies the **current backend is healthy** (`/health` 200), captures `CURRENT_BACKEND_SHA`, and enforces that the **live backend commit is a direct ancestor of the target release commit**. Divergent backend histories stop immediately.
  2. **Prisma CLI compatibility gate**: compares Prisma package and lockfile dependencies between `CURRENT_BACKEND_SHA` and the target release commit to ensure the existing deployed CLI toolchain can safely deploy the new migration.
  3. **Migration WebJob implementation compatibility gate**: compares `Backend/App_Data/jobs/triggered/adminiculum-db-migrate` between `CURRENT_BACKEND_SHA` and the target release. The migration runner must be unchanged for pre-backend migration; a release modifying the runner requires a separate rollout path.
  4. **Remote migration tree drift guard**: reads `site/wwwroot/prisma/migrations/` from Kudu VFS and verifies no foreign or future migration directories exist that are absent from the target commit. If unexpected directories are detected (e.g. from a prior failed attempt), the workflow halts closed without triggering migrations (automatic directory deletion is disabled to prevent accidental data loss).
  5. **Targeted migration asset staging & hash verification**: stages only `schema.prisma` and canonical release `migration.sql` files to `site/wwwroot/prisma/` via targeted Kudu VFS. Every staged `migration.sql` and `schema.prisma` file is downloaded and verified by comparing local and remote SHA256 checksums. No runtime code (`dist/`, `node_modules/`, `package.json`, `package-lock.json`, `release-identity.json`, `templates/`, `scripts/`) is touched or activated.
  6. The currently serving backend remains active and unmodified throughout staging (`/health/version` equals `CURRENT_BACKEND_SHA`).
  7. The canonical `adminiculum-db-migrate` WebJob is triggered and polled to `Success`.
  8. Backend health is re-verified before proceeding to backend runtime deployment.
- **Recovery migration contract (`deploy_backend=false && run_migration=true`)**:
  Because a prior failed staging attempt could leave non-runtime migration assets in `site/wwwroot/prisma/`, recovery migration does not rely only on `/health/version` runtime identity. It explicitly performs asset-identity verification: ensuring the remote migration tree contains no canonical directories absent from `recovery_product_sha`, remote `schema.prisma` SHA256 matches the recovery checkout, and all existing remote `migration.sql` files match the recovery commit before triggering the WebJob.

## Frontend — Next.js standalone → App Service (Oryx OFF)

- `next build` (`output: 'standalone'`) → assemble `.next/standalone` + `.next/static` +
  `public` → ZIP with **`server.js` at the package root** → deploy (Oryx **off**; the app runs
  `node server.js`). Do not package the whole Frontend repo.

## Sequence (never backend + frontend concurrently)

For migration releases (`run_migration=true` and `deploy_backend=true`):
```
migration assets stage → canonical WebJob migration → /health 200 → backend deploy → /health 200 → frontend deploy → smoke
```

For non-migration releases (`run_migration=false` and `deploy_backend=true`):
```
backend deploy → /health 200 → frontend deploy → smoke
```
(No-migration releases remain unchanged: no migration staging occurs).

- If the backend is not healthy, **stop** — do not migrate an unhealthy backend.
- Backend deployment in migration mode runs **only after** the migration WebJob succeeds.
- Frontend runs after backend (+ migration, if requested) is healthy. A **frontend-only** run
  (`deploy_backend=false`) first verifies the current production backend `/health` is 200, so a
  frontend fix never forces an unnecessary backend redeploy.

## One pinned release SHA per deployment

- The `resolve` job resolves the canonical release branch to **one immutable commit SHA** and
  exposes it as a job output; the backend, migration, and frontend jobs all use that exact SHA.
  This removes the race where the release branch could advance between jobs and deploy mismatched
  commits. The resolved SHA is reported at the end of each run.
- When `run_migration=true` and `deploy_backend=false`, the recovery migration path requires an
  explicit `recovery_product_sha` pointing to an ancestor commit already verified deployed on the backend.

## Trigger & safety

- **Manual only** (`workflow_dispatch`). A code push must never deploy production.
- Production source is **always** the canonical release branch `release/editor-ops-workflow-1`.
  There is **no** feature-branch/ref override — a hotfix must be integrated into the release
  branch first, then deployed.
- The workflow declares `environment: production` on the deploy jobs. This **only** enforces
  approvals/protection **if** the repository has a GitHub Environment named `production`
  configured with required reviewers/protection rules. **Recommended repository setup:** create
  the `production` GitHub Environment with required reviewers so each production deploy needs a
  human approval. This workflow does not, and cannot, guarantee that gate by itself.
- Smoke checks are **unauthenticated and bounded** (`/health`, `/`, `/portal`). Authenticated
  production acceptance is a separate, deliberate activity — no bearer tokens are stored in or
  used by deployment workflows.

## Azure authentication (GitHub secret NAMES only)

- `azure/login@v2` using the `AZURE_CREDENTIALS` service-principal secret (same identity for
  backend and frontend App Service operations in resource group `Adminiculum`). No secret
  values appear in logs.

Database migration discipline (Prisma command rules) lives in
[`../Backend/DEPLOY.md`](../Backend/DEPLOY.md); the pilot environment runbook lives in
[`adminiculum-azure-pilot-deploy-runbook.md`](adminiculum-azure-pilot-deploy-runbook.md).
