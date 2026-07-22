# Task attention backend deployment

## Deployment rule

Deploy backend first with a backend-only Oryx ZIP whose archive root is the `Backend` application root.

## Forbidden contents

- `Frontend/`
- `.git/`
- `node_modules/`
- tests
- local env files
- screenshots
- secrets

## Migration rule

Do not run migrations. The production schema migration for nullable Task attention fields is already applied.

## Evidence to record after deployment

- Backend deployment ID.
- Artifact SHA-256.
- File count and byte size.
- Runtime source commit.
- `/health` result.
- Authenticated Task and Dashboard smoke results.
