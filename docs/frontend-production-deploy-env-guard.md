# Frontend Production Deploy Environment Guard

## Incident summary

After an emergency frontend artifact deploy, the production frontend at `https://adminiculumfrontend-austriaeast-01.azurewebsites.net` showed `Hitelesítési hiba` / `Failed to fetch`.

Browser network logs showed requests to `localhost:3001/api/v1/auth/login`, which cannot work from a production browser session.

## Root cause

The frontend artifact was built locally while `Frontend/.env.local` was loaded. That local file contains development settings, including a localhost backend base URL and local-dev auth behavior. Those public values were baked into the generated `.next` output.

The production App Service setting was already correct:

```text
NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net
```

No backend code, auth code, Azure app setting, schema, migration, or client portal change was required to fix the incident.

## Guardrails for future frontend deploys

- Never build a production frontend artifact with `Frontend/.env.local` loaded.
- Explicitly inject the production backend base URL when building a production artifact:

```text
NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net
```

- Prefer the proven frontend-only deploy flow: build from the intended Git commit and use a frontend-only artifact derived from `git archive HEAD:Frontend` or the established production/Oryx path.
- For manual Kudu deploys, verify the deployed bundle after upload and restart.
- Grep deployed frontend bundles/source for accidental development targets:

```text
localhost:3001
/api/v1/auth/login
```

- Browser network proof must show API calls going to the production backend URL, not localhost.

## Required post-deploy smoke

After every frontend production deploy, verify:

- Frontend routes return `200`:
  - `/`
  - `/cases`
  - `/tasks`
  - `/documents/compare`
  - `/litigation-workspace`
  - `/notifications`
- Backend `/health` returns `200`.
- Unauthenticated `GET /api/v1/communications?limit=8` returns `401`.
- Authenticated `GET /api/v1/communications?limit=8` returns `200` with the safe read-only list shape when an auth token is available.
- Client portal spoofed summary/export routes return `501 FEATURE_NOT_AVAILABLE` with reason `CLIENT_PORTAL_NOT_ENABLED`.

## Client portal note

The client portal guard was unaffected by this incident and remained closed:

```text
501 FEATURE_NOT_AVAILABLE
reason: CLIENT_PORTAL_NOT_ENABLED
```

## Closeout classification

The production regression was fixed without code, backend, schema, migration, auth, package, Azure app setting, or client portal changes.

Final incident classification:

```text
production_auth_api_base_frontend_fixed_deployed_smoke_passed
```

This documentation closeout classification:

```text
frontend_production_deploy_env_guard_documented_no_runtime_change
```
