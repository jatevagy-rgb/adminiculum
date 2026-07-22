# Task attention release readiness

## Readiness gates

- Backend validation passes.
- Frontend validation passes.
- Schema and migration directories remain zero-diff.
- Package files and lockfiles remain zero-diff.
- Browser QA passes.
- Release branch integration is validated.
- Backend deploy succeeds before frontend deploy.

## Current posture

This branch is implementation-ready after validation, but production release is not complete until release integration, artifacts, deployment IDs, and authenticated production acceptance are recorded.
