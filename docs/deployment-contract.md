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

## Migration — canonical WebJob only

- The only mechanism allowed to mutate the production schema is the
  **`adminiculum-db-migrate`** triggered WebJob (it runs `prisma migrate deploy` inside the
  deployed wwwroot and verifies the result).
- **No** direct SQL, **no** `prisma db push`, **no** Prisma CLI against production from the web
  app deploy, **no** production `DATABASE_URL` secret in GitHub Actions.
- Run it **only when the release adds a new Prisma migration**, and **only after** the new
  backend is healthy.

## Frontend — Next.js standalone → App Service (Oryx OFF)

- `next build` (`output: 'standalone'`) → assemble `.next/standalone` + `.next/static` +
  `public` → ZIP with **`server.js` at the package root** → deploy (Oryx **off**; the app runs
  `node server.js`). Do not package the whole Frontend repo.

## Sequence (never backend + frontend concurrently)

```
backend deploy → /health 200 → [migration WebJob → /health 200] → frontend deploy → smoke
```

- If the backend is not healthy, **stop** — do not migrate an unhealthy backend.
- Frontend runs only after backend (+ migration, if requested) is healthy.

## Trigger & safety

- **Manual only** (`workflow_dispatch`). A code push must never deploy production.
- The workflow deploys the **canonical release branch** `release/editor-ops-workflow-1` by
  default and refuses other refs unless `allow_nonrelease_ref=true` is set deliberately.
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
