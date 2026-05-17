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
