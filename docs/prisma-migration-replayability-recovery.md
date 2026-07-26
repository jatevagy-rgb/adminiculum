# Prisma Migration Replayability Recovery

Date: 2026-07-26
Branch: `codex/prisma-migration-replayability-recovery`

## Summary

The active legacy Prisma migration chain is not replayable from an empty PostgreSQL database. The first verified failure is:

- migration: `20260212180000_add_workload_tracking`
- PostgreSQL code: `42P01`
- failing object: `clients`
- cause: `20260211153100_baseline` is an intentional no-op and does not create foundational tables.

The recovery implemented here does not rewrite applied legacy migrations and does not pretend the no-op baseline created objects it did not create. Instead, it introduces a separate canonical current-schema baseline for genuinely empty databases.

## Selected Strategy

Selected: canonical baseline for fresh environments while preserving the legacy production chain.

Why:

- production history remains truthful;
- checked-in legacy migrations are left unchanged;
- fresh environments no longer require `prisma db push` or undocumented manual SQL;
- replay validation is automated against real PostgreSQL;
- ambiguous/non-empty databases fail closed.

## Canonical Fresh Bootstrap Contract

Supported PostgreSQL version:

- verified locally on PostgreSQL `18.1`;
- CI runs on PostgreSQL `16`;
- production metadata previously recorded PostgreSQL `15.17`.

Required environment variable:

- `DATABASE_URL` for `npm run db:bootstrap:empty`;
- `MIGRATION_REPLAY_DATABASE_URL` for `npm run db:migrations:verify-replay`.

Fresh empty database bootstrap:

```bash
cd Backend
DATABASE_URL="postgresql://..." npm run db:bootstrap:empty
npm run db:generate
```

Regression replay verification:

```bash
cd Backend
MIGRATION_REPLAY_DATABASE_URL="postgresql://..." npm run db:migrations:verify-replay
```

Safety rules:

- `db:bootstrap:empty` refuses a non-empty `public` schema.
- `db:migrations:verify-replay` refuses URLs that do not clearly identify a disposable replay/baseline/empty/CI database.
- Neither script prints secrets.
- Neither script uses `prisma db push`.
- Neither script edits `_prisma_migrations`.

## Files

- `Backend/prisma/baseline/20260726000000_current_schema_baseline.sql`
- `Backend/scripts/db-bootstrap-empty.mjs`
- `Backend/scripts/verify-migration-replay.mjs`
- `.github/workflows/prisma-migration-replayability.yml`

## Legacy Chain Status

The legacy chain remains in `Backend/prisma/migrations/` for production-history truth and forensic continuity. It is still expected to fail from a genuinely empty database at `20260212180000_add_workload_tracking`; this is now documented and covered by the separate canonical bootstrap path.

Do not edit already-applied migration SQL to make the legacy chain appear replayable. If the product later chooses to convert active Prisma migrations to a one-baseline canonical chain, that must be a separate production-history reconciliation with explicit production treatment of the old `_prisma_migrations` rows.

## Validation Completed

Local disposable PostgreSQL cluster:

- PostgreSQL: `18.1`
- failure reproduced with `npm run db:deploy`
- canonical baseline applied successfully
- `prisma validate` passed
- `prisma generate` passed
- representative synthetic inserts passed for user, client, case, collaborator, task, communication, document, document version, annotation, intake deadline and document/task link
- FK violation check passed

## Production Read-Only Metadata Proof

Access path: Azure App Service Kudu command execution from the backend environment. The probe used a temp-only `pg` install under `/tmp`, queried only catalog and migration metadata, printed no secrets or business rows, and removed the temp package directory afterward.

- PostgreSQL: `15.18`
- database: `adminiculum`
- active failed migration rows: `0`
- production head: `20260724140000_document_work_context`
- production table count: `44`
- production enum count: `51`
- rolled-back rows present:
  - `20260212180000_add_workload_tracking`
  - `20260302142000_add_kb_learning_escalation`
  - `20260331090100_add_anonymous_documents`

Repository/production checksum differences observed:

- `20260622150000_add_lawyer_handoff_packages_foundation`
- `20260628190000_add_communication_baseline`
- `20260701120000_add_outlook_communication_provider_fields`
- `20260722135148_add_task_attention_category`

This reinforces the selected strategy: do not rewrite or silently normalize legacy migration history. Production remains operational and truthful; the fresh-empty recovery path is separate.

## CI

GitHub Actions workflow `Prisma migration replayability` provisions PostgreSQL and runs:

```bash
cd Backend
npm ci
npm run db:migrations:verify-replay
```

The workflow triggers when Prisma schema, migrations, baseline SQL, replay scripts, backend package metadata, or the workflow itself changes.

## Production Policy

No production schema mutation is required for this recovery.

Before any production DB change in future tickets:

1. verify active failed `_prisma_migrations` rows are zero;
2. verify current production head and checksum metadata read-only;
3. do not run the broken blanket legacy chain against production;
4. apply only reviewed, bounded, production-head-compatible SQL;
5. record truthful migration metadata only after SQL execution succeeds.

## Disaster Recovery

For a rebuild from empty, use the canonical fresh bootstrap command above. For restoring a production backup or PITR clone, do not apply the empty baseline; validate migration-history state and schema shape first.
