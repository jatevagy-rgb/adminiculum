# Frontend deployment runbook (hardened)

The `adminiculumfrontend-austriaeast-01` App Service runs **prebuilt** Next.js:
`SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `ENABLE_ORYX_BUILD=false`, runtime
`NODE|20-lts`, startup **`npm run start`** (`next start -p 3000`). The uploaded
ZIP must therefore be a **complete runtime**, not a source tree.

## Incident (2026-07-31) root cause
Two bad artifacts were produced during a recovery:
1. a **source/package artifact without the built `.next`** — `next start` had no
   build output to serve;
2. a **prebuilt artifact with `.next` but without `node_modules/next`** — the
   `next` runtime dependency was missing.
A temporary startup `npm install --omit=dev && npm run start` masked (2) by
installing deps on every worker start; this was reverted to `npm run start`.

## Required artifact contract (verify BEFORE upload)
A deployable prebuilt artifact must contain **all** of:
- `package.json` whose `start` runs `next start`;
- `.next/BUILD_ID` and `.next/static`;
- **either** `.next/standalone/server.js` (standalone) **or**
  `node_modules/next` + `node_modules/react` + the `next` binary (prebuilt);
- `public/`.
And must contain **none** of: `.env*`, `.artifacts`, `graphify-out`, `.git`,
browser profiles, backend secrets.

Run the verifier and refuse to deploy on failure:
```bash
node scripts/verify-frontend-artifact.mjs <artifactDir>
```

## Deployment discipline
1. Never run `npm install` on normal worker startup — keep startup `npm run start`.
2. Pick exactly one artifact mode (prebuilt+node_modules, or tested standalone);
   never mix an incomplete source artifact with an incomplete prebuilt one.
3. Never deploy backend and frontend concurrently (shared App Service Plan; two
   Oryx builds exhaust it — a prior outage).
4. Verify backend `/health` 200 before and after a frontend deploy.
5. Use **async** deploy + **server-side** polling (`az webapp deploy --async true`
   then poll `az webapp log deployment show`); a CLI 502/504 is a client timeout,
   not a terminal failure — query the deployment record before any retry, and
   never start a duplicate deployment while one is active.
6. After deploy, verify `/`, `/portal/register`, a static JS chunk, and CSS all
   return 200, and that a restart does not enter a loop.

## `output: "standalone"` note
Only adopt Next standalone packaging if it passes a complete local build +
`node .next/standalone/server.js` startup test. Do not introduce it
speculatively during a production recovery.
