# Operational UX Final Release Artifact Manifest

## Provenance

| Item | Value |
| --- | --- |
| Official release artifact checkpoint | `d6070fa1886a3c584c8e029d0838412cda532400` |
| Approved runtime source | `01949dc83e1267e8ded33282ff86326f027e94ec` |
| Branch | `release/editor-ops-workflow-1` |
| Release | `operational-ux-1` |
| Packaging model | Oryx/source ZIP |
| Packaging timestamp | `2026-07-17T07:38:41.3874725Z` |
| Deployment performed | No |

The final documentation commit is intentionally excluded from component source ZIPs. It is a docs-only descendant and leaves the `Frontend` and `Backend` trees identical to this official artifact checkpoint.

## Artifacts

| Component | Path | Files | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Frontend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\adminiculum-frontend-operational-ux-final-d6070fa.zip` | 117 | 2,400,586 | `4202d9c41b6ed13517cc57714bd47ac6ac19178411ef483bc03c336d7f8d1060` |
| Backend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\adminiculum-backend-operational-ux-final-d6070fa.zip` | 143 | 955,253 | `b62028f4bd8b64089a82ce891b343af4ab4b9d4f7cd4b4b6347d7e7775f4bbba` |

## Embedded Manifest Hashes

Frontend:

- package lock: `da0040801cfaef5f766043ab5c83e4294b6ca1755f8070e02b6dc391d4ed74f5`.

Backend:

- package lock: `f72c420bd17e17c8a2f4626ceb374d822d7f033beecb837c237633a5e67a412b`;
- Prisma schema: `29189294af55acd192381d9d1e63ee33ceda66a93e4f87030f331238d5a0a072`.

## Frontend Contents

Included:

- source/config/public files required by Oryx;
- `package.json` and `package-lock.json`;
- production bundle env guard;
- `release-manifest.json`.

Excluded:

- `.next` and `node_modules`;
- `.env*`, docs, tests, screenshots, coverage, audit dumps, ZIPs;
- backend content.

Clean extraction validation:

- `npm ci`: passed;
- production build: passed;
- `verify:prod-env`: passed;
- `next start`: passed;
- route smoke: 15/15 returned `200`.

The built runtime contained the production backend URL and no forbidden localhost API/auth target. Source-only localhost references are limited to the existing local-development branch, a placeholder/comment, and the bundle guard's forbidden-pattern list. No local `.next` is packaged.

Existing `workspaceText` identifier references remain in reviewed editor source, but no document content or business data is embedded in the artifact. AI/anonymization source already present in the product was not changed or enabled by this release.

## Backend Contents

Included:

- runtime source and build requirements;
- package files and TypeScript config;
- Prisma schema and unchanged migration history;
- tracked templates;
- runtime OpenAPI file required by startup;
- `release-manifest.json`.

Excluded:

- `.env*`, docs, tests, coverage, frontend, helper scripts, seed helpers, audit dumps, ZIPs.

Clean extraction validation:

- `npm ci`: passed;
- build: passed;
- health `200`;
- unauth communications `401`;
- authenticated intake, agenda, cases, and communications `200`;
- authenticated missing document `404`;
- bogus route `404`.

## Content Audit

| Check | Frontend | Backend |
| --- | ---: | ---: |
| Env files | 0 | 0 |
| Tests | 0 | 0 |
| Markdown docs | 0 | 0 |
| Opposite component | 0 | 0 |
| Potential embedded private key/client secret | 0 | 0 |
| Local database URL | n/a | 0 |
| Local `.next` | 0 | n/a |

Protected-area diffs against `e447168` remain zero for schema, migrations, OpenAPI, CORS, Azure, auth, Client Portal, Outlook/Graph, AI/n8n, flags, and env files.

## Machine-Readable Evidence

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\final-artifact-hashes.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\final-frontend-route-smoke.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\final-backend-authenticated-smoke.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-final-release\integrated-release-visual-qa-report.json`

## Status

Artifact byte integrity remains validated, but the production deployment preflight on 2026-07-17 found a provenance mismatch:

- required official release commit: `94e4c44915af2e3bfe3005cad9b3f5c1c2004aa8`;
- embedded `officialReleaseCommit` in both ZIPs: `d6070fa1886a3c584c8e029d0838412cda532400`;
- embedded approved runtime source: correctly `01949dc83e1267e8ded33282ff86326f027e94ec`.

Decision: `DEPLOYMENT_BLOCKED_ARTIFACT_PROVENANCE`.

No deployment was performed. The existing ZIPs and hashes were not modified.
