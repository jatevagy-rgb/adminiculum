# Task Attention — Frontend Deployment Recovery

Date: 2026-07-22
Release branch: `release/editor-ops-workflow-1` @ `fe7ee52`

## Starting state

- Backend with Task attention runtime already in production (deployment
  `5ae95b35-f9da-4d4b-8c83-3f06d680e107`); migration head
  `20260722135148_add_task_attention_category` (Task.attentionCategory,
  Task.estimatedMinutes).
- Frontend deploy had failed (CLI 504 timeout); the live bundle did **not**
  contain the Task attention feature (`markers absent`), active deployment was
  `59537f9f-…` (older bundle). Classification:
  `TASK_ATTENTION_RUNTIME_FRONTEND_DEPLOYMENT_FAILED`.

## Recovery actions

1. Verified `fe7ee52` contains the Task attention frontend (Tasks page attention
   filter/badge/estimate + create/edit; `attentionCategory`/`estimatedMinutes`
   in `api.ts`/`taskLifecycleApi.ts`).
2. Frontend `tsc --noEmit` clean; `npm run build` clean (compiled successfully,
   `/tasks` 13.7 kB); `verify:prod-env` OK; `git diff --check` clean.
3. Built a fresh clean artifact from `fe7ee52`:
   - `adminiculum-frontend-taskattn-fe7ee52.zip`
   - SHA-256 `AC5C282E0E7B2CC4485EFB4FE02CDBC35A95B20F1623847B0F129CF8F841178B`
   - 129 files, 2,430,414 bytes; **package.json at ZIP root**; no
     Backend/node_modules/.next/tests/docs.
4. Deployed (async OneDeploy). The CLI timed out locally at ~154 s while Oryx kept
   building server-side (the same 504-style pattern). Read-only ARM polling showed
   the new deployment reach terminal state.

## Deployment result

- New deployment **`d4c70042-7016-4edd-8ea3-e4c36db0d6b1`** — status **4**,
  **active**, end 2026-07-22T19:23:32Z. One deploy attempt; no blind retry.
- Live `/tasks` chunks now contain `attentionCategory` / `DETAILED_REVIEW`
  (`5422-cc90083a…js`, `page-bec53c65…js`) — the new frontend is active.

## Production acceptance

- Routes: `/` 200, `/tasks` 200, `/cases` 200.
- Authenticated Tasks page renders the **attention category filter** live:
  *Minden figyelmi kategória · Gyors átfutás · Jóváhagyás · Aláírás · Szerkesztés
  · Részletes ellenőrzés · Nincs besorolva*.
- Browser console: no errors.
- Feature-flag safety intact: unauth communications `401`, Client Portal summary
  `501`, Outlook import unauth `401`.
- Backend unchanged (`5ae95b35` still active); no backend redeploy.

## Known gap (release-branch feature gap, not a deployment issue)

The Dashboard **"Milyen munkák várnak rám?"** workload block exists only in the
**orphaned** `Frontend/src/components/Dashboard.tsx`; it is **not** wired into the
active `DashboardFocused.tsx`, so it does not render on the production Dashboard.
The deployment faithfully delivered `fe7ee52`; wiring this block into the active
dashboard is outstanding feature work in the release branch, independent of the
deployment recovery.

## Classification

Frontend deployment recovery: **complete** — the Task attention Tasks-page runtime
is live in production and verified. `TASK_ATTENTION_RUNTIME_PRODUCTION_ROLLOUT`
for the Tasks-page feature is done; the Dashboard workload block remains a wiring
gap to be closed in a follow-up feature change.
