# Task Lifecycle Frontend Recovery Artifact

Date: 2026-07-19

## Provenance

- Runtime source: `4647c080f7c070713ff9ec1f82e4140e3f622c77`.
- Official branch: `release/editor-ops-workflow-1`.
- Documentation head during packaging: `ad1353067726a7385ddfd1700025422772f902be`.
- Compatible backend deployment: `be17637b-5431-4de6-a96a-98fe8ada884a`.
- Required database migration head: `20260718120000_add_task_submission_workflow`.
- Production API target: `https://adminiculumbackend-b1-01.azurewebsites.net`.
- Target App Service: `adminiculumfrontend-austriaeast-01`.

The `Frontend` and `Backend` trees at documentation head are byte-identical to runtime commit `4647c08`; the descendant commits are documentation-only.

## Artifact

- Path: `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-frontend-recovery-20260719T175043Z\adminiculum-frontend-task-lifecycle-recovery-4647c08.zip`.
- SHA-256: `3c41d5efa4c040c1b11acbbb7b5caa587d7941d5208e7c8116360b96fb4afeaa`.
- Byte size: `2,417,597`.
- File count: `122`.
- ZIP root: `.eslintrc.json`, `next.config.mjs`, `package-lock.json`, `package.json`, `postcss.config.js`, `release-manifest.json`, `tailwind.config.ts`, `tsconfig.json`, `public/`, `scripts/`, `src/`.
- Packaging: clean exact-commit export using the proven Oryx source contract.

The external manifest is authoritative for the immutable ZIP SHA-256 because an embedded manifest cannot self-contain its final archive hash without changing that hash. The embedded manifest identifies source, compatibility, target, build timestamp, and external sidecar authority.

## Source Validation

- Clean export `npm ci --include=dev`: passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run build`: passed; 22/22 static pages generated.
- `npm.cmd run verify:prod-env`: passed.
- Focused lifecycle tests: 22/22 passed through the repository's TypeScript-aware Node runner; `Frontend/package.json` has no generic `test` script.
- `npm audit --json`: four inherited moderate findings, no dependency change and no audit fix.

An initial clean-validation setup used `NODE_ENV=production` before dependency installation and therefore omitted development-only TypeScript tooling. It was discarded and rerun with explicit development dependency inclusion. This was a validation-environment error, not a source or artifact defect.

## Artifact Proof

- ZIP extraction: passed in a new directory.
- Extracted file count: 122.
- Clean extracted `npm ci`, TypeScript, production build, and production environment guard: passed.
- Runtime bundle matches: zero `localhost:3001`; zero `/api/v1/auth/login`.
- Local start: `/`, `/tasks`, and `/reviews` returned `200`.
- `/dashboard` returned `404` because the canonical Dashboard route is `/` and no `/dashboard` route exists in either the accepted source or the prior known-good package.
- Eight sampled generated JavaScript chunks returned `200`.
- No source dependency outside the extracted artifact was used.

Artifact result: ready for the authorized one-attempt frontend deployment.
