# Operational UX Production Deployment 1

## Result

The production deployment attempt was stopped during the mandatory artifact provenance preflight on 2026-07-17.

Decision:

`DEPLOYMENT_BLOCKED_ARTIFACT_PROVENANCE`

Final classification:

`operational_ux_production_deployment_1_blocked_artifact_provenance`

No Azure deployment command was run. Production remained unchanged.

## Approved Target

| Item | Expected |
| --- | --- |
| Release branch | `release/editor-ops-workflow-1` |
| Official release commit | `94e4c44915af2e3bfe3005cad9b3f5c1c2004aa8` |
| Approved runtime source | `01949dc83e1267e8ded33282ff86326f027e94ec` |
| Backend target | `adminiculumbackend-b1-01` |
| Frontend target | `adminiculumfrontend-austriaeast-01` |

## Preflight

The following checks passed:

- local branch and remote branch both resolved to `94e4c44915af2e3bfe3005cad9b3f5c1c2004aa8`;
- worktree was clean;
- parked Claude commit `24bc6c5` was not an ancestor of the release branch;
- both approved deployment ZIPs existed outside the repository;
- both approved deployment ZIP SHA-256 values matched;
- both rollback ZIPs existed, were readable, and matched their documented SHA-256 values.

Commands used:

```powershell
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/release/editor-ops-workflow-1
git log --oneline --decorate -15
git merge-base --is-ancestor 24bc6c5 HEAD
Get-FileHash -Algorithm SHA256 -LiteralPath <approved-artifact>
```

The ZIP files were opened read-only with `System.IO.Compression.ZipFile` to inspect `release-manifest.json`.

## Artifact Integrity

| Component | SHA-256 result |
| --- | --- |
| Backend | `b62028f4bd8b64089a82ce891b343af4ab4b9d4f7cd4b4b6347d7e7775f4bbba` — matched |
| Frontend | `4202d9c41b6ed13517cc57714bd47ac6ac19178411ef483bc03c336d7f8d1060` — matched |

Artifact integrity passed. The blocker is provenance, not byte integrity.

## Provenance Blocker

Both embedded manifests contained:

- `officialReleaseCommit`: `d6070fa1886a3c584c8e029d0838412cda532400`;
- `approvedRuntimeSource`: `01949dc83e1267e8ded33282ff86326f027e94ec`;
- branch: `release/editor-ops-workflow-1`;
- release: `operational-ux-1`;
- correct component, package-lock hash, packaging model, and build timestamp;
- backend schema hash where applicable.

The deployment authorization required `officialReleaseCommit` to equal `94e4c44915af2e3bfe3005cad9b3f5c1c2004aa8`. The runbook explicitly required a stop when both official release and approved runtime provenance were not identified exactly. Therefore backend deployment was not started and frontend deployment remained prohibited.

## Rollback Readiness

| Component | Current deployment | Rollback SHA-256 | Verified |
| --- | --- | --- | --- |
| Backend | `1a976a8f-ecbb-4d15-a899-339b9d7444bf` | `76eacc73a19fa35d0bd092590d45b14d891288ccd37776a58bf44d7a84bea359` | yes |
| Frontend | `9650525c-d465-468d-8171-f830128b9e7b` | `29c840461c302befddefb2a4f585134c9fbd0c5ddf66c702c4dada9d67ab15f0` | yes |

No rollback was required because neither component was deployed.

## Production State

- Backend deployment command: not run.
- Frontend deployment command: not run.
- Azure settings, startup commands, slots, traffic, authentication, and feature flags: unchanged.
- Database, schema, migrations, DDL, DML, and DB push: untouched.
- Production smoke and authenticated browser acceptance: not run because the provenance gate failed before deployment.
- Client Portal, Outlook/Graph, AI, and n8n: unchanged and not enabled.

## Required Remediation

Use a separate explicitly approved follow-up. Either:

1. issue new artifacts whose embedded manifests identify official release commit `94e4c44915af2e3bfe3005cad9b3f5c1c2004aa8`, then record new hashes and repeat validation and approval; or
2. obtain a new explicit human authorization that accepts `d6070fa1886a3c584c8e029d0838412cda532400` as the official artifact checkpoint while retaining `94e4c44` as its docs-only release descendant.

Do not deploy the current artifacts under the superseded authorization without one of those explicit provenance resolutions.
