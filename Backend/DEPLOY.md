# Adminiculum — Database Migration Discipline

## Migration State Model

### Prisma migration tracking
The `_prisma_migrations` table in PostgreSQL tracks which migrations have been applied.
Prisma commands read this table to determine what to do next.

### Allowed commands

| Command | When to use |
|---|---|
| `npx prisma migrate deploy` | Production upgrade. Applies only pending migrations. Fails if `_prisma_migrations` is empty and DB is non-empty (use `resolve` first for baseline). |
| `npx prisma migrate dev` | Local development only. Creates new migration files. Cannot be used when DB schema already exists and has untracked tables. |
| `npx prisma migrate resolve --applied <name>` | Reconciliation only. Marks a migration as applied when the DB already has the table but Prisma doesn't know it. Never use on a migration that hasn't actually been SQL-applied. |
| `npx prisma db push` | Fresh local bootstrap or when schema and migrations are in sync. Creates DB schema from Prisma schema without migration history. Use only for brand-new empty DBs. |
| `npx prisma generate` | Always after schema changes or before app startup. Regenerates the client from schema.prisma. |

### When `migrate resolve` IS allowed
- The DB already has the table (verified by direct query), but `_prisma_migrations` doesn't record it.
- This happens when: a DB was carried forward from a backup, migrations were applied manually, or the migration tracking table was cleared.
- `migrate resolve` is a bookkeeping fix — NOT a schema change.

### When `migrate resolve` IS NOT allowed
- As a substitute for actually applying a migration.
- To skip a migration whose SQL has not been run against the DB.
- On production without verified DB inspection first.

### When `db push` IS allowed
- Brand-new empty DB with no prior schema and no migration history.
- ONLY for local development. Not the canonical production bootstrap path.

### When `db push` IS NOT allowed
- As a substitute for `migrate deploy` in production.
- When the DB already has data.
- In any Azure Container Apps or production deployment workflow.

### `db push` vs `migrate deploy` — canonical paths

| Scenario | Command | Why |
|---|---|---|
| Fresh local dev (empty DB) | `npm run db:bootstrap` → `prisma db push` | No migration history locally; fast bootstrap |
| Existing DB with clean state | `npm run db:deploy` → `prisma migrate deploy` | Standard production upgrade path |
| Existing DB with out-of-sync state | `migrate resolve` then `migrate deploy` | Bookkeeping + real migration in sequence |
| Production fresh DB | `npm run db:deploy` → `prisma migrate deploy` | Canonical path even for fresh DB — run baseline first |

---

## Environment Types

### Fresh DB (new environment)
1. Create empty PostgreSQL database
2. `npx prisma db push` to create schema directly from Prisma schema, OR
3. `npx prisma migrate dev --name init` to create initial migration
4. `npx prisma generate` to regenerate client

### Existing DB with clean migration state
1. `npx prisma migrate deploy` — applies all pending migrations in order
2. `npx prisma generate` — regenerate client
3. `npm run dev` — start app

### Existing DB with out-of-sync migration state (maintenance/repair)
**Symptom:** `prisma migrate deploy` fails with `P3005: database schema is not empty` or `P3018: migration failed to apply`
**Root cause:** `_prisma_migrations` table has fewer entries than the migration history. The DB has the tables; Prisma just doesn't know about earlier migrations.

**Repair steps (in order):**
1. `npx prisma migrate status` — identify which migrations Prisma thinks are unapplied
2. Inspect the actual DB tables directly (e.g., `\dt` in psql) to confirm which tables exist
3. For each migration that has already been applied (confirmed by table existence), run:
   ```
   npx prisma migrate resolve --applied <migration-name>
   ```
4. `npx prisma migrate deploy` — now succeeds for the remaining truly unapplied migrations
5. `npx prisma generate` — regenerate client
6. `npm run dev` — start app

---

## App Startup Assumptions

The app startup in `src/index.ts` does NOT validate schema state. It checks:
- `DATABASE_URL` is present
- `JWT_SECRET` is present
- At least one auth credential set is configured

It does NOT call `prisma migrate status` or fail if schema is out of date.

**This is intentional.** Validation at startup would block deployments during rolling updates. Migration state must be verified by the operator before starting the app.

---

## Scripts

### `npm run db:status`
Runs `prisma migrate status` and exits with the appropriate code.
Use this to check migration state before any deployment.

### `npm run db:deploy`
Runs `prisma migrate deploy`. Intended for production CI/CD pipelines.

### `npm run db:generate`
Runs `prisma generate`. Required after any schema change.

### `npm run db:bootstrap`
Intended for fresh local development environments only.
Runs `prisma db push` to synchronize schema directly (no migration history).
Do NOT use in production.

---

## Startup Sequence (Operator Checklist)

Before starting the backend (`npm run dev` or `npm start`):

```
1. [ ] Database is running and NETWORK accessible
2. [ ] DATABASE_URL in .env points to the correct DB
3. [ ] Run: npm run db:status
4. [ ] If migrations are pending: npm run db:deploy
5. [ ] If status shows unreconciled state: apply migrate resolve (see repair steps above)
6. [ ] Run: npm run db:generate
7. [ ] Start app: npm run dev  (or npm start for production build)
```

---

## Common Failure Modes

### `prisma generate` fails with EPERM
Node process is holding a lock on `node_modules/.prisma/client`.
**Fix:** `taskkill /F /IM node.exe` then retry.

### `prisma migrate deploy` fails P3005
DB schema is not empty but `_prisma_migrations` is empty.
**Fix:** Run `prisma migrate resolve --applied` for each existing migration, then retry deploy.

### App starts but `/cases` returns 500
Usually means schema was updated but migrations not applied, OR Prisma client not regenerated.
**Fix:** Check `db:status`, apply pending migrations, run `db:generate`, restart app.

### Migration applies but app still fails
Likely that `npx prisma generate` was not run after the migration.
Prisma client reflects schema at generate-time, not at migrate-time.
**Fix:** `npm run db:generate` then restart app.

---

## CI/CD Guidance

In automated deploy pipelines:
- Always run `npm run db:status` as a pre-deployment check
- If status is not "up to date", run `npm run db:deploy`
- Always run `npm run db:generate` after schema changes
- The app process should be restarted after both steps above

---

## Env Canonicalization Checklist (Azure-ready)

### Backend canonical envs
- Core:
  - `PORT`
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
- Auth:
  - `AZURE_AD_TENANT_ID`
  - `AZURE_AD_AUDIENCE`
- CORS:
  - `CORS_ALLOWED_ORIGINS` (comma-separated explicit origins)
  - optional fallback: `FRONTEND_ORIGIN`, `FRONTEND_URL`
- SharePoint:
  - `SP_TENANT_ID`
  - `SP_CLIENT_ID`
  - `SP_CLIENT_SECRET`
  - `SP_SITE_ID` and/or `SHAREPOINT_SITE_URL`
  - `SP_DRIVE_ID`

### Frontend canonical envs
- `NEXT_PUBLIC_BACKEND_BASE_URL` (host only, no `/api/v1`)
- `NEXT_PUBLIC_ENTRA_TENANT_ID`
- `NEXT_PUBLIC_ENTRA_CLIENT_ID`
- `NEXT_PUBLIC_ADMINICULUM_API_SCOPE`

Legacy aliases may remain for transition, but canonical names above should be used in staging/production App Service settings.

---

## Production CORS Policy

- Do not use wildcard origins in production when authenticated requests are enabled.
- Set:
  - `CORS_ALLOWED_ORIGINS=https://<frontend-staging-domain>,https://<frontend-prod-domain>`
- Backend allows localhost origins only in non-production mode.
- Verify at startup logs:
  - production should show non-zero CORS allowlist count.

---

## Azure App Service Notes

- Deploy backend and frontend as separate services.
- Backend must expose `PORT` from App Service runtime.
- Frontend must point to backend via `NEXT_PUBLIC_BACKEND_BASE_URL`.
- Keep secrets only in Azure App Settings/Key Vault, never in repo files.

---

## Post-deploy Smoke

1. `GET /health` → healthy/degraded response (JSON present)
2. `GET /api/v1/auth/me` (with valid bearer) → user context
3. `GET /api/v1/sharepoint/diagnostics` (with valid bearer) → structured, secret-safe diagnostics
4. Frontend login and dashboard load:
   - API calls resolve against the configured backend base URL
   - no CORS errors in browser console

---

## SharePoint Setup + Runtime Hardening

### Required Graph permissions (Application)
- `Sites.ReadWrite.All`
- `Files.ReadWrite.All`
- `User.Read.All` (optional in some flows but recommended for diagnostics consistency)
- Admin consent must be granted.

### SharePoint env checklist
- `SP_TENANT_ID`
- `SP_CLIENT_ID`
- `SP_CLIENT_SECRET`
- `SP_SITE_ID` or `SHAREPOINT_SITE_URL`
- optional: `SP_DRIVE_ID`

### Diagnostics endpoint interpretation
- Route: `GET /api/v1/sharepoint/diagnostics` (authenticated)
- Key fields:
  - `configured`
  - `missingEnvVars`
  - `siteResolvable`
  - `driveResolvable`
  - `rootFolderResolvable`
  - `permissionsSmoke.ok`
  - `correlationId`
  - `timestamp`
- Response is secret-safe: no client secret/token/raw authorization dump.

### Typical failure modes
- `TOKEN_REQUEST_FAILED`:
  - invalid client secret, wrong tenant, or app registration mismatch.
- `SITE_REFERENCE_MISSING` / `SITE_RESOLUTION_FAILED`:
  - missing `SP_SITE_ID` and missing/invalid `SHAREPOINT_SITE_URL`.
- `DRIVE_REFERENCE_MISSING` / `DRIVE_RESOLUTION_FAILED`:
  - invalid `SP_DRIVE_ID` or site default drive cannot be resolved.
- `SHAREPOINT_PERMISSION_DENIED`:
  - insufficient Graph permissions or missing admin consent.
- `SHAREPOINT_FILE_NOT_FOUND`:
  - document has stale `spItemId` or item was moved/deleted.

### SharePoint smoke after deployment
1. `GET /api/v1/sharepoint/diagnostics` returns `configured=true`.
2. Upload document through `/api/v1/documents`:
   - verify DB record + SharePoint item linkage.
3. Download document through `/api/v1/documents/:id/download`:
   - verify binary file opens, filename headers are correct.
4. Failure-path test:
   - simulate missing/invalid SharePoint config in staging and verify structured error (no fake success).
