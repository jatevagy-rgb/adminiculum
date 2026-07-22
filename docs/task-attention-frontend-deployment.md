# Task attention frontend deployment

## Deployment rule

Deploy frontend only after backend acceptance passes.

Use a clean frontend Oryx ZIP with `Frontend` contents at archive root, not a nested wrong-root artifact.

## Environment guard

Run `npm run verify:prod-env` after production build and before deploy. The bundle must not contain localhost API/auth targets.

## Evidence to record after deployment

- Frontend deployment ID.
- Artifact SHA-256.
- File count and byte size.
- Runtime source commit.
- Route smoke results.
- Authenticated visual acceptance.
