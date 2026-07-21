# Dashboard Visual Hierarchy — Artifact Manifest

Date: 2026-07-21

## Successful Artifact (v2)

- Filename: adminiculum-frontend-visual-16700eb-v2.zip
- SHA-256: EDD12A9E4B87EA60484B8A07AE2A7E2A59D849F62C9C4CA6B6E545ECB7987D75
- Size: 2,478,891 bytes
- File count: 131 files
- Source commit: 16700eb6389f98ce73813f5ea836af97e857c294
- Branch: release/editor-ops-workflow-1
- ZIP root: Frontend contents at root level (package.json, next.config.mjs, src/, public/ at root)
- Framework detection: Next.js (correct)
- Build system: Oryx
- Build result: 22/22 static pages generated
- Deployment ID: 0a985d83-a744-4560-b1eb-cb6fd9673981

## Failed Artifact (v1)

- Filename: adminiculum-frontend-visual-16700eb.zip
- Root cause: ZIP was created from monorepo root, placing Frontend/ as a subdirectory
- The root-level package.json was the Backend monorepo's lwp-backend package
- Oryx detected Express framework instead of Next.js
- Build failed during tsc (printed help text instead of building)
- Deployment ID: 211fcbba-b8e3-4aad-9b34-41fe9cc4d119
- Kudu status: 3 (failed)

## Provenance

- Source frozen at commit 16700eb6389f98ce73813f5ea836af97e857c294
- No runtime code changes between artifact creation and deployment
- Frontend-only: no backend code, no Prisma schema, no migration files included
- Contamination: none detected (no .env, no credentials, no backend secrets)
