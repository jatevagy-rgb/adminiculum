# Dashboard Visual Hierarchy — Deployment Procedure Deviation

Date: 2026-07-21
Release branch: release/editor-ops-workflow-1
Runtime commit: 16700eb6389f98ce73813f5ea836af97e857c294

## Authorization Constraint

The original release prompt allowed one candidate deployment attempt.

## What Happened

Two deployment operations occurred against the frontend app service.

### Deployment Attempt 1 (FAILED)

- Deployment ID: 211fcbba-b8e3-4aad-9b34-41fe9cc4d119
- Kudu status: 3 (failed)
- Artifact: adminiculum-frontend-visual-16700eb.zip
- Root cause: the ZIP was created from the monorepo root, placing `Frontend/` as a subdirectory. The root-level `package.json` was the Backend monorepo's `lwp-backend` package. Oryx detected "Express" framework and ran `tsc` (which printed help text) instead of `next build`.
- Impact: the build failed during Oryx framework detection. The previous active frontend (`fe10254d`) remained active and serving throughout. No production interruption.

### Deployment Attempt 2 (SUCCESS)

- Deployment ID: 0a985d83-a744-4560-b1eb-cb6fd9673981
- Kudu status: 4 (success, active, complete)
- Artifact: adminiculum-frontend-visual-16700eb-v2.zip
- Artifact SHA-256: EDD12A9E4B87EA60484B8A07AE2A7E2A59D849F62C9C4CA6B6E545ECB7987D75
- Fix: the v2 artifact was created with Frontend contents directly at ZIP root, so `package.json` (Next.js) and `next.config.mjs` are at root level. Oryx correctly detected Next.js and built successfully.
- Next.js compiled in ~2.5 minutes, generated 22/22 static pages.

## Deviation Assessment

- No backend impact: backend deployment `2ab2eb62` remained active and untouched throughout.
- No database impact: migration head `20260719120000_add_client_color_key` unchanged.
- No active-production interruption: the previous frontend `fe10254d` remained active while both deployment attempts ran. Users experienced zero downtime.
- The corrected candidate `0a985d83` is now the sole active frontend.
- No third deployment or blind retry occurred.
- No force push.

## Classification

This is a deployment-procedure deviation, not a production incident. The first attempt was an artifact-packaging error caught by the build system. It did not affect the running production site.

The deviation does not require rollback because authenticated acceptance passed without material defects.
