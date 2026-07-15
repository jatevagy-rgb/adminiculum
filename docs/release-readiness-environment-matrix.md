# Release Readiness Environment Matrix

Date: 2026-07-15
Current HEAD: `6800b13`

No secret values were read or printed. Values below are names and release actions only.

| Variable | Used by | Required? | Safe default | Production presence known? | Release action |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` | Frontend API client | Yes for production frontend | No safe localhost fallback | Correct value was documented previously | Build with explicit production value; verify bundle. |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID`, `NEXT_PUBLIC_AZURE_CLIENT_ID` | Frontend MSAL | Yes | None | Unknown from repo | Confirm before deploy. |
| `NEXT_PUBLIC_ENTRA_TENANT_ID`, `NEXT_PUBLIC_AZURE_TENANT_ID`, `NEXT_PUBLIC_ENTRA_AUTHORITY` | Frontend MSAL | Yes | None | Unknown from repo | Confirm before deploy. |
| `NEXT_PUBLIC_ADMINICULUM_API_SCOPE` | Frontend auth token scope | Yes | None | Unknown from repo | Confirm before deploy. |
| `NEXT_PUBLIC_ENTRA_REDIRECT_URI`, `NEXT_PUBLIC_AZURE_REDIRECT_URI`, post-logout vars | Frontend MSAL redirects | Yes | App URL dependent | Unknown from repo | Confirm before deploy. |
| `NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH`, `NEXT_PUBLIC_DEV_LOGIN_*`, `NEXT_PUBLIC_LOCAL_DEV_LOGIN_EMAIL` | Frontend dev login | No in production | Off/empty | Must be off | Verify not baked into bundle. |
| `DATABASE_URL` | Backend Prisma | Yes | None | Existing production dependency | No change; no DB operation in readiness. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, expiry vars | Backend auth | Yes if local JWT auth path used | None | Existing/unknown | Do not change. |
| `AZURE_AD_TENANT_ID`, `AZURE_AD_AUDIENCE`, Azure client vars | Backend auth | Yes | None | Existing/unknown | Do not change. |
| `SP_*`, `SHAREPOINT_*` | SharePoint/document storage | Required for SharePoint paths | None | Existing/unknown | Do not change; no new Graph use. |
| `ENABLE_*` feature flags | Runtime gates | Depends on feature | Mostly off unless true | Mixed/unknown | No changes authorized. |
| `OPENAPI_SPEC_PATH`, `WEBSITE_HOSTNAME`, `PORT`, `NODE_ENV`, `TZ` | Backend hosting/openapi/runtime | Hosting-specific | Host defaults vary | Existing/unknown | Confirm with deployment runbook. |

Variables referenced by source audit were captured in a local temp file during this run; the file was not committed.

Blocking environment finding: production values for several release-relevant flags and auth variables are not proven from repo state. This alone would require operator confirmation before deploy; combined with unknown deployed baseline, release remains NO-GO.

Build-artifact finding: a clean build with only `NEXT_PUBLIC_BACKEND_BASE_URL=https://prod-env-verify.invalid` still loaded `.env.local` and produced `http://localhost:3000` MSAL redirect values in `.next`. Future production artifact creation must inject the complete public auth environment as process variables or use the approved App Service/Oryx path that does so.
