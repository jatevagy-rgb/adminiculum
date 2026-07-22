# Dashboard Resilience + Workload Cards — Artifact Manifest

Date: 2026-07-22

## Artifact

- Path (local build host): `…/scratchpad/adminiculum-frontend-77bece8-v1.zip`
- Type: clean frontend-only Oryx **source** artifact (server-side Next.js build)
- Byte size: 2,425,875
- File count: 128
- **SHA-256:** `907a7202a3f3aded2b488a217758c6c4af03544ef8b2bfb139804d2e3f6e119b`

## Provenance

- **Release branch HEAD:** `77bece8` (release/editor-ops-workflow-1)
- **Runtime source commit:** `bddeb81` (the artifact contains the Frontend/src
  as of `bddeb81`; `d45177f`/`77bece8` add only tests/docs, absent from the ZIP)
- Target app: `adminiculumfrontend-austriaeast-01` (RG `Adminiculum`)

## ZIP root proof (critical)

Frontend project contents are at the **ZIP root** — `package.json` (name
`adminiculum-frontend`, `next` dependency, `build: next build`) is at root, so
Oryx detects Next.js. Root entries: `package.json`, `package-lock.json`,
`next.config.mjs`, `next-env.d.ts`, `tsconfig.json`, `postcss.config.js`,
`tailwind.config.ts`, `.eslintrc.json`, `src/`, `public/`, `scripts/`.

**No** monorepo/backend root `package.json`, **no** `Backend/`, `node_modules/`,
`.next/`, `tests/`, or `qa-screenshots*` in the ZIP (verified by enumerating
entries). This avoids the prior failure where Oryx detected the backend package
at ZIP root.

## Contamination scan

No secrets, tokens, Windows temp paths, `.env`, QA artifacts, disposable
fixtures, or test harnesses. The only `localhost`/`127.0.0.1` string matches are
pre-existing benign source already live in production: the
`assert-production-bundle-env.js` guard (which lists the patterns it scans
against), dev-mode `window.location.hostname === 'localhost'` checks, a UI
placeholder, and comments. `verify:prod-env` confirmed the build output has no
localhost API/auth targets.

## Exclusions applied

Backend, docs, `.git`, `.env*`, screenshots, QA artifacts, `node_modules`,
`.next`, `tsconfig.tsbuildinfo`, `Dockerfile`/`.dockerignore`, previous ZIPs,
temp files, tokens, browser profiles.
