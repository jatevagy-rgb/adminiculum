# Operational UX Release Candidate 1

## Candidate

| Item | Value |
| --- | --- |
| Review branch | `codex/operational-ux-review-1` |
| Reviewed source | `84774be` |
| Review corrections | `01949dc` |
| Production reference | `e447168` |
| Backend production deployment reference | `1a976a8f-ecbb-4d15-a899-339b9d7444bf` |
| Frontend production deployment reference | `9650525c-d465-468d-8171-f830128b9e7b` |
| Decision | `GO_FOR_OPERATIONAL_UX_RELEASE_APPROVAL` |

The ticket originally expected `247b95a`. The actual reviewed source is `84774be` because the product owner explicitly approved retaining the simplified four-card dashboard grid.

## Release Gate

- Independent runtime diff review: passed.
- Backend compatibility review: passed.
- Authenticated local visual QA: 45/45 checks passed.
- Error-state review: passed.
- Authorization regression review: no branch-introduced regression found.
- Copy and enum review: passed after `01949dc`.
- Protected-area zero-diff gates: passed.
- Frontend validation and extracted-artifact smoke: passed.
- Backend validation and extracted-artifact smoke: passed.
- Production untouched: confirmed.

## Artifacts

Frontend:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\adminiculum-frontend-operational-ux-01949dc.zip`

SHA-256:

`e06fa54b9f47b09bc211580b2f5940bd324a19ee1dfbdd5e8d829c4a11472ccd`

Backend:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\adminiculum-backend-operational-ux-01949dc.zip`

SHA-256:

`06ab76abbee94f488037cd8e34490eb81d1ada4735d7164e2821def22735e753`

Both packages are source/Oryx ZIPs with `package.json` at the root and an embedded `release-manifest.json`.

## Deployment Command Previews

These commands are previews only. They were not run.

Backend:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumbackend-b1-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\adminiculum-backend-operational-ux-01949dc.zip"
```

Frontend:

```powershell
az webapp deploy `
  --resource-group Adminiculum `
  --name adminiculumfrontend-austriaeast-01 `
  --type zip `
  --src-path "C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\adminiculum-frontend-operational-ux-01949dc.zip"
```

Frontend Oryx build must receive:

```text
NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net
NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH=false
```

No app-setting change is part of this candidate.

## Suggested Release Order

1. Human approves exact commit `01949dc` and both hashes.
2. Reconfirm production app settings without changing them.
3. Deploy backend artifact.
4. Verify backend health and unauthenticated auth boundaries.
5. Deploy frontend artifact.
6. Verify Oryx completion and production backend URL in browser network traffic.
7. Run authenticated workflow smoke.

No migration is required or authorized.

## Rollback References

- Source rollback reference: `e447168`.
- Backend deployment reference: `1a976a8f-ecbb-4d15-a899-339b9d7444bf`.
- Frontend deployment reference: `9650525c-d465-468d-8171-f830128b9e7b`.

Rollback is an operational action requiring separate approval. No rollback was performed during this task.

## Remaining Approval Conditions

- Accept the documented pre-existing document text authorization risk.
- Accept the pre-existing professional editor content-hydration limitation.
- Accept existing npm audit findings for this narrow release or schedule dependency remediation separately.
- Verify frontend Oryx receives the existing production public env during any approved deploy.

## Status

Release candidate prepared; deployment not authorized or performed.
