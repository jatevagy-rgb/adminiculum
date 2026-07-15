# Backend Active Artifact Fingerprint

Active deployment ID: `f3129580-9574-429a-a1b3-f078b1319cd7`
App Service: `adminiculumbackend-b1-01`
Status: active, complete
Classification: `COMMIT_RANGE_NARROWED`
Strongest lower-bound marker: `2cf1594 feat(backend): add outlook graph adapter skeleton`
Timestamp-plausible runtime-equivalent upper candidate: `8ce26c0 docs: close out communication outlook intake phase`

## Artifact Summary

| Field | Value |
|---|---|
| ZIP SHA-256 | `8ece0510ed5546abafc6ec5e001b066bbc98d2f2cd05fa4e3f9b0696d8709949` |
| ZIP size | 101,260,225 bytes |
| File count | 505 |
| Source maps | 150 |
| Deployment received | `2026-07-01T13:12:53Z` |
| Deployment completed | `2026-07-01T13:16:01Z` |

## Manifest Files Present

- `oryx-manifest.toml`
- `package-lock.json`
- `package.json`
- `prisma/schema.prisma`

## Dependency Fingerprint

| Dependency | Artifact value |
|---|---|
| `@prisma/client` | `^5.22.0` |
| `prisma` | `^5.22.0` |
| `axios` | `^1.13.5` |
| `pdf-parse` | `^2.4.5` |
| `jszip` | `^3.10.1` |
| `typescript` | `^5.9.3` |

## Route/File Fingerprint

Present:

- `src/modules/communications/outlookGraph.adapter.ts`
- `dist/modules/communications/outlookGraph.adapter.js`
- `src/modules/communications/outlookImport.service.ts`
- `src/modules/communications/routes.ts`
- `prisma/schema.prisma`
- standard pre-workflow route modules such as cases, tasks, contracts, documents, communications, time entries, client portal guard, notifications, sharepoint.

Absent:

- `src/modules/agenda/routes.ts`
- `dist/modules/agenda/routes.js`
- `src/modules/documentEditor/service.ts`
- `dist/modules/documentEditor/service.js`
- `src/modules/documents/documentComments.service.ts`
- `dist/modules/documents/documentComments.service.js`

## Marker Table

| Marker | Present in artifact? | First repository commit containing marker | Relevant later change | Confidence |
|---|---|---|---|---|
| Outlook Graph adapter skeleton | Yes | `2cf1594` | None before July workflow branch | High lower bound |
| Outlook import service extraction | Yes | `d950e87` | Preserved by `2cf1594` | High lower bound |
| Outlook provider schema posture | Yes | `03d0854` | CP-SCHEMA-1 later changes absent | Medium/high |
| `/api/v1/agenda` mount | No | `2818b0b` | Artifact predates workflow agenda | High upper bound |
| `/api/v1/workload` mount | No | `d49d410` | Artifact predates workload workflow | High upper bound |
| `/api/v1/intake` mount | No | `a319255` | Artifact predates intake workflow | High upper bound |
| Document editor metadata/service | No | `adb0161` and editor commits | Artifact predates editor backend readiness | High upper bound |
| Document comments service | No | `b923f33` | Artifact predates comments workflow | High upper bound |
| `corsPolicy` import | No | `0e5c681` | Artifact predates later CORS hardening | High upper bound |
| `sanitizePublicOpenApiSpec` | No | `9c13114` | Artifact predates OpenAPI hardening | High upper bound |
| CP-SCHEMA-1 models | No | `6fc5582` | Artifact predates schema candidate | High upper bound |

## Commit Range

Stable runtime files narrowed the active backend code to a runtime-equivalent range:

- earliest required runtime commit: `2cf1594 feat(backend): add outlook graph adapter skeleton`;
- timestamp-plausible same-artifact docs commit: `8ce26c0 docs: close out communication outlook intake phase`;
- later docs-only commits can share the same backend runtime fingerprint, but they are after the active deployment timestamp or not artifact-distinguishable without embedded SHA.

The active backend cannot be classified as a unique commit because docs-only commits do not alter backend artifact content and no SHA marker exists.

## Prisma/Migration Posture

Code artifact posture:

- Contains packaged Prisma schema with Outlook provider fields.
- Does not contain CP-SCHEMA-1 `ClientPortalUser`/foundation models.
- Does not prove actual database migration state.

DB migration posture remains unknown from this artifact-only pass because production DB was not queried.
